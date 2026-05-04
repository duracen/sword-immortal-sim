import { useMemo } from 'react';
import { formatKR } from '../../utils/formatting';
import { SKILL_OPTIONS } from '../../utils/skillOptions';

const COLORS = [
  '#f59e0b', '#3b82f6', '#ef4444', '#10b981',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#eab308', '#06b6d4', '#84cc16',
  '#d946ef', '#22c55e', '#0ea5e9', '#a855f7',
  '#fb7185', '#64748b', '#facc15', '#4ade80',
];
// 옵션 세그먼트 색상 (메인보다 옅게)
const SEG_COLORS = [
  '#fcd34d', '#93c5fd', '#fca5a5', '#6ee7b7',
  '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74',
  '#a5b4fc', '#fde047',
];

// SKILL_OPTIONS 역매핑: 옵션명 → 부모 신통명 (모듈 스코프, 1회 빌드)
// 띄어쓰기 변형 ("독고 저주" / "독고저주") 도 함께 alias 등록
const OPT_TO_SKILL = (() => {
  const m = {};
  for (const [skill, opts] of Object.entries(SKILL_OPTIONS)) {
    for (const opt of Object.keys(opts)) {
      if (!m[opt]) m[opt] = skill;
      const stripped = opt.replace(/\s+/g, '');
      if (stripped !== opt && !m[stripped]) m[stripped] = skill;
    }
  }
  return m;
})();

// child 라벨 통일 포맷: 모두 "[옵션명] 태그" 형식
function formatChild(rawSrc, parentSkill) {
  if (!rawSrc) return '?';
  // 1) 정확한 skill name (예: "균천·진악") → 본 신통
  if (rawSrc === parentSkill) return '[본 신통]';
  // 1.5) 천검 src — 신통이 발동시킨 천검 (parentSkill 이 신통명 일 때)
  if (rawSrc === '천검' && parentSkill && parentSkill.includes('·')) return '[천검]';
  // 2) "(type)←(reason)" 패턴 (천뢰/낙뢰 추가 피해)
  const arr = rawSrc.match(/^(천뢰|낙뢰)←(.+)$/);
  if (arr) {
    const type = arr[1];
    const reason = arr[2];
    const rsParen = reason.match(/^([가-힣·]+)\((.+)\)$/);
    if (rsParen) {
      const optName = rsParen[1].includes('·') ? rsParen[1].split('·').pop() : rsParen[1];
      const tag = rsParen[2];
      return `[${optName}] ${type} ${tag}`;
    }
    if (reason.includes('·')) {
      const optName = reason.split('·').pop();
      return `[${optName}] ${type}`;
    }
    return `[${reason}] ${type}`;
  }
  // 3) "옵션(태그)" 패턴 (호무 / 지속 / 발동 / 격발 / 보너스 / 유파 등)
  const op = rawSrc.match(/^([가-힣·]+)\((.+)\)$/);
  if (op) {
    const optName = op[1].includes('·') ? op[1].split('·').pop() : op[1];
    return `[${optName}] ${op[2]}`;
  }
  // 4) 작열 DoT (특수)
  if (rawSrc.startsWith('작열')) return `[작열 DoT]`;
  // 5) 단일 옵션명/트리거명
  return `[${rawSrc}]`;
}

// "유파·옵션" 또는 "옵션" 형식 reason 을 (parent, child) 로 파싱
function parseReason(reason) {
  if (!reason) return null;
  // 천벌 트리거 (예: "천벌(뇌인4)")
  if (reason.startsWith('천벌')) {
    return { parent: '천벌 (청명 유파 트리거)', child: reason };
  }
  // 풍뢰/뇌정 crit 트리거 (예: "풍뢰/뇌정(crit)")
  if (reason.includes('풍뢰/뇌정')) {
    return { parent: '풍뢰/뇌정 crit 트리거', child: reason };
  }
  // 점화/혹성/치황 등 지속 트리거 (예: "치황(지속)", "혹성(지속)")
  const persistMatch = reason.match(/^([가-힣]+)\(지속\)?$/);
  if (persistMatch) {
    const opt = persistMatch[1];
    const skill = OPT_TO_SKILL[opt];
    if (skill) return { parent: skill, child: `[${opt}] 지속` };
  }
  // 유파·옵션 형식 (예: "투진·명소", "천노·풍뢰")
  if (reason.includes('·')) {
    const parts = reason.split('·');
    const tail = parts[parts.length - 1].split('(')[0]; // 옵션명만
    const skill = OPT_TO_SKILL[tail];
    if (skill) return { parent: skill, child: `[${tail}]` };
  }
  // 옵션명만 (예: "성염", "전철")
  const opt = reason.split('(')[0];
  if (OPT_TO_SKILL[opt]) {
    return { parent: OPT_TO_SKILL[opt], child: `[${opt}]` };
  }
  return null;
}

