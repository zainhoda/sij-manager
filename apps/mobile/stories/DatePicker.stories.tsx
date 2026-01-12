import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { DatePicker } from '../components/DatePicker';
import { colors } from '../theme';

const meta: Meta<typeof DatePicker> = {
  title: 'Forms/DatePicker',
  component: DatePicker,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minWidth: 300, minHeight: 500 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DatePicker>;

const DatePickerWrapper = (args: any) => {
  const [value, setValue] = useState<Date | null>(args.value || null);
  return <DatePicker {...args} value={value} onChange={setValue} />;
};

export const Default: Story = {
  render: () => (
    <DatePickerWrapper
      label="Due Date"
      placeholder="Select due date"
    />
  ),
};

export const WithValue: Story = {
  render: () => (
    <DatePickerWrapper
      label="Start Date"
      value={new Date()}
    />
  ),
};

export const WithMinDate: Story = {
  render: () => (
    <DatePickerWrapper
      label="Delivery Date"
      placeholder="Select date"
      minDate={new Date()}
      helperText="Must be today or later"
    />
  ),
};

export const WithError: Story = {
  render: () => (
    <DatePickerWrapper
      label="Due Date"
      error="Due date is required"
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <DatePickerWrapper
      label="Locked Date"
      value={new Date()}
      disabled
    />
  ),
};
