import { describe, expect, test } from 'bun:test';
import type { PlatformFileChooserRequest } from '@oxy.so/bloom/platform-surface';
import {
  activateStep,
  childUri,
  chooserTitle,
  fitsTypes,
  isChoosable,
  isSelectable,
  openStep,
  saveStep,
  startFolder,
} from '@/lib/chooser';
import type { LocalPlace } from '@/lib/local-places';
import { stringsFor } from '@/lib/strings';
import { cloud, folder, local } from './fixtures';

function request(facts: Partial<PlatformFileChooserRequest> = {}): PlatformFileChooserRequest {
  return {
    mode: 'open',
    multiple: false,
    directory: false,
    types: [],
    title: null,
    suggestedName: null,
    folder: null,
    application: { id: 'so.oxy.astro', name: 'Astro' },
    ...facts,
  };
}

const HOME = 'file:///home/ada';
const photo = local('photo.png');
const raw = local('shot.CR2');
const notes = local('notes.txt');
const pictures = folder(`${HOME}/Pictures`);
const documents = folder(`${HOME}/Documents`);

describe('what a file chooser takes', () => {
  test('a file fits media types, families of them and extensions, case aside; no types is any', () => {
    expect(fitsTypes(photo, [])).toBe(true);
    expect(fitsTypes(photo, ['image/png'])).toBe(true);
    expect(fitsTypes(photo, ['image/jpeg'])).toBe(false);
    expect(fitsTypes(photo, ['image/*'])).toBe(true);
    expect(fitsTypes(photo, ['.PNG'])).toBe(true);
    expect(fitsTypes(notes, ['image/*', '.png'])).toBe(false);
    expect(fitsTypes(notes, ['text/*'])).toBe(true);
    // A picture whose MIME type Dropsea does not know is still one of the image family.
    expect(fitsTypes(raw, ['image/*'])).toBe(true);
    expect(fitsTypes(raw, ['.cr2'])).toBe(true);
    // What the source says it is wins over its name.
    expect(fitsTypes(local('scan', { mime: 'image/jpeg' }), ['image/jpeg'])).toBe(true);
    expect(fitsTypes(notes, ['*/*'])).toBe(true);
    // A name without an extension fits no extension; a type that is no media type fits nothing.
    expect(fitsTypes(local('README'), ['.'])).toBe(false);
    expect(fitsTypes(photo, ['image'])).toBe(false);
  });

  test('an open panel for files takes the files that fit; folders are gone into, the rest dimmed', () => {
    const images = request({ types: ['image/*'] });
    expect(isChoosable(photo, images)).toBe(true);
    expect(isChoosable(notes, images)).toBe(false);
    expect(isChoosable(pictures, images)).toBe(false);
    expect(isSelectable(pictures, images)).toBe(true);
    expect(isSelectable(photo, images)).toBe(true);
    expect(isSelectable(notes, images)).toBe(false);
  });

  test('an open panel for folders takes folders, never files', () => {
    const folders = request({ directory: true, types: ['image/*'] });
    expect(isChoosable(pictures, folders)).toBe(true);
    expect(isChoosable(photo, folders)).toBe(false);
    expect(isSelectable(photo, folders)).toBe(false);
  });

  test('a save panel chooses nothing among the items: it goes into folders, and files are dimmed', () => {
    const saving = request({ mode: 'save' });
    expect(isChoosable(photo, saving)).toBe(false);
    expect(isChoosable(pictures, saving)).toBe(false);
    expect(isSelectable(pictures, saving)).toBe(true);
    expect(isSelectable(photo, saving)).toBe(false);
  });

  test('an Oxy Files item is never chosen: it is no file on this device', () => {
    const anything = request();
    const asset = cloud('photo.png', { mime: 'image/png' });
    expect(isChoosable(asset, anything)).toBe(false);
    expect(isSelectable(asset, anything)).toBe(false);
    expect(openStep(anything, [asset], HOME)).toEqual({ kind: 'none' });
    expect(activateStep(anything, asset)).toEqual({ kind: 'none' });
  });
});

