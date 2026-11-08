/**
 * The alert a restore asks when the name is taken where the item goes, as Time Machine asks it:
 * Keep Both (the restored item beside the one there, named by the platform, “notes
 * (original).txt”), Stop, or Replace, and Apply to All when more names taken come after it.
 * Escape answers Stop.
 */
import { Checkbox } from '@oxy.so/bloom/checkbox';
import { Dialog, type DialogAction } from '@oxy.so/bloom/dialog';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocale } from '@/hooks/use-locale';
import type { RestoreAnswer, RestoreChoice, RestoreQuestion } from '@/lib/backups';

export function RestoreAlert({
  question,
  onAnswer,
}: {
  question: RestoreQuestion | null;
  onAnswer: (answer: RestoreAnswer) => void;
}) {
  if (!question) return null;
  // Each name taken is asked afresh: Apply to All starts unchecked.
  return <RestoreQuestionAlert key={question.name} question={question} onAnswer={onAnswer} />;
}

function RestoreQuestionAlert({
  question,
  onAnswer,
}: {
  question: RestoreQuestion;
  onAnswer: (answer: RestoreAnswer) => void;
}) {
  const { strings } = useLocale();
  const [isForAll, setForAll] = useState(false);
  const answer = (choice: RestoreChoice) => onAnswer({ choice, isForAll });
  const title = strings.backups.clashTitle(question.name);
  // Each button answers at once and the answer closes the alert. Keep Both is the default, as a
  // restore never loses what is there unless asked.
  const actions: DialogAction[] = [
    {
      label: strings.clash.replace,
      onPress: () => answer('replace'),
      color: 'cancel',
      shouldCloseOnPress: false,
      testID: 'restore-replace',
    },
    {
      label: strings.clash.stop,
      onPress: () => answer('stop'),
      color: 'cancel',
      shouldCloseOnPress: false,
      testID: 'restore-stop',
    },
    {
      label: strings.clash.keepBoth,
      onPress: () => answer('keep-both'),
      shouldCloseOnPress: false,
      initialFocus: true,
      testID: 'restore-keep-both',
    },
  ];
  return (
    <Dialog
      open
      onClose={() => answer('stop')}
      placement="center"
      title={title}
      label={title}
      actions={actions}
      testID="restore-clash"
    >
      {question.remaining > 0 ? (
        <View className="pb-2">
          <Checkbox
            checked={isForAll}
            onCheckedChange={setForAll}
            label={strings.clash.applyToAll}
            testID="restore-apply-to-all"
          />
        </View>
      ) : null}
    </Dialog>
  );
}
