import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { CertificationMatrix } from '@/components/CertificationMatrix';
import { colors, spacing, typography } from '@/theme';
import {
  getWorkers,
  getEquipment,
  getCertifications,
  grantCertification,
  revokeCertification,
  type Worker,
  type Equipment,
  type EquipmentCertification,
} from '@/api/client';

interface MatrixData {
  workers: Worker[];
  equipment: Equipment[];
  certifications: EquipmentCertification[];
}

export default function CertificationsScreen() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [workers, equipment, certifications] = await Promise.all([
        getWorkers(),
        getEquipment(),
        getCertifications(),
      ]);

      // Filter to only active workers
      const activeWorkers = workers.filter((w) => w.status === 'active');
      // Filter to only available equipment
      const availableEquipment = equipment.filter(
        (e) => e.status === 'available' || e.status === 'in_use'
      );

      setData({
        workers: activeWorkers,
        equipment: availableEquipment,
        certifications,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleToggle = useCallback(
    async (workerId: number, equipmentId: number, certificationId?: number) => {
      if (!data) return;

      // Optimistic update
      const prevCertifications = data.certifications;

      if (certificationId) {
        // Revoking - remove from list
        setData((prev) =>
          prev
            ? {
                ...prev,
                certifications: prev.certifications.filter(
                  (c) => c.id !== certificationId
                ),
              }
            : null
        );

        try {
          await revokeCertification(certificationId);
        } catch (err) {
          // Rollback on error
          setData((prev) =>
            prev ? { ...prev, certifications: prevCertifications } : null
          );
          throw err;
        }
      } else {
        // Granting - add to list with temp ID
        const tempCert: EquipmentCertification = {
          id: -1,
          worker_id: workerId,
          equipment_id: equipmentId,
          certified_at: new Date().toISOString(),
          expires_at: null,
        };
        setData((prev) =>
          prev
            ? { ...prev, certifications: [...prev.certifications, tempCert] }
            : null
        );

        try {
          const newCert = await grantCertification({
            worker_id: workerId,
            equipment_id: equipmentId,
          });
          // Replace temp cert with real one
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  certifications: prev.certifications.map((c) =>
                    c.id === -1 && c.worker_id === workerId && c.equipment_id === equipmentId
                      ? newCert
                      : c
                  ),
                }
              : null
          );
        } catch (err) {
          // Rollback on error
          setData((prev) =>
            prev ? { ...prev, certifications: prevCertifications } : null
          );
          throw err;
        }
      }
    },
    [data]
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading certifications...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <Text style={styles.description}>
          Tap cells to grant or revoke equipment certifications for workers.
        </Text>

        {data && (
          <View style={styles.matrixContainer}>
            <CertificationMatrix
              workers={data.workers}
              equipment={data.equipment}
              certifications={data.certifications}
              onToggle={handleToggle}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  matrixContainer: {
    flex: 1,
    minHeight: 400,
  },
});
