import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useViewContext } from '@/context/ViewContext';
import { colors } from '@/theme/colors';

interface SwitchViewButtonProps {
  color?: string;
  size?: number;
}

export function SwitchViewButton({ color = colors.navy, size = 20 }: SwitchViewButtonProps) {
  const { switchView } = useViewContext();

  return (
    <Pressable
      onPress={switchView}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
      ]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <FontAwesome name="th-large" size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginRight: 15,
    padding: 4,
  },
  buttonPressed: {
    opacity: 0.5,
  },
});
