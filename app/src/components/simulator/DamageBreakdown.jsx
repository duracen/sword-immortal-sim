import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatKR } from '../../utils/formatting';

const COLORS = [
  '#f59e0b', '#3b82f6', '#ef4444', '#10b981',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#eab308', '#06b6d4', '#84cc16',
  '#d946ef', '#22c55e', '#0ea5e9', '#a855f7',
  '#fb7185', '#64748b', '#facc15', '#4ade80',
];

export default function DamageBreakdown({ dmgEvents }) {
  if (!dmgEvents || dmgEvents.length === 0) return null;

  // 작열 DoT 는 source 이름이 매 tick/스택/잔여초마다 달라서 그대로 두면 수백 row 가 뜸
  // → "작열(DoT)←..." 계열을 하나의 "작열 DoT (합계)" 로 통합
  function normalizeSrc(raw) {
    if (!raw) return '?';
    if (raw.startsWith('작열(DoT)') || raw.startsWith('작열DoT') || raw === '작열DoT') return '작열 DoT (합계)';
    return raw;
  }

  const bySrc = {};
  const cntSrc = {};
  for (const ev of dmgEvents) {
    const src = normalizeSrc(ev.src);
    bySrc[src] = (bySrc[src] || 0) + ev.amt;
    cntSrc[src] = (cntSrc[src] || 0) + 1;
  }
  const total = Object.values(bySrc).reduce((a, b) => a + b, 0);
  const data = Object.entries(bySrc)
    .map(([name, value]) => ({
      name,
      value,
      pct: (value / total) * 100,
      count: cntSrc[name],
      avg: value / cntSrc[name],
    }))
    .sort((a, b) => b.value - a.value);

  // 소스당 28px + 위아래 패딩
  const chartHeight = Math.max(240, data.length * 28 + 40);

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">데미지 소스 (전체 {data.length}개)</div>
        <div className="text-xs text-slate-400">합계 {formatKR(total)}</div>
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ left: 110, right: 60 }}>
          <XAxis type="number" tickFormatter={formatKR} stroke="#94a3b8" fontSize={11} />
          <YAxis dataKey="name" type="category" stroke="#e2e8f0" fontSize={11} width={110} interval={0} />
          <Tooltip
            formatter={(v, _n, ctx) => {
              const p = ctx.payload;
              return [
                `${formatKR(v)} (${p.pct.toFixed(1)}%) · ${p.count}회 · 평균 ${formatKR(p.avg)}`,
                '데미지',
              ];
            }}
            contentStyle={{ background: '#1e293b', border: '1px solid #475569' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Bar dataKey="value">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-400">
            <tr className="border-b border-slate-700">
              <th className="text-left py-1 px-2">#</th>
              <th className="text-left py-1 px-2">소스</th>
              <th className="text-right py-1 px-2">피해</th>
              <th className="text-right py-1 px-2">비율</th>
              <th className="text-right py-1 px-2">발동</th>
              <th className="text-right py-1 px-2">1회평균</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.name} className="border-b border-slate-800/70 hover:bg-slate-900/40">
                <td className="py-1 px-2 text-slate-500">{i + 1}</td>
                <td className="py-1 px-2 text-slate-200 font-mono">{d.name}</td>
                <td className="py-1 px-2 text-right text-amber-300 font-semibold">{formatKR(d.value)}</td>
                <td className="py-1 px-2 text-right text-slate-400">{d.pct.toFixed(2)}%</td>
                <td className="py-1 px-2 text-right text-blue-300 font-semibold">{d.count}회</td>
                <td className="py-1 px-2 text-right text-slate-400">{formatKR(d.avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
