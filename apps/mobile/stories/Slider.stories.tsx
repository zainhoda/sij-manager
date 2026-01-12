import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { Slider, ProficiencySlider } from '../components/Slider';
import { colors } from '../theme';

const meta: Meta<typeof Slider> = {
  title: 'Forms/Slider',
  component: Slider,
  decorators: [
    (Story) => (
      <View style={{ padding: 16, backgroundColor: colors.cream, minWidth: 300 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Slider>;

const SliderWrapper = (args: any) => {
  const [value, setValue] = useState(args.value || 50);
  return <Slider {...args} value={value} onChange={setValue} />;
};

const ProficiencySliderWrapper = (args: any) => {
  const [value, setValue] = useState<1 | 2 | 3 | 4 | 5>(args.value || 3);
  return <ProficiencySlider {...args} value={value} onChange={setValue} />;
};

export const Default: Story = {
  render: () => <SliderWrapper label="Progress" />,
};

export const WithSteps: Story = {
  render: () => (
    <SliderWrapper
      label="Rating"
      min={1}
      max={5}
      step={1}
      showSteps
      stepLabels={['1', '2', '3', '4', '5']}
    />
  ),
};

export const Proficiency: Story = {
  render: () => (
    <ProficiencySliderWrapper label="Sewing Proficiency" />
  ),
};

export const CustomFormat: Story = {
  render: () => (
    <SliderWrapper
      label="Duration"
      min={0}
      max={120}
      step={15}
      formatValue={(v: number) => `${v} min`}
    />
  ),
};

export const AllProficiencyLevels: Story = {
  render: () => (
    <View style={{ gap: 24 }}>
      <ProficiencySliderWrapper label="Cutting" value={1} />
      <ProficiencySliderWrapper label="Silkscreen" value={2} />
      <ProficiencySliderWrapper label="Prep" value={3} />
      <ProficiencySliderWrapper label="Sewing" value={4} />
      <ProficiencySliderWrapper label="Inspection" value={5} />
    </View>
  ),
};