// source 이름 → 부모 신통(또는 그룹) 추출
function parentOf(rawSrc) {
  if (!rawSrc) return { parent: '기타', child: '?' };
  const src = rawSrc;
  // 작열 DoT 통합
  if (src.startsWith('작열(DoT)') || src.startsWith('작열DoT') || src === '작열DoT') {
    return { parent: '작열 DoT', child: src };
  }
  // 법보
  if (src.startsWith('법보:')) {
    return { parent: src, child: src };
  }
  // 정확한 신통명 (예: "균천·진악", "참허·횡추")
  if (src.includes('·') && !src.includes('(') && !src.includes('←') && SKILL_OPTIONS[src]) {
    return { parent: src, child: '본 신통' };
  }
  // 천뢰/낙뢰 with 발동원 표시 (예: "천뢰←투진·명소", "낙뢰←용음·태허")
  const arrowMatch = src.match(/^(천뢰|낙뢰)←(.+)$/);
  if (arrowMatch) {
    const type = arrowMatch[1];
    const reason = arrowMatch[2];
    const parsed = parseReason(reason);
    if (parsed) return { parent: parsed.parent, child: `${type} ${parsed.child}` };
    return { parent: `${type} (출처 불명)`, child: src };
  }
  // 옵션 패턴: "옵션명(호무)", "옵션명(지속)" 등
  const m = src.match(/^([가-힣]+)(?:·[가-힣]+)?\((.+)\)$/);
  if (m) {
    const optName = m[1];
    const tag = m[2];
    const skill = OPT_TO_SKILL[optName];
    if (skill) return { parent: skill, child: `[${optName}] ${tag}` };
  }
  // 옵션명만 (예: "전철", "성염")
  if (OPT_TO_SKILL[src]) {
    return { parent: OPT_TO_SKILL[src], child: `[${src}]` };
  }
  // 트리거/공통 효과
  if (src === '천검' || src.includes('천검')) return { parent: '천검 (균천 트리거)', child: src };
  if (src === '살혼' || src.includes('살혼')) return { parent: '살혼 (사해 트리거)', child: src };
  if (src.includes('천벌')) return { parent: '천벌 (청명 유파 트리거)', child: src };
  if (src.includes('낙뢰')) return { parent: '낙뢰 (출처 불명)', child: src };
  if (src.includes('천뢰')) return { parent: '천뢰 (출처 불명)', child: src };
  if (src.includes('염양')) return { parent: '염양 (열산 트리거)', child: src };
  if (src === '평타') return { parent: '평타', child: src };
  return { parent: src, child: src };
}

