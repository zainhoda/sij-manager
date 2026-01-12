import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { FilterChip, FilterChipGroup } from '../components/FilterChip';
import { colors } from '../theme';

const meta: Meta<typeof FilterChip> = {
  title: 'Utility/FilterChip',
  component: FilterChip,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FilterChip>;

export const Default: Story = {
  args: {
    label: 'Sewing',
  },
};

export const Selected: Story = {
  args: {
    label: 'Sewing',
    selected: true,
  },
};

export const WithCount: Story = {
  args: {
    label: 'In Progress',
    count: 12,
  },
};

export const SelectedWithCount: Story = {
  args: {
    label: 'In Progress',
    count: 12,
    selected: true,
  },
};

export const ChipGroup: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>(['sewing']);
    const options = [
      { value: 'all', label: 'All', count: 45 },
      { value: 'cutting', label: 'Cutting', count: 8 },
      { value: 'silkscreen', label: 'Silkscreen', count: 5 },
      { value: 'sewing', label: 'Sewing', count: 20 },
      { value: 'inspection', label: 'Inspection', count: 12 },
    ];
    return (
      <FilterChipGroup
        options={options}
        selected={selected}
        onChange={setSelected}
      />
    );
  },
};

export const SingleSelect: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>(['week']);
    const options = [
      { value: 'day', label: 'Day' },
      { value: 'week', label: 'Week' },
      { value: 'month', label: 'Month' },
    ];
    return (
      <FilterChipGroup
        options={options}
        selected={selected}
        onChange={setSelected}
        multiple={false}
      />
    );
  },
};

export const StatusFilters: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>([]);
    const options = [
      { value: 'pending', label: 'Pending', count: 15 },
      { value: 'in-progress', label: 'In Progress', count: 8 },
      { value: 'completed', label: 'Completed', count: 22 },
      { value: 'at-risk', label: 'At Risk', count: 3 },
    ];
    return (
      <FilterChipGroup
        options={options}
        selected={selected}
        onChange={setSelected}
      />
    );
  },
};
