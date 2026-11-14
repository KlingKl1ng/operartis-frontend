import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { moduleConfig } from '../app-shared/viteShared';

export default defineConfig(mergeConfig(
  moduleConfig({ appDir: import.meta.url, name: 'inventory', apiPrefix: '/inventory', port: 4176 }),
  {
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
));
