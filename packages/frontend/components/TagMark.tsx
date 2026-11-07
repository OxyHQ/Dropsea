/**
 * A tag's mark where it stands for the tag itself (a sidebar row, a menu, the
 * Tags settings): a dot of its colour, or a ring for a tag with none, as
 * Finder marks them.
 */
import { useTheme } from '@oxy.so/bloom/theme';
import { View } from 'react-native';
import { type TagColor, tagColorValue } from '@/lib/tags';

export function TagMark({ color, size = 12 }: { color: TagColor | null; size?: number }) {
  const theme = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        ...(color
          ? { backgroundColor: tagColorValue(color, theme.isDark) }
          : { borderWidth: 1.5, borderColor: theme.colors.textSecondary }),
      }}
    />
  );
}
