/**
 * Finder's path bar (OxyOS ADR 0047, decision 13): the folders from the home (or a volume's root,
 * or the computer's for a folder outside both) down to the one shown, each with its folder's
 * picture and name, a press away. Each is a drop target too: files dropped on a segment go into
 * its folder, moved or copied as the platform prefers for that folder's volume, and a segment
 * held under a drag springs open. Squeezed, a segment keeps its picture and cuts its name, as
 * Finder's do.
 */
import { DropZone, type DropTargetDropEvent } from '@oxy.so/bloom/drop-zone';
import { RiArrowRightSLine } from '@oxy.so/bloom/icons';
import { useTheme } from '@oxy.so/bloom/theme';
import { Text } from '@oxy.so/bloom/typography';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ItemIcon } from '@/components/ItemIcon';
import { useLocale } from '@/hooks/use-locale';
import { useSpringLoading } from '@/hooks/use-spring-loading';

const SEGMENT_ICON = 14;
const DROP_ACCEPT = ['files'] as const;
const DROP_ACTIONS = ['move', 'copy'] as const;

export interface PathPart {
  name: string;
  uri: string;
}

export interface PathBarDrops {
  /** Files dropped on a segment, into its folder. */
  onDropFiles: (uris: readonly string[], folderUri: string, action: 'copy' | 'move') => void;
  /** A segment held under a drag springs open in the window. */
  onSpringOpen: (folderUri: string) => void;
}

export function PathBar({
  path,
  onPath,
  drops,
}: {
  path: readonly PathPart[];
  onPath: (uri: string) => void;
  /** What a drop on a segment does; null where nothing is dropped (the file chooser). */
  drops: PathBarDrops | null;
}) {
  const { strings } = useLocale();
  const theme = useTheme();
  // The segment a drag of files is over now, lit as Finder lights it.
  const [dropOver, setDropOver] = useState<string | null>(null);
  const { spring, isUnlit } = useSpringLoading((uri) => drops?.onSpringOpen(uri));
  return (
    <View
      className="min-h-7 flex-row items-center border-b border-border px-2"
      accessibilityRole="toolbar"
      accessibilityLabel={strings.path}
      testID="path"
    >
      {path.map((part, index) => {
        const isCurrent = index === path.length - 1;
        const isLit = dropOver === part.uri && !isUnlit;
        const segment = (
          <Pressable
            onPress={() => onPath(part.uri)}
            accessibilityRole="link"
            accessibilityLabel={part.name}
            accessibilityState={{ selected: isCurrent }}
            className={`min-w-0 flex-row items-center gap-1 rounded-[5px] px-1 py-0.5 ${isLit ? 'bg-primary' : ''}`}
          >
            <ItemIcon kind="folder" size={SEGMENT_ICON} thumbnailUrl={null} />
            <Text
              variant={isCurrent ? 'caption-1-medium' : 'caption-1-regular'}
              numberOfLines={1}
              className="min-w-0 shrink"
              style={{
                color: isLit
                  ? theme.colors.primaryForeground
                  : isCurrent
                    ? theme.colors.text
                    : theme.colors.textSecondary,
              }}
            >
              {part.name}
            </Text>
          </Pressable>
        );
        const handleDrop = ({ action, data }: DropTargetDropEvent) => {
          setDropOver(null);
          spring.cancel();
          const uris = data.files.flatMap((file) => (file.uri ? [file.uri] : []));
          if (uris.length === 0 || action === 'link') return;
          drops?.onDropFiles(uris, part.uri, action);
        };
        return (
          <View key={part.uri} className="min-w-0 shrink flex-row items-center">
            {index > 0 ? <RiArrowRightSLine size="xs" color={theme.colors.textTertiary} /> : null}
            {drops ? (
              <DropZone
                accept={DROP_ACCEPT}
                actions={DROP_ACTIONS}
                folder={part.uri}
                onDragEnter={(event) => {
                  setDropOver(part.uri);
                  spring.hover(event.action && !isCurrent ? part.uri : null);
                }}
                onDragOver={(event) => spring.hover(event.action && !isCurrent ? part.uri : null)}
                onDragLeave={() => {
                  setDropOver((over) => (over === part.uri ? null : over));
                  spring.leave(part.uri);
                }}
                onDrop={handleDrop}
                style={{ minWidth: 0, flexShrink: 1 }}
              >
                {segment}
              </DropZone>
            ) : (
              segment
            )}
          </View>
        );
      })}
    </View>
  );
}
