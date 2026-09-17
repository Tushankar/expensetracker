import type { UploadTicket, UploadedImage } from './types';

/**
 * Sending an image straight to Cloudinary, with honest progress.
 *
 * `fetch` cannot report upload progress — the whole body goes in one call and you
 * learn how it went at the end. On a 4MB photograph over Indian mobile data that
 * is fifteen seconds of a spinner that could mean anything, including nothing.
 * `XMLHttpRequest` still exposes `upload.onprogress`, so this one place in the app
 * uses it deliberately rather than by accident.
 *
 * The bytes never touch our API server. It only signs the request beforehand and
 * verifies the result afterwards, which is what keeps the API secret on the server
 * while still letting the phone talk to Cloudinary directly.
 */
export function uploadToCloudinary(
  ticket: UploadTicket,
  file: { uri: string; name: string; type: string },
  options: {
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const form = new FormData();

    // Exactly the signed fields and nothing else: Cloudinary computes the
    // signature over every parameter it receives, so one extra field makes a
    // valid signature invalid and the error it returns does not say so.
    for (const [key, value] of Object.entries(ticket.params)) form.append(key, value);
    form.append('api_key', ticket.apiKey);
    form.append('signature', ticket.signature);
    // React Native's FormData takes this shape for a local file URI.
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);

    const request = new XMLHttpRequest();
    request.open('POST', ticket.uploadUrl);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      options.onProgress?.(Math.min(1, event.loaded / event.total));
    };

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(readError(request.responseText) ?? 'The upload was refused'));
        return;
      }

      try {
        const body = JSON.parse(request.responseText) as {
          public_id?: string;
          version?: number;
          signature?: string;
          secure_url?: string;
          bytes?: number;
          format?: string;
          width?: number;
          height?: number;
        };

        if (!body.public_id || !body.version || !body.signature || !body.secure_url) {
          reject(new Error('The upload finished but came back incomplete'));
          return;
        }

        // Reported to our API as-is, which then re-derives the signature from its
        // own secret before storing anything. Nothing here is trusted on the
        // strength of having arrived.
        resolve({
          publicId: body.public_id,
          version: body.version,
          signature: body.signature,
          secureUrl: body.secure_url,
          bytes: body.bytes ?? 0,
          format: body.format ?? '',
          width: body.width ?? 0,
          height: body.height ?? 0,
        });
      } catch {
        reject(new Error('The upload finished but the reply could not be read'));
      }
    };

    request.onerror = () => reject(new Error('Could not reach the image server'));
    request.ontimeout = () => reject(new Error('The upload timed out'));
    request.onabort = () => reject(new Error('Upload cancelled'));

    options.signal?.addEventListener('abort', () => request.abort());

    request.send(form);
  });
}

/** Cloudinary puts the real reason in `error.message`; everything else is noise. */
function readError(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? null;
  } catch {
    return null;
  }
}

/** Derives a filename and MIME type from a picker result. */
export function fileFromUri(uri: string, mimeType?: string | null): {
  uri: string;
  name: string;
  type: string;
} {
  const extension = /\.(\w+)(?:\?|$)/.exec(uri)?.[1]?.toLowerCase() ?? 'jpg';
  return {
    uri,
    name: `receipt.${extension}`,
    // HEIC comes off an iPhone camera by default and Cloudinary handles it, but a
    // missing type makes the multipart part unreadable, so it always gets one.
    type: mimeType || (extension === 'png' ? 'image/png' : 'image/jpeg'),
  };
}
