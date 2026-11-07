/** The dialog that names a tag, new or renamed: the name is checked as it is typed. */
import { Dialog } from '@oxy.so/bloom/dialog';
import { TextFieldInput } from '@oxy.so/bloom/text-field';
import { Text } from '@oxy.so/bloom/typography';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocale } from '@/hooks/use-locale';
import { isSameTag, TAG_NAME_MAX, tagNameProblem } from '@/lib/tags';

export function TagNameDialog({
  title,
  initialName,
  others,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  initialName: string;
  /** The person's other tags' names: a name of theirs is taken, case aside. */
  others: readonly string[];
  confirmLabel: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const { strings } = useLocale();
  const [name, setName] = useState(initialName);
  // Its own name, in another case, is no other tag's.
  const problem = tagNameProblem(
    name,
    others.filter((other) => !isSameTag(other, initialName)),
  );
  const canSave = problem === null && name.trim() !== initialName;
  const handleConfirm = () => {
    if (canSave) onConfirm(name.trim());
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      testID="tag-name"
      actions={[
        { label: confirmLabel, onPress: handleConfirm, disabled: !canSave },
        { label: strings.cancel, color: 'cancel' },
      ]}
    >
      <View className="gap-1 pt-2 pb-1">
        <TextFieldInput
          label={strings.tags.tagName}
          value={name}
          onValueChange={setName}
          autoFocus
          selectTextOnFocus
          maxLength={TAG_NAME_MAX}
          invalid={problem !== null && problem !== 'empty'}
          onSubmitEditing={() => {
            if (!canSave) return;
            handleConfirm();
            onClose();
          }}
        />
        {problem !== null && problem !== 'empty' ? (
          <Text variant="caption-1-regular" className="text-text-destructive" role="alert">
            {strings.tags.problems[problem]}
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
}
