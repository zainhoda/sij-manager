import React from 'react';
import { Stack } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { SwitchViewButton } from '@/components';

export default function WorkerLayout() {
  const colorScheme = useColorScheme();

  return (
    <Stack
      screenOptions={{
        headerTintColor: Colors[colorScheme ?? 'light'].tint,
        headerLeft: () => <SwitchViewButton />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'My Tasks',
        }}
      />
    </Stack>
  );
}
