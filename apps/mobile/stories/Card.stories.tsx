import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View, Text } from 'react-native';
import { Card } from '../components/Card';
import { colors, typography } from '../theme';

const meta: Meta<typeof Card> = {
  title: 'Base/Card',
  component: Card,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream }}>
        <Story />
      </View>
    ),
  ],
  argTypes: {
    category: {
      control: 'select',
      options: [undefined, 'cutting', 'silkscreen', 'prep', 'sewing', 'inspection'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    children: (
      <Text style={typography.body}>This is a basic card with default styling.</Text>
    ),
  },
};

export const WithCategory: Story = {
  args: {
    category: 'sewing',
    children: (
      <View>
        <Text style={typography.h3}>Sewing Task</Text>
        <Text style={typography.bodySmall}>This card has a category indicator.</Text>
      </View>
    ),
  },
};

export const AllCategories: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Card category="cutting">
        <Text style={typography.body}>Cutting</Text>
      </Card>
      <Card category="silkscreen">
        <Text style={typography.body}>Silkscreen</Text>
      </Card>
      <Card category="prep">
        <Text style={typography.body}>Prep</Text>
      </Card>
      <Card category="sewing">
        <Text style={typography.body}>Sewing</Text>
      </Card>
      <Card category="inspection">
        <Text style={typography.body}>Inspection</Text>
      </Card>
    </View>
  ),
};

export const NoPadding: Story = {
  args: {
    noPadding: true,
    children: (
      <View style={{ padding: 16, backgroundColor: colors.navy }}>
        <Text style={[typography.body, { color: colors.white }]}>Custom padding content</Text>
      </View>
    ),
  },
};
