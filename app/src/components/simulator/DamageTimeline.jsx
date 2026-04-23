import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { formatKR } from '../../utils/formatting';

export default function DamageTimeline({ dmgEvents }) {
  if (!dmgEvents || dmgEvents.length === 0) return null;

  // 0.5초 버킷으로 누적 데미지 생성
  const bucketSize = 0.5;
  const maxT = 180;
  const buckets = [];
  let cumulative = 0;
  const sorted = [...dmgEvents].sort((a, b) => a.t - b.t);
  let ei = 0;
  for (let t = 0; t <= maxT; t += bucketSize) {
    while (ei < sorted.length && sorted[ei].t <= t) {
      cumulative += sorted[ei].amt;
      ei++;
    }
    buckets.push({ t: +t.toFixed(1), cum: cumulative });
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="font-semibold mb-3">누적 데미지 타임라인</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={buckets}>
          <XAxis
            dataKey="t"
            stroke="#94a3b8"
            fontSize={11}
            label={{ value: '시간 (초)', position: 'insideBottom', offset: -5, fill: '#94a3b8' }}
          />
          <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatKR} />
          <Tooltip
            formatter={(v) => [formatKR(v), '누적']}
            labelFormatter={(t) => `${t}초`}
            contentStyle={{ background: '#1e293b', border: '1px solid #475569' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <ReferenceLine x={60} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '60s', fill: '#f59e0b' }} />
          <ReferenceLine x={120} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: '120s', fill: '#fbbf24' }} />
          <ReferenceLine x={180} stroke="#fde68a" strokeDasharray="3 3" label={{ value: '180s', fill: '#fde68a' }} />
          <Line type="monotone" dataKey="cum" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Legend />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
