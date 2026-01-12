import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { Select } from '../components/Select';
import { colors } from '../theme';

const meta: Meta<typeof Select> = {
  title: 'Forms/Select',
  component: Select,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minWidth: 300, minHeight: 400 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Select>;

const products = [
  { value: 'tenjam-1', label: 'Tenjam Classic', description: '12 steps, 3 hours' },
  { value: 'tenjam-2', label: 'Tenjam Pro', description: '18 steps, 5 hours' },
  { value: 'tenjam-3', label: 'Tenjam Kids', description: '8 steps, 2 hours' },
];

const workers = [
  { value: 'worker-a', label: 'Worker A' },
  { value: 'worker-b', label: 'Worker B' },
  { value: 'worker-c', label: 'Worker C' },
  { value: 'worker-d', label: 'Worker D' },
];

const SelectWrapper = (args: any) => {
  const [value, setValue] = useState<string | null>(args.value || null);
  return <Select {...args} value={value} onChange={setValue} />;
};

export const Default: Story = {
  render: () => (
    <SelectWrapper
      options={products}
      label="Select Product"
      placeholder="Choose a product"
    />
  ),
};

export const WithDescription: Story = {
  render: () => (
    <SelectWrapper
      options={products}
      label="Product"
      placeholder="Select product"
      helperText="Select the product for this order"
    />
  ),
};

export const WithError: Story = {
  render: () => (
    <SelectWrapper
      options={workers}
      label="Assign Worker"
      error="Worker selection is required"
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SelectWrapper
      options={workers}
      label="Worker"
      value="worker-a"
      disabled
    />
  ),
};

export const SimpleOptions: Story = {
  render: () => (
    <SelectWrapper
      options={workers}
      label="Assign Worker"
      placeholder="Select worker"
    />
  ),
};
