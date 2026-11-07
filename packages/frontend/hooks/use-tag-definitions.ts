/**
 * The person's tags (each one's name, colour, place in their order and whether
 * the sidebar shows it), as Finder keeps them in a Mac's preferences:
 *
 * - signed in, in the account's preferences for Dropsea (`oxy.appData`,
 *   namespace `dropsea`, key `tags`), so every device the person uses shows
 *   the same tags;
 * - signed out, on this device.
 *
 * The first time there are none, the seven coloured tags are written, named in
 * the person's language then, so a file tagged "Rojo" keeps its colour if the
 * language changes later. An account with none takes this device's.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale } from '@/hooks/use-locale';
import { useViewer } from '@/hooks/use-viewer';
import { oxyServices } from '@/lib/oxy';
import type { Strings } from '@/lib/strings';
import {
  defaultTagDefinitions,
  readDefinitions,
  storedDefinitions,
  type TagDefinition,
} from '@/lib/tags';

const PREFERENCES_NAMESPACE = 'dropsea';
const PREFERENCES_KEY = 'tags';
/** Where this device keeps them while nobody is signed in. */
const DEVICE_KEY = 'dropsea.tags';

/** The query key of the person's tags (null: this device's, signed out). */
export function tagDefinitionsKey(userId: string | null) {
  return ['tag-definitions', userId] as const;
}

async function deviceDefinitions(): Promise<TagDefinition[] | null> {
  const stored = await AsyncStorage.getItem(DEVICE_KEY);
  if (stored === null) return null;
  try {
    return readDefinitions(JSON.parse(stored));
  } catch (error) {
    console.warn('Dropsea read tags on this device it cannot parse; it starts again', { error });
    return null;
  }
}

async function saveOnDevice(definitions: readonly TagDefinition[]): Promise<void> {
  await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(storedDefinitions(definitions)));
}

async function saveInAccount(definitions: readonly TagDefinition[]): Promise<void> {
  await oxyServices.appData.set(
    PREFERENCES_NAMESPACE,
    PREFERENCES_KEY,
    storedDefinitions(definitions),
  );
}

/** This device's tags, written as the defaults the first time. */
async function loadOnDevice(strings: Strings): Promise<TagDefinition[]> {
  const known = await deviceDefinitions();
  if (known) return known;
  const defaults = defaultTagDefinitions(strings.tags.colors);
  await saveOnDevice(defaults);
  return defaults;
}

/** The account's tags; with none yet, this device's (or the defaults) become the account's. */
async function loadInAccount(strings: Strings): Promise<TagDefinition[]> {
  const known = readDefinitions(
    await oxyServices.appData.get(PREFERENCES_NAMESPACE, PREFERENCES_KEY),
  );
  if (known) return known;
  const first = (await deviceDefinitions()) ?? defaultTagDefinitions(strings.tags.colors);
  await saveInAccount(first);
  return first;
}

export interface TagDefinitions {
  /** The person's tags in their order; empty until they are read. */
  definitions: readonly TagDefinition[];
  isReady: boolean;
  /** Keeps `next` as the person's tags (shown at once; put back if it cannot be kept). */
  save: (next: readonly TagDefinition[]) => Promise<void>;
}

const NONE: readonly TagDefinition[] = [];

export function useTagDefinitions(): TagDefinitions {
  const { strings } = useLocale();
  const { userId, isSignedIn, isResolving } = useViewer();
  const queryClient = useQueryClient();
  const owner = isSignedIn ? userId : null;
  const key = tagDefinitionsKey(owner);
  const query = useQuery({
    queryKey: key,
    queryFn: () => (owner ? loadInAccount(strings) : loadOnDevice(strings)),
    // Until Oxy says who is there, nobody's are read: the device's would show, then the account's.
    enabled: !isResolving,
  });
  return {
    definitions: query.data ?? NONE,
    isReady: query.data !== undefined,
    save: async (next) => {
      const before = queryClient.getQueryData<TagDefinition[]>(key);
      queryClient.setQueryData(key, [...next]);
      try {
        if (owner) await saveInAccount(next);
        else await saveOnDevice(next);
      } catch (error) {
        queryClient.setQueryData(key, before);
        throw error;
      }
    },
  };
}
