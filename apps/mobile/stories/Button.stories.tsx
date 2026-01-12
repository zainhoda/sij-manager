import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { Button } from '../components/Button';

const meta: Meta<typeof Button> = {
  title: 'Base/Button',
  component: Button,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, gap: 12 }}>
        <Story />
      </View>
    ),
  ],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'accent', 'ghost'],
    },
    size: {
      control: 'select',
      options: ['default', 'small'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    title: 'Primary Button',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    title: 'Secondary Button',
    variant: 'secondary',
  },
};

export const Accent: Story = {
  args: {
    title: 'Generate Schedule',
    variant: 'accent',
  },
};

export const Ghost: Story = {
  args: {
    title: 'Cancel',
    variant: 'ghost',
  },
};

export const Small: Story = {
  args: {
    title: 'Small Button',
    variant: 'primary',
    size: 'small',
  },
};

export const Loading: Story = {
  args: {
    title: 'Loading...',
    variant: 'primary',
    loading: true,
  },
};

export const FullWidth: Story = {
  args: {
    title: 'Full Width Button',
    variant: 'primary',
    fullWidth: true,
  },
};

export const AllVariants: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Button title="Primary" variant="primary" />
      <Button title="Secondary" variant="secondary" />
      <Button title="Accent" variant="accent" />
      <Button title="Ghost" variant="ghost" />
    </View>
  ),
};
