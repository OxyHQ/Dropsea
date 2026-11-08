/**
 * A folder the person chooses in the platform's own panel (`Directory.pickDirectoryAsync`, OxyOS's
 * file chooser as a sheet of this window): Restore To…'s.
 */
import { Directory } from 'expo-file-system';

/** The code a picker the person cancelled rejects with (OxyOS's, as Android's). */
const CANCELLED_CODE = 'ERR_FILE_PICKER_CANCELLED';

/** The folder chosen, or null when the person cancelled. Throws when the panel could not open. */
export async function pickFolder(startUri?: string): Promise<string | null> {
  try {
    return (await Directory.pickDirectoryAsync(startUri)).uri;
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === CANCELLED_CODE) return null;
    throw error;
  }
}
