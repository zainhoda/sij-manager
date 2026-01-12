import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    backgrounds: {
      default: 'cream',
      values: [
        { name: 'cream', value: '#FAFAF9' },
        { name: 'white', value: '#FFFFFF' },
        { name: 'dark', value: '#111827' },
      ],
    },
  },
};

export default preview;
