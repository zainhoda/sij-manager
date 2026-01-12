import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { NumberInput } from '../components/NumberInput';
import { colors } from '../theme';

const meta: Meta<typeof NumberInput> = {
  title: 'Forms/NumberInput',
  component: NumberInput,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minWidth: 300 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NumberInput>;

const NumberInputWrapper = (args: any) => {
  const [value, setValue] = useState(args.value || 0);
  return <NumberInput {...args} value={value} onChange={setValue} />;
};

export const Default: Story = {
  render: () => <NumberInputWrapper value={50} label="Quantity" />,
};

export const WithUnit: Story = {
  render: () => <NumberInputWrapper value={100} label="Order Quantity" unit="pcs" />,
};

export const WithMinMax: Story = {
  render: () => (
    <NumberInputWrapper
      value={3}
      label="Proficiency Level"
      min={1}
      max={5}
      helperText="Rate from 1 to 5"
    />
  ),
};

export const WithStep: Story = {
  render: () => (
    <NumberInputWrapper
      value={50}
      label="Time (minutes)"
      step={15}
      unit="min"
    />
  ),
};

export const AllStates: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <NumberInputWrapper value={50} label="Default" />
      <NumberInputWrapper value={100} label="With Unit" unit="pcs" />
      <NumberInputWrapper value={1} label="At Minimum" min={1} max={10} />
      <NumberInputWrapper value={10} label="At Maximum" min={1} max={10} />
      <NumberInputWrapper value={0} label="Disabled" disabled />
    </View>
  ),
};
