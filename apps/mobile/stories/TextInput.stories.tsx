import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View, Text } from 'react-native';
import { TextInput } from '../components/TextInput';
import { colors } from '../theme';

const meta: Meta<typeof TextInput> = {
  title: 'Forms/TextInput',
  component: TextInput,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minWidth: 300 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TextInput>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Product Name',
    placeholder: 'Enter product name',
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Email',
    placeholder: 'you@example.com',
    helperText: 'We will never share your email',
  },
};

export const WithError: Story = {
  args: {
    label: 'Quantity',
    placeholder: 'Enter quantity',
    error: 'Quantity must be a positive number',
    defaultValue: '-5',
  },
};

export const AllStates: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <TextInput label="Default" placeholder="Enter text..." />
      <TextInput label="With Value" defaultValue="Sample text" />
      <TextInput label="With Helper" placeholder="Email" helperText="Your email address" />
      <TextInput label="With Error" error="This field is required" />
      <TextInput label="Disabled" placeholder="Disabled input" editable={false} />
    </View>
  ),
};
