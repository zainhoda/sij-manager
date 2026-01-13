import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ViewCard } from '@/components';
import { useViewContext } from '@/context/ViewContext';
import { ViewId } from '@/hooks/useViewPersistence';
import { colors } from '@/theme/colors';

interface ViewOption {
  id: ViewId;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}

const VIEWS: ViewOption[] = [
  {
    id: 'worker',
    title: 'Worker',
    description: 'Daily tasks, production logging, personal stats',
    icon: 'user',
    color: colors.status.success,
  },
  {
    id: 'supervisor',
    title: 'Supervisor',
    description: 'Schedule overview, worker management, monitoring',
    icon: 'users',
    color: colors.navy,
  },
  {
    id: 'admin',
    title: 'Admin',
    description: 'Full access: orders, planning, data management',
    icon: 'cog',
    color: colors.status.warning,
  },
  {
    id: 'tv',
    title: 'Shop Floor TV',
    description: 'Large display dashboard, auto-refresh',
    icon: 'television',
    color: colors.gray[700],
  },
  {
    id: 'equipment-tablet',
    title: 'Equipment Tablet',
    description: 'Equipment status, certifications',
    icon: 'wrench',
    color: colors.status.info,
  },
];

export default function HomeScreen() {
  const { selectView } = useViewContext();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>SIJ Production</Text>
          <Text style={styles.subtitle}>Select your view</Text>
        </View>

        <View style={styles.grid}>
          {VIEWS.map((view) => (
            <View key={view.id} style={styles.cardWrapper}>
              <ViewCard
                title={view.title}
                description={view.description}
                icon={view.icon}
                color={view.color}
                onPress={() => selectView(view.id)}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.gray[500],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  cardWrapper: {
    width: '50%',
    padding: 8,
  },
});
