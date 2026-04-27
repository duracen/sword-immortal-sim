import { useState, useRef } from 'react';

// 데스크탑: HTML5 네이티브 드래그앤드롭
// 모바일: 카드 좌우 ◀ ▶ 버튼으로 위치 이동 (또는 카드 길게 눌러서 다음 카드 탭으로 swap)
export default function OrderEditor({ items, onChange }) {
  // items: [{ kind: 'skill'|'treasure', idx, label, cat }, ...]
  const [dragIdx, setDragIdx] = useState(null);
  // 모바일 swap 모드: 첫 탭으로 select, 두 번째 탭으로 swap
  const [selectedIdx, setSelectedIdx] = useState(null);
  // 터치 기반 드래그 처리 (모바일)
  const touchStateRef = useRef({ startX: 0, startY: 0, draggedIdx: null });

  function move(from, to) {
    if (from === null || to === null || from === to) return;
    const next = items.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  }

  // ----- 데스크탑 HTML5 드래그 -----
  function onDragStart(i) { setDragIdx(i); }
  function onDragOver(e) { e.preventDefault(); }
  function onDrop(i) {
    if (dragIdx !== null) move(dragIdx, i);
    setDragIdx(null);
  }

  // ----- 모바일 탭 (selectedIdx) -----
  function onTapCard(i) {
    if (selectedIdx === null) {
      setSelectedIdx(i);
    } else if (selectedIdx === i) {
      setSelectedIdx(null);  // 같은 카드 다시 탭 = 취소
    } else {
      move(selectedIdx, i);
      setSelectedIdx(null);
    }
  }

  // ----- 화살표 버튼 -----
  function moveLeft(i) { if (i > 0) move(i, i - 1); }
  function moveRight(i) { if (i < items.length - 1) move(i, i + 1); }

  return (
    <div>
      <div className="text-[11px] text-slate-400 mb-2">
        💡 PC: 드래그 / 모바일: 카드 두 번 탭으로 swap, 또는 ◀ ▶ 버튼으로 이동
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        {items.map((it, i) => {
          const isSelected = selectedIdx === i;
          const isDragging = dragIdx === i;
          return (
            <div key={i} className="flex items-center gap-1">
              <div className="flex flex-col items-center gap-0.5">
                <div
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(i)}
                  onClick={() => onTapCard(i)}
                  className={`flex flex-col items-center justify-center rounded border px-3 py-2 cursor-pointer min-w-[100px] transition ${
                    isSelected
                      ? 'bg-emerald-700 border-emerald-400 ring-2 ring-emerald-300'
                      : it.kind === 'skill'
                      ? 'bg-slate-800 border-slate-700 hover:border-slate-500'
                      : 'bg-amber-950/30 border-amber-700/50 hover:border-amber-500'
                  } ${isDragging ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-slate-300 text-[11px]">#{i + 1}</span>
                    <span
                      className={`text-[11px] px-1 rounded ${
                        it.kind === 'skill' ? 'bg-slate-700 text-slate-300' : 'bg-amber-700 text-amber-100'
                      }`}
                    >
                      {it.kind === 'skill' ? '신통' : '법보'}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-slate-100 text-center whitespace-nowrap">{it.label}</span>
                </div>
                {/* 위치 이동 버튼 (모바일/PC 양쪽) */}
                <div className="flex gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveLeft(i); }}
                    disabled={i === 0}
                    className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                    aria-label="앞으로"
                  >◀</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveRight(i); }}
                    disabled={i === items.length - 1}
                    className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                    aria-label="뒤로"
                  >▶</button>
                </div>
              </div>
              {i < items.length - 1 && <span className="text-slate-400 text-lg">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
