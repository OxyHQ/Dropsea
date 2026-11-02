/**
 * What an item is (its kind), from whether it is a folder or an album, its
 * MIME type when its source knows one (Oxy Files does), else its extension.
 */
import { splitExtension } from '@/lib/names';

export type Kind =
  | 'folder'
  | 'album'
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'text'
  | 'code'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'disk-image'
  | 'font'
  | 'file';

const EXTENSIONS: Record<Exclude<Kind, 'folder' | 'album' | 'file'>, string> = {
  image: 'png jpg jpeg gif webp heic heif avif bmp tif tiff svg ico raw cr2 nef dng',
  audio: 'mp3 m4a aac flac wav ogg oga opus aiff aif wma mid midi',
  video: 'mp4 m4v mov mkv webm avi wmv mpg mpeg ogv 3gp',
  pdf: 'pdf',
  text: 'txt md markdown rtf log csv tsv nfo',
  code: 'js jsx ts tsx mjs cjs json rs c h cc cpp hpp py rb go java kt swift sh zsh bash fish css scss html htm xml yaml yml toml ini conf sql lua php pl mdx',
  document: 'doc docx odt pages epub',
  spreadsheet: 'xls xlsx ods numbers',
  presentation: 'ppt pptx odp key',
  archive: 'zip tar gz tgz bz2 xz zst 7z rar deb rpm',
  'disk-image': 'iso img dmg qcow2 vmdk',
  font: 'ttf otf woff woff2',
};

const KIND_BY_EXTENSION = new Map<string, Kind>();
for (const [kind, extensions] of Object.entries(EXTENSIONS)) {
  for (const extension of extensions.split(' ')) {
    KIND_BY_EXTENSION.set(extension, kind as Kind);
  }
}

const KIND_BY_MIME: Record<string, Kind> = {
  'application/pdf': 'pdf',
  'application/json': 'code',
  'application/zip': 'archive',
  'application/gzip': 'archive',
  'application/x-tar': 'archive',
  'application/vnd.rar': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.oasis.opendocument.text': 'document',
  'application/epub+zip': 'document',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.oasis.opendocument.spreadsheet': 'spreadsheet',
  'application/vnd.ms-powerpoint': 'presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/vnd.oasis.opendocument.presentation': 'presentation',
};

/** An item's extension, lowercased and without its dot; none for a name without one or a dot file. */
export function extensionOf(name: string): string {
  return splitExtension(name).extension.slice(1).toLowerCase();
}

function kindOfMime(mime: string): Kind | null {
  const type = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  const known = KIND_BY_MIME[type];
  if (known) return known;
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('font/')) return 'font';
  if (type === 'text/plain' || type === 'text/markdown' || type === 'text/csv') return 'text';
  if (type.startsWith('text/')) return 'code';
  return null;
}

/** What an item is: a folder or an album first, then by its MIME type, then by its extension. */
export function kindOf(item: {
  name: string;
  isFolder: boolean;
  isAlbum?: boolean;
  mime: string | null;
}): Kind {
  if (item.isAlbum) return 'album';
  if (item.isFolder) return 'folder';
  const byMime = item.mime ? kindOfMime(item.mime) : null;
  if (byMime && byMime !== 'code') return byMime;
  return KIND_BY_EXTENSION.get(extensionOf(item.name)) ?? byMime ?? 'file';
}

/** The order of kinds when a list is sorted by kind: containers first, then media, then documents. */
export const KIND_ORDER: readonly Kind[] = [
  'folder',
  'album',
  'image',
  'video',
  'audio',
  'pdf',
  'document',
  'spreadsheet',
  'presentation',
  'text',
  'code',
  'archive',
  'disk-image',
  'font',
  'file',
];

/** The MIME type a file's name says it is, for an upload whose source knows none. */
export function mimeForName(name: string): string {
  const extension = extensionOf(name);
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
    case 'gif':
    case 'webp':
    case 'avif':
    case 'bmp':
    case 'heic':
    case 'heif':
    case 'tiff':
      return `image/${extension}`;
    case 'svg':
      return 'image/svg+xml';
    case 'mp4':
    case 'webm':
      return `video/${extension}`;
    case 'mov':
      return 'video/quicktime';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
    case 'flac':
    case 'ogg':
      return `audio/${extension}`;
    case 'm4a':
      return 'audio/mp4';
    case 'pdf':
      return 'application/pdf';
    case 'json':
      return 'application/json';
    case 'zip':
      return 'application/zip';
    case 'txt':
    case 'log':
      return 'text/plain';
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'csv':
      return 'text/csv';
    case 'html':
    case 'htm':
      return 'text/html';
    default:
      return 'application/octet-stream';
  }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/** The extension a file of a MIME type takes, for a name that has none; none for a type Dropsea does not know. */
export function extensionForMime(mime: string | null): string {
  if (!mime) return '';
  return EXTENSION_BY_MIME[mime.split(';')[0]?.trim().toLowerCase() ?? ''] ?? '';
}
