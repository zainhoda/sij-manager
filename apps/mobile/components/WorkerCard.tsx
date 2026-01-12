import { StyleSheet, Text, View, Pressable, ViewStyle } from 'react-native';
import { colors, spacing, typography, CategoryType } from '@/theme';
import { Card } from './Card';
import { WorkerBadge } from './WorkerBadge';
import { ProficiencyDots } from './ProficiencyDots';
import { CategoryBadge } from './CategoryBadge';

export interface WorkerSkill {
  category: CategoryType;
  stepName: string;
  proficiency: 1 | 2 | 3 | 4 | 5;
}

interface WorkerCardProps {
  /** Worker name */
  name: string;
  /** Worker skills */
  skills: WorkerSkill[];
  /** Whether worker is currently available */
  isAvailable?: boolean;
  /** Current assignment (if busy) */
  currentTask?: string;
  /** Stats summary */
  stats?: {
    tasksCompleted?: number;
    avgProficiency?: number;
    hoursThisWeek?: number;
  };
  /** Press handler */
  onPress?: () => void;
  /** Handler for editing skills */
  onEditSkills?: () => void;
  /** Show compact view */
  compact?: boolean;
  /** Container style */
  style?: ViewStyle;
}

export function WorkerCard({
  name,
  skills,
  isAvailable = true,
  currentTask,
  stats,
  onPress,
  onEditSkills,
  compact = false,
  style,
}: WorkerCardProps) {
  // Group skills by category
  const skillsByCategory = skills.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill);
    return acc;
  }, {} as Record<CategoryType, WorkerSkill[]>);

  const avgProficiency = skills.length > 0
    ? skills.reduce((sum, s) => sum + s.proficiency, 0) / skills.length
    : 0;

  if (compact) {
    return (
      <Pressable onPress={onPress} disabled={!onPress}>
        <Card style={[styles.compactCard, style]}>
          <View style={styles.compactContent}>
            <WorkerBadge name={name} size="default" />
            <View style={styles.compactInfo}>
              <Text style={styles.compactName}>{name}</Text>
              <View style={styles.compactStatus}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isAvailable ? colors.status.success : colors.status.warning },
                  ]}
                />
                <Text style={styles.statusText}>
                  {isAvailable ? 'Available' : currentTask || 'Busy'}
                </Text>
              </View>
            </View>
            <View style={styles.compactSkills}>
              {Object.keys(skillsByCategory).slice(0, 3).map((cat) => (
                <CategoryBadge
                  key={cat}
                  category={cat as CategoryType}
                  size="small"
                  variant="subtle"
                />
              ))}
            </View>
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card style={[styles.card, style]}>
        {/* Header */}
        <View style={styles.header}>
          <WorkerBadge name={name} size="large" />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{name}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isAvailable ? colors.status.success : colors.status.warning },
                ]}
              />
              <Text style={styles.statusText}>
                {isAvailable ? 'Available' : currentTask || 'Busy'}
              </Text>
            </View>
          </View>
          {avgProficiency > 0 && (
            <View style={styles.avgProficiency}>
              <Text style={styles.avgLabel}>Avg</Text>
              <Text style={styles.avgValue}>{avgProficiency.toFixed(1)}</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        {stats && (
          <View style={styles.stats}>
            {stats.tasksCompleted !== undefined && (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.tasksCompleted}</Text>
                <Text style={styles.statLabel}>Tasks</Text>
              </View>
            )}
            {stats.hoursThisWeek !== undefined && (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.hoursThisWeek}h</Text>
                <Text style={styles.statLabel}>This Week</Text>
              </View>
            )}
          </View>
        )}

        {/* Skills */}
        <View style={styles.skills}>
          <View style={styles.skillsHeader}>
            <Text style={styles.skillsTitle}>Skills</Text>
            {onEditSkills && (
              <Pressable onPress={onEditSkills}>
                <Text style={styles.editButton}>Edit</Text>
              </Pressable>
            )}
          </View>

          {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
            <View key={category} style={styles.skillCategory}>
              <CategoryBadge category={category as CategoryType} size="small" />
              <View style={styles.skillsList}>
                {categorySkills.map((skill, index) => (
                  <View key={index} style={styles.skillItem}>
                    <Text style={styles.skillName} numberOfLines={1}>
                      {skill.stepName}
                    </Text>
                    <ProficiencyDots level={skill.proficiency} size="small" />
                  </View>
                ))}
              </View>
            </View>
          ))}

          {skills.length === 0 && (
            <Text style={styles.noSkills}>No skills assigned</Text>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  compactCard: {
    padding: spacing.sm,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactInfo: {
    flex: 1,
  },
  compactName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  compactStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  compactSkills: {
    flexDirection: 'row',
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    ...typography.h3,
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  avgProficiency: {
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    padding: spacing.sm,
    borderRadius: 8,
  },
  avgLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  avgValue: {
    ...typography.h3,
    color: colors.navy,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.h3,
    color: colors.text,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  skills: {
    gap: spacing.sm,
  },
  skillsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillsTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  editButton: {
    ...typography.bodySmall,
    color: colors.navy,
    fontWeight: '600',
  },
  skillCategory: {
    gap: spacing.xs,
  },
  skillsList: {
    marginLeft: spacing.sm,
    gap: spacing.xs,
  },
  skillItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillName: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  noSkills: {
    ...typography.bodySmall,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
