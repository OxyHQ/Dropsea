/** Dropsea's settings, as Finder's: today its Tags. */
import { RiPriceTag3Line } from '@oxy.so/bloom/icons';
import { SettingsModal } from '@oxy.so/bloom/settings-modal';
import { TagsSettings } from '@/components/TagsSettings';
import { useLocale } from '@/hooks/use-locale';

export function SettingsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { strings } = useLocale();
  return (
    <SettingsModal
      open={isOpen}
      onClose={onClose}
      groups={[
        {
          key: 'dropsea',
          label: strings.appName,
          items: [
            { key: 'tags', label: strings.tags.settingsTitle, icon: RiPriceTag3Line, page: 'tags' },
          ],
        },
      ]}
      pages={{ tags: { title: strings.tags.settingsTitle, content: <TagsSettings /> } }}
      testID="settings"
    />
  );
}
