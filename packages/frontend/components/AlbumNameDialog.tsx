/** The dialog that names an album, new or renamed. */
import { Dialog } from '@oxy.so/bloom/dialog';
import { TextFieldInput } from '@oxy.so/bloom/text-field';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocale } from '@/hooks/use-locale';

/** The longest album name Dropsea's backend keeps. */
const MAX_ALBUM_NAME_LENGTH = 200;

export function AlbumNameDialog({
  isOpen,
  title,
  initialName,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  initialName: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const { strings } = useLocale();
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= MAX_ALBUM_NAME_LENGTH;
  const handleConfirm = () => {
    if (canSave) onConfirm(trimmed);
  };
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={title}
      testID="album-name"
      actions={[
        { label: confirmLabel, onPress: handleConfirm, disabled: !canSave },
        { label: strings.cancel, color: 'cancel' },
      ]}
    >
      <View className="pt-2 pb-1">
        <TextFieldInput
          label={strings.albumName}
          value={name}
          onValueChange={setName}
          autoFocus
          selectTextOnFocus
          maxLength={MAX_ALBUM_NAME_LENGTH}
          onSubmitEditing={() => {
            if (!canSave) return;
            handleConfirm();
            onClose();
          }}
        />
      </View>
    </Dialog>
  );
}
