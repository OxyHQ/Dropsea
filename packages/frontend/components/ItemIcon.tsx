/**
 * An item's icon, as Finder draws one: a folder as Dropsea's folder, an album
 * as a stack of photos, a document as a page with its kind's glyph, or a
 * picture as the picture itself, fitted into the icon's square.
 */
import {
  RiCodeSSlashLine,
  RiDiscLine,
  RiFileExcel2Line,
  RiFileImageLine,
  RiFileLine,
  RiFileMusicLine,
  RiFilePdf2Line,
  RiFileTextLine,
  RiFileWord2Line,
  RiFileZipLine,
  RiFilmLine,
  RiGalleryLine,
  RiGalleryView,
  RiText,
} from '@oxy.so/bloom/icons';
import { useTheme } from '@oxy.so/bloom/theme';
import { type ComponentType, useState } from 'react';
import { Image, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Kind } from '@/lib/kinds';

const FOLDER_IMAGE = require('@/assets/images/folder.png');

type Glyph = ComponentType<{ width?: number; height?: number; fill?: string }>;

const GLYPHS: Partial<Record<Kind, Glyph>> = {
  image: RiFileImageLine,
  audio: RiFileMusicLine,
  video: RiFilmLine,
  pdf: RiFilePdf2Line,
  text: RiFileTextLine,
  code: RiCodeSSlashLine,
  document: RiFileWord2Line,
  spreadsheet: RiFileExcel2Line,
  presentation: RiGalleryView,
  archive: RiFileZipLine,
  'disk-image': RiDiscLine,
  font: RiText,
};

/** The page is drawn in a square this many units across. */
const PAGE_VIEWBOX = 64;

/** Below this a page with a glyph cannot be read: a list's icon is the kind's small glyph. */
const GLYPH_FROM_SIZE = 32;

/** A page with its top corner turned, its kind's glyph in the middle where there is room for one. */
function PageArt({ size, kind }: { size: number; kind: Kind }) {
  const theme = useTheme();
  const Glyph = GLYPHS[kind] ?? RiFileTextLine;
  const glyph = Math.round(size * 0.36);
  const paper = theme.isDark ? '#2c2c30' : '#ffffff';
  const edge = theme.isDark ? '#5a5a62' : '#c9c9cf';
  // The page's edge stays a pixel wide however small the icon is drawn.
  const stroke = Math.max(1.2, PAGE_VIEWBOX / size);
  // A list's icon is too small for a glyph on a page: it is its kind's own
  // small glyph: a page with the kind drawn on it.
  if (size < GLYPH_FROM_SIZE) {
    const Small = GLYPHS[kind] ?? RiFileLine;
    return <Small width={size} height={size} fill={theme.colors.textSecondary} />;
  }
  const page = (
    <Svg width={size} height={size} viewBox={`0 0 ${PAGE_VIEWBOX} ${PAGE_VIEWBOX}`}>
      <Path
        d="M14 4h26l14 14v40a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        fill={paper}
        stroke={edge}
        strokeWidth={stroke}
      />
      <Path d="M40 4v12a2 2 0 0 0 2 2h12" fill="none" stroke={edge} strokeWidth={stroke} />
    </Svg>
  );
  return (
    <View style={{ width: size, height: size }}>
      {page}
      <View className="absolute inset-x-0 items-center" style={{ top: size * 0.4 }}>
        <Glyph width={glyph} height={glyph} fill={theme.colors.textSecondary} />
      </View>
    </View>
  );
}

/** An album: photos stacked in the accent, or its cover when it has one. */
function AlbumArt({ size, coverUrl }: { size: number; coverUrl: string | null }) {
  const theme = useTheme();
  if (coverUrl) {
    return (
      <Image
        source={{ uri: coverUrl }}
        style={{ width: size, height: size, borderRadius: size * 0.14 }}
        resizeMode="cover"
        accessible={false}
      />
    );
  }
  const glyph = Math.round(size * 0.5);
  return (
    <View
      className="items-center justify-center bg-primary-subtle"
      style={{ width: size, height: size, borderRadius: size * 0.18 }}
    >
      <RiGalleryLine width={glyph} height={glyph} fill={theme.colors.primary} />
    </View>
  );
}

export interface ItemIconProps {
  kind: Kind;
  size: number;
  /** The picture to draw instead: a local file's URI or a resolved Oxy Files URL. */
  thumbnailUrl: string | null;
  /** Fill the square with the picture (Photos' grid) rather than fit it (Finder's icons). */
  isCropped?: boolean;
  /**
   * Fill the box it is in (Photos' square, whose size follows the window), the
   * picture across all of it and anything else at `size` in its middle.
   */
  isFilling?: boolean;
  /** Names the picture, whose loading React hears (it falls back to the page when it fails). */
  testID?: string;
}

export function ItemIcon({
  kind,
  size,
  thumbnailUrl,
  isCropped = false,
  isFilling = false,
  testID,
}: ItemIconProps) {
  if (isFilling && !(thumbnailUrl && (kind === 'image' || kind === 'video'))) {
    return (
      <View className="flex-1 items-center justify-center">
        <ItemIcon kind={kind} size={size} thumbnailUrl={thumbnailUrl} isCropped={isCropped} />
      </View>
    );
  }
  if (kind === 'folder') {
    return (
      <Image
        source={FOLDER_IMAGE}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessible={false}
      />
    );
  }
  if (kind === 'album') return <AlbumArt size={size} coverUrl={thumbnailUrl} />;
  if (thumbnailUrl && (kind === 'image' || kind === 'video')) {
    // A picture the platform cannot draw (damaged, or a kind it cannot read)
    // is its kind's page again; a new picture is tried afresh.
    return (
      <Thumbnail
        key={thumbnailUrl}
        uri={thumbnailUrl}
        kind={kind}
        size={size}
        isCropped={isCropped}
        isFilling={isFilling}
        testID={testID}
      />
    );
  }
  return <PageArt size={size} kind={kind} />;
}

function Thumbnail({
  uri,
  kind,
  size,
  isCropped,
  isFilling,
  testID,
}: {
  uri: string;
  kind: Kind;
  size: number;
  isCropped: boolean;
  isFilling: boolean;
  testID: string | undefined;
}) {
  const [hasFailed, setHasFailed] = useState(false);
  if (hasFailed) {
    return isFilling ? (
      <View className="flex-1 items-center justify-center">
        <PageArt size={size} kind={kind} />
      </View>
    ) : (
      <PageArt size={size} kind={kind} />
    );
  }
  return (
    <Image
      source={{ uri }}
      style={
        isFilling
          ? { width: '100%', height: '100%', borderRadius: isCropped ? 0 : 4 }
          : { width: size, height: size, borderRadius: isCropped ? 0 : 4 }
      }
      resizeMode={isCropped ? 'cover' : 'contain'}
      accessible={false}
      onError={() => setHasFailed(true)}
      testID={testID}
    />
  );
}
