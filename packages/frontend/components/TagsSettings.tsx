/**
 * Settings › Tags, as Finder's: every one of the person's tags, each with its
 * colour (a press chooses another), its name (a press renames it, on every
 * item that has it too), whether the sidebar shows it, and a menu to delete it
 * (from every item too, once the person confirms); a new tag; and the
 * favourite tags as a row of chips dragged into the order the sidebar, the
 * menus and the keyboard's Mod+Alt+1 to 7 follow.
 */
import { AlertDialog } from '@oxy.so/bloom/alert-dialog';
import { Button } from '@oxy.so/bloom/button';
import { Checkbox } from '@oxy.so/bloom/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@oxy.so/bloom/dropdown-menu';
import { RiAddLine, RiMoreLine } from '@oxy.so/bloom/icons';
import { SortableChipRow } from '@oxy.so/bloom/sortable-chip-row';
import { toast } from '@oxy.so/bloom/toast';
import { Text } from '@oxy.so/bloom/typography';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { TagMark } from '@/components/TagMark';
import { TagNameDialog } from '@/components/TagNameDialog';
import { useLocale } from '@/hooks/use-locale';
import { useTagActions } from '@/hooks/use-tag-actions';
import {
  favouriteTags,
  isSameTag,
  isTagColor,
  TAG_COLORS,
  type TagDefinition,
  updatedDefinition,
  withDefinition,
} from '@/lib/tags';

/** The radio value of "no colour". */
const NO_COLOR = 'none';

export function TagsSettings() {
  const { strings } = useLocale();
  const actions = useTagActions();
  const { definitions } = actions;
  const [renaming, setRenaming] = useState<TagDefinition | null>(null);
  const [isAdding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<TagDefinition | null>(null);
  const names = definitions.map((definition) => definition.name);

  const keep = (next: readonly TagDefinition[]) => {
    actions.save(next).catch((error: unknown) => {
      console.warn('Dropsea could not keep the person’s tags', error);
      toast.error(strings.couldNotChange);
    });
  };
  const run = (work: Promise<void>, what: string) => {
    work.catch((error: unknown) => {
      console.warn(`Dropsea could not ${what}`, error);
      toast.error(strings.couldNotChange);
    });
  };

  const favourites = favouriteTags(definitions);
  return (
    <View className="gap-5" testID="tags-settings">
      <Text variant="body-2-regular" className="text-text-secondary">
        {strings.tags.settingsHint}
      </Text>
      {favourites.length > 0 ? (
        <SortableChipRow
          accessibilityLabel={strings.tags.section}
          items={favourites.map((definition) => ({
            key: definition.name,
            label: definition.name,
            node: (
              <View className="flex-row items-center gap-1.5 rounded-full bg-fill px-2.5 py-1">
                <TagMark color={definition.color} size={10} />
                <Text variant="caption-1-medium" className="text-foreground">
                  {definition.name}
                </Text>
              </View>
            ),
          }))}
          onReorder={(keys) => {
            // The favourites in their new order first, the rest after them as they were.
            const ordered = keys.flatMap((key) =>
              definitions.filter((definition) => definition.name === key),
            );
            keep([...ordered, ...definitions.filter((definition) => !definition.isFavourite)]);
          }}
          testID="favourite-tags"
        />
      ) : null}
      <View>
        {definitions.map((definition) => (
          <View
            key={definition.name}
            className="flex-row items-center gap-3 border-b border-border py-2"
            testID={`tag-row-${definition.name}`}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${strings.tags.color}: ${
                    definition.color ? strings.tags.colors[definition.color] : strings.tags.noColor
                  }`}
                  hitSlop={8}
                  className="h-6 w-6 items-center justify-center"
                >
                  <TagMark color={definition.color} size={14} />
                </Pressable>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={definition.color ?? NO_COLOR}
                  onValueChange={(value) =>
                    keep(
                      updatedDefinition(definitions, definition.name, {
                        color: isTagColor(value) ? value : null,
                      }),
                    )
                  }
                >
                  {TAG_COLORS.map((color) => (
                    <DropdownMenuRadioItem key={color} value={color}>
                      {strings.tags.colors[color]}
                    </DropdownMenuRadioItem>
                  ))}
                  <DropdownMenuRadioItem value={NO_COLOR}>
                    {strings.tags.noColor}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${definition.name}, ${strings.tags.renameTag}`}
              onPress={() => setRenaming(definition)}
              className="min-w-0 flex-1"
            >
              <Text variant="body-2-regular" numberOfLines={1} className="text-foreground">
                {definition.name}
              </Text>
            </Pressable>
            <Checkbox
              checked={definition.isFavourite}
              onCheckedChange={(isFavourite) =>
                keep(updatedDefinition(definitions, definition.name, { isFavourite }))
              }
              label={strings.tags.showInSidebar}
              testID={`tag-favourite-${definition.name}`}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="xs"
                  iconOnly
                  appearance="plain"
                  tone="neutral"
                  leadingIcon={RiMoreLine}
                  accessibilityLabel={strings.tags.options(definition.name)}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onPress={() => setRenaming(definition)}>
                  {strings.tags.renameTag}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem tone="danger" onPress={() => setDeleting(definition)}>
                  {strings.tags.deleteTag}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
        ))}
      </View>
      <View className="flex-row">
        <Button
          size="sm"
          appearance="plain"
          tone="neutral"
          leadingIcon={RiAddLine}
          onPress={() => setAdding(true)}
          testID="new-tag"
        >
          {strings.tags.newTag}
        </Button>
      </View>
      {renaming ? (
        <TagNameDialog
          key={renaming.name}
          title={strings.tags.renameTitle}
          initialName={renaming.name}
          others={names}
          confirmLabel={strings.save}
          onConfirm={(name) => run(actions.rename(renaming.name, name), 'rename a tag')}
          onClose={() => setRenaming(null)}
        />
      ) : null}
      {isAdding ? (
        <TagNameDialog
          title={strings.tags.newTag}
          initialName=""
          others={names}
          confirmLabel={strings.save}
          onConfirm={(name) =>
            keep(withDefinition(definitions, { name, color: null, isFavourite: true }))
          }
          onClose={() => setAdding(false)}
        />
      ) : null}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null);
        }}
        title={deleting ? strings.tags.deleteTitle(deleting.name) : ''}
        description={strings.tags.deleteBody}
        confirmLabel={strings.tags.deleteAction}
        cancelLabel={strings.cancel}
        destructive
        onConfirm={() => {
          const name = deleting?.name;
          setDeleting(null);
          if (name && definitions.some((definition) => isSameTag(definition.name, name))) {
            run(actions.remove(name), 'delete a tag');
          }
        }}
        onCancel={() => setDeleting(null)}
        testID="delete-tag"
      />
    </View>
  );
}
