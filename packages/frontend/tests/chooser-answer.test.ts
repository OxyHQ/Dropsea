import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type {
  PlatformFileChooser,
  PlatformFileChooserRequest,
} from '@oxy.so/bloom/platform-surface';

/** Dropsea's own storage, as AsyncStorage keeps it: strings by key, in memory for the tests. */
const stored = new Map<string, string>();
let isStorageFailing = false;
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => {
      if (isStorageFailing) throw new Error('storage is unavailable');
      return stored.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      if (isStorageFailing) throw new Error('storage is unavailable');
      stored.set(key, value);
    },
  },
}));

const { answerCancelled, answerChosen, rememberedFolder, rememberFolder } = await import(
  '@/lib/chooser-answer'
);

/** A chooser that records how it was answered. */
function chooserFor(application: PlatformFileChooserRequest['application']) {
  const answers: string[] = [];
  const chooser: PlatformFileChooser = {
    request: {
      mode: 'open',
      multiple: false,
      directory: false,
      types: [],
      title: null,
      suggestedName: null,
      folder: null,
      application,
    },
    choose: (uris) => answers.push(`chose ${uris.join(' ')}`),
    cancel: () => answers.push('cancelled'),
  };
  return { chooser, answers };
}

const ASTRO = { id: 'so.oxy.astro', name: 'Astro' };
const INBOX = { id: 'so.oxy.inbox', name: 'Inbox' };

beforeEach(() => {
  stored.clear();
  isStorageFailing = false;
});

describe('the folder kept for each application', () => {
  test('is the one last chosen in for it, and no other application’s', async () => {
    expect(await rememberedFolder(ASTRO.id)).toBeNull();
    await rememberFolder(ASTRO.id, 'file:///home/ada/Pictures');
    await rememberFolder(INBOX.id, 'file:///home/ada/Documents');
    await rememberFolder(ASTRO.id, 'file:///home/ada/Downloads');
    expect(await rememberedFolder(ASTRO.id)).toBe('file:///home/ada/Downloads');
    expect(await rememberedFolder(INBOX.id)).toBe('file:///home/ada/Documents');
    expect(await rememberedFolder('so.oxy.allo')).toBeNull();
  });

  test('forgets the application asked for longest ago beyond fifty', async () => {
    for (let index = 0; index < 51; index++) {
      await rememberFolder(`app.${index}`, `file:///home/ada/${index}`);
    }
    expect(await rememberedFolder('app.0')).toBeNull();
    expect(await rememberedFolder('app.1')).toBe('file:///home/ada/1');
    expect(await rememberedFolder('app.50')).toBe('file:///home/ada/50');
  });

  test('starts afresh from what it cannot read', async () => {
    stored.set('dropsea.chooser.folders', '{not json');
    expect(await rememberedFolder(ASTRO.id)).toBeNull();
    stored.set(
      'dropsea.chooser.folders',
      JSON.stringify([['so.oxy.astro'], 7, ['so.oxy.inbox', 'file:///x']]),
    );
    expect(await rememberedFolder(ASTRO.id)).toBeNull();
    expect(await rememberedFolder(INBOX.id)).toBe('file:///x');
  });
});

describe('answering the chooser', () => {
  test('a choice keeps the folder for the asking application, then answers with the URIs', async () => {
    const { chooser, answers } = chooserFor(ASTRO);
    await answerChosen(chooser, ['file:///home/ada/Pictures/a.png'], 'file:///home/ada/Pictures');
    expect(answers).toEqual(['chose file:///home/ada/Pictures/a.png']);
    expect(await rememberedFolder(ASTRO.id)).toBe('file:///home/ada/Pictures');
  });

  test('answers once, however many presses come', async () => {
    const { chooser, answers } = chooserFor(ASTRO);
    await Promise.all([
      answerChosen(chooser, ['file:///a'], 'file:///'),
      answerChosen(chooser, ['file:///b'], 'file:///'),
    ]);
    answerCancelled(chooser);
    expect(answers).toEqual(['chose file:///a']);

    const other = chooserFor(ASTRO);
    answerCancelled(other.chooser);
    await answerChosen(other.chooser, ['file:///a'], 'file:///');
    expect(other.answers).toEqual(['cancelled']);
  });

  test('a cancel keeps nothing', async () => {
    const { chooser, answers } = chooserFor(ASTRO);
    answerCancelled(chooser);
    expect(answers).toEqual(['cancelled']);
    expect(await rememberedFolder(ASTRO.id)).toBeNull();
  });

  test('an application the platform does not name has nothing kept, and is answered', async () => {
    const { chooser, answers } = chooserFor(null);
    await answerChosen(chooser, ['file:///a'], 'file:///');
    expect(answers).toEqual(['chose file:///a']);
    expect(stored.size).toBe(0);
  });

  test('storage that fails never keeps the person from their answer', async () => {
    isStorageFailing = true;
    const { chooser, answers } = chooserFor(ASTRO);
    await answerChosen(chooser, ['file:///a'], 'file:///');
    expect(answers).toEqual(['chose file:///a']);
  });
});
