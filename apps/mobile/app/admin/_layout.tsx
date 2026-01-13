import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { SwitchViewButton } from '@/components';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function AdminLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: useClientOnlyValue(false, true),
        headerLeft: () => <SwitchViewButton />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
          headerRight: () => (
            <React.Fragment>
              <Link href="/scheduling" asChild>
                <Pressable>
                  {({ pressed }) => (
                    <FontAwesome
                      name="line-chart"
                      size={20}
                      color={Colors[colorScheme ?? 'light'].tint}
                      style={{ marginRight: 20, opacity: pressed ? 0.5 : 1 }}
                    />
                  )}
                </Pressable>
              </Link>
              <Link href="/orders/new" asChild>
                <Pressable>
                  {({ pressed }) => (
                    <FontAwesome
                      name="plus"
                      size={22}
                      color={Colors[colorScheme ?? 'light'].tint}
                      style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                    />
                  )}
                </Pressable>
              </Link>
            </React.Fragment>
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => <TabBarIcon name="list-alt" color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          tabBarIcon: ({ color }) => <TabBarIcon name="cube" color={color} />,
        }}
      />
      <Tabs.Screen
        name="workers"
        options={{
          title: 'Workers',
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="equipment"
        options={{
          title: 'Equipment',
          tabBarIcon: ({ color }) => <TabBarIcon name="wrench" color={color} />,
        }}
      />
      <Tabs.Screen
        name="certifications"
        options={{
          title: 'Certs',
          tabBarIcon: ({ color }) => <TabBarIcon name="certificate" color={color} />,
        }}
      />
    </Tabs>
  );
}
