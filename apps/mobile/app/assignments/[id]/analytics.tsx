import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { View, Text } from '@/components/Themed';
import { Button } from '@/components';
import { AssignmentAnalytics } from '@/components/AssignmentAnalytics';
import { colors, spacing, typography } from '@/theme';
import {
  getAssignmentAnalytics,
  AssignmentAnalytics as AssignmentAnalyticsType,
} from '@/api/client';

export default function AssignmentAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [analytics, setAnalytics] = useState<AssignmentAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id]);

  const fetchData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const analyticsData = await getAssignmentAnalytics(parseInt(id));
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (error || !analytics) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Analytics not available'}</Text>
        <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: analytics.stepName || 'Assignment Analytics',
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <AssignmentAnalytics
          assignmentId={parseInt(id!)}
          timePerPieceSeconds={analytics.timePerPieceSeconds}
          compact={false}
          expanded={true}
        />
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
  backButton: {
    padding: spacing.xs,
  },
});
