import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { AlertCircle, FileQuestion } from 'lucide-react-native';
import {
  EmptyState,
  NoScheduleEmpty,
  NoWorkersEmpty,
  NoOrdersEmpty,
  NoResultsEmpty,
} from '../components/EmptyState';
import { colors } from '../theme';

const meta: Meta<typeof EmptyState> = {
  title: 'Utility/EmptyState',
  component: EmptyState,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.white, minWidth: 300 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: 'No data found',
    description: 'There is nothing to display here yet.',
  },
};

export const WithAction: Story = {
  args: {
    title: 'No orders yet',
    description: 'Create your first order to get started with production scheduling.',
    action: {
      label: 'Create Order',
      onPress: () => alert('Create order'),
    },
  },
};

export const WithIcon: Story = {
  args: {
    title: 'No workers assigned',
    description: 'Add workers to see them listed here.',
    icon: <AlertCircle size={48} color={colors.textMuted} strokeWidth={1.5} />,
    action: {
      label: 'Add Worker',
      onPress: () => alert('Add worker'),
    },
  },
};

export const Small: Story = {
  args: {
    title: 'No results',
    description: 'Try adjusting your search.',
    size: 'small',
  },
};

export const Large: Story = {
  args: {
    title: 'Welcome to SIJ Scheduler',
    description: 'Get started by creating your first production order.',
    size: 'large',
    action: {
      label: 'Get Started',
      onPress: () => alert('Get started'),
    },
    secondaryAction: {
      label: 'Learn More',
      onPress: () => alert('Learn more'),
    },
  },
};

export const NoSchedule: Story = {
  render: () => <NoScheduleEmpty onCreateOrder={() => alert('Create order')} />,
};

export const NoWorkers: Story = {
  render: () => <NoWorkersEmpty onAddWorker={() => alert('Add worker')} />,
};

export const NoOrders: Story = {
  render: () => <NoOrdersEmpty onCreateOrder={() => alert('Create order')} />,
};

export const NoResults: Story = {
  render: () => <NoResultsEmpty query="elastic" onClear={() => alert('Clear')} />,
};

export const AllPresets: Story = {
  render: () => (
    <View style={{ gap: 32 }}>
      <NoScheduleEmpty onCreateOrder={() => {}} />
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <NoWorkersEmpty onAddWorker={() => {}} />
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <NoOrdersEmpty onCreateOrder={() => {}} />
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <NoResultsEmpty query="test" onClear={() => {}} />
    </View>
  ),
};
