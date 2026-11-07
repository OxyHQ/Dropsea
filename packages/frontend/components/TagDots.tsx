/**
 * An item's coloured tags as Finder draws them by its name: small dots, each
 * overlapping the one before it, edged in what they sit on so they read apart;
 * three at most, the person's first. A tag with no colour has no dot. What they
 * are is said in words by the item itself, so the dots are never read.
 */
import { useTheme } from '@oxy.so/bloom/theme';
import { View } from 'react-native';
import { type ItemTag, type TagColor, tagColorValue } from '@/lib/tags';

/** The most dots drawn, as Finder's. */
const MAX_DOTS = 3;

/** A tag's dot: its name (what keys it) and its colour. */
export interface TagDot {
  name: string;
  color: TagColor;
}

export function TagDots({
  dots,
  size,
  edge,
}: {
  /** The item's coloured tags, in the person's order. */
  dots: readonly TagDot[];
  /** A dot's diameter. */
  size: number;
  /** What the dots sit on: their edge's colour. */
  edge: string;
}) {
  const theme = useTheme();
  const shown = dots.slice(0, MAX_DOTS);
  if (shown.length === 0) return null;
  const overlap = Math.round(size * 0.4);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center"
    >
      {shown.map(({ name, color }, index) => (
        <View
          key={name}
          style={{
            width: size + 2,
            height: size + 2,
            borderRadius: (size + 2) / 2,
            borderWidth: 1,
            borderColor: edge,
            backgroundColor: tagColorValue(color, theme.isDark),
            marginStart: index === 0 ? 0 : -overlap,
            zIndex: shown.length - index,
          }}
        />
      ))}
    </View>
  );
}

/** The dots of `tags` (those with a colour), as an item draws them. */
export function tagDots(
  tags: readonly ItemTag[],
  colorOf: (tag: ItemTag) => TagColor | null,
): TagDot[] {
  return tags.flatMap((tag) => {
    const color = colorOf(tag);
    return color ? [{ name: tag.name, color }] : [];
  });
}
