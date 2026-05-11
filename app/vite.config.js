import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// sim2.js가 app/ 바깥에 있으므로 fs 접근을 허용해야 함
// ⚡ Cross-Origin Isolation 헤더 — SharedArrayBuffer 사용 위해 필요.
//   COOP: same-origin, COEP: require-corp + CORP: same-origin (모든 응답)
//   외부 리소스 (Google Fonts) self-host 후 활성화 가능.
//   server.headers 가 일부 응답 (node_modules CSS 등) 에 적용 안 되어 — middleware 로 강제.
const crossOriginIsolationPlugin = () => ({
  name: 'cross-origin-isolation',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), crossOriginIsolationPlugin()],
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    watch: {
      usePolling: true,
      interval: 200,
    },
  },
  worker: {
    format: 'es',
  },
});
