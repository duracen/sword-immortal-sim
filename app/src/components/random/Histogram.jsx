import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatKR } from '../../utils/formatting';

export default function Histogram({ data, mean, title }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="font-semibold mb-2">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <XAxis
            dataKey="x"
            stroke="#94a3b8"
            fontSize={10}
            tickFormatter={formatKR}
          />
          <YAxis stroke="#94a3b8" fontSize={11} />
          <Tooltip
            formatter={(v) => [v, '빈도']}
            labelFormatter={(v) => formatKR(v)}
            contentStyle={{ background: '#1e293b', border: '1px solid #475569' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          {mean !== undefined && (
            <ReferenceLine x={mean} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '평균', fill: '#f59e0b', fontSize: 10 }} />
          )}
          <Bar dataKey="count" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
