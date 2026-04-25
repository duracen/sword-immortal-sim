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
  build: {
    // 큰 chunk 경고 임계값을 800KB 로 (sim2.js 171KB 텍스트 포함하므로)
    chunkSizeWarningLimit: 800,
    // terser 로 최대 압축 (esbuild 보다 ~5% 더 작음)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,  // 콘솔 로그는 유지 (디버그용)
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        // Korean 변수명 mangle 허용 (식별자 단축)
        keep_classnames: false,
        keep_fnames: false,
      },
    },
    rollupOptions: {
      output: {
        // React 벤더를 별도 chunk 로 (앱 업데이트 시에도 React chunk 캐시 재사용)
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
});