export default function DamageBreakdown({ dmgEvents }) {
  const grouped = useMemo(() => {
    if (!dmgEvents || dmgEvents.length === 0) return null;
    function normalizeSrc(raw) {
      if (!raw) return '?';
      if (raw.startsWith('작열(DoT)') || raw.startsWith('작열DoT') || raw === '작열DoT') return '작열 DoT (합계)';
      // 멀티히트 decay emit / expected-mode trigger 의 hit 식별자 제거 — 데미지 소스에선 hit 합산
      //   "옥추·소명 (hit 1/6, ×1.000)" → "옥추·소명"
      //   "천뢰←풍뢰(hit 2/5)" → "천뢰←풍뢰"
      //   "뇌격(hit 3/5 ×0.50)" → "뇌격"
      let s = raw.replace(/\s*\(hit \d+\/\d+[^)]*\)/g, '');
      // 다회 발동 옵션의 회차 suffix 제거 — 예: "진악(호무) 3/5" → "진악(호무)"
      return s.replace(/\s+\d+\/\d+$/, '');
    }
    // 기존 평면 그룹화 (테이블용)
    const bySrc = {};
    const cntSrc = {};
    for (const ev of dmgEvents) {
      const s = normalizeSrc(ev.src);
      bySrc[s] = (bySrc[s] || 0) + ev.amt;
      cntSrc[s] = (cntSrc[s] || 0) + 1;
    }
    const total = Object.values(bySrc).reduce((a, b) => a + b, 0);
    // 신통 그룹화 (시각화용)
    // 우선순위: 1) 명시 트리거(천벌/천검/살혼/염양 등) > 2) activeCast > 3) source 패턴 매칭
    const groups = {}; // parent → { total, segs: { child: {value, count} } }
    for (const ev of dmgEvents) {
      const s = normalizeSrc(ev.src);
      let parent, child;
      // 우선순위 (높음 → 낮음):
      // 1) 평타 (별도)
      // 2) 유파 효과 (천검·천벌·살혼·염양·만고귀종·도천지세·폭파(유파) 등 — 모든 유파/법체 패시브·트리거를 하나로 모음)
      // 3) 천뢰/낙뢰←옵션 형식: 옵션의 부모 신통으로 매핑
      // 4) 옵션(지속) / 옵션(호무) 형식: 옵션의 부모 신통으로 매핑
      // 5) activeCast (cast 진행 중 emit): 그 신통
      // 6) source 패턴 매칭 fallback
      const arrowMatch = s.match(/^(천뢰|낙뢰)←(.+)$/);
      const optParenMatch = !arrowMatch && s.match(/^([가-힣·]+)\((.+)\)$/);
      const yupaMatch = optParenMatch && optParenMatch[2] === '유파';
      // 천검 src 패턴: '천검' (검세 카운터 누적 — 유파 효과) / '천검(옵션)' (옵션 직접 발동 — 해당 신통 귀속)
      // 옵션 → 부모 신통 매핑
      const 천검옵션부모맵 = { 제월: '균천·파월', 종식: '균천·진악', 남월: '균천·현봉' };
      const 천검OptMatch = s.match(/^천검\(([가-힣]+)\)$/);
      const is천검Skill = !!(천검OptMatch && 천검옵션부모맵[천검OptMatch[1]]);
      const 천검부모신통 = is천검Skill ? 천검옵션부모맵[천검OptMatch[1]] : null;
      // 비술 (자기 발동: 분혼/악신/업화 — 데미지 발생) — 마주별로 분리
      // 적 비술 (탁천/식혼/혼원) 은 자기 데미지 X (적 회복) 이라 dmgEvents 에 안 나옴
      // 악신마주·{branch}·분신 도 매칭 (분신 별도 데미지)
      const 비술Match = s.match(/^(분혼|식혼|탁천|악신|혼원|업화)마주·([무허진])(?:·(분신))?/);
      // 법상 매칭 — "법상·{name}(...)" 형식
      const 법상Match = s.match(/^법상·([가-힣]+)\((.+)\)$/);
      // 유파/법체 효과 — 신통 옵션이 아닌 패시브·트리거 (cast 무관 항상 동일 그룹)
      const isFamilyEffect = !is천검Skill && !비술Match && (
        s === '천검' || s.includes('천검') ||
        s.includes('천벌') ||
        s === '살혼' || s.includes('살혼') ||
        s.includes('염양') ||
        s === '만고귀종' || s === '도천지세' ||
        yupaMatch
      );
      if (s === '평타') {
        parent = '평타';
      } else if (비술Match) {
        // 비술별로 분리 (분혼/악신/업화) + 갈래 표시
        parent = `🔮 비술·${비술Match[1]}마주(${비술Match[2]})`;
      } else if (법상Match) {
        // 법상별로 통합 (8개 법상 — 용/새 아이콘 자동)
        const lawName = 법상Match[1];
        const isYong = ['청교룡', '청반룡', '청룡', '진룡'].includes(lawName);
        parent = `${isYong ? '🐉' : '🦅'} 법상·${lawName}`;
      } else if (is천검Skill) {
        parent = 천검부모신통;
      } else if (isFamilyEffect) {
        // 유파별로 분리
        if (s === '천검' || s.includes('천검')) parent = '균천 유파';
        else if (s.includes('천벌')) parent = '청명 유파';
        else if (s === '살혼' || s.includes('살혼')) parent = '사해 유파';
        else if (s === '도천지세') parent = '사해 유파';
        else if (s.includes('염양')) parent = '열산 유파';
        else if (s === '만고귀종') parent = '주술 유파';
        else if (s.includes('폭파') && yupaMatch) parent = '형혹 유파';
        else parent = '유파 효과 (기타)';
      } else if (arrowMatch) {
        const reason = arrowMatch[2];
        const parsed = parseReason(reason);
        if (parsed) parent = parsed.parent;
        else parent = `${arrowMatch[1]} (출처 불명)`;
      } else if (optParenMatch) {
        const optName = optParenMatch[1].includes('·') ? optParenMatch[1].split('·').pop() : optParenMatch[1];
        const skillFromOpt = OPT_TO_SKILL[optName];
        if (skillFromOpt) parent = skillFromOpt;
        else if (ev.activeCast) parent = ev.activeCast;
        else parent = s;
      } else if (OPT_TO_SKILL[s]) {
        // 단일 옵션명 (괄호 없음) — 부모 신통 매핑 (예: "진염", "순일", "독주", "전철" 등)
        // activeCast 보다 우선 — 옵션은 항상 자기 부모 신통에 귀속
        parent = OPT_TO_SKILL[s];
      } else if (ev.activeCast) {
        parent = ev.activeCast;
      } else {
        const p = parentOf(s);
        parent = p.parent;
      }
      // child 라벨은 단일 함수로 통일 포맷
      // 비술 분신: src='악신마주·무·분신(옥추·소명)' → child='[옥추·소명]' (trigger 신통명)
      if (비술Match) {
        const triggerMatch = s.match(/·분신\(([^)]+)\)$/);
        const 멸신Match = s.match(/·멸신\(/);
        if (triggerMatch) child = `[${triggerMatch[1]}]`;
        else if (멸신Match) child = `[멸신]`;  // 발동 횟수 무관 통합 — 천벌처럼 단일 색
        else child = formatChild(s, parent);
      } else if (법상Match) {
        // 법상: src='법상·청룡(실체)' → child='[실체]' (tier)
        child = `[${법상Match[2]}]`;
      } else {
        child = formatChild(s, parent);
      }
      if (!groups[parent]) groups[parent] = { total: 0, segs: {} };
      groups[parent].total += ev.amt;
      if (!groups[parent].segs[child]) groups[parent].segs[child] = { value: 0, count: 0 };
      groups[parent].segs[child].value += ev.amt;
      groups[parent].segs[child].count++;
    }
    const groupList = Object.entries(groups)
      .map(([parent, g]) => ({
        parent,
        total: g.total,
        pct: (g.total / total) * 100,
        segs: Object.entries(g.segs)
          .map(([child, info]) => ({ child, ...info, pct: (info.value / g.total) * 100 }))
          .sort((a, b) => b.value - a.value),
      }))
      .sort((a, b) => b.total - a.total);
    // 신통 발동 횟수 — 각 parent (신통/그룹) 의 고유 cast 수
    // dmgEvents 의 activeCast = parent 인 이벤트의 unique t 개수로 추정.
    // 신통 한 번 cast 시 여러 record() 가 호출되어도 모두 같은 state.t 라 t Set 의 크기 = cast 수.
    // 평타/유파 효과/작열 DoT 등은 activeCast 가 null/다름이므로 cast 가 아닌 trigger 횟수로 fallback.
    const castCountByParent = {};
    for (const ev of dmgEvents) {
      const p = ev.activeCast;
      if (!p) continue;
      if (!castCountByParent[p]) castCountByParent[p] = new Set();
      castCountByParent[p].add(ev.t);
    }
    // 평면 항목 — 그룹 차트와 동일하게 부모 단위 1행
    const flatList = groupList.map((g) => {
      const totalRecords = g.segs.reduce((a, s) => a + s.count, 0);
      // 신통 cast count: parent 와 일치하는 activeCast 의 unique t
      const castCount = castCountByParent[g.parent]?.size || 0;
      // cast 가 추적되지 않는 그룹 (유파 효과/평타/작열 DoT) 은 record 수를 그대로 사용
      const fires = castCount > 0 ? castCount : totalRecords;
      return {
        parent: g.parent,
        total: g.total,
        pct: g.pct,
        count: fires,
        records: totalRecords,
        avg: g.total / Math.max(1, fires),
        segs: g.segs,
      };
    });
    return { total, groups: groupList, flat: flatList };
  }, [dmgEvents]);

  if (!grouped) return null;
  const { total, groups, flat } = grouped;
  const maxGroupVal = groups[0]?.total || 1;

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="font-semibold">데미지 소스 (그룹 {groups.length}개 / 항목 {flat.length}개)</div>
        <div className="text-xs text-slate-400">합계 {formatKR(total)}</div>
      </div>

      {/* 신통 단위 그룹화 누적 바 */}
      <div className="space-y-2">
        {groups.map((g, gi) => {
          const widthPct = (g.total / maxGroupVal) * 100;
          const baseColor = COLORS[gi % COLORS.length];
          return (
            <div key={g.parent} className="group/bar">
              <div className="flex items-center justify-between text-[11px] sm:text-xs mb-0.5">
                <span className="text-slate-100 font-medium truncate min-w-0 flex-1 mr-2">
                  <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: baseColor }} />
                  {g.parent}
                  <span className="text-slate-300 ml-1.5 text-[11px]">({g.segs.length}항목)</span>
                </span>
                <span className="text-amber-300 font-semibold shrink-0">{formatKR(g.total)}</span>
                <span className="text-slate-300 ml-1 shrink-0 text-[11px]">{g.pct.toFixed(1)}%</span>
              </div>
              {/* 누적 바 — 자식 세그먼트별 색 다름 */}
              <div className="bg-slate-900 rounded h-3 sm:h-3.5 overflow-hidden flex" style={{ width: `${widthPct}%` }}>
                {g.segs.map((seg, si) => (
                  <div
                    key={seg.child}
                    className="h-full transition-all"
                    style={{
                      width: `${seg.pct}%`,
                      background: si === 0 ? baseColor : SEG_COLORS[(si - 1) % SEG_COLORS.length],
                    }}
                    title={`${seg.child}: ${formatKR(seg.value)} (${seg.pct.toFixed(1)}% · ${seg.count}회)`}
                  />
                ))}
              </div>
              {/* hover 시 세그먼트 라벨 */}
              <div className="hidden group-hover/bar:flex group-focus-within/bar:flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-slate-400">
                {g.segs.map((seg, si) => (
                  <span key={seg.child}>
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-sm mr-1 align-middle"
                      style={{ background: si === 0 ? baseColor : SEG_COLORS[(si - 1) % SEG_COLORS.length] }}
                    />
                    {seg.child} {formatKR(seg.value)} ({seg.count}회)
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 상세 항목 — 모바일 카드형, 데스크탑은 더 넓은 grid */}
      <details className="mt-4">
        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-200 select-none">
          ▶ 평면 항목 전체 보기 ({flat.length}개)
        </summary>
        <div className="mt-2 space-y-2">
          {flat.map((d, i) => (
            <div
              key={`${d.parent}|${i}`}
              className="border border-slate-700 bg-slate-900/40 rounded-lg p-2 sm:p-3"
            >
              {/* 1줄: 순위 + 신통명 + 피해 */}
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[11px] text-slate-300 font-mono shrink-0">#{i + 1}</span>
                <span className="text-sm text-slate-100 font-medium flex-1 min-w-0 break-keep">
                  {d.parent}
                  <span className="text-[11px] text-slate-300 ml-1">({d.segs.length}항목)</span>
                </span>
                <span className="text-sm text-amber-300 font-semibold tabular-nums">{formatKR(d.total)}</span>
              </div>
              {/* 2줄: 비율 / 발동 / 1회평균 (모바일에서 줄바꿈) */}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-300">
                <span>비율: <span className="text-slate-100 font-semibold">{d.pct.toFixed(2)}%</span></span>
                <span>발동: <span className="text-blue-300 font-semibold">{d.count}회{d.records !== d.count && (
                  <span className="text-slate-400 font-normal"> ({d.records}건)</span>
                )}</span></span>
                <span>1회평균: <span className="text-slate-100 font-semibold tabular-nums">{formatKR(d.avg)}</span></span>
              </div>
              {/* 3줄: segs (자식 항목들) — 칩 형태 */}
              {d.segs.length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-mono">
                  {d.segs.map((seg) => (
                    <span
                      key={seg.child}
                      className="px-1.5 py-0.5 bg-slate-800/60 border border-slate-700/50 rounded"
                    >
                      <span className="text-slate-300">{seg.child}</span>{' '}
                      <span className="text-slate-100">{formatKR(seg.value)}</span>{' '}
                      <span className="text-slate-400">({seg.count}회 · {seg.pct.toFixed(1)}%)</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
