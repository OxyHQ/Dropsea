import { describe, expect, test } from 'bun:test';
import type { PlatformBackupsState, PlatformFileVersion } from '@oxy.so/bloom/platform-surface';
import {
  backupProblem,
  canBrowseBackups,
  canBrowseVersions,
  destinationOf,
  hasBackups,
  planRestore,
  type RestoreAnswer,
  type RestoreQuestion,
  type RestoreRequest,
  versionGroups,
} from '@/lib/backups';
import type { LocalPlace } from '@/lib/local-places';
import { backupsFolderFromParams, backupsHref } from '@/lib/routes';
import { cloud, local } from './fixtures';

const PLACES: LocalPlace[] = [
  { kind: 'home', name: 'ada', uri: 'file:///home/ada/' },
  { kind: 'documents', name: 'Documents', uri: 'file:///home/ada/Documents/' },
  { kind: 'volume', name: 'USB Stick', uri: 'file:///media/ada/USB%20Stick/' },
];

const DISK = {
  id: 'disk-1',
  name: 'Backup Disk',
  kind: 'disk' as const,
  available: true,
  lastBackup: 2,
  oldestBackup: 1,
};

function state(destinations: PlatformBackupsState['destinations']): PlatformBackupsState {
  return { destinations, lastBackup: null, backingUp: false };
}

function version(time: number, size: number | null = 1): PlatformFileVersion {
  return {
    backup: { destination: 'disk-1', id: `b${time}`, time },
    isDirectory: size === null,
    size,
    lastModified: time,
  };
}

describe('when backups show', () => {
  test('only once the platform keeps them somewhere', () => {
    expect(hasBackups(null)).toBe(false);
    expect(hasBackups(undefined)).toBe(false);
    expect(hasBackups(state([]))).toBe(false);
    expect(hasBackups(state([DISK]))).toBe(true);
  });

  test('for this device’s own items outside the volumes, never Oxy Files’ or a Trash’s', () => {
    expect(canBrowseVersions(local('notes.txt'), PLACES)).toBe(true);
    expect(canBrowseVersions(local('x', { uri: 'file:///home/ada/Documents/x' }), PLACES)).toBe(
      true,
    );
    expect(
      canBrowseVersions(local('a.jpg', { uri: 'file:///media/ada/USB%20Stick/a.jpg' }), PLACES),
    ).toBe(false);
    expect(canBrowseVersions(cloud('notes.txt'), PLACES)).toBe(false);
    expect(canBrowseBackups('file:///home/ada/Documents', PLACES)).toBe(true);
    expect(canBrowseBackups('file:///media/ada/USB%20Stick/', PLACES)).toBe(false);
    expect(canBrowseBackups('file:///etc', PLACES)).toBe(false);
  });

  test('name the disk that keeps a backup', () => {
    const kept = state([DISK]);
    expect(destinationOf(kept, version(1).backup)?.name).toBe('Backup Disk');
    expect(destinationOf(kept, { destination: 'gone', id: 'x', time: 1 })).toBeNull();
  });
});

describe('versions by date', () => {
  test('group as Finder’s Date Modified does, newest first within and across groups', () => {
    const now = new Date(2026, 10, 8, 15, 0).getTime();
    const at = (day: number, hour: number, year = 2026, month = 10) =>
      new Date(year, month, day, hour).getTime();
    const groups = versionGroups(
      [
        version(at(7, 9)),
        version(at(8, 9)),
        version(at(1, 12)),
        version(at(8, 14)),
        version(at(3, 10, 2025, 2)),
        version(at(10, 10, 2026, 1)),
      ],
      now,
    );
    expect(groups.map((group) => group.period)).toEqual([
      { span: 'today' },
      { span: 'yesterday' },
      { span: 'previous-7-days' },
      { span: 'month', month: 1 },
      { span: 'year', year: 2025 },
    ]);
    expect(groups[0]?.entries.map((entry) => entry.backup.time)).toEqual([at(8, 14), at(8, 9)]);
  });
});

