import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function TVLayout() {

  return (
    <>
      <StatusBar hidden />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#111827' },
        }}
      />
    </>
  );
}
