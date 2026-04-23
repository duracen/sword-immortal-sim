// 신통_정리.md 에서 옵션 설명을 런타임 파싱.
// 버프 키 (예: "균천진악_종식") → 신통 [옵션] 설명 조회용.
import mdSource from '../../../신통_정리.md?raw';

// `{ skillName: { optionName: description } }` 생성
function parseSkillOptions() {
  const out = {};
  const lines = mdSource.split(/\r?\n/);
  let currentSkill = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 신통 헤더: "#### 균천·진악"
    const h = line.match(/^####\s+([가-힣·]+)/);
    if (h) {
      currentSkill = h[1];
      out[currentSkill] = {};
      continue;
    }
    if (!currentSkill) continue;
    // 연공 효과 라인
    if (line.includes('연공 효과')) {
      // 옵션 파싱: "[옵션명] 설명 · [옵션명2] 설명2 · ..."
      const afterColon = line.replace(/^연공 효과[^:]*:\s*/, '');
      // · 로 분리
      const parts = afterColon.split(/\s*·\s*/);
      for (const p of parts) {
        const m = p.match(/^\[([^\]]+)\]\s*(.+)/);
        if (m) {
          const optName = m[1].trim();
          const desc = m[2].trim();
          out[currentSkill][optName] = desc;
        }
      }
    }
  }
  return out;
}

