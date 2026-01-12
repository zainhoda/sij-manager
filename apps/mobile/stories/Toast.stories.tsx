import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { Toast, ToastProvider, useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { colors } from '../theme';

const meta: Meta<typeof Toast> = {
  title: 'Utility/Toast',
  component: Toast,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minHeight: 400 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Show Success" onPress={() => setVisible(true)} />
        <View style={{ marginTop: 60 }}>
          <Toast
            message="Order created successfully!"
            type="success"
            visible={visible}
            onHide={() => setVisible(false)}
          />
        </View>
      </View>
    );
  },
};

export const Error: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Show Error" onPress={() => setVisible(true)} />
        <View style={{ marginTop: 60 }}>
          <Toast
            message="Failed to save changes. Please try again."
            type="error"
            visible={visible}
            onHide={() => setVisible(false)}
          />
        </View>
      </View>
    );
  },
};

export const Warning: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Show Warning" onPress={() => setVisible(true)} />
        <View style={{ marginTop: 60 }}>
          <Toast
            message="This order is at risk of missing its deadline."
            type="warning"
            visible={visible}
            onHide={() => setVisible(false)}
          />
        </View>
      </View>
    );
  },
};

export const Info: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Show Info" onPress={() => setVisible(true)} />
        <View style={{ marginTop: 60 }}>
          <Toast
            message="Schedule has been updated with new assignments."
            type="info"
            visible={visible}
            onHide={() => setVisible(false)}
          />
        </View>
      </View>
    );
  },
};

export const WithAction: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    return (
      <View>
        <Button title="Show With Action" onPress={() => setVisible(true)} />
        <View style={{ marginTop: 60 }}>
          <Toast
            message="Worker reassigned successfully."
            type="success"
            visible={visible}
            onHide={() => setVisible(false)}
            action={{
              label: 'Undo',
              onPress: () => alert('Undo pressed'),
            }}
          />
        </View>
      </View>
    );
  },
};

export const AllTypes: Story = {
  render: () => {
    const [activeToast, setActiveToast] = useState<string | null>(null);
    return (
      <View style={{ gap: 12 }}>
        <Button title="Success" variant="primary" onPress={() => setActiveToast('success')} />
        <Button title="Error" variant="secondary" onPress={() => setActiveToast('error')} />
        <Button title="Warning" variant="secondary" onPress={() => setActiveToast('warning')} />
        <Button title="Info" variant="secondary" onPress={() => setActiveToast('info')} />

        <View style={{ marginTop: 60 }}>
          <Toast
            message="Success message"
            type="success"
            visible={activeToast === 'success'}
            onHide={() => setActiveToast(null)}
          />
          <Toast
            message="Error message"
            type="error"
            visible={activeToast === 'error'}
            onHide={() => setActiveToast(null)}
          />
          <Toast
            message="Warning message"
            type="warning"
            visible={activeToast === 'warning'}
            onHide={() => setActiveToast(null)}
          />
          <Toast
            message="Info message"
            type="info"
            visible={activeToast === 'info'}
            onHide={() => setActiveToast(null)}
          />
        </View>
      </View>
    );
  },
};

// Using ToastProvider
const ToastDemo = () => {
  const toast = useToast();

  return (
    <View style={{ gap: 12 }}>
      <Button
        title="Success Toast"
        onPress={() => toast.success('Operation completed successfully!')}
      />
      <Button
        title="Error Toast"
        variant="secondary"
        onPress={() => toast.error('Something went wrong.')}
      />
      <Button
        title="With Action"
        variant="secondary"
        onPress={() =>
          toast.info('Item deleted.', {
            action: { label: 'Undo', onPress: () => toast.success('Restored!') },
          })
        }
      />
    </View>
  );
};

export const WithProvider: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};
