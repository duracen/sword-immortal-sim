import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// 모바일/데스크탑 호환 툴팁
// - 데스크탑: hover 로 표시, mouseleave 로 닫기
// - 모바일/터치: 트리거 탭으로 토글, 외부 탭 또는 스크롤로 닫기
// - viewport 안에 들어오게 좌우 자동 clamp + 하단 공간 부족 시 위로 flip
//
// props
//   children: 트리거 요소 (이미 있는 button 등)
//   content: 툴팁 내부 (JSX)
//   className: 툴팁 박스 추가 클래스 (border 색 등)
//   maxWidth: 기본 384 (px). vp - 16px 보다 크면 자동 축소
export default function HoverTooltip({ children, content, className = 'border-slate-600', maxWidth = 384 }) {
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  // 터치 디바이스에서는 hover 의도와 click 의도 분리하기 위해 추적
  const isTouchRef = useRef(false);

  function compute(measureH = 0) {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const w = Math.min(maxWidth, vw - margin * 2);
    // 좌측: 트리거 가운데 기준, viewport 안에 clamp
    let left = r.left + r.width / 2 - w / 2;
    if (left < margin) left = margin;
    if (left + w > vw - margin) left = vw - margin - w;
    // 하단: 트리거 아래 4px. 만약 측정된 height 가 viewport 아래로 넘치면 위로 flip
    let top = r.bottom + 4;
    if (measureH > 0 && top + measureH > vh - margin) {
      const flippedTop = r.top - measureH - 4;
      if (flippedTop >= margin) top = flippedTop;
      else {
        // 위/아래 모두 부족하면 viewport 위쪽 마진에 강제 (스크롤 가능)
        top = margin;
      }
    }
    return { left, top, width: w };
  }

  // 표시 직후 실제 height 측정 후 flip 재계산
  useLayoutEffect(() => {
    if (!shown || !pos) return;
    const el = tooltipRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const recomputed = compute(h);
    // 위치가 바뀌면 다시 set
    if (recomputed && (recomputed.top !== pos.top || recomputed.left !== pos.left)) {
      setPos(recomputed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  function show() {
    setPos(compute());
    setShown(true);
  }
  function hide() { setShown(false); }
  function toggle() { shown ? hide() : show(); }

  // 외부 탭 / 스크롤 시 닫기 (mobile, 토글 식)
  useEffect(() => {
    if (!shown) return;
    function onDocPointer(e) {
      const t = triggerRef.current;
      const tt = tooltipRef.current;
      if (t && t.contains(e.target)) return;
      if (tt && tt.contains(e.target)) return;
      hide();
    }
    function onScroll() { hide(); }
    document.addEventListener('pointerdown', onDocPointer);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [shown]);

  return (
    <span
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={() => {
        // 마우스 hover (데스크탑) 만 즉시 표시
        if (!isTouchRef.current) show();
      }}
      onMouseLeave={() => {
        if (!isTouchRef.current) hide();
      }}
      onTouchStart={() => {
        // 터치 시작: 터치 모드 플래그 set (이후 click 에서 toggle)
        isTouchRef.current = true;
      }}
      onClick={() => {
        // 터치/모바일: 탭하면 토글. 데스크탑은 hover 로 이미 표시되어 있음.
        if (isTouchRef.current) {
          toggle();
        }
      }}
      onFocus={() => show()}
      onBlur={() => {
        setTimeout(() => {
          if (document.activeElement && triggerRef.current?.contains(document.activeElement)) return;
          hide();
        }, 0);
      }}
    >
      {children}
      {shown && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed z-[9999] p-3 bg-slate-950 border rounded-lg shadow-xl pointer-events-none ${className}`}
          style={{ left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px`, maxHeight: '70vh', overflowY: 'auto' }}
        >
          {content}
        </div>,
        document.body
      )}
    </span>
  );
}
