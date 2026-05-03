import { FAMILIES, FAMILIES_BY_CAT, CATEGORIES, SK, CFG } from '../../engine';
import { SKILL_OPTIONS, SKILL_CAST_DESC, FAMILY_EFFECTS, CAT_LAW_BODY, FAMILY_TIER, sortFamsByTier } from '../../utils/skillOptions';
import HoverTooltip from '../common/HoverTooltip';

// 통합 신통 선택기 — 유파 슬롯 선택을 흡수.
// 사용자는 아무 유파에서든 신통을 클릭해 토글하고, 총 6개까지 선택 가능.
// 유파 슬롯 수는 선택된 신통 수에서 자동 유도.
// props:
//   skillSel: { fam: [name, ...] }
//   onChange: (next) => void
//   maxTotal: number (기본 6)
export default function SkillPicker({ skillSel, onChange, maxTotal = 6 }) {
  const totalSelected = Object.values(skillSel || {}).reduce((a, arr) => a + (arr?.length || 0), 0);

  function toggleSkill(fam, name) {
    const famCur = skillSel[fam] || [];
    const isSelected = famCur.includes(name);
    let nextFam;
    if (isSelected) {
      nextFam = famCur.filter((n) => n !== name);
    } else {
      if (totalSelected >= maxTotal) return;
      if (famCur.length >= 4) return;
      nextFam = [...famCur, name];
    }
    onChange({ ...skillSel, [fam]: nextFam });
  }

  // 유파 전체 선택 / 해제 — 해당 유파의 4개 신통을 잔여 슬롯까지 채움
  function toggleFamily(fam) {
    const famCur = skillSel[fam] || [];
    const pool = FAMILIES[fam]?.skills || [];
    const allSelected = pool.length > 0 && pool.every((n) => famCur.includes(n));
    if (allSelected) {
      const next = { ...skillSel };
      delete next[fam];
      onChange(next);
      return;
    }
    const remaining = maxTotal - totalSelected;
    const toAdd = pool.filter((n) => !famCur.includes(n)).slice(0, Math.min(remaining, 4 - famCur.length));
    onChange({ ...skillSel, [fam]: [...famCur, ...toAdd] });
  }

  // 계열(카테고리) 전체 해제 — 해당 계열의 모든 유파 선택 해제
  function clearCategory(cat) {
    const fams = FAMILIES_BY_CAT[cat] || [];
    const next = { ...skillSel };
    for (const f of fams) delete next[f];
    onChange(next);
  }

  // 계열에 선택된 신통 수
  function catSelectedCount(cat) {
    const fams = FAMILIES_BY_CAT[cat] || [];
    return fams.reduce((sum, f) => sum + (skillSel[f]?.length || 0), 0);
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <span className={`text-sm font-bold ${totalSelected === maxTotal ? 'text-emerald-400' : 'text-amber-400'}`}>
          {totalSelected} / {maxTotal} 선택
        </span>
        {totalSelected !== maxTotal && (
          <span className="text-xs text-slate-300">신통을 총 {maxTotal}개 선택해주세요</span>
        )}
        {totalSelected > 0 && (
          <button
            onClick={() => onChange({})}
            className="ml-auto text-xs px-3 py-1 bg-rose-900/40 border border-rose-700/50 text-rose-300 hover:bg-rose-900/60 rounded font-semibold"
            title="선택한 신통 전체 해제"
          >
            ↺ 전체 해제
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => {
          const catCount = catSelectedCount(cat);
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
                  {catCount > 0 && <span className="text-[11px] text-amber-400 ml-1">({catCount})</span>}
                </button>
              </HoverTooltip>
              {catCount > 0 && (
                <button
                  onClick={() => clearCategory(cat)}
                  className="text-[11px] px-2 py-0.5 rounded border bg-rose-900/40 border-rose-700/50 text-rose-300 hover:bg-rose-900/60"
                  title={`${cat} 계열 선택 전체 해제`}
                >
                  계열 해제
                </button>
              )}
            </div>
            <div className="space-y-1">
              {sortFamsByTier(FAMILIES_BY_CAT[cat]).map((fam) => {
                const chosen = skillSel[fam] || [];
                const pool = FAMILIES[fam]?.skills || [];
                const allSelected = pool.length > 0 && pool.every((n) => chosen.includes(n));
                const canAddSome = !allSelected && totalSelected < maxTotal && chosen.length < 4;
                return (
                  <div
                    key={fam}
                    className="flex items-center gap-1 border border-slate-800 rounded p-1 bg-slate-950/40"
                  >
                    {/* 유파명 */}
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
                    {/* 신통 4개 */}
                    <div className="grid grid-cols-4 gap-0.5 flex-1 min-w-0">
                      {pool.map((name) => {
                        const on = chosen.includes(name);
                        const raw = SK[name]?.main ?? 0;
                        const withBonus = raw + (CFG?.신통계수보너스 || 0);
                        const order = on ? Object.values(skillSel).flat().indexOf(name) : -1;
                        const opts = SKILL_OPTIONS[name] || null;
                        const hasOpts = opts && Object.keys(opts).length > 0;
                        const castDesc = SKILL_CAST_DESC[name] || null;
                        const canAdd = !on && totalSelected < maxTotal && chosen.length < 4;
                        const disabled = !on && !canAdd;
                        // 신통 이름에서 유파부분 제거 ("복룡·절화" → "절화")
                        const shortName = name.includes('·') ? name.split('·')[1] : name;
                        return (
                          <HoverTooltip
                            key={name}
                            className="border-yellow-600"
                            maxWidth={384}
                            content={(hasOpts || castDesc) ? (
                              <>
                                <div className="text-xs font-bold text-yellow-300 mb-2">
                                  ▶ {name} <span className="text-slate-400 font-normal">· 공격력 {withBonus}%</span>
                                </div>
                                {castDesc && (
                                  <div className="mb-2 pb-2 border-b border-slate-700">
                                    <div className="text-[10px] text-slate-400 mb-0.5">신통 효과 (재사용 32초 / 공통 5초)</div>
                                    <div className="text-[12px] text-slate-200 leading-relaxed">{castDesc}</div>
                                  </div>
                                )}
                                {hasOpts && (
                                  <div className="text-[13px] text-slate-200 leading-relaxed space-y-1">
                                    <div className="text-[10px] text-slate-400 mb-0.5">연공 효과 (max tier 수치 적용)</div>
                                    {Object.entries(opts).map(([opt, d]) => (
                                      <div key={opt}>
                                        <span className="font-bold text-yellow-200">[{opt}]</span>{' '}
                                        <span className="text-slate-300">{d}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : null}
                          >
                            <button
                              onClick={() => toggleSkill(fam, name)}
                              disabled={disabled}
                              className={`w-full text-center px-0.5 py-1.5 rounded border text-[11px] transition cursor-help leading-tight ${
                                on
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                                  : disabled
                                    ? 'bg-slate-900/40 border-slate-800 text-slate-400 cursor-not-allowed'
                                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <span className="font-medium truncate block">
                                {shortName}
                                {on && order >= 0 && (
                                  <sup className="text-[8px] bg-amber-500 text-slate-950 rounded-full px-0.5 ml-0.5">
                                    {order + 1}
                                  </sup>
                                )}
                              </span>
                            </button>
                          </HoverTooltip>
                        );
                      })}
                    </div>
                    {/* 유파 전체 선택/해제 */}
                    <button
                      onClick={() => toggleFamily(fam)}
                      disabled={!allSelected && !canAddSome}
                      className={`text-[9px] px-1 py-0.5 rounded border transition shrink-0 w-8 ${
                        allSelected
                          ? 'bg-rose-900/40 border-rose-700/50 text-rose-300 hover:bg-rose-900/60'
                          : canAddSome
                            ? 'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {allSelected ? '해제' : '전체'}
                    </button>
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
