import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, CategoryBadge } from '@/components';
import { colors, spacing, typography, CategoryType } from '@/theme';
import { getProduct, getProductSteps, Product, ProductStep } from '@/api/client';

function mapCategoryToType(category: string): CategoryType {
  const mapping: Record<string, CategoryType> = {
    CUTTING: 'cutting',
    SILKSCREEN: 'silkscreen',
    PREP: 'prep',
    SEWING: 'sewing',
    INSPECTION: 'inspection',
  };
  return mapping[category] || 'sewing';
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [steps, setSteps] = useState<ProductStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchProductData();
    }
  }, [id]);

  const fetchProductData = async () => {
    try {
      setError(null);
      const productId = parseInt(id!);
      const [productData, stepsData] = await Promise.all([
        getProduct(productId),
        getProductSteps(productId),
      ]);
      setProduct(productData);
      setSteps(stepsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Product',
          }}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Loading product...</Text>
        </View>
      </>
    );
  }

  if (error || !product) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Product',
          }}
        />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'Product not found'}</Text>
        </View>
      </>
    );
  }

  // Create a map of step IDs to step names for dependency display
  const stepNameMap = new Map(steps.map((step) => [step.id, step.name]));

  return (
    <>
      <Stack.Screen
        options={{
          title: product.name,
        }}
      />
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.productName}>{product.name}</Text>
          {product.description && (
            <Text style={styles.productDescription}>{product.description}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Production Steps</Text>
          <Text style={styles.sectionDescription}>
            Steps required to produce this product, in order
          </Text>
        </View>

        {steps.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>No steps defined for this product</Text>
          </Card>
        ) : (
          steps.map((step, index) => (
            <Card key={step.id} style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.stepInfo}>
                  <Text style={styles.stepName}>{step.name}</Text>
                  <View style={styles.stepMeta}>
                    <CategoryBadge
                      category={mapCategoryToType(step.category)}
                      variant="subtle"
                      size="small"
                    />
                    <View style={styles.timeContainer}>
                      <FontAwesome name="clock-o" size={12} color={colors.textSecondary} />
                      <Text style={styles.timeText}>
                        {formatTime(step.time_per_piece_seconds)} per piece
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {Array.isArray(step.dependencies) && step.dependencies.length > 0 && (
                <View style={styles.dependenciesContainer}>
                  <Text style={styles.dependenciesLabel}>Depends on:</Text>
                  <View style={styles.dependenciesList}>
                    {step.dependencies.map((depId) => {
                      const depStep = steps.find((s) => s.id === depId);
                      if (!depStep) return null;
                      const depIndex = steps.findIndex((s) => s.id === depId);
                      return (
                        <View key={depId} style={styles.dependencyItem}>
                          <Text style={styles.dependencyText}>
                            {depIndex + 1}. {depStep.name}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {step.required_skill_category && (
                <View style={styles.skillContainer}>
                  <Text style={styles.skillLabel}>
                    Required skill: {step.required_skill_category}
                  </Text>
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: 'center',
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  productName: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  productDescription: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  emptyCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  stepCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  stepHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    ...typography.label,
    color: colors.white,
    fontWeight: '600',
  },
  stepInfo: {
    flex: 1,
  },
  stepName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  stepMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  dependenciesContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dependenciesLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  dependenciesList: {
    gap: spacing.xs,
  },
  dependencyItem: {
    paddingLeft: spacing.md,
  },
  dependencyText: {
    ...typography.bodySmall,
    color: colors.text,
  },
  skillContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skillLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
