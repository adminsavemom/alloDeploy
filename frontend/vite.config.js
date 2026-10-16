import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/sites': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    },
    watch: {
      ignored: [
        '**/*.rar',
        '**/*.zip',
        '**/dist/**',
        '**/.git/**',
        '**/storage/**'
      ]
    }
  }
});
