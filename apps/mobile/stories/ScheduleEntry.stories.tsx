import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { ScheduleEntry } from '../components/ScheduleEntry';
import { colors } from '../theme';

const meta: Meta<typeof ScheduleEntry> = {
  title: 'Domain/ScheduleEntry',
  component: ScheduleEntry,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minWidth: 350 }}>
        <Story />
      </View>
    ),
  ],
  argTypes: {
    category: {
      control: 'select',
      options: ['cutting', 'silkscreen', 'prep', 'sewing', 'inspection'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ScheduleEntry>;

export const Default: Story = {
  args: {
    category: 'sewing',
    stepName: 'Attach Elastic',
    timeRange: '9:00 - 11:00',
    workerName: 'Worker B',
    plannedOutput: 120,
  },
};

export const WithProgress: Story = {
  args: {
    category: 'sewing',
    stepName: 'Attach Elastic',
    timeRange: '9:00 - 11:00',
    workerName: 'Worker B',
    plannedOutput: 120,
    actualOutput: 96,
  },
};

export const Completed: Story = {
  args: {
    category: 'inspection',
    stepName: 'Final Quality Check',
    timeRange: '14:00 - 15:30',
    workerName: 'Worker A',
    plannedOutput: 100,
    actualOutput: 100,
  },
};

export const NoWorker: Story = {
  args: {
    category: 'cutting',
    stepName: 'Cut Body Panels',
    timeRange: '7:00 - 9:00',
    plannedOutput: 200,
  },
};

export const DaySchedule: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <ScheduleEntry
        category="cutting"
        stepName="Cut Body Panels"
        timeRange="7:00 - 9:00"
        workerName="Worker A"
        plannedOutput={200}
        actualOutput={200}
      />
      <ScheduleEntry
        category="silkscreen"
        stepName="Print Logo"
        timeRange="9:00 - 10:30"
        workerName="Worker C"
        plannedOutput={150}
        actualOutput={120}
      />
      <ScheduleEntry
        category="sewing"
        stepName="Attach Elastic"
        timeRange="10:30 - 12:00"
        workerName="Worker B"
        plannedOutput={120}
        actualOutput={60}
      />
      <ScheduleEntry
        category="sewing"
        stepName="Side Seams"
        timeRange="12:30 - 14:00"
        workerName="Worker B"
        plannedOutput={100}
      />
      <ScheduleEntry
        category="inspection"
        stepName="Final Check"
        timeRange="14:00 - 15:30"
        workerName="Worker D"
        plannedOutput={80}
      />
    </View>
  ),
};

export const Interactive: Story = {
  args: {
    category: 'prep',
    stepName: 'Prepare Materials',
    timeRange: '8:00 - 9:30',
    workerName: 'Worker E',
    plannedOutput: 50,
    actualOutput: 25,
    onPress: () => alert('Card pressed!'),
  },
};