describe('a restore’s names taken', () => {
  const notes: RestoreRequest = {
    uri: 'file:///home/ada/notes.txt',
    name: 'notes.txt',
    isDirectory: false,
  };
  const taxes: RestoreRequest = {
    uri: 'file:///home/ada/Taxes',
    name: 'Taxes',
    isDirectory: true,
  };
  const photo: RestoreRequest = {
    uri: 'file:///home/ada/photo.jpg',
    name: 'photo.jpg',
    isDirectory: false,
  };

  function asking(answers: RestoreAnswer[]) {
    const asked: RestoreQuestion[] = [];
    const ask = async (question: RestoreQuestion) => {
      asked.push(question);
      const answer = answers.shift();
      if (!answer) throw new Error(`asked once too often: ${question.name}`);
      return answer;
    };
    return { asked, ask };
  }

  test('ask nothing when no name is taken, and replace nothing', async () => {
    const { asked, ask } = asking([]);
    const steps = await planRestore([notes, photo], new Set(['other.txt']), ask);
    expect(asked).toEqual([]);
    expect(steps?.map((step) => step.replace)).toEqual([false, false]);
  });

  test('compare names as the file system does: exactly', async () => {
    const { asked, ask } = asking([]);
    await planRestore([notes], new Set(['Notes.txt']), ask);
    expect(asked).toEqual([]);
  });

  test('ask about each taken name in order, saying how many come after', async () => {
    const { asked, ask } = asking([
      { choice: 'replace', isForAll: false },
      { choice: 'keep-both', isForAll: false },
    ]);
    const steps = await planRestore([notes, photo, taxes], new Set(['notes.txt', 'Taxes']), ask);
    expect(asked).toEqual([
      { name: 'notes.txt', isDirectory: false, remaining: 1 },
      { name: 'Taxes', isDirectory: true, remaining: 0 },
    ]);
    expect(steps?.map((step) => [step.request.name, step.replace])).toEqual([
      ['notes.txt', true],
      ['photo.jpg', false],
      ['Taxes', false],
    ]);
  });

  test('answer the rest with Apply to All', async () => {
    const { asked, ask } = asking([{ choice: 'replace', isForAll: true }]);
    const steps = await planRestore([notes, taxes], new Set(['notes.txt', 'Taxes']), ask);
    expect(asked).toHaveLength(1);
    expect(steps?.every((step) => step.replace)).toBe(true);
  });

  test('restore nothing when the person stops', async () => {
    const { ask } = asking([
      { choice: 'keep-both', isForAll: false },
      { choice: 'stop', isForAll: false },
    ]);
    expect(await planRestore([notes, taxes], new Set(['notes.txt', 'Taxes']), ask)).toBeNull();
  });
});

describe('a backup’s problems', () => {
  test('are read from the error’s code, anything else being the disk’s', () => {
    const coded = (code: string) => Object.assign(new Error(code), { code });
    expect(backupProblem(coded('unavailable'))).toBe('unavailable');
    expect(backupProblem(coded('not-permitted'))).toBe('not-permitted');
    expect(backupProblem(coded('cancelled'))).toBe('cancelled');
    expect(backupProblem(coded('exists'))).toBe('io');
    expect(backupProblem(new Error('no code'))).toBe('io');
    expect(backupProblem('unavailable')).toBe('io');
  });
});

describe('the backups’ route', () => {
  test('names a local folder, or the home when it names none', () => {
    const uri = 'file:///home/ada/Documents/';
    const href = backupsHref(uri);
    expect(href).toEqual({ pathname: '/backups', params: { uri } });
    expect(backupsFolderFromParams({ uri })).toBe(uri);
    expect(backupsHref(null)).toBe('/backups');
    expect(backupsFolderFromParams({})).toBeNull();
    expect(backupsFolderFromParams({ uri: 'https://example.com/x' })).toBeNull();
    expect(backupsFolderFromParams({ uri: [uri, 'file:///b'] })).toBe(uri);
  });
});
