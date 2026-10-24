import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_API_BACKEND_URL || env.VITE_API_BASE_URL || env.BACKEND_URL;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/auth': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
        '/orgs': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
        '/analytics': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
        '/permissions': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
