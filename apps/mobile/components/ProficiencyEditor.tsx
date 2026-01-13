import { useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Card } from './Card';
import { ProficiencySlider } from './Slider';
import { CategoryBadge } from './CategoryBadge';
import { colors, spacing, typography } from '@/theme';
import type { WorkerProficienciesResponse, ProficiencyStep } from '@/api/client';

interface ProficiencyEditorProps {
  workerId: number;
  proficienciesData: WorkerProficienciesResponse;
  onUpdate: (productStepId: number, level: 1 | 2 | 3 | 4 | 5) => Promise<void>;
}

export function ProficiencyEditor({
  workerId,
  proficienciesData,
  onUpdate,
}: ProficiencyEditorProps) {
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const [updating, setUpdating] = useState<number | null>(null);

  const toggleProduct = (productId: number) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleProficiencyChange = useCallback(
    async (step: ProficiencyStep, newLevel: 1 | 2 | 3 | 4 | 5) => {
      if (step.level === newLevel) return;

      setUpdating(step.product_step_id);
      try {
        await onUpdate(step.product_step_id, newLevel);
      } finally {
        setUpdating(null);
      }
    },
    [onUpdate]
  );

  if (!proficienciesData.by_product.length) {
    return (
      <Text style={styles.emptyText}>No products configured</Text>
    );
  }

  return (
    <View style={styles.container}>
      {proficienciesData.by_product.map((product) => {
        const isExpanded = expandedProducts.has(product.product_id);
        const avgLevel =
          product.steps.reduce((sum, s) => sum + s.level, 0) / product.steps.length;

        return (
          <View key={product.product_id} style={styles.productSection}>
            <TouchableOpacity
              style={styles.productHeader}
              onPress={() => toggleProduct(product.product_id)}
              activeOpacity={0.7}
            >
              <View style={styles.productTitleRow}>
                <FontAwesome
                  name={isExpanded ? 'chevron-down' : 'chevron-right'}
                  size={12}
                  color={colors.textSecondary}
                />
                <Text style={styles.productName}>{product.product_name}</Text>
              </View>
              <View style={styles.avgBadge}>
                <Text style={styles.avgText}>
                  Avg: {avgLevel.toFixed(1)}
                </Text>
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.stepsContainer}>
                {product.steps.map((step) => (
                  <View key={step.product_step_id} style={styles.stepRow}>
                    <View style={styles.stepHeader}>
                      <Text style={styles.stepName}>{step.step_name}</Text>
                      <CategoryBadge category={step.category as any} size="small" />
                      {updating === step.product_step_id && (
                        <ActivityIndicator size="small" color={colors.navy} />
                      )}
                    </View>
                    <ProficiencySlider
                      value={step.level}
                      onChange={(newLevel) => handleProficiencyChange(step, newLevel)}
                      disabled={updating === step.product_step_id}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  productSection: {
    backgroundColor: colors.gray[50],
    borderRadius: 8,
    overflow: 'hidden',
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    backgroundColor: colors.gray[100],
  },
  productTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  productName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  avgBadge: {
    backgroundColor: colors.amber + '30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  avgText: {
    ...typography.caption,
    color: colors.amber,
    fontWeight: '600',
  },
  stepsContainer: {
    padding: spacing.sm,
    gap: spacing.md,
  },
  stepRow: {
    gap: spacing.xs,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  stepName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
