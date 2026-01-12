import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View, Text } from 'react-native';
import { StatCard, StatGrid } from '../components/StatCard';
import { colors } from '../theme';

const meta: Meta<typeof StatCard> = {
  title: 'Utility/StatCard',
  component: StatCard,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof StatCard>;

export const Default: Story = {
  args: {
    label: 'Orders',
    value: 24,
  },
};

export const WithUnit: Story = {
  args: {
    label: 'Hours Worked',
    value: 156,
    unit: 'hrs',
  },
};

export const WithTrendUp: Story = {
  args: {
    label: 'Completed',
    value: 142,
    previousValue: 120,
    trendLabel: 'vs last week',
  },
};

export const WithTrendDown: Story = {
  args: {
    label: 'Efficiency',
    value: 85,
    unit: '%',
    previousValue: 92,
    trendLabel: 'vs last week',
  },
};

export const WithAccent: Story = {
  args: {
    label: 'At Risk',
    value: 3,
    accentColor: colors.status.error,
  },
};

export const Dashboard: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatCard
          label="Active Orders"
          value={8}
          style={{ flex: 1 }}
        />
        <StatCard
          label="Workers"
          value={6}
          unit="active"
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatCard
          label="On Track"
          value={85}
          unit="%"
          previousValue={78}
          accentColor={colors.status.success}
          style={{ flex: 1 }}
        />
        <StatCard
          label="At Risk"
          value={2}
          accentColor={colors.status.error}
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatCard
          label="This Week"
          value={142}
          unit="pcs"
          previousValue={128}
          trendLabel="vs last week"
          style={{ flex: 1 }}
        />
        <StatCard
          label="Efficiency"
          value={92}
          unit="%"
          style={{ flex: 1 }}
        />
      </View>
    </View>
  ),
};

export const Pressable: Story = {
  args: {
    label: 'Orders',
    value: 24,
    onPress: () => alert('Stat card pressed'),
  },
};
