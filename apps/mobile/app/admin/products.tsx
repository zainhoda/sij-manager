import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, NoProductsEmpty } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { getProducts, Product } from '@/api/client';

export default function AdminProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchProducts = async () => {
    try {
      setError(null);
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={fetchProducts} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (products.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <NoProductsEmpty />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Products</Text>
      </View>

      {products.map((product) => (
        <Pressable
          key={product.id}
          onPress={() => router.push(`/products/${product.id}`)}
        >
          <Card style={styles.productCard}>
            <View style={styles.productHeader}>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{product.name}</Text>
                {product.description && (
                  <Text style={styles.productDescription} numberOfLines={2}>
                    {product.description}
                  </Text>
                )}
              </View>
              <FontAwesome name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
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
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.navy,
    borderRadius: 8,
  },
  retryText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  header: {
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  productCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  productName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  productDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
