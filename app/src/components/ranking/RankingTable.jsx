import { useMemo } from 'react';
import { formatKR } from '../../utils/formatting';

const CAT_BADGE = {
  영검: 'bg-blue-600',
  화염: 'bg-red-600',
  뇌전: 'bg-purple-600',
  백족: 'bg-emerald-600',
};

export default function RankingTable({ results, sortBy, onRowClick, limit = 10 }) {
  const key = `s${sortBy}`;
  const sorted = useMemo(() => [...results].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)), [results, key]);
  const list = sorted.slice(0, limit);

  return (
    <>
      {/* 데스크톱: 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-left py-2 px-2 w-12">#</th>
              <th className="text-left py-2 px-2">빌드</th>
              <th className="text-left py-2 px-2">법보</th>
              <th className="text-right py-2 px-2">45초</th>
              <th className="text-right py-2 px-2">60초</th>
              <th className="text-right py-2 px-2">120초</th>
              <th className="text-right py-2 px-2">180초</th>
              <th className="text-left py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr
                key={(r.skills?.slice().sort().join(',') || r.label) + '|' + r.treasures + '|' + (r.orderArr?.map((o) => (o.kind === 'skill' ? 's' + o.idx : 't' + o.idx)).join('>') || '')}
                className="border-b border-slate-800 hover:bg-slate-800/50"
              >
                <td className="py-2 px-2 font-bold text-amber-400 align-top">{i + 1}</td>
                <td className="py-2 px-2">
                  <div>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded text-white mr-2 ${CAT_BADGE[r.cat] || 'bg-slate-600'}`}>
                      {r.cat}
                    </span>
                    {r.label}
                    {r.orderRank && r.orderRank > 1 && (
                      <span className="ml-2 text-[10px] text-slate-500">(순서 #{r.orderRank})</span>
                    )}
                  </div>
                  {r.skillLabel && (
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">{r.skillLabel}</div>
                  )}
                  {r.order && (
                    <div className="text-[10px] text-slate-600 font-mono mt-0.5 leading-tight">시전: {r.order}</div>
                  )}
                </td>
                <td className="py-2 px-2 text-slate-400 text-xs">{r.treasures}</td>
                <td className={`py-2 px-2 text-right ${sortBy === '45' ? 'font-bold text-amber-300' : ''}`}>{formatKR(r.s45)}</td>
                <td className={`py-2 px-2 text-right ${sortBy === '60' ? 'font-bold text-amber-300' : ''}`}>{formatKR(r.s60)}</td>
                <td className={`py-2 px-2 text-right ${sortBy === '120' ? 'font-bold text-amber-300' : ''}`}>{formatKR(r.s120)}</td>
                <td className={`py-2 px-2 text-right ${sortBy === '180' ? 'font-bold text-amber-300' : ''}`}>{formatKR(r.s180)}</td>
                <td className="py-2 px-2">
                  {onRowClick && (
                    <button
                      onClick={() => onRowClick(r)}
                      className="text-xs text-amber-400 hover:text-amber-300 underline"
                    >
                      로그 보기
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 리스트 */}
      <div className="md:hidden space-y-2">
        {list.map((r, i) => (
          <div
            key={(r.skills?.slice().sort().join(',') || r.label) + '|' + r.treasures + '|' + (r.orderArr?.map((o) => (o.kind === 'skill' ? 's' + o.idx : 't' + o.idx)).join('>') || '')}
            className="bg-slate-800/60 border border-slate-700 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-amber-400 text-sm">#{i + 1}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${CAT_BADGE[r.cat] || 'bg-slate-600'}`}>
                {r.cat}
              </span>
              <span className="font-medium text-slate-100 text-sm break-keep">{r.label}</span>
              {r.orderRank && r.orderRank > 1 && (
                <span className="text-[9px] text-slate-500">(#{r.orderRank})</span>
              )}
            </div>
            {r.skillLabel && (
              <div className="text-[10px] text-slate-400 font-mono mb-1 leading-tight">{r.skillLabel}</div>
            )}
            <div className="text-[10px] text-slate-500 mb-1">법보: {r.treasures}</div>
            {r.order && (
              <div className="text-[9px] text-slate-600 font-mono leading-tight mb-2">시전: {r.order}</div>
            )}
            {/* 시간별 누적 — 가로 4분할 */}
            <div className="grid grid-cols-4 gap-1 mb-2">
              {[
                { lbl: '45초', v: r.s45, on: sortBy === '45' },
                { lbl: '60초', v: r.s60, on: sortBy === '60' },
                { lbl: '120초', v: r.s120, on: sortBy === '120' },
                { lbl: '180초', v: r.s180, on: sortBy === '180' },
              ].map((x) => (
                <div key={x.lbl} className={`rounded px-1 py-0.5 text-center min-w-0 ${x.on ? 'bg-amber-500/20 border border-amber-400/50' : 'bg-slate-900/50'}`}>
                  <div className="text-[8px] text-slate-500">{x.lbl}</div>
                  <div className={`text-[11px] font-bold truncate ${x.on ? 'text-amber-300' : 'text-slate-300'}`}>
                    {formatKR(x.v) || '-'}
                  </div>
                </div>
              ))}
            </div>
            {onRowClick && (
              <button
                onClick={() => onRowClick(r)}
                className="w-full text-xs py-1.5 bg-amber-500/20 border border-amber-500/50 text-amber-300 rounded hover:bg-amber-500/30 font-semibold"
              >
                📋 로그 보기
              </button>
            )}
          </div>
        ))}
      </div>

      {sorted.length > limit && (
        <div className="text-center text-xs text-slate-500 mt-3">
          상위 {limit}개만 표시 중 (전체 {sorted.length}개)
        </div>
      )}
    </>
  );
}
