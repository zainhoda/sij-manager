import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router, Stack } from 'expo-router';

import { View, Text } from '@/components/Themed';
import { Button, NumberInput, DatePicker, Select, SelectOption, Card } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { getProducts, createOrder, generateSchedule, Product } from '@/api/client';

export default function NewOrderScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [productId, setProductId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(100);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [autoSchedule, setAutoSchedule] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data);
      if (data.length > 0) {
        setProductId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const productOptions: SelectOption<number>[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    description: p.description || undefined,
  }));

  const validateForm = (): string | null => {
    if (!productId) return 'Please select a product';
    if (quantity < 1) return 'Quantity must be at least 1';
    if (!dueDate) return 'Please select a due date';
    if (dueDate < new Date()) return 'Due date must be in the future';
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

      const order = await createOrder({
        product_id: productId!,
        quantity,
        due_date: dueDate!.toISOString().split('T')[0],
      });

      if (autoSchedule) {
        await generateSchedule(order.id);
      }

      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1); // At least tomorrow

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New Order',
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
          <Text style={styles.title}>Create Production Order</Text>
          <Text style={styles.subtitle}>
            Set up a new production run and optionally generate the schedule.
          </Text>

          <Card style={styles.formCard}>
            <Select
              label="Product"
              value={productId}
              onChange={setProductId}
              options={productOptions}
              placeholder="Select a product"
              style={styles.field}
            />

            <NumberInput
              label="Quantity"
              value={quantity}
              onChange={setQuantity}
              min={1}
              max={10000}
              step={10}
              unit="units"
              helperText="Number of items to produce"
              style={styles.field}
            />

            <DatePicker
              label="Due Date"
              value={dueDate}
              onChange={setDueDate}
              minDate={minDate}
              placeholder="Select due date"
              helperText="When the order needs to be completed"
              style={styles.field}
            />
          </Card>

          <Card style={styles.optionsCard}>
            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Auto-generate schedule</Text>
                <Text style={styles.optionDescription}>
                  Create production schedule immediately after creating the order
                </Text>
              </View>
              <Button
                title={autoSchedule ? 'On' : 'Off'}
                variant={autoSchedule ? 'primary' : 'secondary'}
                size="small"
                onPress={() => setAutoSchedule(!autoSchedule)}
              />
            </View>
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
              title={autoSchedule ? 'Create & Schedule' : 'Create Order'}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
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
  optionsCard: {
    marginBottom: spacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  optionDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
