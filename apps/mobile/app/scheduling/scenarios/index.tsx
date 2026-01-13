import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { useFocusEffect, Stack, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button } from '@/components';
import { colors, spacing, typography } from '@/theme';
import {
  getScenarios,
  getWorkers,
  createScenario,
  deleteScenario,
  SchedulingScenario,
  Worker,
} from '@/api/client';

export default function ScenariosListScreen() {
  const [scenarios, setScenarios] = useState<SchedulingScenario[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [scenariosData, workersData] = await Promise.all([
        getScenarios(),
        getWorkers(),
      ]);
      setScenarios(scenariosData);
      setWorkers(workersData.filter((w) => w.status === 'active'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCreateScenario = async () => {
    setCreating(true);
    try {
      // Create a default scenario with all workers available
      const workerPool = workers.map((w) => ({
        workerId: w.id,
        available: true,
        hoursPerDay: 8,
      }));

      const scenario = await createScenario({
        name: `Scenario ${scenarios.length + 1}`,
        description: 'New what-if scenario',
        workerPool,
      });

      router.push(`/scheduling/scenarios/${scenario.id}`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create scenario');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteScenario = (id: number, name: string) => {
    Alert.alert(
      'Delete Scenario',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteScenario(id);
              fetchData();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading scenarios...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={fetchData} variant="secondary" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'What-If Scenarios',
          headerRight: () => (
            <Pressable onPress={handleCreateScenario} disabled={creating}>
              {({ pressed }) => (
                <FontAwesome
                  name="plus"
                  size={22}
                  color={colors.navy}
                  style={{ marginRight: 15, opacity: pressed || creating ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.description}>
          Create scenarios to test different workforce configurations and see how they affect
          your schedule, deadlines, and overtime.
        </Text>

        {scenarios.length === 0 ? (
          <Card style={styles.emptyCard}>
            <FontAwesome name="flask" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Scenarios Yet</Text>
            <Text style={styles.emptyText}>
              Create a what-if scenario to explore different scheduling options
            </Text>
            <Button
              title="Create First Scenario"
              onPress={handleCreateScenario}
              loading={creating}
              style={styles.createButton}
            />
          </Card>
        ) : (
          <View style={styles.scenarioList}>
            {scenarios.map((scenario) => {
              const workerPool = scenario.workerPoolParsed || [];
              const availableCount = workerPool.filter((w) => w.available).length;

              return (
                <Pressable
                  key={scenario.id}
                  onPress={() => router.push(`/scheduling/scenarios/${scenario.id}`)}
                >
                  <Card style={styles.scenarioCard}>
                    <View style={styles.scenarioHeader}>
                      <View style={styles.scenarioTitleRow}>
                        <FontAwesome
                          name="flask"
                          size={16}
                          color={colors.navy}
                          style={styles.scenarioIcon}
                        />
                        <Text style={styles.scenarioName}>{scenario.name}</Text>
                      </View>
                      <Pressable
                        onPress={() => handleDeleteScenario(scenario.id, scenario.name)}
                        hitSlop={10}
                      >
                        <FontAwesome name="trash-o" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>

                    {scenario.description && (
                      <Text style={styles.scenarioDescription}>{scenario.description}</Text>
                    )}

                    <View style={styles.scenarioStats}>
                      <View style={styles.statItem}>
                        <FontAwesome name="users" size={12} color={colors.textSecondary} />
                        <Text style={styles.statText}>
                          {availableCount} / {workerPool.length} workers
                        </Text>
                      </View>
                      <View style={styles.statItem}>
                        <FontAwesome name="calendar" size={12} color={colors.textSecondary} />
                        <Text style={styles.statText}>
                          {new Date(scenario.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.scenarioAction}>
                      <Text style={styles.actionText}>Tap to view & generate</Text>
                      <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.bottomPadding} />
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
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  emptyCard: {
    margin: spacing.md,
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  createButton: {
    marginTop: spacing.md,
  },
  scenarioList: {
    padding: spacing.md,
    paddingTop: 0,
    gap: spacing.md,
  },
  scenarioCard: {
    padding: spacing.md,
  },
  scenarioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  scenarioTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scenarioIcon: {
    marginRight: spacing.sm,
  },
  scenarioName: {
    ...typography.h3,
    color: colors.text,
  },
  scenarioDescription: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  scenarioStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  scenarioAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  actionText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  bottomPadding: {
    height: spacing.xl,
  },
});
