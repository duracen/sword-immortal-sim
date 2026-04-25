import { useMemo } from 'react';
import { formatKR } from '../../utils/formatting';

const CAT_COLORS = {
  영검: 'from-blue-600 to-blue-800',
  화염: 'from-red-600 to-orange-700',
  뇌전: 'from-purple-600 to-purple-800',
  백족: 'from-emerald-600 to-emerald-800',
};

const CAT_BADGE = {
  영검: 'bg-blue-500',
  화염: 'bg-red-500',
  뇌전: 'bg-purple-500',
  백족: 'bg-emerald-500',
};

const MEDALS = ['🥇', '🥈', '🥉'];

export default function WinnerPodium({ results, sortBy }) {
  const key = `s${sortBy}`;
  const top3 = useMemo(() => [...results].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, 3), [results, key]);
  if (top3.length === 0) return null;

  const winner = top3[0];

  return (
    <div className="space-y-4">
      {/* 1위 메인 카드 */}
      <div
        className={`relative rounded-xl p-4 sm:p-6 bg-gradient-to-br ${CAT_COLORS[winner.cat] || 'from-slate-700 to-slate-900'} border-2 border-amber-400 shadow-2xl shadow-amber-500/20`}
      >
        <div className="absolute top-3 right-4 text-3xl sm:text-4xl">{MEDALS[0]}</div>
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-xs px-2 py-0.5 rounded text-white ${CAT_BADGE[winner.cat] || 'bg-slate-600'}`}>
            {winner.cat}
          </span>
          <span className="text-sm text-slate-200">최적 빌드</span>
        </div>
        <div className="text-lg sm:text-2xl font-bold text-white mb-1 break-keep">{winner.label}</div>
        {winner.skillLabel && (
          <div className="text-xs text-slate-100/70 font-mono mb-2">{winner.skillLabel}</div>
        )}
        <div className="text-sm text-slate-200 mb-3">법보: {winner.treasures}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
          {[
            { label: '45초', v: winner.s45, hl: sortBy === '45' },
            { label: '60초', v: winner.s60, hl: sortBy === '60' },
            { label: '120초', v: winner.s120, hl: sortBy === '120' },
            { label: '180초', v: winner.s180, hl: sortBy === '180' },
          ].map((x) => (
            <div
              key={x.label}
              className={`rounded-lg p-2 sm:p-3 min-w-0 ${x.hl ? 'bg-amber-500/30 border border-amber-300' : 'bg-black/30'}`}
            >
              <div className="text-xs text-slate-300">{x.label}</div>
              <div className={`text-base sm:text-xl font-bold truncate ${x.hl ? 'text-amber-200' : 'text-white'}`}>
                {formatKR(x.v)}
              </div>
            </div>
          ))}
        </div>
        <div className="bg-black/40 rounded p-3 text-xs">
          <div className="text-slate-400 mb-1">최적 시전 순서:</div>
          <div className="font-mono text-slate-100 leading-relaxed">{winner.order}</div>
        </div>
      </div>

      {/* 2, 3위 */}
      {top3.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {top3.slice(1).map((r, i) => (
            <div
              key={(r.skills?.slice().sort().join(',') || r.label) + '|' + r.treasures + '|' + (r.orderArr?.map((o) => (o.kind === 'skill' ? 's' + o.idx : 't' + o.idx)).join('>') || '')}
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 relative"
            >
              <div className="absolute top-2 right-3 text-2xl">{MEDALS[i + 1]}</div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded text-white ${CAT_BADGE[r.cat] || 'bg-slate-600'}`}>
                  {r.cat}
                </span>
                <span className="text-sm text-slate-300">{i + 2}위</span>
              </div>
              <div className="font-bold text-slate-100 mb-0.5">
                {r.label}
                {r.orderRank && r.orderRank > 1 && (
                  <span className="ml-2 text-[11px] text-slate-400 font-normal">(순서 #{r.orderRank})</span>
                )}
              </div>
              {r.skillLabel && (
                <div className="text-[11px] text-slate-400 font-mono mb-1">{r.skillLabel}</div>
              )}
              <div className="text-xs text-slate-400 mb-1">법보: {r.treasures}</div>
              {r.order && (
                <div className="text-[11px] text-slate-500 font-mono mb-2 leading-tight">시전: {r.order}</div>
              )}
              <div className="text-amber-300 text-lg font-bold">
                {formatKR(r[key])}{' '}
                <span className="text-xs text-slate-400 font-normal">({sortBy}초)</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
