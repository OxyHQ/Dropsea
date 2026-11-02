/**
 * `expo-file-system`'s `Directory`, `File` and `Paths`, as the parts Dropsea uses
 * behave, over Node's file system in a folder a test makes: the tests run
 * Dropsea's own local-files module against real files, as a device would.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

function pathOf(uri: string): string {
  return decodeURI(uri.replace(/^file:\/\//, ''));
}

function uriOf(target: string, isDirectory: boolean): string {
  const written = encodeURI(`file://${target}`);
  return isDirectory ? `${written.replace(/\/+$/, '')}/` : written;
}

type Part = string | Entry;

function joined(parts: readonly Part[]): string {
  return path.join(
    ...parts.map((part) => (typeof part === 'string' ? pathOf(part) : pathOf(part.uri))),
  );
}

abstract class Entry {
  uri: string;

  constructor(isDirectory: boolean, parts: readonly Part[]) {
    this.uri = uriOf(joined(parts), isDirectory);
  }

  protected get target(): string {
    return pathOf(this.uri).replace(/\/+$/, '');
  }

  get name(): string {
    return path.basename(this.target);
  }

  get exists(): boolean {
    return fs.existsSync(this.target);
  }

  delete(): void {
    fs.rmSync(this.target, { recursive: true });
  }

  rename(name: string): void {
    const next = path.join(path.dirname(this.target), name);
    fs.renameSync(this.target, next);
    this.uri = uriOf(next, this instanceof Directory);
  }

  async move(destination: Directory): Promise<void> {
    const next = path.join(pathOf(destination.uri), this.name);
    fs.renameSync(this.target, next);
    this.uri = uriOf(next, this instanceof Directory);
  }
}

export class Directory extends Entry {
  constructor(...parts: Part[]) {
    super(true, parts);
  }

  /** Its own date, one look at it, as OxyOS publishes it (Expo's Android and iOS modules do not). */
  get lastModified(): number {
    return fs.statSync(this.target).mtimeMs;
  }

  /** As expo-file-system answers it: its size is every file's below it, read by walking its whole tree. */
  info(): { exists: boolean; size?: number; modificationTime?: number; files?: string[] } {
    const stat = fs.statSync(this.target);
    const size = fs
      .readdirSync(this.target, { recursive: true, withFileTypes: true })
      .filter((dirent) => dirent.isFile())
      .reduce(
        (total, dirent) => total + fs.statSync(path.join(dirent.parentPath, dirent.name)).size,
        0,
      );
    return {
      exists: true,
      size,
      modificationTime: stat.mtimeMs,
      files: fs.readdirSync(this.target),
    };
  }

  list(): (Directory | File)[] {
    return fs.readdirSync(this.target, { withFileTypes: true }).map((dirent) => {
      const child = path.join(this.target, dirent.name);
      return dirent.isDirectory()
        ? new Directory(uriOf(child, true))
        : new File(uriOf(child, false));
    });
  }

  createDirectory(name: string): Directory {
    const child = path.join(this.target, name);
    fs.mkdirSync(child);
    return new Directory(uriOf(child, true));
  }

  watch(onChange: () => void): { remove(): void } {
    const watcher = fs.watch(this.target, () => onChange());
    return { remove: () => watcher.close() };
  }
}

export class File extends Entry {
  constructor(...parts: Part[]) {
    super(false, parts);
  }

  info(): { exists: boolean; size?: number; modificationTime?: number } {
    const stat = fs.statSync(this.target);
    return { exists: true, size: stat.size, modificationTime: stat.mtimeMs };
  }

  async text(): Promise<string> {
    return fs.readFileSync(this.target, 'utf8');
  }

  async canPreview(): Promise<boolean> {
    return false;
  }

  async preview(): Promise<void> {
    throw new Error('No preview in the tests');
  }

  /** Writes what the test's server would send for `url`, refusing to replace a file, as expo does by default. */
  static async downloadFileAsync(
    url: string,
    destination: File,
    options: { onProgress?: (data: { bytesWritten: number; totalBytes: number }) => void } = {},
  ): Promise<File> {
    if (destination.exists) throw new Error(`Destination already exists: ${destination.uri}`);
    const body = `downloaded from ${url}`;
    options.onProgress?.({ bytesWritten: body.length / 2, totalBytes: body.length });
    fs.writeFileSync(pathOf(destination.uri), body);
    options.onProgress?.({ bytesWritten: body.length, totalBytes: body.length });
    return destination;
  }
}

/** A `Paths` whose document folder is the test's own. */
export function pathsAt(documentFolder: string) {
  return {
    get document(): Directory {
      return new Directory(uriOf(documentFolder, true));
    },
  };
}
