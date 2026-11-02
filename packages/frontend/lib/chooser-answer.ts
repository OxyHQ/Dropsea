/**
 * The file chooser's answer, and what Dropsea keeps between panels: the folder
 * it last chose in for each asking application, so the next panel that
 * application asks for opens there (OxyOS ADR 0029, decision 8: Dropsea's to
 * keep, per application). Kept in Dropsea's own storage, by application id.
 */
import type { PlatformFileChooser } from '@oxy.so/bloom/platform-surface';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FOLDERS_KEY = 'dropsea.chooser.folders';
/** The applications whose folders are kept; the one asked for longest ago is forgotten first. */
const MAX_REMEMBERED = 50;

type RememberedFolder = readonly [applicationId: string, folderUri: string];

function isRememberedFolder(value: unknown): value is RememberedFolder {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}

/** What is kept, most recent first; nothing for what cannot be read. */
async function readRemembered(): Promise<RememberedFolder[]> {
  const stored = await AsyncStorage.getItem(FOLDERS_KEY);
  if (!stored) return [];
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch (error) {
    console.warn('Dropsea could not read the folders it keeps for open and save panels', { error });
    return [];
  }
  return Array.isArray(value) ? value.filter(isRememberedFolder) : [];
}

/** The folder Dropsea last chose in for an application, or null. */
export async function rememberedFolder(applicationId: string): Promise<string | null> {
  const found = (await readRemembered()).find(([id]) => id === applicationId);
  return found ? found[1] : null;
}

/** Keeps the folder chosen in for an application, for its next panel. */
export async function rememberFolder(applicationId: string, folderUri: string): Promise<void> {
  const others = (await readRemembered()).filter(([id]) => id !== applicationId);
  const chosen: RememberedFolder = [applicationId, folderUri];
  const next = [chosen, ...others].slice(0, MAX_REMEMBERED);
  await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(next));
}

/** Choosers already answered: a request is answered once, however fast the presses come. */
const answered = new WeakSet<PlatformFileChooser>();

/**
 * Answers with the `file://` URIs chosen in `folderUri`, once, after keeping
 * that folder for the asking application: the platform ends Dropsea as soon as
 * the request is answered.
 */
export async function answerChosen(
  chooser: PlatformFileChooser,
  uris: readonly string[],
  folderUri: string | null,
): Promise<void> {
  if (answered.has(chooser)) return;
  answered.add(chooser);
  const application = chooser.request.application;
  if (application && folderUri) {
    try {
      await rememberFolder(application.id, folderUri);
    } catch (error) {
      console.warn('Dropsea could not keep the folder for the next panel; it answers anyway', {
        application: application.id,
        error,
      });
    }
  }
  chooser.choose(uris);
}

/** Answers that the person cancelled, once. */
export function answerCancelled(chooser: PlatformFileChooser): void {
  if (answered.has(chooser)) return;
  answered.add(chooser);
  chooser.cancel();
}
