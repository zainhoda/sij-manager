import { StyleSheet, Text, View } from 'react-native';
import { colors, getCategoryColor } from '@/theme';
import { StationStatus, CategoryType } from '@/hooks/useDashboardData';

interface StationStatusGridProps {
  stations: StationStatus[];
}

const CATEGORY_LABELS: Record<CategoryType, string> = {
  CUTTING: 'Cutting',
  SILKSCREEN: 'Silkscreen',
  PREP: 'Prep',
  SEWING: 'Sewing',
  INSPECTION: 'Inspection',
};

const CATEGORY_COLORS: Record<CategoryType, string> = {
  CUTTING: colors.category.cutting,
  SILKSCREEN: colors.category.silkscreen,
  PREP: colors.category.prep,
  SEWING: colors.category.sewing,
  INSPECTION: colors.category.inspection,
};

const STATUS_INDICATORS = {
  active: { label: 'Active', color: colors.status.success },
  idle: { label: 'Idle', color: colors.gray[500] },
  completed: { label: 'Done', color: colors.status.info },
};

export function StationStatusGrid({ stations }: StationStatusGridProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>STATION STATUS</Text>
      <View style={styles.stationsList}>
        {stations.map((station) => {
          const { piecesCompleted, piecesPlanned } = station.todayStats;
          const percentage = piecesPlanned > 0 ? Math.round((piecesCompleted / piecesPlanned) * 100) : 0;
          const categoryColor = CATEGORY_COLORS[station.category];
          const statusInfo = STATUS_INDICATORS[station.status];

          return (
            <View key={station.category} style={styles.stationCard}>
              <View style={styles.stationHeader}>
                <View style={styles.categoryRow}>
                  <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
                  <Text style={styles.categoryName}>{CATEGORY_LABELS[station.category]}</Text>
                </View>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
                  <Text style={[styles.statusLabel, { color: statusInfo.color }]}>
                    {statusInfo.label}
                  </Text>
                </View>
              </View>

              <View style={styles.progressContainer}>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(percentage, 100)}%`,
                        backgroundColor: categoryColor,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressPercent}>{percentage}%</Text>
              </View>

              <Text style={styles.piecesText}>
                {piecesCompleted.toLocaleString()} / {piecesPlanned.toLocaleString()} pieces
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.gray[800],
    borderRadius: 16,
    padding: 28,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[400],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  stationsList: {
    gap: 12,
  },
  stationCard: {
    backgroundColor: colors.gray[700],
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  stationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  categoryName: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.white,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarTrack: {
    flex: 1,
    height: 18,
    backgroundColor: colors.gray[600],
    borderRadius: 9,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 9,
  },
  progressPercent: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.white,
    fontFamily: 'monospace',
    minWidth: 55,
    textAlign: 'right',
  },
  piecesText: {
    fontSize: 16,
    color: colors.gray[400],
    fontFamily: 'monospace',
  },
});
