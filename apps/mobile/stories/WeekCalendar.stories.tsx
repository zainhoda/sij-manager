import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { WeekCalendar } from '../components/WeekCalendar';
import { TimeSlot } from '../components/DayColumn';
import { colors } from '../theme';

const meta: Meta<typeof WeekCalendar> = {
  title: 'Domain/WeekCalendar',
  component: WeekCalendar,
  decorators: [
    (Story) => (
      <View style={{ backgroundColor: colors.cream, minHeight: 500, minWidth: 350 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof WeekCalendar>;

// Get Monday of current week
const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

// Sample schedule data
const generateSampleSlots = (weekStart: Date): Record<string, TimeSlot[]> => {
  const slots: Record<string, TimeSlot[]> = {};

  for (let i = 0; i < 5; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dateKey = date.toISOString().split('T')[0];

    slots[dateKey] = [
      {
        id: `${dateKey}-1`,
        startTime: '07:00',
        endTime: '09:00',
        title: 'Cut Body Panels',
        category: 'cutting',
        workerName: 'Worker A',
        progress: i < 3 ? 100 : i === 3 ? 60 : 0,
      },
      {
        id: `${dateKey}-2`,
        startTime: '09:00',
        endTime: '11:00',
        title: 'Print Logo',
        category: 'silkscreen',
        workerName: 'Worker C',
        progress: i < 2 ? 100 : i === 2 ? 40 : 0,
      },
      {
        id: `${dateKey}-3`,
        startTime: '11:30',
        endTime: '14:00',
        title: 'Attach Elastic',
        category: 'sewing',
        workerName: 'Worker B',
        progress: i < 1 ? 100 : 0,
      },
    ];
  }

  return slots;
};

const WeekCalendarWrapper = (args: any) => {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const slotsByDate = generateSampleSlots(weekStart);

  return (
    <WeekCalendar
      {...args}
      weekStart={weekStart}
      slotsByDate={slotsByDate}
      selectedDate={selectedDate}
      onWeekChange={setWeekStart}
      onDaySelect={setSelectedDate}
      onSlotPress={(slot) => alert(`Pressed: ${slot.title}`)}
    />
  );
};

export const Default: Story = {
  render: () => <WeekCalendarWrapper />,
};

export const WithSaturday: Story = {
  render: () => <WeekCalendarWrapper showSaturday />,
};

export const EmptyWeek: Story = {
  render: () => {
    const [weekStart, setWeekStart] = useState(getMonday(new Date()));
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();

    return (
      <WeekCalendar
        weekStart={weekStart}
        slotsByDate={{}}
        selectedDate={selectedDate}
        onWeekChange={setWeekStart}
        onDaySelect={setSelectedDate}
      />
    );
  },
};
