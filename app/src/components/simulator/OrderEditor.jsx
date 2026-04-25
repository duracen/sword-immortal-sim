import { useState } from 'react';

// HTML5 네이티브 드래그앤드롭 사용 (외부 의존성 X)
export default function OrderEditor({ items, onChange }) {
  // items: [{ kind: 'skill'|'treasure', idx, label, cat }, ...]
  const [dragIdx, setDragIdx] = useState(null);

  function onDragStart(i) {
    setDragIdx(i);
  }
  function onDragOver(e) {
    e.preventDefault();
  }
  function onDrop(i) {
    if (dragIdx === null || dragIdx === i) return;
    const next = items.slice();
    const [m] = next.splice(dragIdx, 1);
    next.splice(i, 0, m);
    onChange(next);
    setDragIdx(null);
  }

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1">
          <div
            draggable
            onDragStart={() => onDragStart(i)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(i)}
            className={`flex flex-col items-center justify-center rounded border px-3 py-2 cursor-move min-w-[100px] ${
              it.kind === 'skill'
                ? 'bg-slate-800 border-slate-700 hover:border-slate-500'
                : 'bg-amber-950/30 border-amber-700/50 hover:border-amber-500'
            } ${dragIdx === i ? 'opacity-50' : ''}`}
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
          {i < items.length - 1 && <span className="text-slate-400 text-lg">→</span>}
        </div>
      ))}
    </div>
  );
}
