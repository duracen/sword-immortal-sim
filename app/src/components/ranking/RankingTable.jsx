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
  // results 가 커도 sort 는 results / sortBy 변할 때만 수행
  const sorted = useMemo(() => [...results].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)), [results, key]);

  return (
    <div className="overflow-x-auto">
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
          {sorted.slice(0, limit).map((r, i) => (
            <tr
              key={(r.skills?.slice().sort().join(',') || r.label) + '|' + r.treasures + '|' + (r.orderArr?.map((o) => (o.kind === 'skill' ? 's' + o.idx : 't' + o.idx)).join('>') || '')}
              className="border-b border-slate-800 hover:bg-slate-800/50"
            >
              <td className="py-2 px-2 font-bold text-amber-400 align-top">{i + 1}</td>
              <td className="py-2 px-2">
                <div>
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded text-white mr-2 ${CAT_BADGE[r.cat] || 'bg-slate-600'}`}
                  >
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
                  <div className="text-[10px] text-slate-600 font-mono mt-0.5 leading-tight">
                    시전: {r.order}
                  </div>
                )}
              </td>
              <td className="py-2 px-2 text-slate-400 text-xs">{r.treasures}</td>
              <td className={`py-2 px-2 text-right ${sortBy === '45' ? 'font-bold text-amber-300' : ''}`}>
                {formatKR(r.s45)}
              </td>
              <td className={`py-2 px-2 text-right ${sortBy === '60' ? 'font-bold text-amber-300' : ''}`}>
                {formatKR(r.s60)}
              </td>
              <td className={`py-2 px-2 text-right ${sortBy === '120' ? 'font-bold text-amber-300' : ''}`}>
                {formatKR(r.s120)}
              </td>
              <td className={`py-2 px-2 text-right ${sortBy === '180' ? 'font-bold text-amber-300' : ''}`}>
                {formatKR(r.s180)}
              </td>
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
      {sorted.length > limit && (
        <div className="text-center text-xs text-slate-500 mt-3">
          상위 {limit}개만 표시 중 (전체 {sorted.length}개)
        </div>
      )}
    </div>
  );
}
