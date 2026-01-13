import { useState } from 'react';
import { StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router, Stack } from 'expo-router';

import { View, Text } from '@/components/Themed';
import { Button, TextInput, Select, SelectOption, Card } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { createWorker } from '@/api/client';

type SkillCategory = 'SEWING' | 'OTHER';

const skillOptions: SelectOption<SkillCategory>[] = [
  { value: 'SEWING', label: 'Sewing', description: 'Can operate sewing machines' },
  { value: 'OTHER', label: 'General', description: 'Cutting, inspection, and other tasks' },
];

export default function NewWorkerScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [skillCategory, setSkillCategory] = useState<SkillCategory>('OTHER');

  const validateForm = (): string | null => {
    if (!name.trim()) return 'Please enter a name';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await createWorker({
        name: name.trim(),
        employee_id: employeeId.trim() || undefined,
        skill_category: skillCategory,
      });

      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create worker');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New Worker',
          headerBackTitle: 'Cancel',
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Add Worker</Text>
          <Text style={styles.subtitle}>
            Add a new worker to your production team.
          </Text>

          <Card style={styles.formCard}>
            <TextInput
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Enter worker name"
              autoCapitalize="words"
              style={styles.field}
            />

            <TextInput
              label="Employee ID (optional)"
              value={employeeId}
              onChangeText={setEmployeeId}
              placeholder="e.g., EMP001"
              autoCapitalize="characters"
              style={styles.field}
            />

            <Select
              label="Skill Category"
              value={skillCategory}
              onChange={(val) => val && setSkillCategory(val)}
              options={skillOptions}
              style={styles.field}
            />
          </Card>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => router.back()}
              style={styles.cancelButton}
            />
            <Button
              title="Add Worker"
              variant="primary"
              loading={submitting}
              onPress={handleSubmit}
              style={styles.submitButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  formCard: {
    marginBottom: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
  },
  errorContainer: {
    backgroundColor: colors.status.errorLight,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
  },
  submitButton: {
    flex: 2,
  },
});
