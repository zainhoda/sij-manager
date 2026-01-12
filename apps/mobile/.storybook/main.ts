import type { StorybookConfig } from '@storybook/react-vite';
import react from '@vitejs/plugin-react';

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (config) => {
    // Remove existing react plugins to avoid conflicts
    const plugins = (config.plugins || []).filter(
      (plugin) => !(plugin && (plugin as any).name?.includes('vite:react'))
    );

    return {
      ...config,
      plugins: [
        ...plugins,
        react({
          jsxRuntime: 'automatic',
        }),
      ],
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          'react-native': 'react-native-web',
          'lucide-react-native': 'lucide-react',
          '@': '/Users/zain/git/sij-manager/apps/mobile',
        },
        extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js'],
      },
      define: {
        ...config.define,
        'process.env': {},
        __DEV__: true,
      },
    };
  },
};

export default config;
