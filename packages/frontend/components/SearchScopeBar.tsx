/**
 * The bar above a search's results, Finder's scope bar: where the search
 * looks, everywhere on the computer (Finder's "This Mac", the default) or in
 * the folder the window showed; and, while the platform is still indexing, a
 * word that the results may not be complete yet.
 */
import { ButtonGroup, ButtonGroupItem } from '@oxy.so/bloom/button-group';
import { Text } from '@oxy.so/bloom/typography';
import { View } from 'react-native';
import { useLocale } from '@/hooks/use-locale';
import type { SearchScope } from '@/lib/search';

export function SearchScopeBar({
  scope,
  onScope,
  folderName,
  isIndexing,
}: {
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
  /** The folder the window showed, which the folder's scope looks in. */
  folderName: string;
  isIndexing: boolean;
}) {
  const { strings } = useLocale();
  const words = strings.searching;
  return (
    <View
      className="flex-row items-center gap-2 border-b border-border px-3 py-1.5"
      testID="search-scope-bar"
    >
      <Text variant="caption-1-medium" className="text-text-secondary">
        {words.scope}
      </Text>
      <ButtonGroup size="xs" accessibilityLabel={words.scopeLabel}>
        <ButtonGroupItem
          selected={scope === 'computer'}
          onPress={() => onScope('computer')}
          accessibilityLabel={words.thisComputer}
          testID="search-scope-computer"
        >
          {words.thisComputer}
        </ButtonGroupItem>
        <ButtonGroupItem
          selected={scope === 'folder'}
          onPress={() => onScope('folder')}
          accessibilityLabel={words.folder(folderName)}
          testID="search-scope-folder"
        >
          {words.folder(folderName)}
        </ButtonGroupItem>
      </ButtonGroup>
      {isIndexing ? (
        <Text
          variant="caption-1-regular"
          numberOfLines={1}
          className="ms-auto text-text-secondary"
          testID="search-indexing"
        >
          {words.indexing}
        </Text>
      ) : null}
    </View>
  );
}
