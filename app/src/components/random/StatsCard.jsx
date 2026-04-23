import { formatKR } from '../../utils/formatting';

export default function StatsCard({ title, stats }) {
  if (!stats) return null;
  const cv = stats.mean > 0 ? (stats.stdev / stats.mean) * 100 : 0;
  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-1">
      <div className="text-sm text-slate-400">{title}</div>
      <div className="text-2xl font-bold text-amber-300">{formatKR(stats.mean)}</div>
      <div className="text-xs text-slate-400 space-y-0.5">
        <div>중앙값: {formatKR(stats.median)}</div>
        <div>표준편차: {formatKR(stats.stdev)} (CV {cv.toFixed(1)}%)</div>
        <div>범위: {formatKR(stats.min)} ~ {formatKR(stats.max)}</div>
        <div>10~90퍼센타일: {formatKR(stats.p10)} ~ {formatKR(stats.p90)}</div>
      </div>
    </div>
  );
}
