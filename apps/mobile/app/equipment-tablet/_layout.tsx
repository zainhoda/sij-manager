import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { SwitchViewButton } from '@/components';

export default function EquipmentTabletLayout() {
  const colorScheme = useColorScheme();

  return (
    <>
      <StatusBar hidden />
      <Stack
        screenOptions={{
          headerTintColor: Colors[colorScheme ?? 'light'].tint,
          headerLeft: () => <SwitchViewButton />,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Select Equipment',
          }}
        />
        <Stack.Screen
          name="[id]"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: '#111827' },
          }}
        />
      </Stack>
    </>
  );
}
