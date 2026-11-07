/**
 * A group's header among the items (View › Group By), as Finder draws one: the
 * group's name in bold over a hairline, a tag's mark before a tag's name. It
 * is no item: nothing selects it, a press on it is a press on the background,
 * and a screen reader says it as a heading.
 */
import { Text } from '@oxy.so/bloom/typography';
import { View } from 'react-native';
import { TagMark } from '@/components/TagMark';
import { useLocale } from '@/hooks/use-locale';
import { formatMonth, formatYear } from '@/lib/format';
import type { GroupHeading } from '@/lib/sorting';
import { type TagStyle, tagColorOf, tagKey } from '@/lib/tags';

export function GroupHeader({
  heading,
  tagStyle,
  top,
  height,
  isList,
}: {
  heading: GroupHeading;
  tagStyle: TagStyle;
  top: number;
  height: number;
  /** In the list it spans the rows' inset; in the grid, the grid's. */
  isList: boolean;
}) {
  const { strings, locale } = useLocale();
  const { title, tag } = (() => {
    switch (heading.by) {
      case 'kind':
        return { title: heading.name, tag: null };
      case 'tags':
        // A tag's name as the person spells it; the untagged under "No Tags", with no mark.
        return heading.tag
          ? {
              title: tagStyle.known.get(tagKey(heading.tag.name))?.name ?? heading.tag.name,
              tag: heading.tag,
            }
          : { title: strings.tags.noTags, tag: null };
      case 'date': {
        const { period } = heading;
        if (period.span === 'month') return { title: formatMonth(period.month, locale), tag: null };
        if (period.span === 'year') return { title: formatYear(period.year, locale), tag: null };
        return { title: strings.periods[period.span], tag: null };
      }
    }
  })();
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="header"
      accessibilityLabel={title}
      className={`absolute flex-row items-end border-b border-border pb-1 ${isList ? 'inset-x-2.5 px-2' : 'inset-x-0 px-1'}`}
      style={{ top, height }}
    >
      <View className="min-w-0 flex-row items-center gap-1.5">
        {tag ? <TagMark color={tagColorOf(tag, tagStyle.known)} size={10} /> : null}
        <Text
          variant="body-2-semibold"
          numberOfLines={1}
          selectable={false}
          className="min-w-0 shrink text-foreground"
        >
          {title}
        </Text>
      </View>
    </View>
  );
}
