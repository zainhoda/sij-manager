import { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { ChevronDown, ChevronUp, TrendingUp, Clock } from 'lucide-react-native';
import { Text } from './Themed';
import { Card } from './Card';
import { StatCard, StatGrid } from './StatCard';
import { LineChart } from './LineChart';
import { colors, spacing, typography } from '@/theme';
import {
  getAssignmentOutputHistory,
  getAssignmentMetrics,
  AssignmentOutputHistoryEntry,
  AssignmentTimeMetrics,
} from '@/api/client';

interface AssignmentAnalyticsProps {
  assignmentId: number;
  timePerPieceSeconds: number;
  /** Show in compact mode (for Production Log) */
  compact?: boolean;
  /** Show expanded by default */
  expanded?: boolean;
  /** Callback when user wants to view full analytics */
  onViewFull?: () => void;
}

export function AssignmentAnalytics({
  assignmentId,
  timePerPieceSeconds,
  compact = false,
  expanded = false,
  onViewFull,
}: AssignmentAnalyticsProps) {
  const [history, setHistory] = useState<AssignmentOutputHistoryEntry[]>([]);
  const [metrics, setMetrics] = useState<AssignmentTimeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [assignmentId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const [historyData, metricsData] = await Promise.all([
        getAssignmentOutputHistory(assignmentId),
        getAssignmentMetrics(assignmentId),
      ]);
      setHistory(historyData);
      setMetrics(metricsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (error || !metrics || history.length < 2) {
    if (compact) return null;
    return (
      <Card style={styles.card}>
        <Text style={styles.errorText}>
          {error || 'Not enough data for analytics (need at least 2 updates)'}
        </Text>
      </Card>
    );
  }

  // Prepare chart data
  const chartData = history.map((entry, index) => ({
    x: index,
    y: entry.output,
    label: new Date(entry.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  // Calculate time per piece chart data
  const timePerPieceData: Array<{ x: number; y: number; label?: string }> = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    const prevTime = new Date(prev.recorded_at).getTime();
    const currTime = new Date(curr.recorded_at).getTime();
    const timeDiffSeconds = (currTime - prevTime) / 1000;
    const outputDiff = curr.output - prev.output;

    if (outputDiff > 0 && timeDiffSeconds > 0) {
      const timePerPiece = timeDiffSeconds / outputDiff;
      timePerPieceData.push({
        x: i - 1,
        y: timePerPiece,
        label: new Date(curr.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }

  const speedupColor =
    metrics.speedupPercentage !== null && metrics.speedupPercentage > 0
      ? colors.status.success
      : metrics.speedupPercentage !== null && metrics.speedupPercentage < 0
      ? colors.status.warning
      : colors.textSecondary;

  if (compact) {
    return (
      <Card style={styles.card}>
        <Pressable
          onPress={() => setIsExpanded(!isExpanded)}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <Text style={styles.title}>Performance Analytics</Text>
            {metrics.speedupPercentage !== null && (
              <View style={[styles.speedupBadge, { backgroundColor: speedupColor + '20' }]}>
                <TrendingUp size={12} color={speedupColor} />
                <Text style={[styles.speedupText, { color: speedupColor }]}>
                  {metrics.speedupPercentage > 0 ? '+' : ''}
                  {metrics.speedupPercentage.toFixed(1)}%
                </Text>
              </View>
            )}
          </View>
          {isExpanded ? (
            <ChevronUp size={20} color={colors.textSecondary} />
          ) : (
            <ChevronDown size={20} color={colors.textSecondary} />
          )}
        </Pressable>

        {isExpanded && (
          <View style={styles.content}>
            <StatGrid style={styles.statsGrid}>
              {metrics.overallAvgTimePerPiece !== null && (
                <StatCard
                  label="Avg Time/Piece"
                  value={`${(metrics.overallAvgTimePerPiece / 60).toFixed(1)}m`}
                  icon={<Clock size={16} color={colors.primary} />}
                />
              )}
              {metrics.speedupPercentage !== null && (
                <StatCard
                  label="Speedup"
                  value={`${metrics.speedupPercentage > 0 ? '+' : ''}${metrics.speedupPercentage.toFixed(1)}%`}
                  color={speedupColor}
                />
              )}
            </StatGrid>

            {chartData.length > 1 && (
              <View style={styles.chartContainer}>
                <Text style={styles.chartTitle}>Output Over Time</Text>
                <LineChart
                  data={chartData}
                  width={280}
                  height={120}
                  color={colors.primary}
                  showPoints={true}
                  showGrid={true}
                />
              </View>
            )}

            {onViewFull && (
              <Pressable onPress={onViewFull} style={styles.viewFullButton}>
                <Text style={styles.viewFullText}>View Full Analytics →</Text>
              </Pressable>
            )}
          </View>
        )}
      </Card>
    );
  }

  // Full view
  return (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <Card style={styles.card}>
        <Text style={styles.title}>Performance Analytics</Text>

        {/* Key Metrics */}
        <StatGrid style={styles.statsGrid}>
          {metrics.overallAvgTimePerPiece !== null && (
            <StatCard
              label="Avg Time/Piece"
              value={`${(metrics.overallAvgTimePerPiece / 60).toFixed(1)}m`}
              icon={<Clock size={16} color={colors.primary} />}
            />
          )}
          {metrics.beginningAvgTimePerPiece !== null && (
            <StatCard
              label="Beginning"
              value={`${(metrics.beginningAvgTimePerPiece / 60).toFixed(1)}m`}
            />
          )}
          {metrics.endAvgTimePerPiece !== null && (
            <StatCard
              label="End"
              value={`${(metrics.endAvgTimePerPiece / 60).toFixed(1)}m`}
            />
          )}
          {metrics.speedupPercentage !== null && (
            <StatCard
              label="Speedup"
              value={`${metrics.speedupPercentage > 0 ? '+' : ''}${metrics.speedupPercentage.toFixed(1)}%`}
              color={speedupColor}
            />
          )}
        </StatGrid>

        {/* Stage Breakdown */}
        {(metrics.beginningAvgTimePerPiece !== null ||
          metrics.middleAvgTimePerPiece !== null ||
          metrics.endAvgTimePerPiece !== null) && (
          <View style={styles.stageSection}>
            <Text style={styles.sectionTitle}>Time Per Piece by Stage</Text>
            <View style={styles.stageList}>
              {metrics.beginningAvgTimePerPiece !== null && (
                <View style={styles.stageItem}>
                  <Text style={styles.stageLabel}>Beginning</Text>
                  <Text style={styles.stageValue}>
                    {(metrics.beginningAvgTimePerPiece / 60).toFixed(1)} min/piece
                  </Text>
                </View>
              )}
              {metrics.middleAvgTimePerPiece !== null && (
                <View style={styles.stageItem}>
                  <Text style={styles.stageLabel}>Middle</Text>
                  <Text style={styles.stageValue}>
                    {(metrics.middleAvgTimePerPiece / 60).toFixed(1)} min/piece
                  </Text>
                </View>
              )}
              {metrics.endAvgTimePerPiece !== null && (
                <View style={styles.stageItem}>
                  <Text style={styles.stageLabel}>End</Text>
                  <Text style={styles.stageValue}>
                    {(metrics.endAvgTimePerPiece / 60).toFixed(1)} min/piece
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Output Chart */}
        {chartData.length > 1 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Output Progression</Text>
            <LineChart
              data={chartData}
              width={300}
              height={180}
              color={colors.primary}
              showPoints={true}
              showGrid={true}
              showXLabels={true}
            />
          </View>
        )}

        {/* Time Per Piece Chart */}
        {timePerPieceData.length > 1 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Time Per Piece Over Time</Text>
            <LineChart
              data={timePerPieceData}
              width={300}
              height={180}
              color={colors.status.warning}
              showPoints={true}
              showGrid={true}
              showXLabels={true}
              formatYLabel={(v) => `${(v / 60).toFixed(1)}m`}
            />
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    margin: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  speedupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  speedupText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
  content: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  statsGrid: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  stageSection: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  stageList: {
    gap: spacing.sm,
  },
  stageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.gray[50],
    borderRadius: 8,
  },
  stageLabel: {
    ...typography.body,
    color: colors.text,
  },
  stageValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  chartContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  chartTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  viewFullButton: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    alignItems: 'center',
  },
  viewFullText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
});
