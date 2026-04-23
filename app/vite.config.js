import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// sim2.js가 app/ 바깥에 있으므로 fs 접근을 허용해야 함
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  worker: {
    format: 'es',
  },
});
