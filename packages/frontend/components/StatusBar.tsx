/**
 * The bars under the items, Finder's: the path bar (each folder down to this
 * one a way back up and a place to drop files, for a place on this device,
 * while View › Show Path Bar is on) and the status bar (how many items there
 * are, or how many of them are selected; or, while a move or a copy that has
 * taken more than half a second goes on, its progress and its stop button).
 * The pane's `Screen` places them at its bottom and keeps the items clear of
 * them.
 */
import { useAppShellPanel } from '@oxy.so/bloom/app-shell';
import { Button } from '@oxy.so/bloom/button';
import { RiCloseCircleFill } from '@oxy.so/bloom/icons';
import { Text } from '@oxy.so/bloom/typography';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PathBar, type PathBarDrops, type PathPart } from '@/components/PathBar';
import { useLocale } from '@/hooks/use-locale';
import { formatPercent } from '@/lib/format';
import { type OperationProgress, stopOperation } from '@/lib/operations';

export function StatusBar({
  text,
  path,
  onPath,
  drops,
  progress,
}: {
  text: string;
  /** The folders down to this one, for a place on this device; empty where none is shown. */
  path: readonly PathPart[];
  onPath: (uri: string) => void;
  /** What a drop on the path bar does; null where nothing is dropped (the file chooser). */
  drops: PathBarDrops | null;
  /** The move or copy going, once it has taken half a second. */
  progress: OperationProgress | null;
}) {
  const { strings, locale } = useLocale();
  // A pane drawn edge to edge (a phone's) ends at the screen's bottom, over its home indicator.
  const panel = useAppShellPanel();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="border-t border-border"
      style={{ paddingBottom: panel.framed ? 0 : insets.bottom }}
    >
      {path.length > 0 ? <PathBar path={path} onPath={onPath} drops={drops} /> : null}
      {progress ? (
        <View className="min-h-6.5 flex-row items-center gap-2 px-3" testID="progress">
          <Text
            variant="caption-1-regular"
            numberOfLines={1}
            className="shrink text-text-secondary"
            accessibilityLiveRegion="polite"
          >
            {progress.isStopping
              ? strings.transfers.stopping
              : strings.transfers.relocating(
                  progress.relocation,
                  progress.count,
                  progress.folderName,
                )}
          </Text>
          <View
            className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-fill"
            accessibilityRole="progressbar"
            accessibilityLabel={strings.transfers.relocating(
              progress.relocation,
              progress.count,
              progress.folderName,
            )}
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(progress.fraction * 100),
              text: formatPercent(progress.fraction, locale),
            }}
          >
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </View>
          <Button
            size="xs"
            iconOnly
            appearance="plain"
            tone="neutral"
            leadingIcon={RiCloseCircleFill}
            accessibilityLabel={strings.transfers.stop}
            disabled={progress.isStopping}
            onPress={stopOperation}
            testID="stop"
          />
        </View>
      ) : (
        <View className="min-h-6.5 items-center justify-center">
          <Text
            variant="caption-1-regular"
            className="text-text-secondary"
            testID="status"
            accessibilityLiveRegion="polite"
          >
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}
