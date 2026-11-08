/**
 * What the Versions window and the backups' timeline share: a date heading (Finder's periods), a
 * backup's row (its date, and what it held and where it is kept), and a restore's progress with
 * its Stop.
 */
import { Button } from '@oxy.so/bloom/button';
import { RiCloseCircleFill } from '@oxy.so/bloom/icons';
import { Item } from '@oxy.so/bloom/item';
import { Text } from '@oxy.so/bloom/typography';
import { View } from 'react-native';
import type { RestoreProgress } from '@/hooks/use-restore';
import { useLocale } from '@/hooks/use-locale';
import { formatDate, formatMonth, formatPercent, formatYear } from '@/lib/format';
import type { DatePeriod } from '@/lib/sorting';

/** A period's heading, as View › Group By › Date heads it. */
export function PeriodHeading({ period }: { period: DatePeriod }) {
  const { strings, locale } = useLocale();
  const title =
    period.span === 'month'
      ? formatMonth(period.month, locale)
      : period.span === 'year'
        ? formatYear(period.year, locale)
        : strings.periods[period.span];
  return (
    <View
      className="px-3 pt-3 pb-1"
      accessible
      accessibilityRole="header"
      accessibilityLabel={title}
    >
      <Text variant="caption-1-semibold" className="text-text-secondary">
        {title}
      </Text>
    </View>
  );
}

/** A backup's date as its row names it: “Today at 14:05”, “12 Mar 2026, 10:04”. */
export function useBackupDate(): (time: number) => string {
  const { strings, locale } = useLocale();
  return (time) => formatDate(time, Date.now(), locale, strings);
}

/** A backup in a list: its date as its name, what it held and where it is kept beneath. */
export function BackupRow({
  date,
  detail,
  isSelected,
  onPress,
  testID,
}: {
  date: string;
  detail: string;
  isSelected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Item
      size="sm"
      title={date}
      subtitle={detail}
      selected={isSelected}
      role="option"
      accessibilityLabel={date}
      onPress={onPress}
      testID={testID}
    />
  );
}

/** A restore going: what is being restored, how far, and Stop. */
export function RestoreProgressRow({
  progress,
  onStop,
}: {
  progress: RestoreProgress;
  onStop: () => void;
}) {
  const { strings, locale } = useLocale();
  const percent = progress.fraction === null ? null : formatPercent(progress.fraction, locale);
  const label = strings.backups.restoring(progress.name, percent);
  return (
    <View className="min-h-8 flex-row items-center gap-2" testID="restore-progress">
      <Text
        variant="caption-1-regular"
        numberOfLines={1}
        className="shrink text-text-secondary"
        accessibilityLiveRegion="polite"
      >
        {label}
      </Text>
      <View
        className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-fill"
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={
          progress.fraction === null
            ? undefined
            : { min: 0, max: 100, now: Math.round(progress.fraction * 100), text: percent ?? '' }
        }
      >
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round((progress.fraction ?? 0) * 100)}%` }}
        />
      </View>
      <Button
        size="xs"
        iconOnly
        appearance="plain"
        tone="neutral"
        leadingIcon={RiCloseCircleFill}
        accessibilityLabel={strings.backups.stop}
        onPress={onStop}
        testID="restore-stop-progress"
      />
    </View>
  );
}
