import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { CategoryBadge } from '../components/CategoryBadge';

const meta: Meta<typeof CategoryBadge> = {
  title: 'Domain/CategoryBadge',
  component: CategoryBadge,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, gap: 16 }}>
        <Story />
      </View>
    ),
  ],
  argTypes: {
    category: {
      control: 'select',
      options: ['cutting', 'silkscreen', 'prep', 'sewing', 'inspection'],
    },
    variant: {
      control: 'select',
      options: ['subtle', 'filled', 'outline'],
    },
    size: {
      control: 'select',
      options: ['small', 'default'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof CategoryBadge>;

export const Default: Story = {
  args: {
    category: 'sewing',
  },
};

export const AllCategories: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <CategoryBadge category="cutting" />
      <CategoryBadge category="silkscreen" />
      <CategoryBadge category="prep" />
      <CategoryBadge category="sewing" />
      <CategoryBadge category="inspection" />
    </View>
  ),
};

export const Filled: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <CategoryBadge category="cutting" variant="filled" />
      <CategoryBadge category="silkscreen" variant="filled" />
      <CategoryBadge category="prep" variant="filled" />
      <CategoryBadge category="sewing" variant="filled" />
      <CategoryBadge category="inspection" variant="filled" />
    </View>
  ),
};

export const Outline: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <CategoryBadge category="cutting" variant="outline" />
      <CategoryBadge category="silkscreen" variant="outline" />
      <CategoryBadge category="prep" variant="outline" />
      <CategoryBadge category="sewing" variant="outline" />
      <CategoryBadge category="inspection" variant="outline" />
    </View>
  ),
};

export const Small: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <CategoryBadge category="cutting" size="small" />
      <CategoryBadge category="silkscreen" size="small" />
      <CategoryBadge category="prep" size="small" />
      <CategoryBadge category="sewing" size="small" />
      <CategoryBadge category="inspection" size="small" />
    </View>
  ),
};
