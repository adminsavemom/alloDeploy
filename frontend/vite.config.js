import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    strictPort: true,
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
