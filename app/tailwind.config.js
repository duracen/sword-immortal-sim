/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cat: {
          영검: '#4a90e2',
          화염: '#e24a4a',
          뇌전: '#b04ae2',
          백족: '#4ae28a',
        },
      },
      fontFamily: {
        kr: ['Pretendard', 'Noto Sans KR', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
