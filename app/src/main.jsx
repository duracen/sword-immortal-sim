import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
// ⚡ Noto Sans KR self-hosted — Google Fonts 의존 제거 (Cross-Origin Isolation 호환)
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
