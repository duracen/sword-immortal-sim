import { FAMILIES, FAMILIES_BY_CAT, CATEGORIES, SK, CFG } from '../../engine';
import { SKILL_OPTIONS, FAMILY_EFFECTS, CAT_LAW_BODY, FAMILY_TIER, sortFamsByTier } from '../../utils/skillOptions';
import HoverTooltip from '../common/HoverTooltip';

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

  function setAllInCat(cat, on) {
    const next = new Set(pool);
    for (const fam of FAMILIES_BY_CAT[cat]) {
      for (const n of FAMILIES[fam].skills) {
        if (on) next.add(n); else next.delete(n);
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
        {CATEGORIES.map((cat) => {
          const fams = FAMILIES_BY_CAT[cat];
          const catAllSelected = fams.every((f) => FAMILIES[f].skills.every((n) => pool.has(n)));
          return (
          <div key={cat} className="border border-slate-700 bg-slate-900/40 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1.5">
              <HoverTooltip
                className="border-purple-600"
                maxWidth={420}
                content={CAT_LAW_BODY[cat] ? (
                  <>
                    <div className="text-xs font-bold text-purple-300 mb-1">⚜ {CAT_LAW_BODY[cat].name}</div>
                    <div className="text-[11px] text-slate-400 mb-2">{CAT_LAW_BODY[cat].상성}</div>
                    <div className="text-[13px] text-slate-200 leading-relaxed space-y-1.5">
                      <div>{CAT_LAW_BODY[cat].effect2}</div>
                      <div>{CAT_LAW_BODY[cat].effect4}</div>
                    </div>
                  </>
                ) : null}
              >
                <button type="button" className="cursor-help focus:outline-none focus:ring-1 focus:ring-purple-400 rounded">
                  <span className="font-bold text-slate-100 text-xs border-b border-dotted border-slate-500">{cat}</span>
                </button>
              </HoverTooltip>
              <div className="flex gap-1">
                <button
                  onClick={() => setAllInCat(cat, true)}
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-600 bg-slate-700/60 text-slate-200 hover:bg-slate-700 transition"
                >
                  계열 선택
                </button>
                <button
                  onClick={() => setAllInCat(cat, false)}
                  className="text-[11px] px-2 py-0.5 rounded border border-rose-700/50 bg-rose-900/40 text-rose-300 hover:bg-rose-900/60 transition"
                >
                  계열 해제
                </button>
              </div>
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
                    <HoverTooltip
                      className="border-blue-600"
                      maxWidth={384}
                      content={FAMILY_EFFECTS[fam] ? (
                        <>
                          <div className="text-xs font-bold text-blue-300 mb-1">
                            🏛 {fam} 유파 효과
                            <span className="text-[11px] text-amber-300 font-bold ml-2 px-1.5 py-0.5 bg-amber-900/50 rounded">2+</span>
                            {FAMILY_TIER[fam] && <span className="text-[11px] text-slate-400 font-normal ml-2">({FAMILY_TIER[fam]})</span>}
                          </div>
                          <div className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {FAMILY_EFFECTS[fam]}
                          </div>
                        </>
                      ) : null}
                    >
                      <button type="button" className="w-14 shrink-0 cursor-help flex items-center gap-1 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded">
                        <span className="text-[11px] text-slate-200 font-medium border-b border-dotted border-slate-500">{fam}</span>
                        {FAMILY_TIER[fam] && (
                          <span className={`text-[8px] px-0.5 rounded font-mono ${
                            FAMILY_TIER[fam] === '합체기' ? 'bg-amber-900/60 text-amber-300 border border-amber-700/60' :
                            FAMILY_TIER[fam] === '반허기' ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60' :
                            'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {FAMILY_TIER[fam][0]}
                          </span>
                        )}
                      </button>
                    </HoverTooltip>
                    <div className="grid grid-cols-4 gap-0.5 flex-1 min-w-0">
                      {skills.map((name) => {
                        const on = pool.has(name);
                        const raw = SK[name]?.main ?? 0;
                        const withBonus = raw + (CFG?.신통계수보너스 || 0);
                        const opts = SKILL_OPTIONS[name] || null;
                        const hasOpts = opts && Object.keys(opts).length > 0;
                        const shortName = name.includes('·') ? name.split('·')[1] : name;
                        return (
                          <HoverTooltip
                            key={name}
                            className="border-yellow-600"
                            maxWidth={384}
                            content={hasOpts ? (
                              <>
                                <div className="text-xs font-bold text-yellow-300 mb-2">
                                  ▶ {name} <span className="text-slate-400 font-normal">· 공격력 {withBonus}%</span>
                                </div>
                                <div className="text-[13px] text-slate-200 leading-relaxed space-y-1">
                                  {Object.entries(opts).map(([opt, d]) => (
                                    <div key={opt}>
                                      <span className="font-bold text-yellow-200">[{opt}]</span>{' '}
                                      <span className="text-slate-300">{d}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : null}
                          >
                            <button
                              onClick={() => toggle(name)}
                              className={`w-full text-center px-0.5 py-1.5 rounded border text-[11px] transition cursor-help leading-tight ${
                                on
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <span className="font-medium truncate block">{shortName}</span>
                            </button>
                          </HoverTooltip>
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => setAllInFam(fam, true)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 bg-slate-700/60 text-slate-200 hover:bg-slate-700 transition font-semibold"
                      >
                        선택
                      </button>
                      <button
                        onClick={() => setAllInFam(fam, false)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-rose-700/50 bg-rose-900/40 text-rose-300 hover:bg-rose-900/60 transition font-semibold"
                      >
                        해제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
