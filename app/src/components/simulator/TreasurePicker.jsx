import { useState } from 'react';
import { TREASURE_NAMES } from '../../engine';
import { TREASURE_DESCS } from '../../utils/skillOptions';
import HoverTooltip from '../common/HoverTooltip';

// 표시 순서 (시전 기본 순서와 동일): 환음요탑 → 유리옥호 → 참원선검 → 오염혁선 → 산하옥척 → 경몽비파
const DISPLAY_ORDER = ['환음요탑', '유리옥호', '참원선검', '오염혁선', '산하옥척', '경몽비파'];
const TREASURE_DISPLAY = DISPLAY_ORDER.filter((t) => TREASURE_NAMES.includes(t));

export default function TreasurePicker({ selected, onChange, showOrder = true, showOrderEditor = true, maxSelect = 6, minSelect = 0, order = null }) {
  // order 가 주어지면 각 법보의 시전 순서 (1-based) 를 계산 — 없으면 selected.indexOf + 1
  // order = [{kind: 'skill'|'treasure', idx, ...}, ...]
  const treasureSlotMap = order ? (() => {
    const m = {};
    order.forEach((o, slotIdx) => {
      if (o.kind === 'treasure') {
        const tr = selected[o.idx];
        if (tr) m[tr] = slotIdx + 1; // 1-based
      }
    });
    return m;
  })() : null;
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  function toggle(tr) {
    if (selected.includes(tr)) {
      onChange(selected.filter((t) => t !== tr));
    } else if (selected.length < maxSelect) {
      onChange([...selected, tr]);
    }
  }

  function moveTo(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    if (toIdx < 0 || toIdx >= selected.length) return;
    const next = selected.slice();
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    onChange(next);
  }

  function move(idx, dir) {
    moveTo(idx, idx + dir);
  }

  function handleDragStart(idx) {
    setDragIdx(idx);
  }
  function handleDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }
  function handleDragLeave() {
    setDragOverIdx(null);
  }
  function handleDrop(e, idx) {
    e.preventDefault();
    if (dragIdx !== null) moveTo(dragIdx, idx);
    setDragIdx(null);
    setDragOverIdx(null);
  }
  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="text-sm text-slate-300">
          선택된 법보: <span className="font-bold text-amber-400">{selected.length}</span>/{maxSelect}
          {minSelect > 0 && selected.length < minSelect && (
            <span className="text-red-400 ml-2">(최소 {minSelect}개 필요)</span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onChange(TREASURE_DISPLAY.slice(0, maxSelect))}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
          >
            전체 선택
          </button>
          <button
            onClick={() => onChange([])}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
          >
            전체 해제
          </button>
        </div>
      </div>
      {/* 1. 법보 선택 (toggle) */}
      <div className="flex flex-wrap gap-2">
        {TREASURE_DISPLAY.map((tr) => {
          const on = selected.includes(tr);
          const idx = selected.indexOf(tr);
          const desc = TREASURE_DESCS[tr];
          return (
            <HoverTooltip
              key={tr}
              className="border-yellow-600"
              maxWidth={420}
              content={desc ? (
                <>
                  <div className="text-xs font-bold text-yellow-300 mb-1">📿 {tr}</div>
                  <div className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-line">{desc}</div>
                </>
              ) : null}
            >
              <button
                onClick={() => toggle(tr)}
                className={`relative px-3 py-2 rounded-md border font-medium text-sm cursor-help ${
                  on
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {tr}
                {on && showOrder && (
                  <span className="ml-2 text-xs bg-amber-500 text-slate-950 rounded-full w-4 h-4 inline-flex items-center justify-center">
                    {treasureSlotMap ? (treasureSlotMap[tr] ?? (idx + 1)) : (idx + 1)}
                  </span>
                )}
                {on && !showOrder && (
                  <span className="ml-2 text-xs text-amber-400">✓</span>
                )}
              </button>
            </HoverTooltip>
          );
        })}
      </div>

      {/* 2. 법보 순서 변경 (showOrder + showOrderEditor 모두 활성 + 1개 이상 선택 시) */}
      {showOrder && showOrderEditor && selected.length > 0 && (
        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded-md">
          <div className="text-xs text-slate-400 mb-2">
            ⬌ <span className="font-semibold text-slate-300">법보 시전 순서</span>
            <span className="ml-2 text-[11px]">— 드래그 또는 화살표 버튼으로 순서 변경</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.map((tr, idx) => {
              const isDragging = dragIdx === idx;
              const isDragOver = dragOverIdx === idx && dragIdx !== idx;
              return (
                <div
                  key={tr}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-md border bg-amber-500/10 border-amber-500/60 transition cursor-move select-none ${
                    isDragging ? 'opacity-40' : ''
                  } ${isDragOver ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''}`}
                >
                  <span className="text-xs bg-amber-500 text-slate-950 rounded-full w-5 h-5 inline-flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-sm text-amber-300 font-medium px-1">{tr}</span>
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      idx === 0
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-slate-300 hover:bg-slate-700 cursor-pointer'
                    }`}
                    title="앞으로 이동"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === selected.length - 1}
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      idx === selected.length - 1
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-slate-300 hover:bg-slate-700 cursor-pointer'
                    }`}
                    title="뒤로 이동"
                  >
                    ▶
                  </button>
                  <button
                    onClick={() => onChange(selected.filter((_, i) => i !== idx))}
                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded px-1.5 py-0.5 ml-1"
                    title="제거"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
