/**
 * Finder's alert for a name taken (OxyOS ADR 0047, decision 15): “An item named “notes.txt”
 * already exists in this location. Do you want to replace it with the one you're moving?”, with
 * Keep Both, Stop and Replace (Replace not offered for the item itself nor a folder holding it),
 * and Apply to All when more clashes come after it. Escape answers Stop. It asks about the
 * window's move or copy going (`lib/operations`), one clash at a time.
 */
import { Checkbox } from '@oxy.so/bloom/checkbox';
import { Dialog, type DialogAction } from '@oxy.so/bloom/dialog';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocale } from '@/hooks/use-locale';
import { answerClash, useOperations } from '@/lib/operations';
import type { ClashChoice, ClashQuestion } from '@/lib/transfer';

export function ClashAlert() {
  const { question } = useOperations();
  if (!question) return null;
  // Each clash is asked afresh: Apply to All starts unchecked.
  return <ClashQuestionAlert key={question.clash.item.uri} question={question} />;
}

function ClashQuestionAlert({ question }: { question: ClashQuestion }) {
  const { strings } = useLocale();
  const [isForAll, setForAll] = useState(false);
  const { clash, relocation, remaining } = question;
  const answer = (choice: ClashChoice) => answerClash({ choice, isForAll });
  // Each button answers at once and the question closes the alert, so none asks the dialog to.
  // Replace is the default button, as Finder's; without it, Keep Both is.
  const actions: DialogAction[] = [
    {
      label: strings.clash.keepBoth,
      onPress: () => answer('keep-both'),
      color: clash.canReplace ? 'cancel' : 'default',
      shouldCloseOnPress: false,
      initialFocus: !clash.canReplace,
      testID: 'clash-keep-both',
    },
    {
      label: strings.clash.stop,
      onPress: () => answer('stop'),
      color: 'cancel',
      shouldCloseOnPress: false,
      testID: 'clash-stop',
    },
  ];
  if (clash.canReplace) {
    actions.push({
      label: strings.clash.replace,
      onPress: () => answer('replace'),
      shouldCloseOnPress: false,
      initialFocus: true,
      testID: 'clash-replace',
    });
  }
  return (
    <Dialog
      open
      onClose={() => answer('stop')}
      placement="center"
      title={strings.clash.title(clash.item.name, relocation)}
      actions={actions}
      label={strings.clash.title(clash.item.name, relocation)}
      testID="clash"
    >
      {remaining > 0 ? (
        <View className="pb-2">
          <Checkbox
            checked={isForAll}
            onCheckedChange={setForAll}
            label={strings.clash.applyToAll}
            testID="clash-apply-to-all"
          />
        </View>
      ) : null}
    </Dialog>
  );
}
