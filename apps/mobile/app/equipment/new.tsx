import { useState } from 'react';
import { StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router, Stack } from 'expo-router';

import { View, Text } from '@/components/Themed';
import { Button, TextInput, Card } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { createEquipment } from '@/api/client';

export default function NewEquipmentScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

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

      await createEquipment({
        name: name.trim(),
        description: description.trim() || undefined,
      });

      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create equipment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New Equipment',
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
          <Text style={styles.title}>Add Equipment</Text>
          <Text style={styles.subtitle}>
            Add a new piece of equipment to track certifications.
          </Text>

          <Card style={styles.formCard}>
            <TextInput
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g., Industrial Sewing Machine #1"
              style={styles.field}
            />

            <TextInput
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Enter a description"
              multiline
              numberOfLines={3}
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
              title="Add Equipment"
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
