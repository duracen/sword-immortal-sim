import { useState, useEffect } from 'react';

// 스크롤 위치가 화면 1배 이상 내려가면 우하단에 "맨 위로" 버튼 표시
export default function ScrollToTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    function onScroll() {
      setShow(window.scrollY > window.innerHeight * 0.5);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-4 right-4 z-[1000] w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold shadow-xl shadow-amber-900/50 border border-amber-300/40 flex items-center justify-center text-xl"
      aria-label="맨 위로"
      title="맨 위로"
    >
      ↑
    </button>
  );
}
