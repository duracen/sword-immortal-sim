import { formatKR, formatFull } from '../../utils/formatting';

export default function ResultSummary({ result, highlight }) {
  if (!result) return null;
  const [c45, c60, c120, c180] = result.cumByMarker;
  const items = [
    { label: '45초', t: 45, v: c45, color: 'text-amber-400' },
    { label: '60초', t: 60, v: c60, color: 'text-amber-300' },
    { label: '120초', t: 120, v: c120, color: 'text-amber-200' },
    { label: '180초', t: 180, v: c180, color: 'text-amber-100' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((x) => {
        const dim = highlight && highlight !== x.t;
        const on = highlight === x.t;
        return (
          <div
            key={x.label}
            className={`rounded-lg p-4 border transition ${
              on
                ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500/50'
                : dim
                ? 'bg-slate-900/40 border-slate-800 opacity-50'
                : 'bg-slate-800 border-slate-700'
            }`}
          >
            <div className="text-sm text-slate-400">{x.label} 누적</div>
            <div className={`text-2xl font-bold ${x.color}`}>{formatKR(x.v)}</div>
            <div className="text-xs text-slate-500 mt-1">{formatFull(x.v)}</div>
          </div>
        );
      })}
    </div>
  );
}
