import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { WorkerBadge } from '../components/WorkerBadge';
import { colors } from '../theme';

const meta: Meta<typeof WorkerBadge> = {
  title: 'Domain/WorkerBadge',
  component: WorkerBadge,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, gap: 16 }}>
        <Story />
      </View>
    ),
  ],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'default', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof WorkerBadge>;

export const Default: Story = {
  args: {
    name: 'Maria Santos',
  },
};

export const WithName: Story = {
  args: {
    name: 'Maria Santos',
    showName: true,
  },
};

export const SingleName: Story = {
  args: {
    name: 'Worker A',
    showName: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <WorkerBadge name="Small Size" size="small" showName />
      <WorkerBadge name="Default Size" size="default" showName />
      <WorkerBadge name="Large Size" size="large" showName />
    </View>
  ),
};

export const CustomColors: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <WorkerBadge name="Worker A" backgroundColor={colors.category.cutting} showName />
      <WorkerBadge name="Worker B" backgroundColor={colors.category.sewing} showName />
      <WorkerBadge name="Worker C" backgroundColor={colors.category.inspection} showName />
    </View>
  ),
};

export const Team: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <WorkerBadge name="Worker A" size="large" showName />
      <WorkerBadge name="Worker B" size="large" showName />
      <WorkerBadge name="Worker C" size="large" showName />
      <WorkerBadge name="Worker D" size="large" showName />
    </View>
  ),
};
