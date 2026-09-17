import { createHash } from 'node:crypto';

import { env } from '../config/env';
import { logger } from '../config/logger';

import { ApiError } from './ApiError';

/**
 * Cloudinary, without the SDK.
 *
 * The whole integration is two HTTP calls and a SHA-1, and the official package
 * brings a config singleton and a streaming upload API that this server
 * deliberately does not use — the bytes go from the phone to Cloudinary directly
 * and never pass through here. What is left is small enough to read in one sitting
 * and has no opinion about global state.
 *
 * The API secret is used for exactly two things: signing the parameters the app is
 * allowed to upload with, and verifying that what the app says it uploaded is what
 * Cloudinary actually stored. It never leaves this file's module.
 */

export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
};

export function cloudinaryConfig(): CloudinaryConfig | null {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;

  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
    folder: env.CLOUDINARY_FOLDER,
  };
}

export function isStorageConfigured(): boolean {
  return cloudinaryConfig() !== null;
}

export function requireStorage(): CloudinaryConfig {
  const config = cloudinaryConfig();
  if (!config) {
    throw ApiError.serviceUnavailable('Receipt storage is not configured on this server');
  }
  return config;
}

/**
 * Cloudinary's signature: the parameters sorted by key, joined as a query string,
 * with the API secret appended, hashed with SHA-1.
 *
 * `file`, `api_key`, `resource_type` and `cloud_name` are excluded by Cloudinary's
 * own rules — signing them produces a signature the upload endpoint rejects, which
 * is a confusing hour if you have not read that paragraph of their documentation.
 */
export function sign(params: Record<string, string | number>, apiSecret: string): string {
  const payload = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join('&');

  return createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

export type UploadTicket = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  /** Exactly the fields the app must send, already signed. Sending more breaks it. */
  params: Record<string, string>;
  signature: string;
  maxBytes: number;
};

/**
 * A short-lived permission to upload one image into one user's folder.
 *
 * Signed rather than unsigned, and this is the point of the whole arrangement: an
 * unsigned preset is a public write endpoint on your account that anyone who opens
 * the app bundle can find, and it cannot constrain where the file lands. Here the
 * server picks the folder and the public id, the signature covers both, and a
 * client that edits either has a signature that no longer matches.
 */
export function createUploadTicket(userId: string): UploadTicket {
  const config = requireStorage();

  const timestamp = Math.floor(Date.now() / 1000);
  // Per-user folder, so a misconfiguration cannot show one person another's
  // receipts, and a deleted account is one prefix to clean up.
  const folder = `${config.folder}/${userId}`;
  const publicId = `${folder}/${timestamp}-${Math.random().toString(36).slice(2, 10)}`;

  const params = {
    folder,
    public_id: publicId,
    timestamp,
    // Receipts are private records. `authenticated` would need signed delivery
    // URLs on every render; `upload` with an unguessable id is the pragmatic
    // middle, and the id is generated here rather than from the file name.
    type: 'upload',
  };

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    params: Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    signature: sign(params, config.apiSecret),
    maxBytes: env.RECEIPT_MAX_BYTES,
  };
}

export type UploadResult = {
  publicId: string;
  version: number;
  signature: string;
  secureUrl: string;
  bytes: number;
  format: string;
  width: number;
  height: number;
};

/**
 * Checks that an upload the app reports actually happened.
 *
 * Cloudinary signs its own response with the same secret, over just the public id
 * and the version. Recomputing it here is what makes it safe to take the rest of
 * the payload — the URL, the size — from the client: a fabricated response cannot
 * produce a matching signature without the secret, and the secret is only here.
 *
 * Without this check the endpoint would happily store a URL pointing anywhere, and
 * the app would render it.
 */
export function verifyUpload(result: UploadResult): boolean {
  const config = requireStorage();
  const expected = sign(
    { public_id: result.publicId, version: result.version },
    config.apiSecret,
  );

  if (expected !== result.signature) return false;

  // Belt and braces: the URL must live on this account, so a valid signature for
  // some other asset cannot smuggle in a foreign host.
  const prefix = `https://res.cloudinary.com/${config.cloudName}/`;
  return result.secureUrl.startsWith(prefix);
}

/** Removes the stored image. Failing here must not block deleting our own row. */
export async function destroyUpload(publicId: string): Promise<boolean> {
  const config = cloudinaryConfig();
  if (!config) return false;

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ public_id: publicId, timestamp }, config.apiSecret);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          public_id: publicId,
          timestamp,
          api_key: config.apiKey,
          signature,
        }),
      },
    );

    const body = (await response.json()) as { result?: string };
    if (body.result === 'ok' || body.result === 'not found') return true;

    logger.warn({ publicId, result: body.result }, 'cloudinary refused to delete a receipt');
    return false;
  } catch (error) {
    logger.warn({ publicId, err: error }, 'could not reach cloudinary to delete a receipt');
    return false;
  }
}

/**
 * A derived URL for the app's thumbnails.
 *
 * Cloudinary transforms in the path, so this is string work rather than a request:
 * a receipt list showing twenty 4MB photographs at 64dp is an unusable screen and
 * someone's data plan.
 */
export function thumbnailUrl(secureUrl: string, size = 320): string {
  return secureUrl.replace('/upload/', `/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`);
}

/** A readable, bandwidth-sane rendition for the vision model and the full-screen view. */
export function readableUrl(secureUrl: string, width = 1400): string {
  return secureUrl.replace('/upload/', `/upload/c_limit,w_${width},q_auto:good/`);
}
