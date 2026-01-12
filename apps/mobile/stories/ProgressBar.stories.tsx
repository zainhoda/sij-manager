import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View, Text } from 'react-native';
import { ProgressBar, SegmentedProgress, CircularProgress } from '../components/ProgressBar';
import { colors, typography, spacing } from '../theme';

const meta: Meta<typeof ProgressBar> = {
  title: 'Utility/ProgressBar',
  component: ProgressBar,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minWidth: 300 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {
  args: {
    value: 65,
  },
};

export const WithLabel: Story = {
  args: {
    value: 75,
    showLabel: true,
  },
};

export const LabelAbove: Story = {
  args: {
    value: 45,
    showLabel: true,
    labelPosition: 'above',
  },
};

export const CustomColor: Story = {
  args: {
    value: 80,
    color: colors.status.success,
    showLabel: true,
  },
};

export const Tall: Story = {
  args: {
    value: 60,
    height: 20,
    showLabel: true,
    labelPosition: 'inside',
  },
};

export const AllVariants: Story = {
  render: () => (
    <View style={{ gap: 24 }}>
      <View>
        <Text style={[typography.label, { marginBottom: 8 }]}>Default</Text>
        <ProgressBar value={65} showLabel />
      </View>
      <View>
        <Text style={[typography.label, { marginBottom: 8 }]}>Success</Text>
        <ProgressBar value={100} color={colors.status.success} showLabel />
      </View>
      <View>
        <Text style={[typography.label, { marginBottom: 8 }]}>Warning</Text>
        <ProgressBar value={45} color={colors.status.warning} showLabel />
      </View>
      <View>
        <Text style={[typography.label, { marginBottom: 8 }]}>Error</Text>
        <ProgressBar value={20} color={colors.status.error} showLabel />
      </View>
    </View>
  ),
};

export const Segmented: Story = {
  render: () => (
    <View style={{ gap: 24 }}>
      <View>
        <Text style={[typography.label, { marginBottom: 8 }]}>Step 2 of 5</Text>
        <SegmentedProgress total={5} completed={2} active={2} />
      </View>
      <View>
        <Text style={[typography.label, { marginBottom: 8 }]}>Completed</Text>
        <SegmentedProgress total={5} completed={5} />
      </View>
      <View>
        <Text style={[typography.label, { marginBottom: 8 }]}>Not Started</Text>
        <SegmentedProgress total={5} completed={0} active={0} />
      </View>
    </View>
  ),
};

export const Circular: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
      <CircularProgress value={25} />
      <CircularProgress value={50} color={colors.amber} />
      <CircularProgress value={75} color={colors.status.success} />
      <CircularProgress value={100} color={colors.status.success} />
    </View>
  ),
};

export const ProductionProgress: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={typography.bodySmall}>Cutting</Text>
        <ProgressBar value={100} color={colors.category.cutting} showLabel style={{ flex: 1, marginLeft: 16 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={typography.bodySmall}>Silkscreen</Text>
        <ProgressBar value={80} color={colors.category.silkscreen} showLabel style={{ flex: 1, marginLeft: 16 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={typography.bodySmall}>Sewing</Text>
        <ProgressBar value={45} color={colors.category.sewing} showLabel style={{ flex: 1, marginLeft: 16 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={typography.bodySmall}>Inspection</Text>
        <ProgressBar value={0} color={colors.category.inspection} showLabel style={{ flex: 1, marginLeft: 16 }} />
      </View>
    </View>
  ),
};
