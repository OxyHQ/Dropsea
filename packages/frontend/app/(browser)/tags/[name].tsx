import { RiPriceTag3Line } from '@oxy.so/bloom/icons';
import { useLocalSearchParams } from 'expo-router';
import { Browser } from '@/components/Browser';
import { useLocale } from '@/hooks/use-locale';
import { useTaggedItems } from '@/hooks/use-tagged-items';

/** Every item with a tag, on this device and in Oxy Files: a sidebar tag's place, as Finder's. */
export default function TagScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  return <Tag key={name} name={name ?? ''} />;
}

function Tag({ name }: { name: string }) {
  const { strings } = useLocale();
  const tagged = useTaggedItems(name);
  return (
    <Browser
      listing={{
        location: { kind: 'tag', name },
        title: name,
        items: tagged.items,
        status: tagged.status,
        layout: 'files',
        empty: {
          icon: RiPriceTag3Line,
          title: strings.tags.empty(name),
          hint: strings.tags.emptyHint,
        },
        onRetry: tagged.retry,
      }}
    />
  );
}
