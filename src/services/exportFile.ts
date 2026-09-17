import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Writing an export to disk and handing it to the share sheet.
 *
 * The cache directory rather than documents: this file exists to be shared, and
 * once it has reached Drive or a mail draft it is a duplicate of data the server
 * already holds. Leaving copies of someone's full financial history in a
 * permanent app directory is a liability nobody asked for, and the OS clears the
 * cache on its own when space runs short.
 *
 * `expo-file-system` moved to a `File`/`Paths` object API in SDK 54; the old
 * `writeAsStringAsync` free functions are the legacy import path.
 */

export type ShareResult =
  | { status: 'shared' }
  /** Written, but the platform has no share sheet — the path is worth showing. */
  | { status: 'saved'; uri: string };

export async function shareTextFile(input: {
  filename: string;
  content: string;
  mimeType: string;
  dialogTitle: string;
}): Promise<ShareResult> {
  const file = new File(Paths.cache, input.filename);

  // A second export in the same session would otherwise fail on an existing
  // file rather than replacing it.
  if (file.exists) file.delete();

  file.create();
  file.write(input.content);

  if (!(await Sharing.isAvailableAsync())) {
    return { status: 'saved', uri: file.uri };
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: input.mimeType,
    dialogTitle: input.dialogTitle,
    // iOS picks the receiving apps from the UTI, Android from the MIME type
    // above. Without this one a CSV is offered to nothing useful on iOS.
    UTI: 'public.comma-separated-values-text',
  });

  return { status: 'shared' };
}
