import { FAMILIES, FAMILIES_BY_CAT, CATEGORIES, SK, CFG } from '../../engine';
import { SKILL_OPTIONS, FAMILY_EFFECTS, CAT_LAW_BODY, FAMILY_TIER, sortFamsByTier } from '../../utils/skillOptions';

// pool: Set<string> of skill names
// onChange: (nextSet) => void
export default function SkillPoolPicker({ pool, onChange }) {
  function toggle(name) {
    const next = new Set(pool);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  }

  function setAllInFam(fam, on) {
    const next = new Set(pool);
    for (const n of FAMILIES[fam].skills) {
      if (on) next.add(n); else next.delete(n);
    }
    onChange(next);
  }

  function setAll(on) {
    const next = new Set();
    if (on) {
      for (const fam of Object.keys(FAMILIES)) {
        for (const n of FAMILIES[fam].skills) next.add(n);
      }
    }
    onChange(next);
  }

  const selected = pool.size;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-slate-300">
          선택된 신통: <span className="font-bold text-amber-400">{selected}</span>개
          {selected < 6 && <span className="text-red-400 ml-2">(최소 6개 필요)</span>}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setAll(true)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">전체 선택</button>
          <button onClick={() => setAll(false)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">전체 해제</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => (
          <div key={cat} className="border border-slate-700 bg-slate-900/40 rounded-lg p-2">
            <div className="relative group/cat inline-block mb-1.5 cursor-help">
              <span className="font-bold text-slate-100 text-xs border-b border-dotted border-slate-500">{cat}</span>
              {CAT_LAW_BODY[cat] && (
                <div className="hidden group-hover/cat:block absolute left-0 top-full mt-1 z-[200] w-[420px] p-3 bg-slate-950 border border-purple-600 rounded-lg shadow-xl pointer-events-none">
                  <div className="text-xs font-bold text-purple-300 mb-1">⚜ {CAT_LAW_BODY[cat].name}</div>
                  <div className="text-[10px] text-slate-400 mb-2">{CAT_LAW_BODY[cat].상성}</div>
                  <div className="text-[11px] text-slate-200 leading-relaxed space-y-1.5">
                    <div>{CAT_LAW_BODY[cat].effect2}</div>
                    <div>{CAT_LAW_BODY[cat].effect4}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1">
              {sortFamsByTier(FAMILIES_BY_CAT[cat]).map((fam) => {
                const skills = FAMILIES[fam].skills;
                const onCnt = skills.filter((n) => pool.has(n)).length;
                const allSelected = onCnt === skills.length;
                return (
                  <div
                    key={fam}
                    className="flex items-center gap-1 border border-slate-800 rounded p-1 bg-slate-950/40"
                  >
                    <div className="relative group/fam w-14 shrink-0 cursor-help flex items-center gap-1">
                      <span className="text-[10px] text-slate-200 font-medium border-b border-dotted border-slate-500">{fam}</span>
                      {FAMILY_TIER[fam] && (
                        <span className={`text-[8px] px-0.5 rounded font-mono ${
                          FAMILY_TIER[fam] === '합체기' ? 'bg-amber-900/60 text-amber-300 border border-amber-700/60' :
                          FAMILY_TIER[fam] === '반허기' ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60' :
                          'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {FAMILY_TIER[fam][0]}
                        </span>
                      )}
                      {FAMILY_EFFECTS[fam] && (
                        <div className="hidden group-hover/fam:block absolute left-0 top-full mt-1 z-[200] w-96 p-3 bg-slate-950 border border-blue-600 rounded-lg shadow-xl pointer-events-none">
                          <div className="text-xs font-bold text-blue-300 mb-1">
                            🏛 {fam} 유파 효과
                            {FAMILY_TIER[fam] && <span className="text-[10px] text-slate-400 font-normal ml-2">({FAMILY_TIER[fam]})</span>}
                          </div>
                          <div className="text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {FAMILY_EFFECTS[fam]}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-0.5 flex-1 min-w-0">
                      {skills.map((name) => {
                        const on = pool.has(name);
                        const raw = SK[name]?.main ?? 0;
                        const withBonus = raw + (CFG?.신통계수보너스 || 0);
                        const opts = SKILL_OPTIONS[name] || null;
                        const hasOpts = opts && Object.keys(opts).length > 0;
                        const shortName = name.includes('·') ? name.split('·')[1] : name;
                        return (
                          <div key={name} className="relative group">
                            <button
                              onClick={() => toggle(name)}
                              className={`w-full text-center px-0.5 py-1.5 rounded border text-[10px] transition cursor-help leading-tight ${
                                on
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <span className="font-medium truncate block">{shortName}</span>
                            </button>
                            {hasOpts && (
                              <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-[200] w-96 p-3 bg-slate-950 border border-yellow-600 rounded-lg shadow-xl pointer-events-none">
                                <div className="text-xs font-bold text-yellow-300 mb-2">
                                  ▶ {name} <span className="text-slate-400 font-normal">· 공격력 {withBonus}%</span>
                                </div>
                                <div className="text-[11px] text-slate-200 leading-relaxed space-y-1">
                                  {Object.entries(opts).map(([opt, d]) => (
                                    <div key={opt}>
                                      <span className="font-bold text-yellow-200">[{opt}]</span>{' '}
                                      <span className="text-slate-300">{d}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setAllInFam(fam, !allSelected)}
                      className={`text-[10px] px-2 py-1 rounded border transition shrink-0 font-semibold ${
                        allSelected
                          ? 'bg-rose-900/40 border-rose-700/50 text-rose-300 hover:bg-rose-900/60'
                          : 'bg-slate-700/60 border-slate-600 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {allSelected ? '해제' : '유파 전체'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
