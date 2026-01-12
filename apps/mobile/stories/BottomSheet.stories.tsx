import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View, Text } from 'react-native';
import { BottomSheet, ActionSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { TextInput } from '../components/TextInput';
import { Select } from '../components/Select';
import { colors, typography, spacing } from '../theme';

const meta: Meta<typeof BottomSheet> = {
  title: 'Utility/BottomSheet',
  component: BottomSheet,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minHeight: 600 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BottomSheet>;

export const Default: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Open Sheet" onPress={() => setVisible(true)} />
        <BottomSheet
          visible={visible}
          onClose={() => setVisible(false)}
          title="Edit Task"
        >
          <View style={{ gap: 16 }}>
            <TextInput label="Task Name" defaultValue="Attach Elastic" />
            <TextInput label="Worker" defaultValue="Worker B" />
            <Text style={[typography.bodySmall, { color: colors.textSecondary }]}>
              Make changes to the task assignment here.
            </Text>
          </View>
        </BottomSheet>
      </View>
    );
  },
};

export const WithFooter: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Open With Footer" onPress={() => setVisible(true)} />
        <BottomSheet
          visible={visible}
          onClose={() => setVisible(false)}
          title="New Order"
          height={0.7}
          footer={
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Create Order"
                variant="primary"
                onPress={() => setVisible(false)}
                style={{ flex: 1 }}
              />
            </View>
          }
        >
          <View style={{ gap: 16 }}>
            <TextInput label="Product" placeholder="Select product" />
            <TextInput label="Quantity" placeholder="Enter quantity" keyboardType="numeric" />
            <TextInput label="Due Date" placeholder="Select date" />
          </View>
        </BottomSheet>
      </View>
    );
  },
};

export const ActionSheetExample: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Show Actions" onPress={() => setVisible(true)} />
        <ActionSheet
          visible={visible}
          onClose={() => setVisible(false)}
          title="Task Options"
          message="What would you like to do with this task?"
          options={[
            { label: 'Edit Task', onPress: () => alert('Edit') },
            { label: 'Reassign Worker', onPress: () => alert('Reassign') },
            { label: 'Mark Complete', onPress: () => alert('Complete') },
            { label: 'Delete Task', onPress: () => alert('Delete'), variant: 'destructive' },
          ]}
        />
      </View>
    );
  },
};

export const TallSheet: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Open Tall Sheet" onPress={() => setVisible(true)} />
        <BottomSheet
          visible={visible}
          onClose={() => setVisible(false)}
          title="Worker Skills"
          height={0.8}
        >
          <View style={{ gap: 16 }}>
            {['Cutting', 'Silkscreen', 'Prep', 'Sewing', 'Inspection'].map((skill) => (
              <View key={skill} style={{ padding: 16, backgroundColor: colors.gray[50], borderRadius: 8 }}>
                <Text style={typography.h3}>{skill}</Text>
                <Text style={[typography.bodySmall, { color: colors.textSecondary }]}>
                  Proficiency level: 3/5
                </Text>
              </View>
            ))}
          </View>
        </BottomSheet>
      </View>
    );
  },
};
