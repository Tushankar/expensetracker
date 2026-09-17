/**
 * Turning a picker result into a multipart file part.
 *
 * Deliberately separate from the uploader: this is pure string work, and keeping
 * it out of the module that touches `XMLHttpRequest` is what lets it be
 * unit-tested under Node without a DOM.
 */
export type UploadFile = { uri: string; name: string; type: string };

export function fileFromUri(uri: string, mimeType?: string | null): UploadFile {
  const extension = /\.(\w+)(?:\?|$)/.exec(uri)?.[1]?.toLowerCase() ?? 'jpg';
  return {
    uri,
    name: `receipt.${extension}`,
    // HEIC comes off an iPhone camera by default and Cloudinary handles it, but a
    // missing type makes the multipart part unreadable at the other end, and the
    // failure arrives as a bare 400 with nothing useful in it. So it always gets
    // one.
    type: mimeType || (extension === 'png' ? 'image/png' : 'image/jpeg'),
  };
}
