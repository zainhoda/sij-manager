import { StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { colors } from '@/theme';

interface TVHeaderProps {
  title?: string;
  lastRefresh: Date;
  isRefreshing?: boolean;
}

export function TVHeader({ title = 'SIJ PRODUCTION DASHBOARD', lastRefresh, isRefreshing }: TVHeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      setSecondsAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastRefresh]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const getRefreshText = () => {
    if (isRefreshing) return 'Updating...';
    if (secondsAgo < 5) return 'Just updated';
    if (secondsAgo < 60) return `Updated ${secondsAgo}s ago`;
    return `Updated ${Math.floor(secondsAgo / 60)}m ago`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rightSection}>
        <Text style={styles.time}>{formatTime(currentTime)}</Text>
        <View style={styles.refreshContainer}>
          <View style={[styles.dot, isRefreshing && styles.dotPulsing]} />
          <Text style={styles.refreshText}>{getRefreshText()}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 20,
    backgroundColor: colors.gray[800],
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[700],
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  time: {
    fontSize: 48,
    fontWeight: '600',
    color: colors.amber,
    fontFamily: 'monospace',
  },
  refreshContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.status.success,
  },
  dotPulsing: {
    backgroundColor: colors.amber,
  },
  refreshText: {
    fontSize: 18,
    color: colors.gray[400],
  },
});