describe('the open panel’s answer', () => {
  test('one file that fits is the answer; nothing, or one that does not fit, is none', () => {
    const images = request({ types: ['image/*'] });
    expect(openStep(images, [photo], HOME)).toEqual({ kind: 'choose', uris: [photo.uri] });
    expect(openStep(images, [], HOME)).toEqual({ kind: 'none' });
    expect(openStep(images, [notes], HOME)).toEqual({ kind: 'none' });
  });

  test('several files are the answer only when the request allows several', () => {
    const one = request();
    const several = request({ multiple: true });
    expect(openStep(one, [photo, notes], HOME)).toEqual({ kind: 'none' });
    expect(openStep(several, [photo, notes], HOME)).toEqual({
      kind: 'choose',
      uris: [photo.uri, notes.uri],
    });
    // Every one must fit.
    expect(openStep(request({ multiple: true, types: ['.png'] }), [photo, notes], HOME)).toEqual({
      kind: 'none',
    });
  });

  test('a folder selected alone, when files are asked for, is gone into', () => {
    expect(openStep(request(), [pictures], HOME)).toEqual({ kind: 'enter', uri: pictures.uri });
    // Among files it is no answer.
    expect(openStep(request({ multiple: true }), [pictures, photo], HOME)).toEqual({
      kind: 'none',
    });
  });

  test('a folder asked for is the selected folders, or with nothing selected the folder shown', () => {
    const folders = request({ directory: true });
    expect(openStep(folders, [pictures], HOME)).toEqual({ kind: 'choose', uris: [pictures.uri] });
    expect(openStep(folders, [], HOME)).toEqual({ kind: 'choose', uris: [HOME] });
    expect(openStep(folders, [pictures, documents], HOME)).toEqual({ kind: 'none' });
    expect(
      openStep(request({ directory: true, multiple: true }), [pictures, documents], HOME),
    ).toEqual({ kind: 'choose', uris: [pictures.uri, documents.uri] });
  });

  test('a save panel has no open answer', () => {
    expect(openStep(request({ mode: 'save' }), [photo], HOME)).toEqual({ kind: 'none' });
  });

  test('a double click goes into a folder, chooses a file that fits, and does nothing else', () => {
    const images = request({ types: ['image/*'] });
    expect(activateStep(images, pictures)).toEqual({ kind: 'enter', uri: pictures.uri });
    expect(activateStep(images, photo)).toEqual({ kind: 'choose', uris: [photo.uri] });
    expect(activateStep(images, notes)).toEqual({ kind: 'none' });
    // A folder chooser still goes into the folder double clicked, as a Mac's does.
    expect(activateStep(request({ directory: true }), pictures)).toEqual({
      kind: 'enter',
      uri: pictures.uri,
    });
  });

  test('in a save panel a double click on a file puts its name in the field', () => {
    expect(activateStep(request({ mode: 'save' }), notes)).toEqual({
      kind: 'name',
      name: 'notes.txt',
    });
  });
});

describe('the save panel’s answer', () => {
  const items = [notes, pictures];

  test('a new name is a new file in the folder shown, its name escaped in the URI', () => {
    expect(saveStep('report.txt', HOME, items)).toEqual({
      kind: 'save',
      uri: `${HOME}/report.txt`,
    });
    expect(saveStep('Q1 #2?.txt', `${HOME}/`, items)).toEqual({
      kind: 'save',
      uri: `${HOME}/Q1%20%232%3F.txt`,
    });
  });

  test('the name of a file there asks before replacing it; its own URI is the answer', () => {
    expect(saveStep('notes.txt', HOME, items)).toEqual({ kind: 'replace', uri: notes.uri });
    // Names are compared exactly: another case is another file.
    expect(saveStep('Notes.txt', HOME, items)).toEqual({ kind: 'save', uri: `${HOME}/Notes.txt` });
  });

  test('a folder is never replaced by a file, and a name must keep the rules', () => {
    expect(saveStep('Pictures', HOME, items)).toEqual({
      kind: 'problem',
      problem: 'folder-taken',
    });
    expect(saveStep('', HOME, items)).toEqual({ kind: 'problem', problem: 'empty' });
    expect(saveStep('a/b', HOME, items)).toEqual({ kind: 'problem', problem: 'slash' });
    expect(saveStep('..', HOME, items)).toEqual({ kind: 'problem', problem: 'dots' });
  });

  test('a child of the file system’s root keeps one slash', () => {
    expect(childUri('file:///', 'a b')).toBe('file:///a%20b');
  });
});

describe('where the panel starts', () => {
  const places: LocalPlace[] = [
    { kind: 'pictures', name: 'Pictures', uri: `${HOME}/Pictures` },
    { kind: 'home', name: 'ada', uri: HOME },
  ];
  const everywhere = () => true;

  test('the folder the asker named, else the one kept for it, else the home', () => {
    const named = request({ folder: `${HOME}/Documents` });
    expect(startFolder(named, `${HOME}/Pictures`, places, everywhere)).toBe(`${HOME}/Documents`);
    expect(startFolder(request(), `${HOME}/Pictures`, places, everywhere)).toBe(`${HOME}/Pictures`);
    expect(startFolder(request(), null, places, everywhere)).toBe(HOME);
  });

  test('a folder no longer there is passed over, and so is one that is not a file URI', () => {
    const gone = request({ folder: `${HOME}/Gone` });
    const exists = (uri: string) => uri !== `${HOME}/Gone`;
    expect(startFolder(gone, null, places, exists)).toBe(HOME);
    expect(startFolder(request({ folder: 'https://example.com/' }), null, places, everywhere)).toBe(
      HOME,
    );
  });

  test('without a home, the first place; without places, none', () => {
    expect(startFolder(request(), null, places.slice(0, 1), everywhere)).toBe(`${HOME}/Pictures`);
    expect(startFolder(request(), null, [], everywhere)).toBeNull();
  });
});

describe('the panel’s title', () => {
  test('the asker’s, else what the panel does, in the person’s language', () => {
    const english = stringsFor('en');
    const spanish = stringsFor('es-ES');
    expect(chooserTitle(request({ title: 'Choose an image' }), english)).toBe('Choose an image');
    expect(chooserTitle(request({ title: '  ' }), english)).toBe('Open');
    expect(chooserTitle(request(), spanish)).toBe('Abrir');
    expect(chooserTitle(request({ directory: true }), english)).toBe('Choose a Folder');
    expect(chooserTitle(request({ mode: 'save' }), spanish)).toBe('Guardar');
  });
});
