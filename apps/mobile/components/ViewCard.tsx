import React from 'react';
import { StyleSheet, Pressable, View, Text } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { colors } from '@/theme/colors';

export interface ViewCardProps {
  title: string;
  description: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
  onPress: () => void;
}

export function ViewCard({ title, description, icon, color, onPress }: ViewCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconContainer, { backgroundColor: color }]}>
        <FontAwesome name={icon} size={32} color={colors.white} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 180,
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.charcoal,
    marginBottom: 4,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 18,
  },
});
