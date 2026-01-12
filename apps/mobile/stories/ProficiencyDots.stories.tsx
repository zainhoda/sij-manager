import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View, Text } from 'react-native';
import { ProficiencyDots } from '../components/ProficiencyDots';
import { typography, colors } from '../theme';

const meta: Meta<typeof ProficiencyDots> = {
  title: 'Domain/ProficiencyDots',
  component: ProficiencyDots,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, gap: 16 }}>
        <Story />
      </View>
    ),
  ],
  argTypes: {
    level: {
      control: { type: 'range', min: 1, max: 5, step: 1 },
    },
    size: {
      control: 'select',
      options: ['small', 'default'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ProficiencyDots>;

export const Default: Story = {
  args: {
    level: 3,
  },
};

export const WithLabel: Story = {
  args: {
    level: 3,
    showLabel: true,
  },
};

export const AllLevels: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <ProficiencyDots level={1} showLabel />
      <ProficiencyDots level={2} showLabel />
      <ProficiencyDots level={3} showLabel />
      <ProficiencyDots level={4} showLabel />
      <ProficiencyDots level={5} showLabel />
    </View>
  ),
};

export const Small: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[typography.bodySmall, { width: 80, color: colors.text }]}>Cutting:</Text>
        <ProficiencyDots level={4} size="small" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[typography.bodySmall, { width: 80, color: colors.text }]}>Sewing:</Text>
        <ProficiencyDots level={5} size="small" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[typography.bodySmall, { width: 80, color: colors.text }]}>Inspection:</Text>
        <ProficiencyDots level={2} size="small" />
      </View>
    </View>
  ),
};
