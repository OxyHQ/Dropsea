/**
 * Space's preview, Quick Look's: a picture as itself, a text as its words,
 * anything else as its icon and its facts.
 */
import { Dialog } from '@oxy.so/bloom/dialog';
import { Text } from '@oxy.so/bloom/typography';
import { useQuery } from '@tanstack/react-query';
import { Image, ScrollView, View } from 'react-native';
import { ItemFacts } from '@/components/ItemFacts';
import { ItemIcon } from '@/components/ItemIcon';
import { useLocale } from '@/hooks/use-locale';
import { useViewer } from '@/hooks/use-viewer';
import { assetIdOf, type Item, itemKind } from '@/lib/items';
import { readText } from '@/lib/local-files';
import { oxyServices } from '@/lib/oxy';

/** The most of a text a preview reads. */
const TEXT_PREVIEW_CHARACTERS = 64 * 1024;
const PICTURE_SIZE = 420;

/** A picture as itself, a text as its words; nothing for another kind. */
export function PictureOrText({ item }: { item: Item }) {
  const { strings } = useLocale();
  const { userId } = useViewer();
  const kind = itemKind(item);
  const assetId = assetIdOf(item);
  const isPicture = kind === 'image';
  const isText = kind === 'text' || kind === 'code';
  const content = useQuery({
    queryKey: ['preview', userId, item.key, isPicture ? 'picture' : 'text'],
    queryFn: async (): Promise<{ url: string } | { text: string }> => {
      if (isPicture) {
        if (item.source === 'local') return { url: item.uri };
        if (assetId) return { url: await oxyServices.assets.url(assetId) };
      }
      if (item.source === 'local') return { text: await readText(item, TEXT_PREVIEW_CHARACTERS) };
      if (assetId) {
        return { text: (await oxyServices.assets.text(assetId)).slice(0, TEXT_PREVIEW_CHARACTERS) };
      }
      throw new Error('Nothing to preview');
    },
    enabled: isPicture || isText,
    staleTime: 60_000,
  });
  if (!isPicture && !isText) return null;
  if (content.isError) {
    return (
      <Text variant="body-2-regular" className="text-text-secondary">
        {strings.preview.couldNotRead}
      </Text>
    );
  }
  if (!content.data) return <View style={{ height: isPicture ? PICTURE_SIZE : 120 }} />;
  if ('url' in content.data) {
    return (
      <Image
        source={{ uri: content.data.url }}
        style={{ width: PICTURE_SIZE, height: PICTURE_SIZE, maxWidth: '100%' }}
        resizeMode="contain"
        accessibilityLabel={item.name}
      />
    );
  }
  return (
    <ScrollView className="max-h-96 w-full rounded-lg bg-muted p-3">
      <Text variant="body-2-regular" className="font-mono text-foreground" selectable>
        {content.data.text}
      </Text>
    </ScrollView>
  );
}

export function PreviewDialog({
  item,
  origin,
  onClose,
}: {
  item: Item | null;
  origin: string | null;
  onClose: () => void;
}) {
  const { strings } = useLocale();
  const kind = item ? itemKind(item) : 'file';
  return (
    <Dialog open={item !== null} onClose={onClose} title={item?.name} testID="preview">
      {item ? (
        <View className="items-center gap-4 p-2">
          {kind === 'image' || kind === 'text' || kind === 'code' ? (
            <PictureOrText item={item} />
          ) : (
            <ItemIcon kind={kind} size={128} thumbnailUrl={null} />
          )}
          <ItemFacts item={item} origin={origin} />
          {kind !== 'image' && kind !== 'text' && kind !== 'code' ? (
            <Text variant="caption-1-regular" className="text-text-secondary">
              {strings.preview.noPreview}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Dialog>
  );
}
