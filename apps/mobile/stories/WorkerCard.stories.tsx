import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { WorkerCard, WorkerSkill } from '../components/WorkerCard';
import { colors } from '../theme';

const meta: Meta<typeof WorkerCard> = {
  title: 'Domain/WorkerCard',
  component: WorkerCard,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minWidth: 350 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof WorkerCard>;

const sampleSkills: WorkerSkill[] = [
  { category: 'cutting', stepName: 'Cut Body Panels', proficiency: 4 },
  { category: 'cutting', stepName: 'Cut Sleeves', proficiency: 3 },
  { category: 'sewing', stepName: 'Attach Elastic', proficiency: 5 },
  { category: 'sewing', stepName: 'Side Seams', proficiency: 4 },
  { category: 'inspection', stepName: 'Final Check', proficiency: 3 },
];

export const Default: Story = {
  args: {
    name: 'Maria Santos',
    skills: sampleSkills,
    isAvailable: true,
    stats: {
      tasksCompleted: 24,
      hoursThisWeek: 32,
    },
    onEditSkills: () => alert('Edit skills'),
  },
};

export const Busy: Story = {
  args: {
    name: 'John Doe',
    skills: sampleSkills.slice(0, 3),
    isAvailable: false,
    currentTask: 'Sewing - Attach Elastic',
    stats: {
      tasksCompleted: 18,
      hoursThisWeek: 28,
    },
  },
};

export const Compact: Story = {
  args: {
    name: 'Maria Santos',
    skills: sampleSkills,
    isAvailable: true,
    compact: true,
    onPress: () => alert('Card pressed'),
  },
};

export const NoSkills: Story = {
  args: {
    name: 'New Worker',
    skills: [],
    isAvailable: true,
    onEditSkills: () => alert('Add skills'),
  },
};

export const WorkerList: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <WorkerCard
        name="Worker A"
        skills={sampleSkills}
        isAvailable={true}
        compact
        onPress={() => {}}
      />
      <WorkerCard
        name="Worker B"
        skills={sampleSkills.slice(0, 2)}
        isAvailable={false}
        currentTask="Cutting"
        compact
        onPress={() => {}}
      />
      <WorkerCard
        name="Worker C"
        skills={sampleSkills.slice(2, 4)}
        isAvailable={true}
        compact
        onPress={() => {}}
      />
    </View>
  ),
};
