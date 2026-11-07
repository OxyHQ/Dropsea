/**
 * The tags of one item or several as a field, Finder's Tags field in Get Info
 * and its Tags… panel: the tags they all have as chips, a name typed and
 * committed (Return or a comma) put on all of them, a chip removed taken off
 * all. As a name is typed the person's tags are offered first, then those found
 * on their items. A name that is none of the person's tags becomes one.
 */
import { TagField } from '@oxy.so/bloom/tag-field';
import { useFoundTagNames } from '@/hooks/use-item-tags';
import { useLocale } from '@/hooks/use-locale';
import type { TagChange } from '@/hooks/use-tag-actions';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import { commonTags, hasTag, type ItemTag, tagNameProblem, tagSuggestions } from '@/lib/tags';

export function TagsField({
  itemsTags,
  onChange,
  testID,
}: {
  /** Each item's tags. */
  itemsTags: readonly (readonly ItemTag[])[];
  onChange: (change: TagChange) => void;
  testID?: string;
}) {
  const { strings } = useLocale();
  const { definitions } = useTagDefinitions();
  const found = useFoundTagNames(true);
  const value = commonTags(itemsTags).map((tag) => tag.name);
  return (
    <TagField
      value={value}
      onChange={(next) => {
        const added = next.filter((name) => !value.some((known) => known === name));
        const removed = value.filter((name) => !next.some((kept) => kept === name));
        const add = added
          // A name that cannot be a tag's (a line break) is left out; a comma already split it.
          .filter((name) => tagNameProblem(name, []) === null)
          .map((name) => {
            const known = definitions.find((definition) => hasTag([definition], name));
            // Typed in another case, a known tag keeps its own spelling.
            return { name: known?.name ?? name.trim(), color: known?.color ?? null };
          });
        if (add.length === 0 && removed.length === 0) return;
        onChange({ add, remove: removed });
      }}
      suggestions={tagSuggestions(definitions, found)}
      normalize={(raw) => raw.trim()}
      placeholder={strings.tags.fieldPlaceholder}
      accessibilityLabel={strings.tags.field}
      testID={testID}
    />
  );
}
