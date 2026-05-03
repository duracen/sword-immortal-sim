import { useMemo } from 'react';

const TAG_COLORS = {
  CST: 'text-yellow-300 bg-yellow-950/30',
  BUF: 'text-emerald-300 bg-emerald-950/30',
  STK: 'text-blue-300 bg-blue-950/30',
  DMG: 'text-red-300 bg-red-950/30',
  OPT: 'text-purple-300 bg-purple-950/30',
  END: 'text-slate-300 bg-slate-700/30',
  TRG: 'text-orange-300 bg-orange-950/30',
};

function Row({ ev }) {
  const tagCls = TAG_COLORS[ev.tag] || 'text-slate-300 bg-slate-800';
  return (
    <div className="flex items-start gap-2 px-3 py-1 border-b border-slate-800/70 font-mono text-xs">
      <span className="text-slate-500 w-16 shrink-0 leading-5">{(ev.t ?? 0).toFixed(2)}s</span>
      <span className={`px-1.5 rounded shrink-0 w-12 text-center leading-5 ${tagCls}`}>
        {ev.tag}
      </span>
      <span className="text-slate-200 whitespace-pre-wrap break-words leading-5 flex-1 min-w-0">
        {ev.msg}
      </span>
    </div>
  );
}

export default function Timeline({ events, filter }) {
  // 시간순 정렬 + 같은 t 면 emit 순서 유지 (stable sort).
  // catch-up (경정/천벌/봉황/주작 등) 이 state.t 임시 변경하여 trace emit 하므로
  // emit 순서가 시간 순서와 어긋남 → 정렬해서 일관된 시간 흐름으로 표시.
  const sorted = useMemo(() => {
    const indexed = events.map((e, i) => ({ ...e, _idx: i }));
    indexed.sort((a, b) => {
      const dt = (a.t ?? 0) - (b.t ?? 0);
      if (Math.abs(dt) > 1e-6) return dt;
      return a._idx - b._idx;  // 같은 t 면 emit 순서 유지
    });
    return indexed;
  }, [events]);
  const filtered = useMemo(
    () => (filter ? sorted.filter((e) => filter[e.tag]) : sorted),
    [sorted, filter]
  );
  if (filtered.length === 0) {
    return <div className="text-slate-500 text-sm p-4">표시할 이벤트가 없습니다.</div>;
  }
  return (
    <div className="max-h-[600px] overflow-y-auto">
      {filtered.map((ev, i) => (
        <Row key={i} ev={ev} />
      ))}
    </div>
  );
}