// 유파 효과 파싱: 각 신통 블록의 "유파 효과:" 라인에서 유파명 → 설명 추출.
// 같은 유파의 모든 신통이 동일한 라인을 가지므로 처음 나오는 것만 저장.
function parseFamilyEffects() {
  const out = {};
  const lines = mdSource.split(/\r?\n/);
  let currentFam = null;
  for (const line of lines) {
    const fh = line.match(/^####\s+([가-힣]+)·/);
    if (fh) {
      currentFam = fh[1];
      continue;
    }
    if (!currentFam || out[currentFam]) continue;
    if (line.startsWith('유파 효과')) {
      const afterColon = line.replace(/^유파 효과[^:]*:\s*/, '').trim();
      if (afterColon) out[currentFam] = afterColon;
    }
  }
  return out;
}

const SKILL_OPTIONS = parseSkillOptions();
export const FAMILY_EFFECTS = parseFamilyEffects();

// 유파 수련 단계 (합체기 > 반허기 > 인간계)
export const FAMILY_TIER = {
  // 합체기
  균천: '합체기', 열산: '합체기', 청명: '합체기', 주술: '합체기',
  // 반허기
  참허: '반허기', 형혹: '반허기', 옥추: '반허기', 사해: '반허기',
  // 인간계 (나머지)
  복룡: '인간계', 중광: '인간계', 이화: '인간계', 천로: '인간계', 오뢰: '인간계', 신소: '인간계',
};

const TIER_ORDER = { 합체기: 0, 반허기: 1, 인간계: 2 };

// 카테고리 안의 유파들을 합체기 → 반허기 → 인간계 순으로 정렬
export function sortFamsByTier(fams) {
  return fams.slice().sort((a, b) => {
    const ta = TIER_ORDER[FAMILY_TIER[a]] ?? 99;
    const tb = TIER_ORDER[FAMILY_TIER[b]] ?? 99;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });
}

// 카테고리별 법체 설명 (md 원문 기준)
export const CAT_LAW_BODY = {
  영검: {
    name: '영검법체',
    상성: '유뢰법체를 억제',
    effect2: '[2+ 기본 효과] 신통으로 입히는 피해가 7.00%~12.50% 증가하며, 대상의 현재 생명력 백분율이 낮을수록 입히는 피해가 증가한다.',
    effect4: '[4+ 법체 효과] 신통으로 적을 명중 시, 대상의 현재 생명력 백분율이 80.00% 이하인 경우, 5초간 공격력이 20.00% 증가하고, 유뢰법체를 활성화한 수련자에게 입히는 피해가 20.00% 증가한다.',
  },
  화염: {
    name: '현염법체',
    상성: '영검법체를 억제',
    effect2: '[2+ 기본 효과] 5초간 작열 상태인 대상에게 신통 시전 시 공격력이 9.00% 증가하고, 작열 효과 부여 시 추가로 대상에게 화상을 1중첩 부여한다.',
    effect4: '[4+ 법체 효과] 신통으로 입히는 최종 피해가 8.00% 증가하고, 대상에게 부여된 작열 효과 1중첩당 2.00%씩 추가 증가한다(최대 18.00% 증가). 영검법체를 활성화한 수련자에게 입히는 피해가 20.00% 증가한다.',
  },
  뇌전: {
    name: '유뢰법체',
    상성: '현염법체를 억제',
    effect2: '[2+ 기본 효과] 신통 시전 시 치명타율이 11.00% 증가한다.',
    effect4: '[4+ 법체 효과] 신통으로 적에게 치명타를 부여 시 본 신통으로 입히는 최종 피해가 20.00% 증가하고, 현염법체를 활성화한 수련자에게 입히는 피해가 20.00% 증가한다.',
  },
  백족: {
    name: '백족법체',
    상성: '삼각 상성과 별개 축 (법체 효과 없음)',
    effect2: '[기본 효과 1 · 만고귀종 (주술 2+)] 대상에게 동일 유형의 독고가 2중첩 이상 부여된 경우, 상응하는 독고를 격발·소모하여 대상 주변 3명에게 공격력 75% 피해를 입히고, 상응하는 계약을 1중첩 획득한다.',
    effect4: '[기본 효과 2 · 도천지세 (사해 2+)] 살혼을 5회 누적 시전할 때마다 대상 주변 3명에게 공격력 100%의 확정 피해를 입힌다.',
  },
};

// 불씨 세트 효과 설명 (탑티어 기준, md에 없어 별도 관리)
export const BULSSI_DESCS = {
  통명묘화: '[통명묘화 3개] 신통 피해 심화가 8.00% 증가한다.',
  진무절화: '[진무절화 3개/6개] 신통을 2개 시전할 때마다, 다음 신통의 입히는 피해가 16.00%(3개) 또는 48.00%(6개) 증가한다.',
  태현잔화: '[태현잔화 3개] 신통 시전 시, 신통 피해가 0.00%~16.00% 랜덤 증가한다 (기댓값 +8.00%).',
  유리현화: '[유리현화 3개] 신통 피해 심화가 15.00% 증가한다.',
  진마성화: '[진마성화 3개/6개] 신통을 1개 시전할 때마다, 신통 피해 심화가 1.00%(3개) 또는 3.00%(6개) 증가한다 (최대 10중첩).',
};

// 자원 스택 설명 (유파 고유 자원)
export const STACK_DESCS = {
  뇌인: '[청명 유파] 임의의 신통 명중 시 1중첩 획득 (최대 10중첩, TTL 20초). 1중첩당 20초 동안 신통 시전 시 치명타율이 5.00% 증가한다.',
  옥추: '[옥추 유파] 옥추·수광/황룡/청사 시전 시 1중첩 획득 (최대 5중첩, TTL 20초). 1중첩당 신통 피해가 1.00% 증가 + 옥추 슬롯당 2.50% 신통 피해 증가(스택 1+일 때).',
  검세: '[균천 유파] 신통 명중 시 획득 (최대 10중첩, TTL 20초). 1중첩당 20초 동안 신통 피해 심화가 1.50% 증가한다. 천검 발동 시 소비.',
  검심: '[참허 유파] 신통 명중 시 획득 (최대 10중첩). 10중첩 도달 시 10초 "검심통명" 상태 진입 (신통 피해 심화 +20% 등), 잔여분은 다음 검심으로 이월.',
  신소: '[신소 유파] 신소 자원 보유 시 신소 슬롯당 4.00% 신통 피해 증가.',
  작열: '[화염 작열] 20초간 1중첩당 대상에게 공격력 N%의 DoT (지속 피해) 부여. 6중첩 누적 시마다 열산유파 폭발 발동.',
  화상: '[백족 화상] 신소/사해의 약화 효과로 DoT 부여.',
  검심통명: '[참허 유파] 검심 10중첩 시 10초간 진입. 신통 피해 심화 +20%, 본 유파 옵션별 추가 효과 발동.',
  계약: '[주술 유파] 저주·계약 스택. 독고/유식 등에 증감 연동.',
  독고: '[주술 유파] 저주·독고 스택. 주술 옵션에 따라 추가 피해.',
};

// 트리거 설명 (균천/열산/청명 공통 트리거)
export const TRIGGER_DESCS = {
  천벌: '[균천 유파 트리거] 일정 조건 충족 시 발동. 10초 동안 여러 검세 소비/천벌 효과 유지 (본 유파 옵션의 추가 피해 트리거).',
  천검: '[균천 유파 트리거] 검세 1중첩 소비하여 즉시 영검 타격 발동. 각종 옵션이 천검 발동 시 추가 피해 부여.',
  염양: '[열산 유파 트리거] 작열 6중첩 누적 시 발동. 10초간 치황/진공 등 추가 효과 활성.',
};

// 법보 설명 (sim2.js 구현 기준)
export const TREASURE_DESCS = {
  환음요탑: '대상 호신강기 보유 시 본 법보 피해 +25% (기댓값 반영).',
  참원선검: '본 법보 피해 +10%~+20% (대상 체력 낮을수록 선형 증가).',
  유리옥호: '10초간 자신의 치명타율 +15%, 치명타 배율 +15% (신통/법보 한정).',
  오염혁선: '자신 호신강기 보유 시 본 법보 피해 +15% (기댓값 반영).',
};

// 버프 key → { skill, option, desc }
// 지원 포맷:
//   1) "균천·진악 → 종식"      (TRACE 메시지에서 파싱된 가공 key)
//   2) "균천진악_종식"          (applyBuff 내부 key)
//   3) "균천진악_종식_1"        (중첩별 suffix)
//   4) "종식"                   (fallback — 옵션명만 있는 경우 전체 스캔)
//   5) "검심통명" / "열산상태"  (특수 상태, 옵션 매칭 X)
export function lookupOption(bufKey) {
  if (!bufKey) return null;

  // 불씨 버프: "불씨 진무절화" 등
  if (bufKey.startsWith('불씨 ')) {
    const name = bufKey.substring(3).trim();
    return { skill: '불씨', option: name, desc: BULSSI_DESCS[name] || null };
  }

  // 포맷 1: "유파·신통 → 옵션"
  if (bufKey.includes('→')) {
    const parts = bufKey.split('→').map((s) => s.trim());
    const skillFull = parts[0];  // e.g., "청명·풍뢰" 또는 "유리·옥호"
    const option = parts[1];     // e.g., "뇌벌"
    // 법보 체크 먼저 (유리·옥호 → 유리옥호)
    const joined = skillFull.replace(/·/g, '');
    if (TREASURE_DESCS[joined]) {
      return { skill: `📿${joined}`, option, desc: TREASURE_DESCS[joined] };
    }
    const skillOpts = SKILL_OPTIONS[skillFull];
    if (skillOpts && skillOpts[option]) {
      return { skill: skillFull, option, desc: skillOpts[option] };
    }
    return { skill: skillFull, option, desc: null };
  }

  // 포맷 2/3: "유파신통_옵션" or "유파신통_옵션_N"
  if (bufKey.includes('_')) {
    const idx = bufKey.indexOf('_');
    const prefix = bufKey.substring(0, idx);
    const optionPart = bufKey.substring(idx + 1).replace(/_\d+$/, '');
    // 법보 버프 특수 처리 (예: "유리옥호_버프")
    if (TREASURE_DESCS[prefix]) {
      return { skill: `📿${prefix}`, option: optionPart, desc: TREASURE_DESCS[prefix] };
    }
    if (prefix.length >= 3) {
      const fam = prefix.substring(0, 2);
      const skillShort = prefix.substring(2);
      const skillFull = `${fam}·${skillShort}`;
      const skillOpts = SKILL_OPTIONS[skillFull];
      if (skillOpts && skillOpts[optionPart]) {
        return { skill: skillFull, option: optionPart, desc: skillOpts[optionPart] };
      }
    }
    return { skill: null, option: optionPart, desc: null };
  }

  // 포맷 4: 옵션명만 — 모든 신통 스캔해서 매칭
  for (const [skill, opts] of Object.entries(SKILL_OPTIONS)) {
    if (opts[bufKey]) return { skill, option: bufKey, desc: opts[bufKey] };
  }

  // 포맷 5: 특수 상태 (검심통명, 순요, 관일 등) — STACK_DESCS 에서 fallback 조회
  if (STACK_DESCS[bufKey]) {
    return { skill: null, option: bufKey, desc: STACK_DESCS[bufKey] };
  }

  return { skill: null, option: bufKey, desc: null };
}

export { SKILL_OPTIONS };
