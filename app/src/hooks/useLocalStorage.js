import { useState, useEffect } from 'react';

// localStorage 기반 state hook — 변경 시 자동 저장, 페이지 reload 시 복원.
// 값이 객체/배열이면 JSON serialize. 기본값은 lazy init.
export default function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return defaultValue;
      return JSON.parse(stored);
    } catch (e) {
      console.warn(`useLocalStorage: failed to parse "${key}" — using default`, e);
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`useLocalStorage: failed to save "${key}"`, e);
    }
  }, [key, value]);

  return [value, setValue];
}
