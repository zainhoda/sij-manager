import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { TextInput } from './TextInput';
import { Select } from './Select';
import { Button } from './Button';
import { spacing } from '@/theme';

interface QuickAddWorkerModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (worker: { name: string; skill_category: 'SEWING' | 'OTHER' }) => void;
}

const SKILL_OPTIONS = [
  { label: 'Sewing', value: 'SEWING' as const },
  { label: 'Other', value: 'OTHER' as const },
];

export function QuickAddWorkerModal({
  visible,
  onClose,
  onAdd,
}: QuickAddWorkerModalProps) {
  const [name, setName] = useState('');
  const [skillCategory, setSkillCategory] = useState<'SEWING' | 'OTHER'>('OTHER');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    onAdd({
      name: name.trim(),
      skill_category: skillCategory,
    });

    // Reset form
    setName('');
    setSkillCategory('OTHER');
    setError(null);
    onClose();
  };

  const handleClose = () => {
    setName('');
    setSkillCategory('OTHER');
    setError(null);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Add Temporary Worker"
      height={0.45}
      footer={
        <View style={styles.footer}>
          <Button
            title="Cancel"
            onPress={handleClose}
            variant="secondary"
            style={styles.button}
          />
          <Button
            title="Add Worker"
            onPress={handleAdd}
            variant="primary"
            style={styles.button}
          />
        </View>
      }
    >
      <View style={styles.form}>
        <TextInput
          label="Worker Name"
          placeholder="Enter name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (error) setError(null);
          }}
          error={error || undefined}
        />

        <Select
          label="Skill Category"
          value={skillCategory}
          onChange={setSkillCategory}
          options={SKILL_OPTIONS}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
  },
});
