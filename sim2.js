// ============================================================================
// 검선귀환 정교화 시뮬레이션 (sim2.js)
// ----------------------------------------------------------------------------
// 0.5초 틱 기반 이벤트 드리븐 시뮬. 자원·버프·트리거를 실시간 추적.
// 5 사이클(150s) 시뮬 후 마지막 2 사이클 평균 피해 = 안정 상태 점수.
// 오프닝(첫 사이클) 점수도 별도 보고.
// ============================================================================

// ======================== 환경 파라미터 ========================
const CFG = {
  // ---- 기본 스탯 (사용자 지정) ----
  baseATK: 160_000_000,    // 공격력 1.6억
  baseDEF: 100_000_000,    // 방어력 1억
  baseHP: 17_000_000_000,  // 체력 170억
  baseShield: 6_000_000_000, // 호신강기 60억
  baseCR: 30,         // 기본 치명타율 (%)
  baseCD: 200,        // 기본 치명타 피해 (%)
  baseDodge: 5,       // 기본 회피 (%)
  // ---- 시뮬 구조 ----
  casts: 9,           // 사이클당 캐스트 수 (신통6 + 법보3, 5s 공통쿨 순차)
  cycleSec: 45,       // 1 사이클 = 9캐스트 완주 = 45s
  법보CD: 32,
  법보Slots: 3,
  신통Slots: 6,
  tickSec: 0.5,
  totalCycles: 5,
  lowHPProb: 0.5,   // (임시) targetHPRatio 기반 모델 리팩터 전까지 유지
  // ---- 방어력 감산 (공식 비공개 → 단순 근사, 리팩터 시 적용 예정) ----
  defReduction: 0.7,   // 일반피해는 원피해의 70%만 적용 (30% 감산). 확정피해(백족)는 우회.
  targetMaxHP: 23_000_000_000, // 170억 HP + 60억 호신강기
  호신강기대상확률: 0.5, // 환음요탑: 대상이 호신강기 보유 확률
  자신호신강기확률: 0.9, // 오염혁선: 자신 호신강기 활성 확률 (60억 풀이라 거의 항상 활성)
  // ---- 법보 절대값 (스크린샷 원문) ----
  법보_base_절대: 564_000_000, // 본체 5.64억
  법보_호신강기추가: 452_000_000, // 호신강기에 추가 4.52억 (대상 보유 시)
  // ---- 법체·공명 임계 ----
  // 공명 기본 효과: 계열 2개 이상 장착 시 신통 피해 +7% (풀체력) ~ +12.5% (저체력) — 선형 스케일
  공명_계열2개_inc_hi: 7,
  공명_계열2개_inc_lo: 12.5,
  유뢰법체_계열4개_최종피해: 20, // 뇌 계열 4개 장착 시 crit 부여 시 본 신통 최종 피해 +20%
  // ---- 현염법체 (화 4set): 항시 +8% + 작열당 +2% (최대 +18%, 총 +26%) ----
  // Phase 1: 작열 자원 미구현이므로 평균 작열 5중첩 가정 → +18%
  현염법체_기본: 8,
  현염법체_작열당: 2,
  현염법체_평균작열중첩: 5,
  // 신통 본 피해 계수 보너스 (+X percentage points) — 모든 신통 기본 피해에 덧셈
  // 예: baseCoef 135%에 +200 보너스 → 335% × ATK
  신통계수보너스: 200,
  // === 불씨 (운명의 궁궐 상) 세트 효과 ===
  // 총 9슬롯. 개수별 최대 급수 효과 적용 (성급 조건 생략).
  // 자동 탐색은 계산 생략, 수동 시뮬에서만 opts.불씨 전달.
  불씨: {
    통명묘화: 0,  // 0 or 3 → 3개 시 3급 (+8 amp)
    진무절화: 0,  // 0 or 3 or 6 → 3개=1급(+16), 6개=3급(+48)
    태현잔화: 0,  // 0 or 3 → 3개 시 3급 (dealt +8 기댓값)
    유리현화: 0,  // 0 or 3 → 3개 시 3급 (+15 amp)
    진마성화: 0,  // 0 or 3 or 6 → 3개=1%/스택, 6개=3%/스택 (max 10)
  },
  trace: null, // function(t, tag, msg) — set by external runner for per-build trace
  preEvent: null, // function(state, ev) — hook before each event (for stack reset experiments)
};
function TRACE(state, tag, msg) { if (CFG.trace) CFG.trace(state.t, tag, msg); }

// ======================== 자원·버프 스키마 ========================
// 상태(state)는 한 빌드 시뮬 인스턴스마다 새로 초기화.
function newState() {
  return {
    t: 0,                 // 시뮬 시간
    dmgLog: [],           // 사이클별 피해 총합
    // 스택 자원
    stacks: {
      검세: 0, 검심: 0, 검심통명: 0, // 영검
      작열: 0, 열산: 0,              // 화염 (열산 상태는 10s 타이머)
      뇌인: 0, 옥추: 0, 신소: 0,     // 뇌전
    },
    // 공유 TTL 스택 (스택 추가 시 전체 타이머가 dur로 리셋)
    // 사용자 확정: 뇌인·옥추·검세 모두 동일 규칙 — 스택이 쌓이면 쿨다운 초기화
    // 읽을 때는 state.stacks.{key}를 참조 (pruneStackTTL이 동기화)
    stackTTL: {
      검세: { count: 0, endT: 0 },
      뇌인: { count: 0, endT: 0 },
      옥추: { count: 0, endT: 0 },
    },
    // 타이머 (key → expiry time)
    timers: {},
    // 버프 누적 (flat: 공격력 %, cr/cd: 글로벌)
    buffs: [],            // {key, atk, cr, cd, dmgMult, endT, maxStacks, stackCount}
    // 다음 캐스트 한정 강화
    nextCast: { cr: 0, cd: 0, finalDmg: 0, finalCR: 0, finalCD: 0 },
    // 장착 컨텍스트 (법체/유파 효과 참조용)
    build: null,          // [[famKey, slots], ...]
    famSlots: {},         // 유파별 슬롯
    catSlots: {},         // 계열별 슬롯
    // 균천·관일 전용 상태
    관일End: 0,
    관일종료처리: true,
    검망남은: 0,
    검망증폭: 0,
    // 참허·분광 [분광] 지속 트리거 / [응현] 검심획득 창 트리거
    분광End: 0,
    응현End: 0,
    응현발동: 0,
    // 중광·육요 [검광] 지속 트리거 (30s, 시전 시마다 23% 호무)
    검광End: 0,
    명화End: 0,
    폭우End: 0, 폭우살혼: 0, 폭우발동: 0,
    // 참허·단진 [단진] 리필 카운터 (연광 가정 4회)
    단진남은: 0,
    // 균천·파월 [파월] 리필 카운터 — 신통 시전마다 검세+1 + atk+15% 5s, max 4회 발동
    파월남은: 0,
    // 옥추·수광 [뇌격] 지속 crit 트리거 / [천붕] 수광 종료 시 트리거
    뇌격End: 0,
    뇌격남은: 0,
    수광End: 0,
    수광종료처리: true,
    // 청명·투진 [순요] 10초 창 — 창 안의 매 신통 cast에서 crit 시 5초 atk+25
    순요End: 0,
    // === 랜덤 크리 모드 cast별 추적 ===
    _castAnyCrit: false,   // 이번 cast 에서 crit 최소 1회 발생 여부
    _castCritCount: 0,     // 이번 cast 에서 crit 누적 횟수 (per-hit 판정 합)
    _tahyunRoll: null,     // 이번 cast 의 태현잔화 roll 결과 (0~16, null이면 기댓값 사용)
    // 불씨 진무절화: 신통 2 시전마다 다음 신통 입히는피해 증가 (탑티어)
    진무절화카운터: 0,
    진무절화스택: 0,  // 현재 저장된 다음 신통 피해 증가치 (%)
    // 불씨 진마성화: 신통 1 시전마다 amp(신통 피해 심화) 증가, 최대 10중첩
    진마성화스택: 0,
    // === 호신강기/HP 분리 풀 ===
    // 일반 피해는 호신강기부터 소진, 오버플로우는 HP로.
    // 호신강기 무시(type:'호무'|'살혼'|'천검' / bypassShield / 검심통명 상태의 신통 기본 피해)는 HP 직접 타격.
    // hpRatio() 는 hpRem/baseHP 기준 (HP 조건 옵션 - 현미/검현/참선/단천/검세/관일/검홍/한광 등 판정용)
    shieldRem: 0,  // newState에서 설정 안 하고 simulateBuild에서 CFG.baseShield로 초기화
    hpRem: 0,
    // ===== 백족 자원 =====
    // 독고 (적 디버프, 4유형, 각 최대 5중첩, 20s TTL — 부여 시 갱신)
    독고: { 강체: 0, 환체: 0, 실혼: 0, 매혹: 0 },
    독고EndT: { 강체: 0, 환체: 0, 실혼: 0, 매혹: 0 },
    // 화상 (화염 공명 기본 효과로 부여, 20s, 방어 -2%/스택, 중첩 제한 없음)
    // 작열 개별 타이머 배열 [{dot, startT, endT}, ...] — 각 스택이 독립 만료
    작열Arr: [],
    // 폭파(60%) 트리거용 결정적 RNG seed — 매 시뮬마다 0 으로 초기화 → 같은 빌드/순서/스킬 = 같은 결과
    폭파RngSeed: 0,
    작열부여카운터: 0, // 신규 작열 부여 누적 (6회마다 염양 트리거)
    화상: 0, 화상EndT: 0,
    염양방감: 0, 염양방감EndT: 0, // 염양 방어력 감소 디버프 (10%/스택, 최대 3중첩, 10초)
    // 계약은 applyBuff 정식 시스템으로 처리 (key='계약·실혼','계약·매혹' 등)
    // 도천지세 카운터 (살혼 누적 시전 횟수)
    살혼누적: 0,
    // 명화 마상 — cast마다 5회로 리셋 (사해·명화 시전 시 활성화)
    마상남은: 0,
    // 이화·삼매 현화 — cast마다 5회로 리셋 (이화·삼매 시전 시 활성화)
    현화남은: 0,
    // 주술·제율 — cast마다 5회로 리셋 (주술·제율 시전 시 활성화)
    제율남은: 0,
    // 열산·순일 — 염양 발동 시 30% 물리 (최대 4회, 순일 cast마다 4로 리셋)
    순일남은: 0,
    // 열산·순일 진공 — 염양 발동 시 작열 +1 (최대 4회, 순일 cast마다 4로 리셋)
    진공남은: 0,
    // 열산·양운 진염 — 염양 발동 시 20% 물리 (최대 3회, 양운 cast마다 3으로 리셋)
    진염남은: 0,
    // 형혹·겁염 — 폭파 발동 시 atk/defDebuff 트리거 윈도우
    겁염End: 0,
    // 형혹·함양 — 폭파 발동 시 함양/염화 트리거
    함양End: 0,
    함양남은: 0,
    // 천로·단주 광염+충염 — 다음 6회 신통 명중 시 작열 1중첩
    광염남은: 0,
    // 청명·풍뢰 [풍뢰+천적 max]: 최대 14회
    풍뢰남은: 0,
    // 오뢰·용음 [뇌정+어뢰 max]: 최대 12회
    뇌정남은: 0,
    // 청명 유파 천벌 — 뇌인 4중첩 도달 시 1초 간격으로 30% 천뢰
    // 옥추 분수 누적 (기댓값 모드에서 hits × crEff 누적)
    _옥추분수: 0,
    // 검세 3회 획득마다 천검 발동 카운터 (염양 스타일)
    검세획득카운터: 0,
    // 뇌인 4회 획득마다 천벌 발동 카운터 (염양 스타일)
    뇌인획득카운터: 0,
    // 히트 창(window) 카운터들 — 피해 N회 입힐 때마다 트리거
    // [동허] 중광·투영: 20초, 5히트마다 defDebuff+4% (최대 5중첩)
    동허End: 0, 동허히트: 0, 동허중첩: 0,
    // [검영] 중광·환성: 15초, 5히트마다 5% 물리 (최대 20회)
    검영End: 0, 검영히트: 0, 검영발동: 0,
    // [파천] 중광·환성: 검영 3회 발동마다 48% 물리
    파천카운터: 0,
    // [열천] 사해·열천: 15초, 10히트마다 살혼 5% (최대 10회)
    열천End: 0, 열천히트: 0, 열천발동: 0,
    // [마념] 열천 살혼 2회 시전마다 12% 술법
    마념카운터: 0,
    // [유령불] 명화 살혼 2회 시전마다 15% 물리
    유령불카운터: 0,
    // [독주] 주술·유식: 본 신통 시전 15초 후 발동 예약 (0 = 비활성)
    독주FireT: 0,
    // 다음 record() 호출의 히트 수 (기본 1, 멀티히트 시 명시 설정)
    _recordHits: 1,
  };
}

// ======================== 유틸 ========================
// 대상의 현재 HP 비율 (호신강기 제외한 본체 HP 풀 기준)
// 1: 풀체력, 0: 사망. 호신강기가 아직 남아있어도 HP가 줄었으면 저체력 조건 발동.
// HP 조건 옵션(현미 60%, 검현 50%, 참선 50%, 단천 60%, 검세 60%, 관일 60%, 검홍 60%, 한광 60%)은 이 값 기준.
function hpRatio(state) {
  const baseHP = CFG.baseHP || 1;
  const hpRem = (state.hpRem !== undefined) ? state.hpRem : baseHP;
  return Math.max(0, Math.min(1, hpRem / baseHP));
}
// 불씨 세트 급수 보너스 계산 — "개수별 최대급수" (성급 조건 없이 장착 개수로만)
function 불씨급수값(state, name, tiers) {
  const src = (state && state.불씨) || CFG.불씨 || {};
  const count = src[name] || 0;
  if (count <= 0) return 0;
  if (name === '통명묘화' || name === '태현잔화' || name === '유리현화') {
    // 3-set: 3개 → 3급(최대)
    if (count >= 3) return tiers[2];
  } else if (name === '진무절화' || name === '진마성화') {
    // 6-set: 3개 → 1급, 6개 → 3급(최대)
    if (count >= 6) return tiers[2];
    if (count >= 3) return tiers[0];
  }
  return 0;
}
// 불씨 장착 검증
function 불씨검증(state) {
  const b = (state && state.불씨) || CFG.불씨 || {};
  const total = (b.통명묘화||0) + (b.진무절화||0) + (b.태현잔화||0) + (b.유리현화||0) + (b.진마성화||0);
  if (total > 9) console.warn(`불씨 장착 개수 초과: ${total}/9`);
  return total;
}

// 저체력 선형 스케일 계수 (0: 풀체력, 1: 사망)
function hpLowFactor(state) { return 1 - hpRatio(state); }
// HP가 threshold 이하인지 (예: 0.60 = HP 60% 이하)
function hpBelow(state, threshold) { return hpRatio(state) <= threshold; }

// 유파 효과 활성 조건 — 해당 유파 신통 2개 이상 장착 시
function famActive(state, fam) { return (state.famSlots[fam] || 0) >= 2; }
// 활성 시 슬롯 개수, 비활성 시 0 — 슬롯 스케일링용
function famActiveSlots(state, fam) { return famActive(state, fam) ? (state.famSlots[fam] || 0) : 0; }

function sumBuffAtk(state) {
  let s = 0;
  for (const b of state.buffs) if (b.endT > state.t && b.atk) s += b.atk * (b.stackCount || 1);
  // 현염법체 기본(화 2+): 작열 상태 대상에게 신통 시전 시 공격력 +9%
  if ((state.catSlots.화염 || 0) >= 2 && (state.stacks.작열 || 0) > 0) s += 9;
  // 영검법체 4set 은 buff '영검법체4' 로 등록되어 위 루프에서 합산됨 (트리거: 신통 명중 시 + HP 80% 이하)
  return s;
}
// isShintong=true: 신통 본체 피해에서 호출 (신통 전용 buff도 포함)
// isShintong=false: 천뢰/낙뢰/작열/호무/평타 등 — 신통 전용 buff 제외
function sumBuffCR(state, isShintong = true) {
  let s = 0;
  for (const b of state.buffs) {
    if (b.endT <= state.t || !b.cr) continue;
    if (b.shintongOnly && !isShintong) continue;
    s += b.cr * (b.stackCount || 1);
  }
  // 뇌인 스택: "1중첩당 20초 동안 신통 시전 시 치명타율 5% 증가" → 신통 전용 (청명 ≥2)
  if (famActive(state, '청명') && isShintong) s += state.stacks.뇌인 * 5;
  // 공명 기본 효과 (뇌전 2+): "신통 시전 시 치명타율 +11%" → 신통 전용
  if ((state.catSlots.뇌전 || 0) >= 2 && isShintong) s += 11;
  return s;
}
// 치명타 저항 감소 합산 (crRes 필드) — 기본 저항 0 기준, 곱연산 레이어
function sumBuffCritRes(state) {
  let s = 0;
  for (const b of state.buffs) if (b.endT > state.t && b.crRes) s += b.crRes * (b.stackCount || 1);
  return s;
}
// 공명 기본 효과 inc 기여분 (영검 2+: 신통 피해 +7~12.5%, 저체력 선형)
// 20.42.32 검 폴더 공명 화면 기준. 다른 계열은 crit(뇌)/TBD(화/백족)라 여기서 취급 안 함.
function 공명inc(state) {
  if ((state.catSlots.영검 || 0) < 2) return 0;
  const hi = CFG.공명_계열2개_inc_hi;
  const lo = CFG.공명_계열2개_inc_lo;
  // 대상 HP ratio 사용 (풀체력→hi, 저체력→lo). 실시간 HP 기반 선형 보간.
  return hi + (lo - hi) * hpLowFactor(state);
}
function sumBuffCD(state, isShintong = true) {
  let s = 0;
  for (const b of state.buffs) {
    if (b.endT <= state.t || !b.cd) continue;
    if (b.shintongOnly && !isShintong) continue;
    s += b.cd * (b.stackCount || 1);
  }
  return s;
}
// 신통 피해 증가 (scope: '신통'만 적용) — "신통으로 입히는 피해 X% 증가" 계열
function sumShintongInc(state) {
  let s = 0;
  for (const b of state.buffs) {
    if (b.endT > state.t && b.cat === 'inc' && b.dmgMult) s += b.dmgMult * (b.stackCount || 1);
  }
  // 옥추 스택: 1%/스택 (옥추 ≥2)
  if (famActive(state, '옥추')) s += state.stacks.옥추;
  // 옥추 유파 slot×2.5% (옥추 보유 시, 옥추 ≥2)
  if (famActive(state, '옥추') && state.stacks.옥추 > 0) s += state.famSlots.옥추 * 2.5;
  // 신소 유파 slot×4% (신소 효과 보유 시, 신소 ≥2)
  if (famActive(state, '신소') && state.stacks.신소 > 0) s += state.famSlots.신소 * 4;
  // 참허 유파 slot×3% (검심통명 중, 참허 ≥2)
  if (famActive(state, '참허') && state.stacks.검심통명) s += state.famSlots.참허 * 3;
  // 복룡 유파 slot×4% (HP 70%↓, 복룡 ≥2)
  if (famActive(state, '복룡') && hpBelow(state, 0.70)) s += state.famSlots.복룡 * 4;
  // 공명 영검 2+: 신통 피해 +7~12.5% (저체력 선형)
  s += 공명inc(state);
  // 독고 디버프: 강체(신통 피해 감면 감소), 환체(방어 감소) — 우리 신통 피해에 inc로 환산 (주술 ≥2)
  if (famActive(state, '주술')) {
    pruneDokgo(state);
    s += (state.독고.강체 || 0) * 2.5;
    s += (state.독고.환체 || 0) * 2.5;
  }
  return s;
}
// 구 이름 유지 (호환): sumBuffInc === sumShintongInc
function sumBuffInc(state) { return sumShintongInc(state); }

// 유형별 피해 증가 (scope: 해당 유형만) — 천뢰/낙뢰/작열DoT/작열폭발/염양/살혼/호무/천검
// 모든 유파 효과는 해당 유파 ≥2 슬롯에서만 발동
function sumTypeDmg(state, type) {
  let s = 0;
  switch (type) {
    case '천뢰':
      s += famActiveSlots(state, '청명') * 10; // 청명 유파 (≥2)
      // [투진] 투진: 20초간 천뢰 피해 +40%
      if (state.buffs.some(b => b.key === '청명투진_투진' && b.endT > state.t)) s += 40;
      break;
    case '낙뢰':
      s += famActiveSlots(state, '오뢰') * 10; // 오뢰 유파 (≥2)
      // [용음] 천뢰: 20초간 낙뢰 피해 +80% (key: 오뢰용음_낙뢰증폭)
      if (state.buffs.some(b => b.key === '오뢰용음_낙뢰증폭' && b.endT > state.t)) s += 80;
      break;
    case '작열DoT':
      s += famActiveSlots(state, '이화') * 10; // 이화 유파 (≥2)
      // [염우] 열염: 15초간 작열 DoT +50%
      if (state.buffs.some(b => b.key === '이화염우_열염' && b.endT > state.t)) s += 50;
      break;
    case '작열폭발':
      s += famActiveSlots(state, '형혹') * 10; // 형혹 유파 (≥2)
      s += famActiveSlots(state, '천로') * 15; // 천로 유파 (≥2)
      break;
    case '염양':
      s += famActiveSlots(state, '열산') * 10; // 열산 유파 (≥2)
      break;
    case '살혼':
      s += famActiveSlots(state, '사해') * 10; // 사해 유파 (≥2)
      break;
    case '호무':
      s += famActiveSlots(state, '중광') * 10; // 중광 유파 (≥2)
      break;
    case '천검':
      s += famActiveSlots(state, '균천') * 10; // 균천 유파 (≥2)
      break;
  }
  return s;
}

// 입히는 피해 (scope: 모든 유형) — 명시 스코프 없는 범용 피해 증가
function sumBuffDealt(state, isShintong = true) {
  let s = 0;
  for (const b of state.buffs) {
    if (b.endT > state.t && b.cat === 'dealt' && b.dmgMult) s += b.dmgMult * (b.stackCount || 1);
  }
  // 불씨 세트: 태현잔화 (0~8/0~12/0~16 랜덤)
  // - 기댓값 모드: 절반 (4/6/8)
  // - 랜덤 모드: cast 시작 시 0~2×expected 로 롤, cast 동안 캐시값 사용
  if (isShintong) {
    const 태현기댓값 = 불씨급수값(state, '태현잔화', [4, 6, 8]);
    if (태현기댓값 > 0) {
      if (CFG.randomCrit) {
        // cast 시작 시 롤된 값 사용 (없으면 0 → 안전하게 기댓값 fallback)
        s += (state._tahyunRoll ?? 태현기댓값);
      } else {
        s += 태현기댓값;
      }
    }
  }
  return s;
}
function prune화상(state) {
  if (state.화상EndT > 0 && state.t >= state.화상EndT) {
    state.화상 = 0;
    state.화상EndT = 0;
  }
}
function 화상부여(state, n = 1) {
  if ((state.catSlots.화염 || 0) < 2) return;
  prune화상(state);
  state.화상 = (state.화상 || 0) + n;
  state.화상EndT = state.t + 20;
}
// 버프에서 방어력 감소(%) 합산 (스킬별 defDebuff 필드)
function sumBuffDefDebuff(state) {
  let s = 0;
  for (const b of state.buffs) {
    if (b.endT > state.t && b.defDebuff) s += b.defDebuff * (b.stackCount || 1);
  }
  return s;
}
// 독고 만료 정리
function pruneDokgo(state) {
  for (const t of ['강체','환체','실혼','매혹']) {
    if (state.독고EndT[t] > 0 && state.t >= state.독고EndT[t]) {
      state.독고[t] = 0;
      state.독고EndT[t] = 0;
    }
  }
}
// 피해 심화 (amp) 버킷: 버프 dmgMult 중 cat==='amp' 인 것 + 검세 스택
function sumBuffAmp(state) {
  let s = 0;
  for (const b of state.buffs) {
    if (b.endT > state.t && b.cat === 'amp' && b.dmgMult) s += b.dmgMult * (b.stackCount || 1);
  }
  // 검세 스택: 1.5%/스택 (docx "1중첩당 신통 피해 심화 1.50% 증가") (균천 ≥2)
  if (famActive(state, '균천')) s += state.stacks.검세 * 1.5;
  // 불씨 세트: 개수별 탑티어 효과만 적용 (누적 아님)
  s += 불씨급수값(state, '통명묘화', [4, 6, 8]);
  s += 불씨급수값(state, '유리현화', [5, 10, 15]);
  // 진마성화: 신통 1 cast마다 +X% amp 스택 (최대 10). 3개→1%/스택, 6개→3%/스택
  const 진마성화Per = 불씨급수값(state, '진마성화', [1, 3, 3]);
  if (진마성화Per > 0) s += (state.진마성화스택 || 0) * 진마성화Per;
  return s;
}
function applyBuff(state, key, spec, dur, maxStack = 1) {
  // 같은 key 존재하면 stack 증가 / 갱신
  const ex = state.buffs.find(b => b.key === key && b.endT > state.t);
  const isWeak = !!(spec.defDebuff || spec.crRes);
  // 본 cast 의 dealDamage 가 이미 실행된 후에 부여되는 buff 는 [post] 표시
  // (이 buff 는 본 cast 에 영향 없고 다음 cast 부터 적용 — 타임라인 시각화에 사용)
  const postTag = state._snapBuffsCaptured ? ' [post]' : '';
  if (ex) {
    ex.endT = state.t + dur + 0.001; // +epsilon — 갱신 시에도 dur초 후 cast 포함
    const prevStack = ex.stackCount || 1;
    ex.stackCount = Math.min(prevStack + 1, maxStack);
    // 갱신 로그
    const m2 = key.match(/^(..)(..)_(.+)$/);
    const keyLabel2 = m2 ? `[${m2[1]}·${m2[2]} → ${m2[3]}]` : `[${key}]`;
    if (ex.stackCount > prevStack) {
      TRACE(state, 'BUF', `↑중첩 ${keyLabel2} ${prevStack}→${ex.stackCount} (${dur}초 재갱신)${postTag}`);
    } else {
      TRACE(state, 'BUF', `↻갱신 ${keyLabel2} (${dur}초 재갱신, 중첩 ${ex.stackCount}/${maxStack} 유지)${postTag}`);
    }
    // 약화 중첩 증가 시 마상 트리거 (갱신이 아닌 중첩 증가만)
    if (isWeak && ex.stackCount > prevStack && typeof 마상트리거 === 'function') 마상트리거(state);
    return;
  }
  // endT에 +0.001 epsilon — "10초 지속"이 정확히 10초 후 cast까지 포함되도록
  // (예: t=15에 10초 버프 → t=25 cast에서 여전히 활성)
  state.buffs.push({ key, endT: state.t + dur + 0.001, stackCount: 1, maxStacks: maxStack, ...spec });
  // 로그: "+열산염폭_염식" → "+[열산·염폭 → 염식]"
  const m = key.match(/^(..)(..)_(.+)$/);
  const keyLabel = m ? `[${m[1]}·${m[2]} → ${m[3]}]` : `[${key}]`;
  const specStr = Object.entries(spec).map(([k,v])=>k+'+'+v).join(',') || '(효과표시없음)';
  const kindTag = isWeak ? '🔻디버프' : '🔼버프';
  TRACE(state, 'BUF', `${kindTag} ${keyLabel} ${specStr} ${dur}초${maxStack>1?` (중첩최대${maxStack})`:''}${postTag}`);
  // 신규 약화 부여 시 마상 트리거
  if (isWeak && typeof 마상트리거 === 'function') 마상트리거(state);
}
function addStack(state, resource, n = 1, max = Infinity) {
  const before = state.stacks[resource] || 0;
  state.stacks[resource] = Math.min(before + n, max);
  const after = state.stacks[resource];
  if (after !== before) TRACE(state, 'STK', `${resource} ${before}→${after}`);
}
// 공유 TTL 스택: 스택 추가마다 전체 타이머가 dur로 리셋 (검세/뇌인/옥추 모두 동일 규칙)
function addStackTTL(state, resource, n, max, dur = 20) {
  const st = state.stackTTL[resource];
  if (!st) return;
  const before = st.count;
  st.count = Math.min(before + n, max);
  st.endT = state.t + dur + 0.001; // +epsilon — dur초 뒤 정확히 cast되는 시점까지 포함
  state.stacks[resource] = st.count;
  // 검세 (균천) 의 경우 획득 카운터 (N+n)/3 을 트레이스에 포함 — 다음 천검 발동까지 누적치 표시
  let extraStr = '';
  if (resource === '검세' && famActive(state, '균천')) {
    const nextCnt = ((state.검세획득카운터 || 0) + n) % 3;
    extraStr = ` (획득카운터 ${nextCnt}/3)`;
  }
  if (st.count !== before) {
    TRACE(state, 'STK', `${resource} ${before}→${st.count} (TTL=${dur}s reset)${extraStr}`);
  } else if (st.count > 0) {
    // 최대치라 count 불변이지만 TTL 만 갱신 — 타임라인 표시용으로 trace
    TRACE(state, 'STK', `${resource} ${st.count}↻ (TTL=${dur}s reset, 최대치 유지)${extraStr}`);
  }
}
function pruneStackTTL(state) {
  for (const key of Object.keys(state.stackTTL)) {
    const st = state.stackTTL[key];
    if (st.endT > 0 && st.endT <= state.t) {
      if (st.count > 0) TRACE(state, 'STK', `${key} ${st.count}→0 (만료)`);
      st.count = 0;
      st.endT = 0;
    }
    state.stacks[key] = st.count;
  }
}
function consumeStack(state, resource, n) {
  state.stacks[resource] = Math.max(0, (state.stacks[resource] || 0) - n);
}

// ---- 작열 개별 타이머 헬퍼 ----
// 만료된 작열 스택 제거 (피해 정산 없음 — 틱에서 처리)
function prune작열(s) {
  s.작열Arr = s.작열Arr.filter(st => st.endT > s.t);
  s.stacks.작열 = s.작열Arr.length;
}
// 작열 DoT 전용 피해 계산 — 부여 시점에 스냅샷.
// 적용 계층: 공격력, 유형별(작열DoT), 입히는피해, 최종피해, 방어감면.
// 제외: 신통 피해 심화(신통 전용), 크리(DoT는 크리 X).
function dealDotDamage(s, basePct) {
  const atkBuff = sumBuffAtk(s);
  const typePct = sumTypeDmg(s, '작열DoT');            // 이화 slot×10 + [열염] 50 등
  const dealtPct = sumBuffDealt(s, false);             // 입히는 피해 (신통 아님)
  const finalPct = (s.nextCast && s.nextCast.finalDmg) || 0;  // 최종 피해 (nextCast 버프)
  const rawBase = basePct * CFG.baseATK / 100;
  let dmg = rawBase
    * (1 + atkBuff / 100)
    * (1 + typePct / 100)
    * (1 + dealtPct / 100)
    * (1 + finalPct / 100);
  // 방어 감소 디버프 합산: 화상 + 염양방감 + 스킬별 defDebuff 버프
  let defMult = CFG.defReduction;
  let 감소 = 0;
  if ((s.catSlots.화염 || 0) >= 2) {
    prune화상(s);
    감소 += (s.화상 || 0) * 2;
  }
  prune염양방감(s);
  감소 += (s.염양방감 || 0) * 10;
  감소 += sumBuffDefDebuff(s);
  감소 = Math.min(감소, 100);
  if (감소 > 0) {
    defMult = CFG.defReduction + (1 - CFG.defReduction) * (감소 / 100);
  }
  return dmg * defMult;
}
// 작열 스택 추가 — 부여 시점에 1틱 피해를 스냅샷 계산하여 저장
function add작열(s, basePct, dur = 20, source) {
  // [열염]·[이화 유파 slot] 은 sumTypeDmg('작열DoT') 에서 자동 합산됨 — 중복 방지 위해 여기선 안 곱함
  const tickDmg = dealDotDamage(s, basePct / dur); // 1초분 피해 스냅샷 (atk + type + dealt + final + def)
  const src = source || s._currentSource || '?';
  s.작열Arr.push({ tickDmg, startT: s.t, endT: s.t + dur, source: src });
  s.stacks.작열 = s.작열Arr.length;
  // 약화 중첩 증가 → 마상 트리거
  if (typeof 마상트리거 === 'function') 마상트리거(s);
  // 작열 중첩 증가 → 현화 트리거
  if (typeof 현화트리거 === 'function') 현화트리거(s);
}
// 작열 틱 처리 — 매 초 호출, 살아있는 스택마다 스냅샷된 1틱 피해 적용
function tick작열(s) {
  prune작열(s);
  if (s.작열Arr.length === 0) return;
  const prevSrc = s._currentSource;
  for (const st of s.작열Arr) {
    const remain = Math.max(0, st.endT - s.t).toFixed(0);
    s._currentSource = `작열(DoT)←${st.source} 남은${remain}초`;
    s._lastIsCrit = null; // DoT는 크리 없음
    s._lastCR = undefined;
    s._lastCD = undefined;
    record(s, st.tickDmg);
  }
  s._currentSource = prevSrc;
}
// 작열 스택 FIFO 소모 — 폭파용. 잔여 틱 피해(남은 초 × 스냅샷 tickDmg) 합산 반환
function consume작열(s, n) {
  prune작열(s);
  let remainingDot = 0;
  const toConsume = Math.min(n, s.작열Arr.length);
  for (let i = 0; i < toConsume; i++) {
    const st = s.작열Arr.shift();
    const remainSec = Math.max(0, st.endT - s.t);
    remainingDot += st.tickDmg * remainSec;
  }
  s.stacks.작열 = s.작열Arr.length;
  return remainingDot;
}

// 크리 기댓값 배율
function critMult(cr, cd) {
  cr = Math.max(0, Math.min(100, cr));
  return (100 - cr) / 100 * 1 + cr / 100 * (1 + cd / 100);
}

// 랜덤 크리 모드용 확률 스케일 헬퍼
// - 랜덤 ON: Math.random() < p 이면 1, 아니면 0 (주사위)
// - 랜덤 OFF: p 그대로 반환 (기댓값)
function probScale(p) {
  if (CFG.randomCrit) return (Math.random() < p) ? 1 : 0;
  return p;
}
// 결정적 PRNG (mulberry32) — 폭파 60% 트리거 전용. 같은 빌드/순서/스킬 → 항상 같은 결과
// 랜덤 모드 (CFG.randomCrit=true) 와 무관: 시드 기반이라 두 모드에서 동일하게 동작
function seededRand(s) {
  // state 의 폭파RngSeed 를 32-bit 정수로 갱신 후 [0,1) 반환
  let t = (s.폭파RngSeed = (s.폭파RngSeed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// 여러 번 반복하는 확률 카운트 (예: hits×crEff 기댓값 = 실제 crit 횟수)
function randomTries(tries, p) {
  if (CFG.randomCrit) {
    let cnt = 0;
    for (let i = 0; i < tries; i++) if (Math.random() < p) cnt++;
    return cnt;
  }
  return tries * p; // 기댓값
}

// ======================== crit 트리거 ========================
// 풍뢰/뇌정: 버프 활성 중 매 캐스트 시 crit 마다 천뢰/낙뢰 방출
// - 기댓값 모드: crit 확률만큼 스케일 피해
// - 랜덤 모드: 이번 cast 의 실제 crit 횟수만큼 full 피해 × N회
function tickCritTriggers(state) {
  const activeKeys = new Set(state.buffs.filter(b => b.endT > state.t).map(b => b.key));
  // 본 신통의 hit 수 (multi-hit 신통은 hit 별 crit roll → expected 모드에서도 hits × crEff)
  const _hits = (state._activeCast && SKILL_HITS[state._activeCast]) || 1;
  // 청명·풍뢰 [풍뢰+천적 max]: crit 시 16+12=28% 물리 천뢰, 최대 14회
  if (state.famSlots.청명 && activeKeys.has('청명풍뢰_풍뢰') && (state.풍뢰남은 || 0) > 0) {
    const base = 16 + 12;
    if (CFG.randomCrit) {
      const trigCount = Math.min(state._castCritCount || 0, state.풍뢰남은);
      if (trigCount > 0) {
        state.풍뢰남은 = Math.max(0, state.풍뢰남은 - trigCount);
        for (let i = 0; i < trigCount; i++) {
          record(state, dealDamage(state, base, { type: '천뢰' }), '천뢰←풍뢰(crit)');
        }
      }
    } else {
      const crEff = Math.min(100, CFG.baseCR * (1 + sumBuffCR(state) / 100) * (1 + state.nextCast.finalCR / 100) * (1 + sumBuffCritRes(state) / 100)) / 100;
      const expectedCrits = Math.min(_hits * crEff, state.풍뢰남은);
      record(state, dealDamage(state, base * expectedCrits, { type: '천뢰' }), '천뢰←풍뢰(crit)');
      state.풍뢰남은 = Math.max(0, state.풍뢰남은 - expectedCrits);
    }
  }
  // 오뢰·용음 [뇌정+어뢰 max]: crit 시 15% 술법 낙뢰, 최대 12회
  if (state.famSlots.오뢰 && activeKeys.has('오뢰용음_뇌정') && (state.뇌정남은 || 0) > 0) {
    if (CFG.randomCrit) {
      const trigCount = Math.min(state._castCritCount || 0, state.뇌정남은);
      if (trigCount > 0) {
        state.뇌정남은 = Math.max(0, state.뇌정남은 - trigCount);
        for (let i = 0; i < trigCount; i++) {
          record(state, dealDamage(state, 15, { type: '낙뢰' }), '낙뢰←뇌정(crit)');
        }
      }
    } else {
      const crEff = Math.min(100, CFG.baseCR * (1 + sumBuffCR(state) / 100) * (1 + state.nextCast.finalCR / 100) * (1 + sumBuffCritRes(state) / 100)) / 100;
      const expectedCrits = Math.min(_hits * crEff, state.뇌정남은);
      record(state, dealDamage(state, 15 * expectedCrits, { type: '낙뢰' }), '낙뢰←뇌정(crit)');
      state.뇌정남은 = Math.max(0, state.뇌정남은 - expectedCrits);
    }
  }
}

// ======================== 피해 계산 (기댓값) ========================
// dmg = base × (1+atk%) × (1+inc%) × (1+amp%) × critMult × finalDmg × 법체
// inc = 신통 피해 증가 (additive, same bucket)
// amp = 신통 피해 심화 증가 (additive, separate bucket)
// 두 버킷은 서로 곱연산.
function dealDamage(state, base, opts = {}) {
  // === 피해 유형 결정 ===
  // opts.type: '신통' | '평타' | '천뢰' | '낙뢰' | '작열DoT' | '작열폭발' | '염양' | '살혼' | '호무' | '천검' | '법보절대' | '기타'
  // 미지정 시 기본값: absolute → '법보절대', noSkillMult → '기타', else → '신통'
  const type = opts.type || (opts.absolute ? '법보절대' : (opts.noSkillMult ? '기타' : '신통'));
  const isShintong = (type === '신통');
  // 신통 본 피해 계수 보너스 (CFG.신통계수보너스) — 본 신통 기본 피해에만 덧셈 적용
  if (isShintong && CFG.신통계수보너스) {
    base = base + CFG.신통계수보너스;
  }

  // === 공격력 (scope: 모든 피해) ===
  const atkBuff = sumBuffAtk(state) + (opts.localAtk || 0);

  // === 유형별 피해 증가 (scope: 해당 유형만) ===
  const typePct = sumTypeDmg(state, type) + (opts.localTypePct || 0);

  // === 신통 피해 증가 (scope: 신통만) ===
  const shintongPct = isShintong ? (sumShintongInc(state) + (opts.localInc || 0)) : 0;

  // === 심화 피해 증가 (scope: 신통만) ===
  const ampPct = isShintong ? (sumBuffAmp(state) + (opts.localAmp || 0)) : 0;

  // === 입히는 피해 증가 (scope: 모든 유형) ===
  let dealtPct = sumBuffDealt(state, isShintong) + (opts.localDealt || 0);
  // 불씨 진무절화: 직전 2회 신통 시전 후 저장된 증가치 — 신통 본 피해만 소비
  if (isShintong && state.진무절화스택 > 0) {
    dealtPct += state.진무절화스택;
    if (!state._진무절화소비) {
      // 최초 소비 시점에 TRACE (사용되는 신통 시점에 바가 생기도록)
      TRACE(state, 'BUF', `🔼버프 [불씨 진무절화] 본 신통 입히는피해 +${state.진무절화스택}%`);
    }
    state._진무절화소비 = true;
  }

  // === nextCast (소비) ===
  const ncCR = state.nextCast.cr || 0;
  const ncFinalCR = state.nextCast.finalCR || 0;
  const ncCD = state.nextCast.cd || 0;
  const ncFinalCD = state.nextCast.finalCD || 0;
  const ncFinalDmg = state.nextCast.finalDmg || 0;

  // === 크리티컬 ===
  // isShintong=false인 피해(천뢰/낙뢰/작열/호무/평타 등)에는 "신통 치명타율/배율" 계열 buff 제외
  // nextCast.* 도 "다음번에 시전하는 신통" 한정 (예: [파정]) 이므로 isShintong 일 때만 적용
  const ncApply = isShintong ? 1 : 0;
  const crIncPct = sumBuffCR(state, isShintong) + (opts.localCR || 0) + ncCR * ncApply;
  const finalCRPct = (opts.localFinalCR || 0) + ncFinalCR * ncApply;
  const crResPct = sumBuffCritRes(state);
  let cr = CFG.baseCR * (1 + crIncPct / 100) * (1 + finalCRPct / 100) * (1 + crResPct / 100);
  const finalCDPct = (opts.localFinalCD || 0) + ncFinalCD * ncApply;
  let cd = CFG.baseCD + sumBuffCD(state, isShintong) + (opts.localCD || 0) + ncCD * ncApply + finalCDPct;
  if (opts.forceCrit) cr = 100;
  let cMult, isCrit = null;
  if (opts.noCrit) cMult = 1;
  else if (CFG.randomCrit) {
    const roll = Math.random() * 100;
    isCrit = roll < cr;
    cMult = isCrit ? cd / 100 : 1;
    // cast별 crit 누적 (유뢰법체/순요/풍뢰/뇌정 등 다운스트림 트리거용)
    if (isCrit) {
      state._castAnyCrit = true;
      state._castCritCount = (state._castCritCount || 0) + 1;
    }
  } else {
    cMult = critMult(cr, cd);
  }

  // === CONSUME nextCast (신통 시전만) ===
  if (isShintong) {
    // nextCast 가 실제로 소비되는 시점에 TRACE 로 timeline 표시
    if (state._nextCastSources && state._nextCastSources.length > 0) {
      for (const src of state._nextCastSources) {
        TRACE(state, 'BUF', `🔼버프 [${src.key}] 본 신통 적용 (${src.msg})`);
      }
      // 소비 시점 source 보존 — record() 의 SNAP 캡처에서 정확한 라벨에 사용
      state._consumedNextCastSources = state._nextCastSources.slice();
      state._nextCastSources = [];
    }
    state.nextCast.cr = 0;
    state.nextCast.finalCR = 0;
    state.nextCast.cd = 0;
    state.nextCast.finalCD = 0;
    state.nextCast.finalDmg = 0;
  }

  // === 최종 피해 (scope: 신통만) ===
  //   소스: nextCast.finalDmg (다음 신통 — 현미/풍세) + localFinalDmg (본 신통 — 통백 등)
  //         + 유뢰4법체(crit) + 현염4법체(작열)
  let finalPct = 0;
  let 유뢰법체Final = 0, 현염법체Final = 0;
  const localFinalDmg = opts.localFinalDmg || 0;
  if (isShintong) {
    finalPct += ncFinalDmg + localFinalDmg;
    if (state.catSlots.뇌전 >= 4) {
      const crEff = Math.min(cr, 100) / 100;
      // 랜덤 모드: isCrit 확정 기반 (crit 나면 full 20%, 아니면 0)
      // 기댓값 모드: crit 확률 × 20% 스케일
      유뢰법체Final = (CFG.randomCrit ? (isCrit ? 1 : 0) : crEff) * CFG.유뢰법체_계열4개_최종피해;
      finalPct += 유뢰법체Final;
    }
    if (state.catSlots.화염 >= 4) {
      const 작열중첩 = state.stacks.작열 || CFG.현염법체_평균작열중첩;
      const 작열보너스 = Math.min(작열중첩, 9) * CFG.현염법체_작열당;
      현염법체Final = CFG.현염법체_기본 + 작열보너스;
      finalPct += 현염법체Final;
    }
  }
  // === 방어 감면 (대상측) ===
  let defMult = 1;
  if (!opts.absolute && !opts.bypassDef) {
    defMult = CFG.defReduction;
    let 감소 = 0;
    if ((state.catSlots.화염 || 0) >= 2) {
      prune화상(state);
      감소 += (state.화상 || 0) * 2;
    }
    prune염양방감(state);
    감소 += (state.염양방감 || 0) * 10;
    감소 += sumBuffDefDebuff(state);
    감소 = Math.min(감소, 100);
    if (감소 > 0) defMult = CFG.defReduction + (1 - CFG.defReduction) * (감소 / 100);
  }
  // 트레이스용
  state._lastCR = Math.min(cr, 100);
  state._lastCD = cd;
  state._lastIsCrit = isCrit;

  // === 공격자 피해 공식 ===
  //   base_damage × (1+공격력%) × (1+유형피해%) × (1+신통피해%) × (1+심화피해%) × (1+입히는피해%) × cMult × (1+최종피해%)
  //   최종피해는 크리까지 다 끝난 뒤 마지막 단일 덧셈 배율
  const atkM       = 1 + atkBuff / 100;
  const typeM      = 1 + typePct / 100;
  const shintongM  = 1 + shintongPct / 100;
  const ampM       = 1 + ampPct / 100;
  const dealtM     = 1 + dealtPct / 100;
  const fmM        = 1 + finalPct / 100;
  let attackerDmg;
  if (opts.absolute) {
    // 법보 절대값: base는 이미 절대 데미지값
    attackerDmg = base * typeM * shintongM * ampM * dealtM * cMult * fmM;
  } else {
    const rawBase = base * CFG.baseATK / 100;
    const L1 = rawBase * atkM;        // × 공격력
    const L2 = L1 * typeM;            // × 유형 피해 (천뢰/낙뢰/…)
    const L3 = L2 * shintongM;        // × 신통 피해 (신통만)
    const L4 = L3 * ampM;             // × 심화 피해 (신통만)
    const L5 = L4 * dealtM;           // × 입히는 피해 (공통)
    const L6 = L5 * cMult;            // × 크리기대값
    attackerDmg = L6 * fmM;           // × 최종 피해 (신통만) ← 마지막
  }
  const finalResult = attackerDmg * defMult;

  // breakdown (record()가 DMG 이후 출력)
  state._lastBreakdown = {
    base, type,
    absolute: !!opts.absolute,
    noSkillMult: !!opts.noSkillMult,
    bypassDef: !!opts.bypassDef,
    bypassShield: !!opts.bypassShield,
    atkBuff, localAtk: opts.localAtk || 0,
    typePct, localTypePct: opts.localTypePct || 0,
    shintongPct, localInc: opts.localInc || 0,
    ampPct, localAmp: opts.localAmp || 0,
    dealtPct, localDealt: opts.localDealt || 0,
    finalPct, finalDmgPct: ncFinalDmg, localFinalDmg, localFinalDmgSrc: opts.localFinalDmgSrc || null, 유뢰법체Final, 현염법체Final,
    ncCR, ncCD, ncFinalCR, ncFinalCD,
    crIncPct, finalCRPct, crResPct, forceCrit: !!opts.forceCrit,
    cr: Math.min(cr, 100), cd, cMult,
    atkM, typeM, shintongM, ampM, dealtM, fmM, defMult,
    final: finalResult,
  };
  return finalResult;
}
// 히트 카운터 트리거 — 피해 입힐 때마다 호출. 활성 창(window)들의 임계치 체크
function tickHitCounters(s, n) {
  // [동허] (중광·투영): 30초간(max tier: 20+지수15) 5히트마다 defDebuff 7%/중첩 (최대 5)
  if (s.동허End > s.t && s.famSlots.중광) {
    s.동허히트 += n;
    while (s.동허히트 >= 5 && s.동허중첩 < 5) {
      s.동허히트 -= 5;
      s.동허중첩++;
      TRACE(s, 'OPT', `🟠동허 발동: 5히트 누적 → 방어력 -7% (${s.동허중첩}/5중첩)`);
      applyBuff(s, '중광투영_동허_' + s.동허중첩, { defDebuff: 7 }, 10);
    }
  }
  // [검영] (중광·환성): 30초간(max tier) 5히트마다 8% 물리 (최대 20회)
  if (s.검영End > s.t && s.famSlots.중광) {
    s.검영히트 += n;
    while (s.검영히트 >= 5 && s.검영발동 < 20) {
      s.검영히트 -= 5;
      s.검영발동++;
      TRACE(s, 'OPT', `🟠검영 발동: 5히트 누적 → 8% 물리 (${s.검영발동}/20회)`);
      const prev = s._currentSource; s._currentSource = '검영(트리거)';
      record(s, dealDamage(s, 8, { noSkillMult: true, type: '호무' }));
      s._currentSource = prev;
      // [파천] 검영 3회 발동마다 96% 물리 (max tier)
      s.파천카운터++;
      if (s.파천카운터 >= 3) {
        s.파천카운터 -= 3;
        TRACE(s, 'OPT', `🟠파천 발동: 검영 3회 → 96% 물리`);
        const p = s._currentSource; s._currentSource = '파천(트리거)';
        record(s, dealDamage(s, 96, { noSkillMult: true, type: '호무' }));
        s._currentSource = p;
      }
    }
  }
  // [열천] (사해·열천): 15초간 10히트마다 살혼 10% (max tier, 최대 10회)
  if (s.열천End > s.t && s.famSlots.사해) {
    s.열천히트 += n;
    while (s.열천히트 >= 10 && s.열천발동 < 10) {
      s.열천히트 -= 10;
      s.열천발동++;
      TRACE(s, 'OPT', `🟠열천 발동: 10히트 누적 → 살혼 10% (${s.열천발동}/10회)`);
      살혼발사(s, 10);
      // [마념] 열천 살혼 2회 시전마다 24% 술법 (max tier)
      s.마념카운터++;
      if (s.마념카운터 >= 2) {
        s.마념카운터 -= 2;
        TRACE(s, 'OPT', `🟠마념 발동: 열천 살혼 2회 → 24% 술법`);
        const p = s._currentSource; s._currentSource = '마념(트리거)';
        record(s, dealDamage(s, 24, { noSkillMult: true }));
        s._currentSource = p;
      }
    }
  }
}

// 법체 상성 +20% 배수 (기록 시점에 일괄 적용 — 스킬/평타/DoT/법보 모두)
function lawCounterMult(state) {
  if (!state.targetLawBody) return 1;
  const own뇌 = (state.catSlots.뇌전 || 0) >= 4;
  const own화 = (state.catSlots.화염 || 0) >= 4;
  const own검 = (state.catSlots.영검 || 0) >= 4;
  if ((own뇌 && state.targetLawBody === '화염') ||
      (own화 && state.targetLawBody === '영검') ||
      (own검 && state.targetLawBody === '뇌전')) {
    return 1.20;
  }
  return 1;
}
// DMG 라인에 붙일 활성 효과 요약 (자신 버프/디버프/자원)
function summarizeActiveEffects(state) {
  let atk = 0, inc = 0, amp = 0, finalDmg = 0, cr = 0, cd = 0;
  let defDeb = 0, crResDeb = 0;
  const selfBuffNames = [];
  const debuffNames = [];
  for (const b of state.buffs || []) {
    if (b.endT <= state.t) continue;
    const sc = b.stackCount || 1;
    if (b.atk) atk += b.atk * sc;
    if (b.inc) inc += b.inc * sc;
    if (b.amp) amp += b.amp * sc;
    if (b.finalDmg) finalDmg += b.finalDmg * sc;
    if (b.cr) cr += b.cr * sc;
    if (b.cd) cd += b.cd * sc;
    if (b.defDebuff) defDeb += b.defDebuff * sc;
    if (b.crRes) crResDeb += b.crRes * sc;
    const m = (b.key || '').match(/^(..)(..)_(.+)$/);
    const short = m ? `${m[2]}·${m[3]}${sc > 1 ? `×${sc}` : ''}` : b.key;
    if (b.defDebuff || b.crRes) debuffNames.push(short);
    else if (b.atk || b.inc || b.amp || b.finalDmg || b.cr || b.cd) selfBuffNames.push(short);
  }
  const parts = [];
  const stat = [];
  if (atk) stat.push(`atk+${atk.toFixed(0)}%`);
  if (inc) stat.push(`inc+${inc.toFixed(0)}%`);
  if (amp) stat.push(`amp+${amp.toFixed(0)}%`);
  if (finalDmg) stat.push(`최종+${finalDmg.toFixed(0)}%`);
  if (cr) stat.push(`cr+${cr.toFixed(0)}%`);
  if (cd) stat.push(`cd+${cd.toFixed(0)}%`);
  if (defDeb) stat.push(`def-${defDeb.toFixed(0)}%`);
  if (crResDeb) stat.push(`crRes-${crResDeb.toFixed(0)}%`);
  // 자원 상태
  const st = state.stacks || {};
  const rsc = [];
  if (st.검세) rsc.push(`검세${st.검세}`);
  if (st.검심) rsc.push(`검심${st.검심}`);
  if (state.stacks?.검심통명) rsc.push('검심통명');
  if (st.뇌인) rsc.push(`뇌인${st.뇌인}`);
  if (st.옥추) rsc.push(`옥추${st.옥추}`);
  if (st.신소) rsc.push(`신소${st.신소}`);
  if (st.작열) rsc.push(`작열${st.작열}`);
  if (state.buffs?.some(b => b.key === '열산상태' && b.endT > state.t)) rsc.push('열산');
  const 계약 = (typeof 계약합 === 'function') ? 계약합(state) : 0;
  if (계약) rsc.push(`계약${계약}`);
  const 독고 = state.독고 ? Object.values(state.독고).reduce((a,b)=>a+b,0) : 0;
  if (독고) rsc.push(`독고${독고.toFixed(1)}`);
  if (stat.length) parts.push(stat.join(','));
  if (rsc.length) parts.push(rsc.join(','));
  // 버프·디버프 이름은 길어서 생략; 필요 시 확장
  return parts.length ? ` ⟨${parts.join(' | ')}⟩` : '';
}

// 적용 레이어별 기여 버프 상세 나열 (breakdown에 부가)
function detailedBuffBreakdown(state, bd) {
  const cat = { 공격력: [], 유형피해: [], 신통피해: [], 심화피해: [], 입히는피해: [], 최종피해: [], cr: [], cd: [], crRes: [], def: [] };
  const isShintong = (bd?.type === '신통');
  // state.buffs
  for (const b of state.buffs || []) {
    if (b.endT <= state.t) continue;
    // shintongOnly 버프는 신통 피해에만 표시 (실제 계산도 그때만 적용됨)
    if (b.shintongOnly && !isShintong) continue;
    const sc = b.stackCount || 1;
    const m = (b.key || '').match(/^(..)(..)_(.+)$/);
    const short = m ? `${m[2]}·${m[3]}` : b.key;
    const tag = sc > 1 ? `${short}×${sc}` : short;
    if (b.atk) cat.공격력.push(`${tag}+${(b.atk * sc).toFixed(0)}`);
    if (b.inc) cat.신통피해.push(`${tag}+${(b.inc * sc).toFixed(0)}`);
    if (b.amp) cat.심화피해.push(`${tag}+${(b.amp * sc).toFixed(0)}`);
    if (b.finalDmg) cat.최종피해.push(`${tag}+${(b.finalDmg * sc).toFixed(0)}`);
    if (b.cr) cat.cr.push(`${tag}+${(b.cr * sc).toFixed(0)}`);
    if (b.cd) cat.cd.push(`${tag}+${(b.cd * sc).toFixed(0)}`);
    if (b.crRes) cat.crRes.push(`${tag}+${(b.crRes * sc).toFixed(0)}`);
    if (b.defDebuff) cat.def.push(`${tag}-${(b.defDebuff * sc).toFixed(0)}`);
    if (b.cat === 'inc' && b.dmgMult) cat.신통피해.push(`${tag}+${(b.dmgMult * sc).toFixed(0)}`);
    if (b.cat === 'amp' && b.dmgMult) cat.심화피해.push(`${tag}+${(b.dmgMult * sc).toFixed(0)}`);
    if (b.cat === 'dealt' && b.dmgMult) cat.입히는피해.push(`${tag}+${(b.dmgMult * sc).toFixed(0)}`);
  }
  // 자동 소스 (state.buffs 외 유파·공명·자원 기반 기여)
  if ((state.catSlots.화염 || 0) >= 2 && (state.stacks.작열 || 0) > 0) cat.공격력.push('현염법체2+9');
  // 영검법체4 는 buff '영검법체4' 로 등록되어 위 루프에서 자동 처리됨 (manual push 제거)
  // 신통피해 소스는 type='신통'일 때만 실제 적용됨 → 표시도 그때만
  const isShintongType = isShintong;
  if (isShintongType) {
    if ((state.catSlots.영검 || 0) >= 2) {
      const incContrib = 공명inc(state);
      if (incContrib) cat.신통피해.push(`공명영검2+${incContrib.toFixed(1)}`);
    }
    if (famActive(state, '옥추') && state.stacks.옥추) {
      cat.신통피해.push(`옥추×${state.stacks.옥추}+${state.stacks.옥추}`);
      cat.신통피해.push(`옥추유파+${state.famSlots.옥추 * 2.5}`);
    }
    if (famActive(state, '신소') && state.stacks.신소) cat.신통피해.push(`신소유파+${state.famSlots.신소 * 4}`);
    if (famActive(state, '참허') && state.stacks.검심통명) cat.신통피해.push(`참허유파+${state.famSlots.참허 * 3}`);
    if (famActive(state, '복룡') && hpBelow(state, 0.70)) cat.신통피해.push(`복룡유파+${state.famSlots.복룡 * 4}`);
    if (famActive(state, '주술')) {
      const 강 = (state.독고?.강체 || 0), 환 = (state.독고?.환체 || 0);
      if (강) cat.신통피해.push(`강체독고×${강.toFixed(0)}+${(강*2.5).toFixed(0)}`);
      if (환) cat.신통피해.push(`환체독고×${환.toFixed(0)}+${(환*2.5).toFixed(0)}`);
    }
  }
  // 공명뇌전2 / 뇌인 스택은 "신통 시전 시" → 신통 피해에만 표시
  if (isShintong) {
    if ((state.catSlots.뇌전 || 0) >= 2) cat.cr.push('공명뇌전2+11');
    if (famActive(state, '청명') && state.stacks.뇌인) cat.cr.push(`뇌인×${state.stacks.뇌인}+${state.stacks.뇌인 * 5}`);
  }
  // 불씨 세트 효과 표시 — 탑티어 값만 (state.불씨 또는 CFG.불씨 fallback)
  const 불씨Src = (state.불씨) || CFG.불씨 || {};
  if (isShintong) {
    const 통명값 = 불씨급수값(state, '통명묘화', [4, 6, 8]);
    if (통명값) cat.심화피해.push(`불씨·통명묘화(${불씨Src.통명묘화||0}/3)+${통명값}`);
    const 유리값 = 불씨급수값(state, '유리현화', [5, 10, 15]);
    if (유리값) cat.심화피해.push(`불씨·유리현화(${불씨Src.유리현화||0}/3)+${유리값}`);
    const 태값 = 불씨급수값(state, '태현잔화', [4, 6, 8]);
    if (태값) cat.입히는피해.push(`불씨·태현잔화(${불씨Src.태현잔화||0}/3)+${태값}(기댓값)`);
    if (state._진무절화소비) {
      cat.입히는피해.push(`불씨·진무절화(${불씨Src.진무절화||0}/6)+${state.진무절화스택}`);
    }
    const 진마Per = 불씨급수값(state, '진마성화', [1, 3, 3]);
    if (진마Per > 0 && state.진마성화스택 > 0) {
      cat.심화피해.push(`불씨·진마성화(${불씨Src.진마성화||0}/6)×${state.진마성화스택}/10 +${state.진마성화스택 * 진마Per}`);
    }
  }
  // local 옵션 기여
  if (bd?.localAtk) cat.공격력.push(`local+${bd.localAtk.toFixed(1)}`);
  if (bd?.localInc) cat.신통피해.push(`local+${bd.localInc}`);
  if (bd?.localAmp) cat.심화피해.push(`local+${bd.localAmp}`);
  if (bd?.localCR) cat.cr.push(`local+${bd.localCR}`);
  if (bd?.localCD) cat.cd.push(`local+${bd.localCD}`);
  if (bd?.localFinalCR) cat.cr.push(`localFinal+${bd.localFinalCR}`);
  if (bd?.localFinalCD) cat.cd.push(`localFinal+${bd.localFinalCD}`);
  // 최종피해 (신통만)
  if (bd?.type === '신통') {
    if (bd?.finalDmgPct) cat.최종피해.push(`nextCast+${bd.finalDmgPct.toFixed(0)}`);
    if (bd?.localFinalDmg) cat.최종피해.push(`${bd.localFinalDmgSrc || 'local'}+${bd.localFinalDmg.toFixed(0)}`);
    if (bd?.유뢰법체Final) cat.최종피해.push(`유뢰4법체+${bd.유뢰법체Final.toFixed(1)}`);
    if (bd?.현염법체Final) cat.최종피해.push(`현염4법체+${bd.현염법체Final.toFixed(0)}`);
  }
  // 유형별 피해 증가 (해당 피해 유형만)
  if (bd?.type === '천뢰') {
    if (famActive(state, '청명')) cat.유형피해.push(`청명유파+${state.famSlots.청명 * 10}`);
    if (state.buffs.some(b => b.key === '청명투진_투진' && b.endT > state.t)) cat.유형피해.push('투진+40');
  }
  if (bd?.type === '낙뢰') {
    if (famActive(state, '오뢰')) cat.유형피해.push(`오뢰유파+${state.famSlots.오뢰 * 10}`);
    if (state.buffs.some(b => b.key === '오뢰용음_낙뢰증폭' && b.endT > state.t)) cat.유형피해.push('용음·천뢰+80');
  }
  if (bd?.type === '작열DoT') {
    if (famActive(state, '이화')) cat.유형피해.push(`이화유파+${state.famSlots.이화 * 10}`);
    if (state.buffs.some(b => b.key === '이화염우_열염' && b.endT > state.t)) cat.유형피해.push('열염+50');
  }
  if (bd?.type === '작열폭발') {
    if (famActive(state, '형혹')) cat.유형피해.push(`형혹유파+${state.famSlots.형혹 * 10}`);
    if (famActive(state, '천로')) cat.유형피해.push(`천로유파+${state.famSlots.천로 * 15}`);
  }
  if (bd?.type === '염양' && famActive(state, '열산')) cat.유형피해.push(`열산유파+${state.famSlots.열산 * 10}`);
  if (bd?.type === '살혼' && famActive(state, '사해')) cat.유형피해.push(`사해유파+${state.famSlots.사해 * 10}`);
  if (bd?.type === '호무' && famActive(state, '중광')) cat.유형피해.push(`중광유파+${state.famSlots.중광 * 10}`);
  if (bd?.type === '천검' && famActive(state, '균천')) cat.유형피해.push(`균천유파+${state.famSlots.균천 * 10}`);
  if (bd?.localTypePct) cat.유형피해.push(`local+${bd.localTypePct}`);
  // 방어 감면 (화상·염양방감)
  if ((state.catSlots.화염 || 0) >= 2 && state.화상) cat.def.push(`화상×${state.화상}-${state.화상 * 2}`);
  if (state.염양방감) cat.def.push(`염양×${state.염양방감}-${state.염양방감 * 10}`);
  // 라인 구성
  const out = [];
  const push = (label, arr) => { if (arr.length) out.push(`${label}[${arr.join(', ')}]`); };
  push('공격력', cat.공격력);
  push('유형피해', cat.유형피해);
  push('신통피해', cat.신통피해);
  push('심화피해', cat.심화피해);
  push('입히는피해', cat.입히는피해);
  push('cr', cat.cr);
  push('cd', cat.cd);
  push('crRes', cat.crRes);
  push('def', cat.def);
  push('최종피해', cat.최종피해);
  return out.length ? out.join(' · ') : '(없음)';
}

// 호신강기 무시(bypassShield) 조건 — type / 기타 상태에 따라
function isBypassShield(state, bd) {
  if (!bd) return false;
  // 명시 플래그 최우선 (복룡·결운 [현검] 등)
  if (bd.bypassShield) return true;
  const t = bd.type;
  // type 기반: 호무/살혼/천검은 항상 본체 HP 직접
  if (t === '호무' || t === '살혼' || t === '천검') return true;
  // 확정 피해(bypassDef)도 호신강기 무시
  if (bd.bypassDef) return true;
  // 참허 검심통명 상태에서 신통 기본 피해는 호신강기 무시 (검심 키워드 원문)
  if (t === '신통' && state.stacks.검심통명) return true;
  return false;
}

function record(state, amount, source) {
  // 첫 신통-type record 시점 buff/stack snapshot 캡처 — UI SNAP 용 ("본 신통 DMG 적용 시점" 상태)
  // 호무/천뢰/작열 등 추가 데미지가 본 신통보다 먼저 record 되는 경우 (여명/동현/뇌벌 등),
  // 그 이후 본 신통 record 직전에 부여되는 buff (제월/귀진/검망 등) 도 SNAP 에 포함되도록
  // type==='신통' 인 record 까지 캡처 보류.
  // _inMainCast 가 true 일 때만 캡처 (pre-cast hook 의 폭파 record 는 무시)
  const _bdType = state._lastBreakdown && state._lastBreakdown.type;
  if (state._inMainCast && !state._snapBuffsCaptured && _bdType === '신통') {
    state._snapBuffsCaptured = true;
    state._snapBuffsAtDmg = state.buffs.map(b => ({
      key: b.key, endT: b.endT, stackCount: b.stackCount, maxStacks: b.maxStacks,
      atk: b.atk, cr: b.cr, cd: b.cd, crRes: b.crRes, defDebuff: b.defDebuff,
      cat: b.cat, dmgMult: b.dmgMult, dealt: b.dealt, shintongOnly: b.shintongOnly,
    }));
    state._snapStacksAtDmg = { ...state.stacks };
    // nextCast (현미/통백/풍세/파정 등) 은 dealDamage 가 이미 소비했으므로,
    // 본 cast 의 첫 신통 record 의 _lastBreakdown 에서 소비된 값을 보존.
    const bd = state._lastBreakdown || {};
    state._snapNextCastConsumed = {
      cr: bd.ncCR || 0,
      cd: bd.ncCD || 0,
      finalCR: bd.ncFinalCR || 0,
      finalCD: bd.ncFinalCD || 0,
      finalDmg: bd.finalDmgPct || 0,        // nextCast 의 finalDmg (다음 신통 류)
      localFinalDmg: bd.localFinalDmg || 0, // 본 cast 한정 finalDmg ([통백] 등)
      localFinalDmgSrc: bd.localFinalDmgSrc || null,
      consumedSources: (state._consumedNextCastSources || []).slice(),
    };
  }
  // 법체 상성 보너스 일괄 반영
  amount = amount * lawCounterMult(state);
  // 시간별 누적 피해 트래킹
  state.totalDmg = (state.totalDmg || 0) + amount;
  state.dmgEvents = state.dmgEvents || [];
  const src = source || state._currentSource || '?';
  // activeCast: 현재 진행 중인 신통 cast 이름 (cast 시작 시 설정, 종료 시 클리어)
  // 이 정보로 데미지 소스를 신통 단위로 그룹화 가능
  const activeCast = state._activeCast || null;
  state.dmgEvents.push({ t: state.t, amt: amount, src, activeCast });
  // === 호신강기/HP 풀 적용 ===
  const bd = state._lastBreakdown;
  const bypassShield = isBypassShield(state, bd);
  let shieldHit = 0, hpHit = 0;
  if (bypassShield) {
    hpHit = amount;
    state.hpRem = Math.max(0, (state.hpRem || 0) - amount);
  } else {
    const absorbed = Math.min(state.shieldRem || 0, amount);
    shieldHit = absorbed;
    state.shieldRem = (state.shieldRem || 0) - absorbed;
    const overflow = amount - absorbed;
    if (overflow > 0) {
      hpHit = overflow;
      state.hpRem = Math.max(0, (state.hpRem || 0) - overflow);
    }
  }
  // 히트 카운터 tick (기본 1히트, 멀티히트 스킬은 _recordHits에 설정)
  const hits = state._recordHits || 1;
  state._recordHits = 1; // 1회용 → 자동 리셋
  if (hits > 0) tickHitCounters(state, hits);
  let critStr;
  if (state._lastIsCrit === true) {
    critStr = ` 💥CRIT (cd=${state._lastCD.toFixed(0)}%)`;
  } else if (state._lastIsCrit === false) {
    critStr = ` (일반, cr굴림 실패/${state._lastCR.toFixed(1)}%)`;
  } else if (state._lastCR !== undefined) {
    critStr = ` cr기댓값=${state._lastCR.toFixed(1)}% cd=${state._lastCD.toFixed(0)}%`;
  } else {
    critStr = '';
  }
  const activeStr = summarizeActiveEffects(state);
  // 기여 버프 상세만 DMG 메시지에 개행으로 이어 붙임 (bd는 상단에서 이미 캡처)
  let breakdownStr = '';
  if (bd) {
    const detail = detailedBuffBreakdown(state, bd);
    const counter = lawCounterMult(state);
    const counterStr = counter > 1 ? `\n           └ 법체 상성 ×${counter.toFixed(2)} (상대=${state.targetLawBody})` : '';
    breakdownStr = `\n           └ 기여 버프: ${detail}${counterStr}`;
    state._lastBreakdown = null;
  }
  // 호신강기/HP 분포 태그
  let poolStr = '';
  if (bypassShield) poolStr = ` [HP직접 -${(hpHit/1e8).toFixed(2)}억]`;
  else if (shieldHit > 0 && hpHit > 0) poolStr = ` [호신강기 -${(shieldHit/1e8).toFixed(2)}억 / HP -${(hpHit/1e8).toFixed(2)}억]`;
  else if (shieldHit > 0) poolStr = ` [호신강기 -${(shieldHit/1e8).toFixed(2)}억]`;
  else if (hpHit > 0) poolStr = ` [HP -${(hpHit/1e8).toFixed(2)}억]`;
  const poolRemStr = ` (shield=${((state.shieldRem||0)/1e8).toFixed(2)}억, hp=${((state.hpRem||0)/1e8).toFixed(2)}억)`;
  TRACE(state, 'DMG', `[${src}] +${amount.toFixed(0)}${critStr}  (누적 ${state.totalDmg.toFixed(0)})${poolStr}${poolRemStr}${activeStr}${breakdownStr}`);
  // === 영검법체 4set 트리거: 신통으로 적을 명중 시 + HP 80% 이하 → 5초간 atk+20% buff ===
  // (사양: "신통으로 적을 명중 시, 대상의 현재 생명력 백분율이 80% 이하인 경우, 5초간 공격력이 20% 증가")
  // 명중 시 트리거이므로 DMG trace 후 발동. 단, 법보 cast 의 record 는 dealDamage 가 type 기본값 '신통' 으로
  // 처리되지만 사양상 '신통으로 명중 시' 가 아니므로 제외 (activeCast 가 '법보:' 로 시작하면 skip).
  if (bd && bd.type === '신통' && (state.catSlots.영검 || 0) >= 4 && hpBelow(state, 0.80)
      && !(state._activeCast && state._activeCast.startsWith('법보:'))) {
    applyBuff(state, '영검법체4', { atk: 20 }, 5);
  }
}

// 중복 명중/반사 감쇠: 이전 타의 90% 배수
// N회 히트 총 배수: (1 - 0.9^N) / 0.1
const DECAY_RATE = 0.1; // 90% 감폭 = 매 추가 타격이 이전의 10%만 유지
function multiHitMult(n) {
  if (n <= 1) return 1;
  return (1 - Math.pow(DECAY_RATE, n)) / (1 - DECAY_RATE);
}
// 사전 계산: N=2→1.9, 3→2.71, 4→3.439, 5→4.0951, 6→4.68559
const MH = { 2: multiHitMult(2), 3: multiHitMult(3), 4: multiHitMult(4), 5: multiHitMult(5), 6: multiHitMult(6) };

// 신통별 히트 수 (멀티히트 — 옥추 스택 획득 등 per-hit 트리거에 사용)
// 미지정 시 1회 히트로 간주. md의 "신통 효과" 공격 횟수 기준.
const SKILL_HITS = {
  // 영검 복룡
  '복룡·결운': 4,      // "지정한 적을 4회 공격"
  // 영검 균천
  '균천·진악': 1,      // 3명 광역 1타
  '균천·현봉': 4,      // "지정한 적을 4회 공격"
  '균천·파월': 1,      // 3명 광역 1타
  '균천·관일': 5,      // "지정한 적을 5회 공격"
  // 영검 참허
  '참허·횡추': 5,      // "지정한 적을 5회 공격"
  '참허·단진': 4,      // "지정한 적을 4회 공격"
  // 영검 중광
  '중광·귀사': 5,      // "지정한 적을 5회 공격"
  '중광·투영': 4,      // "지정한 적을 4회 공격"
  '중광·육요': 6,      // "지정한 적을 6회 공격"
  '중광·환성': 4,      // 4명 (중복 명중)
  // 화염 열산
  '열산·염폭': 3,      // 3명 (중복)
  '열산·양운': 4,      // 4명 4회
  '열산·성료': 4,      // 4명 (중복)
  // 화염 형혹
  '형혹·업화': 4,      // 4명 (중복)
  '형혹·함양': 4,      // 4명 (중복)
  // 화염 이화
  '이화·풍권': 3,      // 3명 (중복)
  '이화·삼매': 5,      // 3명 5회 공격
  // 화염 천로
  '천로·단주': 4,      // 4명 (중복)
  '천로·직염': 4,      // 4명 (중복)
  '천로·유형': 4,      // 4명 (중복)
  // 뇌전 청명
  '청명·투진': 6,      // 6회 반사
  '청명·천노': 5,      // 3명 5회 공격
  '청명·붕운': 5,      // 3명 5회 공격
  '청명·풍뢰': 5,      // 3명 5회 공격 ← 누락되어 있던 항목
  // 뇌전 옥추
  '옥추·황룡': 4,      // 4명 4회 공격
  '옥추·소명': 6,      // 6회 반사
  '옥추·청사': 4,      // 4회 반사
  // 뇌전 오뢰
  '오뢰·천강': 6,      // 6회 반사
  '오뢰·경칩': 4,      // 4명 4회
  '오뢰·용음': 3,      // 3명 (중복)
  // 뇌전 신소
  '신소·천고': 3,      // 3명 3회
  '신소·환뢰': 4,      // 4회 반사
  '신소·청삭': 6,      // 6회 반사
  // 백족 주술
  '주술·태사': 3,      // 3명
  '주술·경선': 2,      // 3명 2회
  '주술·유식': 4,      // 지정 4회
  // 백족 사해
  '사해·폭우': 5,      // 지정 5회
  '사해·명화': 3,      // 3명 (중복)
};

// ======================== 스킬 DB ========================
// 각 스킬: { fam, main, mainType, cast(state, slotsInFam) }
// cast 함수는 main + sect 트리거 + cult 4옵션 효과를 실행한다.
const SK = {};

// ---------- 영검: 복룡 (저체력 특화) ----------
SK['복룡·절화'] = {
  fam: '복룡', cat: '영검', main: 135,
  cast(s, slots) {
    const f = hpLowFactor(s);
    const hpPct = (hpRatio(s) * 100).toFixed(0);
    // [둔검] 방어력 25~35% (max tier, 저체력 스케일)
    const dun = 25 + 10 * f;
    TRACE(s, 'BUF', `🔻디버프 [복룡·절화 → 둔검] def-${dun.toFixed(1)}% 10초 (저체력 스케일, HP ${hpPct}%)`);
    applyBuff(s, '복룡절화_둔검', { defDebuff: dun }, 10);
    // [파세] crRes 30% 15초 (max tier)
    applyBuff(s, '복룡절화_파세', { crRes: 30 }, 15);
    // [검흔] 방어력 30% 추가 감소 (max tier)
    applyBuff(s, '복룡절화_검흔', { defDebuff: 30 }, 10);
    // [검현] HP 50% 이하 시 atk 40% (max tier)
    if (hpBelow(s, 0.50)) {
      TRACE(s, 'BUF', `🔼버프 [복룡·절화 → 검현] 발동: HP ${hpPct}% ≤ 50% → atk+40% 10초`);
      applyBuff(s, '검현', { atk: 40 }, 10);
    }
    record(s, dealDamage(s, 135));
  }
};
SK['복룡·약영'] = {
  fam: '복룡', cat: '영검', main: 135,
  cast(s, slots) {
    const f = hpLowFactor(s);
    const hpPct = (hpRatio(s) * 100).toFixed(0);
    // === 시전 시 buff (조건 없음) — 본 신통 record 전 부여하여 본 신통에 반영 ===
    // [능허] 5초간 atk 20~30% (max tier, 저체력 선형 스케일)
    const neung = 20 + 10 * f;
    applyBuff(s, '복룡약영_능허', { atk: neung }, 5);
    // [통찰] 15초간 cr +30 (max tier)
    applyBuff(s, '복룡약영_통찰', { cr: 30 }, 15);
    // [축세] 5초간 atk +20 (max tier)
    applyBuff(s, '복룡약영_축세', { atk: 20 }, 5);
    // [현미] HP 60% 이하 조건은 시전 시점 (본 신통 record 전 HP) 으로 검사 — 본 신통이 HP 를 더 깎기 전 기준
    const 현미발동 = hpBelow(s, 0.60);
    // === 본 신통 ===
    record(s, dealDamage(s, 135));
    // [현미] 발동 시 다음 신통 최종피해 +45% (max tier) — nextCast 1회용
    // 부여(nextCast.finalDmg 설정) 는 record 후에 해야 자기 record 가 소비하지 않고 다음 cast 가 받음.
    if (현미발동) {
      s.nextCast.finalDmg += 45;
      s._nextCastSources = s._nextCastSources || [];
      s._nextCastSources.push({ key: '복룡·약영 → 현미', pct: 45, field: 'finalDmg', msg: `HP ${hpPct}% ≤ 60% → 다음 신통 최종피해 +45%` });
    }
  }
};
SK['복룡·결운'] = {
  fam: '복룡', cat: '영검', main: 172,
  cast(s, slots) {
    const hpPct = (hpRatio(s) * 100).toFixed(0);
    // [파군] 방어력 30% 감소 10초 (max tier)
    applyBuff(s, '복룡결운_파군', { defDebuff: 30 }, 10);
    // [현검] 본 신통 호신강기 무시 + 기본 피해 계수 +40% + [천균] +40% = 총 +80% → ×1.8
    let base = 172 * 1.8;
    // [검세] HP 60% 이하 시 최종피해 45% (max tier)
    if (hpBelow(s, 0.60)) {
      TRACE(s, 'BUF', `🔼버프 [복룡·결운 → 검세] 발동: HP ${hpPct}% ≤ 60% → 이번 cast 최종피해 ×1.45`);
      base *= 1.45;
    }
    // [현검] 호신강기 무시 → type:'호무' (그러나 신통 피해/심화피해/최종피해 버킷은 정상 적용받아야 하므로
    // noSkillMult 플래그는 쓰지 않음. 대신 bypassShield를 위해 type만 지정)
    // 단, dealDamage의 isShintong 플래그는 type==='신통'일 때만 true라, type:'호무'로 바꾸면
    // 신통피해 버킷이 날아감 → 커스텀 플래그 bypassShield 도입.
    record(s, dealDamage(s, base, { bypassShield: true }));
  }
};
SK['복룡·붕산'] = {
  fam: '복룡', cat: '영검', main: 135,
  cast(s, slots) {
    const f = hpLowFactor(s);
    const hpPct = (hpRatio(s) * 100).toFixed(0);
    // [검혼] 피해 15~25% 증가 (max tier, 저체력 선형 스케일)
    const geom = 15 + 10 * f;
    TRACE(s, 'BUF', `🔼버프 [복룡·붕산 → 검혼] 이번 cast 피해 +${geom.toFixed(1)}% (저체력 스케일, HP ${hpPct}%)`);
    let base = 135 * (1 + geom / 100);
    // [참선] HP 50% 이하 시 반드시 치명타 + cd 50%
    const forceC = hpBelow(s, 0.50);
    if (forceC) TRACE(s, 'BUF', `🔼버프 [복룡·붕산 → 참선] 발동: HP ${hpPct}% ≤ 50% → 치명타 확정 + cd+50% (이번 cast)`);
    // [신력] atk +20% 5초 (max tier) — 시전 시 buff, record 전 부여
    applyBuff(s, '복룡붕산_신력', { atk: 20 }, 5);
    // [통백] "본 신통으로 입히는 최종 피해 +20%" — local 적용 (nextCast 가 아닌 본 cast 한정)
    // 타임라인 가시성을 위해 BUF trace 도 emit (검혼/참선 패턴과 동일, "이번 cast 한정")
    TRACE(s, 'BUF', `🔼버프 [복룡·붕산 → 통백] 본 신통 최종 피해 +20% (이번 cast 한정)`);
    record(s, dealDamage(s, base, { forceCrit: forceC, localCD: forceC ? 50 : 0, localFinalDmg: 20, localFinalDmgSrc: '복룡·붕산 → 통백' }));
  }
};

// ---------- 영검: 균천 (검세·천검) ----------
function 천검발동(s, slots, ampPct = 0, srcTag = '천검') {
  TRACE(s, 'TRG', `천검발동 (검세=${s.stacks.검세||0}, +${ampPct}% 증폭, 검망남은=${s.검망남은||0}, src=${srcTag})`);
  const prevSrc = s._currentSource;
  s._currentSource = srcTag;
  s.castCounts = s.castCounts || {};
  s.castCounts['천검'] = (s.castCounts['천검'] || 0) + 1;
  // 천검: 대상+주변 3명, 3회 공격, 총 60~120% 호무 피해 (저체력 선형 스케일)
  // 명세상 "총" 피해이므로 × 3 중복 없음. 중복명중 감쇠도 이미 합산값 기준.
  // 유파 효과: 장착 1개당 +10% → slots×10%
  // HP 100%→60%, HP 0%→120%, 실시간 HP 기반 선형 보간
  const base = 60 + 60 * hpLowFactor(s);
  const mult = 1 + slots * 10 / 100;
  let amp = 1 + ampPct / 100;
  // 관일·[검망]: 천검 발동 시 발동 (max tier: 3회 + [쇄일] +3회 = 6회)
  //   [검망] 효과: 입히는 피해 +40% (general dealt buff, 5초) + 검세 +1
  //   [쇄일] 효과: 검망 발동 시 천검 자체 피해 +20%
  if (s.검망남은 > 0) {
    const used = (s.검망max || 6) - s.검망남은 + 1;
    TRACE(s, 'OPT', `🟠관일·검망 발동: 천검 → 입히는 피해 +40% 5s (general) + 천검 ×1.20 (쇄일) + 검세 +1 (${used}/${s.검망max || 6}회)`);
    s.검망남은--;
    // [검망] dealt +40% buff 5초 (전체 입히는 피해)
    // 천검 자체 record 가 아직 안 일어났으므로 이번 천검 데미지에 대해서는 pre-DMG 부여.
    // host cast 의 record 후 시점이라 _snapBuffsCaptured=true 일 수 있는데, 그대로 두면
    // applyBuff 가 [post] 태그를 붙여 타임라인에서 +0.4s offset 표시됨 → 잘못된 시각.
    // 천검 발동 시점=실제 적용 시점이므로 임시로 snap flag 해제하여 [post] 태그 방지.
    const _prevSnap = s._snapBuffsCaptured;
    s._snapBuffsCaptured = false;
    // key 포맷 "균천관일_검망" → applyBuff 가 자동으로 "[균천·관일 → 검망]" 형식 로그 생성
    // (lookupOption 의 포맷 1 로 파싱되어 옵션 desc 자동 매칭됨)
    applyBuff(s, '균천관일_검망', { cat: 'dealt', dmgMult: 40 }, 5);
    s._snapBuffsCaptured = _prevSnap;
    // [쇄일] 천검 dmg +20% (이번 천검 한정 — 다음 데미지엔 적용 X)
    // 실제 buff 등록은 안 함 (다음 데미지에 잘못 적용 방지). 타임라인 시각화 용도로만 BUF trace 찍음.
    TRACE(s, 'BUF', `🔼버프 [균천·관일 → 쇄일] 천검 dmg ×1.20 (이번 천검 한정)`);
    amp *= 1.20;
    // 검세 +1
    if (s.famSlots.균천) 검세획득_균천(s, s.famSlots.균천, 1);
  }
  // 천검은 호신강기 무시 — type:'천검' 으로 처리
  record(s, dealDamage(s, base * mult * amp, { noSkillMult: true, type: '천검' }));
  s._currentSource = prevSrc;
}
function 검세획득_균천(s, slots, n = 1) {
  if (!famActive(s, '균천')) return;
  addStackTTL(s, '검세', n, 10, 20);
  // 검세 3회 획득마다 천검 발동 (누적 counter, 염양 스타일)
  // TTL로 스택이 사라져도 누적 획득 카운트는 유지되어 다음 3회차에 다시 발동
  s.검세획득카운터 = (s.검세획득카운터 || 0) + n;
  while (s.검세획득카운터 >= 3) {
    s.검세획득카운터 -= 3;
    천검발동(s, slots);
  }
}
SK['균천·진악'] = {
  fam: '균천', cat: '영검', main: 225,
  cast(s, slots) {
    const js = s.stacks.검세;
    // === "본 신통 시전 시" 트리거 (본 신통 record 전) ===
    // [종식] 검세 3+ 시: 즉시 천검 + atk 30% 10s (max tier)
    if (js >= 3) {
      TRACE(s, 'OPT', `🟠진악·종식 발동: 검세 ${js}중첩 ≥ 3 → 즉시 천검 발동 + atk 30% 10s`);
      applyBuff(s, '균천진악_종식', { atk: 30 }, 10);
      천검발동(s, slots, 0, '천검(종식)');
    }
    // [진악] 검세당 30% 호무 1회 추가 (max 5회, max tier)
    const 진악Cnt = Math.min(js, 5);
    if (진악Cnt > 0) TRACE(s, 'OPT', `🟠진악·진악 발동: 검세 ${진악Cnt}중첩 → 30% 호무 ×${진악Cnt}`);
    for (let i = 0; i < 진악Cnt; i++) {
      record(s, dealDamage(s, 30, { noSkillMult: true, type: '호무' }), `진악(호무) ${i+1}/${진악Cnt}`);
    }
    // [동현] 50% 호무 × 2회 (max tier)
    TRACE(s, 'OPT', `🟠진악·동현 발동: 50% 호무 ×2`);
    for (let i = 0; i < 2; i++) {
      record(s, dealDamage(s, 50, { noSkillMult: true, type: '호무' }), `동현(호무) ${i+1}/2`);
    }
    // [절학] 검세 5+ 시 105% 호무 × 2회 (max tier)
    if (js >= 5) {
      TRACE(s, 'OPT', `🟠진악·절학 발동: 검세 ${js}중첩 ≥ 5 → 105% 호무 ×2`);
      for (let i = 0; i < 2; i++) {
        record(s, dealDamage(s, 105, { noSkillMult: true, type: '호무' }), `절학(호무) ${i+1}/2`);
      }
    }
    // === 본 신통 (술법 일반 피해) ===
    record(s, dealDamage(s, 225));
  }
};
SK['균천·현봉'] = {
  fam: '균천', cat: '영검', main: 252,
  cast(s, slots) {
    const js = s.stacks.검세;
    // === "본 신통 시전 시" 트리거 (본 신통 record 전) ===
    // [현봉] 검세당 본 신통 피해 +3% (max tier, 이번 cast 한정)
    const selfMult = 1 + js * 3 / 100;
    if (js > 0) TRACE(s, 'BUF', `🔼버프 [균천·현봉 → 현봉] 본 신통 피해 +${(js * 3).toFixed(0)}% (검세 ${js}중첩, 이번 cast 한정)`);
    // [새벽빛] 검세 3+ 시 140% 호무 추가 (max tier)
    if (js >= 3) {
      TRACE(s, 'OPT', `🟠현봉·새벽빛 발동: 검세 ${js}중첩 ≥ 3 → 140% 호무 추가`);
      record(s, dealDamage(s, 140, { noSkillMult: true, type: '호무' }), '새벽빛(호무)');
    }
    // [남월] 검세 5+ 시 천검 +80% 증폭 (max tier)
    if (js >= 5) {
      TRACE(s, 'OPT', `🟠현봉·남월 발동: 검세 ${js}중첩 ≥ 5 → 즉시 천검 발동 (천검 +80% 증폭)`);
      천검발동(s, slots, 80, '천검(남월)');
    }
    // [절진] crRes 20% 10s (max tier) — "본 신통으로 명중 시" debuff, 본 신통 record 직전 부여 (본 신통이 디버프 받도록)
    applyBuff(s, '균천현봉_절진', { crRes: 20 }, 10);
    // === 본 신통 (물리, 현봉 +3%/검세) ===
    record(s, dealDamage(s, 252 * selfMult));
    // === 본 신통 명중 후 추가 데미지 ===
    // [절진] 60% 호무 추가 — 명중 시 트리거
    record(s, dealDamage(s, 60, { noSkillMult: true, type: '호무' }), '절진(호무)');
  }
};
SK['균천·파월'] = {
  fam: '균천', cat: '영검', main: 225,
  cast(s, slots) {
    // [파월] (신통 시전 시, 리필 창) — pre-DMG 섹션에서 reset+fire 처리됨 ([광염] 패턴)
    // [제월] (즉시, 조건 없음) — pre-DMG 섹션에서 [파월] 보다 먼저 처리됨 (시전 시 보다 빠름)
    // === "본 신통 시전 시" 트리거 (본 신통 record 전 — 추가 데미지 + 검세) ===
    // [여명] 100% 호무 추가 + 검세 +1 (max tier)
    record(s, dealDamage(s, 100, { noSkillMult: true, type: '호무' }), '여명(호무)');
    검세획득_균천(s, slots, 1);
    // === "본 신통으로 적을 명중 시" 트리거 — 본 신통 record 직전 buff 부여 ===
    // [귀진] def-20% 10s (max tier)
    applyBuff(s, '균천파월_귀진', { defDebuff: 20 }, 10);
    // === 본 신통 ===
    record(s, dealDamage(s, 225));
    // === 본 신통 명중 후 ===
    // [귀진] 60% 호무 추가 — 본 신통 명중 후 추가 데미지 1회
    record(s, dealDamage(s, 60, { noSkillMult: true, type: '호무' }), '귀진(호무)');
  }
};
SK['균천·관일'] = {
  fam: '균천', cat: '영검', main: 250,
  cast(s, slots) {
    // [검망]/[쇄일] 은 관일 cast 와 무관 — "천검 발동 시" 트리거만 보면 됨.
    //   초기화는 simulateBuild 에서 1회, 이후 사이클 (45초) 마다 리셋 (event loop).
    record(s, dealDamage(s, 250));
    s.관일End = s.t + 15;
    s.관일종료처리 = false;
    // [관일] 40% 호무 + 검세 +1 (max tier)
    const prevSrc = s._currentSource;
    s._currentSource = '관일(지속)';
    record(s, dealDamage(s, 40, { noSkillMult: true, type: '호무' }));
    s._currentSource = prevSrc;
    if (s.famSlots.균천) 검세획득_균천(s, s.famSlots.균천, 1);
    s._관일이미처리 = true;
  }
};

// ---------- 영검: 참허 (검심통명) ----------
function 검심획득(s, n = 1) {
  if (!famActive(s, '참허')) return;
  // 검심 10 도달 시 -10 차감 + 검심통명 진입 (초과분 보존)
  // 예: 9 + 2 = 11 → -10 = 1
  addStack(s, '검심', n, Infinity);
  while (s.stacks.검심 >= 10) {
    s.stacks.검심 -= 10;
    TRACE(s, 'STK', `검심 -10 (검심통명 진입), 잔여=${s.stacks.검심}`);
    applyBuff(s, '검심통명', { dmgMult: 20, cat: 'inc' }, 10);
    s.stacks.검심통명 = 1;
  }
  // [참허·분광 응현] 15초 창, 검심 획득 시 atk+8 5s (최대 5회)
  if (s.응현End > s.t && (s.응현발동 || 0) < 5) {
    applyBuff(s, '참허분광_응현', { atk: 8 }, 5, 5);
    s.응현발동 = (s.응현발동 || 0) + 1;
  }
}
SK['참허·횡추'] = {
  fam: '참허', cat: '영검', main: 200,
  cast(s, slots) {
    검심획득(s, 1);
    // [횡추] 본 신통 15~30% 피해 증가 (저체력 선형)
    const base = 200 * (1.15 + 0.15 * hpLowFactor(s));
    // [현의] cr 30% 15초
    applyBuff(s, '참허횡추_현의', { cr: 30 }, 15);
    record(s, dealDamage(s, base));
    // [연봉] 50% 호무, 검심통명 시 +50% 추가 (= 100%)
    const cm = s.stacks.검심통명 ? 1 : 0;
    record(s, dealDamage(s, 50 * (1 + cm), { noSkillMult: true, type: '호무' }), '연봉(호무)');
    // [단천] HP 60% 이하 시 160% 호무
    if (hpBelow(s, 0.60)) record(s, dealDamage(s, 160, { noSkillMult: true, type: '호무' }), '단천(호무)');
  }
};
SK['참허·단진'] = {
  fam: '참허', cat: '영검', main: 200,
  cast(s, slots) {
    // [단진+연광] 리필 창은 pre-DMG 섹션에서 reset+fire (자기 cast 포함, [광염] 패턴)
    // [참파] 본 신통 명중 시 atk 20% 5s
    applyBuff(s, '참허단진_참파', { atk: 20 }, 5);
    // [참멸] 검심 +2 + def-30% 10s
    검심획득(s, 2);
    applyBuff(s, '참허단진_참멸', { defDebuff: 30 }, 10);
    // 본 신통
    record(s, dealDamage(s, 200));
    // [참파] 40% 호무 추가 (본 신통 명중 시 1회)
    record(s, dealDamage(s, 40, { noSkillMult: true, type: '호무' }), '참파(호무)');
  }
};
SK['참허·엄동'] = {
  fam: '참허', cat: '영검', main: 180,
  cast(s, slots) {
    검심획득(s, 1);
    const cm = s.stacks.검심통명 ? 1 : 0;
    // [응세] 본 신통 피해 +15%, 검심통명 시 +15% 추가 (= +30)
    const selfMult = 1 + (cm ? 30 : 15) / 100;
    TRACE(s, 'BUF', `🔼버프 [참허·엄동 → 응세] 본 신통 피해 +${cm ? 30 : 15}% (이번 cast 한정${cm ? ', 검심통명 +15%' : ''})`);
    // [참심] 검심통명 시 본 신통 최종 cr +60
    const localFinalCR = cm ? 60 : 0;
    if (cm) TRACE(s, 'BUF', `🔼버프 [참허·엄동 → 참심] 본 신통 최종 cr +60% (검심통명, 이번 cast 한정)`);
    // [검식] crRes 25~40% 15초 저체력 스케일
    applyBuff(s, '참허엄동_검식', { crRes: 25 + 15 * hpLowFactor(s) }, 15);
    // 본 신통
    record(s, dealDamage(s, 180 * selfMult, { localFinalCR }));
    // [엄동] 60% 호무, 검심통명 시 +1회 추가 (총 120%)
    record(s, dealDamage(s, 60, { noSkillMult: true, type: '호무' }), '엄동(호무)');
    if (cm) record(s, dealDamage(s, 60, { noSkillMult: true, type: '호무' }), '엄동·통명(호무)');
  }
};
SK['참허·분광'] = {
  fam: '참허', cat: '영검', main: 180,
  cast(s, slots) {
    // [응현] 15초 창 먼저 열어둠 — 이후 검심획득() 헬퍼에서 atk+8 5s (max 5회) 트리거
    s.응현End = s.t + 15;
    s.응현발동 = 0;
    // [분광+검백] 30초 창, 시전마다 검심+1 + 24% 호무
    s.분광End = s.t + 30;
    검심획득(s, 1);
    // 본 cast 즉시 24% 호무 1회
    const prevSrc = s._currentSource;
    s._currentSource = '분광(지속)';
    record(s, dealDamage(s, 24, { noSkillMult: true, type: '호무' }));
    s._currentSource = prevSrc;
    s._분광이미처리 = true;
    // 본 신통
    record(s, dealDamage(s, 180));
    // [참공] 80% 호무 추가 1회
    record(s, dealDamage(s, 80, { noSkillMult: true, type: '호무' }), '참공(호무)');
  }
};

// ---------- 영검: 중광 (호신강기 무시) ----------
// 중광 유파 효과: dealDamage(type:'호무') 시 sumTypeDmg가 자동으로 slot×10% 적용
// (이중 곱셈 방지 — skill 코드에서 별도 배율 곱하지 않음)
function 호무mult(s) { return 1; } // 레거시 보존, 실제 효과 없음
SK['중광·귀사'] = {
  fam: '중광', cat: '영검', main: 150,
  cast(s, slots) {
    // [통찰] cr 30% 15s — 시전 시 buff, record 전 부여
    applyBuff(s, '중광귀사_통찰', { cr: 30 }, 15);
    // 본 신통 (물리 일반)
    record(s, dealDamage(s, 150));
    // [여영] 36% 호무 × 2회 + [유광 max: +3회] = 총 5회
    for (let i = 0; i < 5; i++) {
      record(s, dealDamage(s, 36, { noSkillMult: true, type: '호무' }), '여영(호무)');
    }
    // [관일] HP 60% 이하 시 160% 호무 1회
    if (hpBelow(s, 0.60)) record(s, dealDamage(s, 160, { noSkillMult: true, type: '호무' }), '관일(호무)');
  }
};
SK['중광·투영'] = {
  fam: '중광', cat: '영검', main: 152,
  cast(s, slots) {
    // [동허] 30초 창 (15+지수15), 5히트마다 defDebuff 7% max 5중첩
    s.동허End = s.t + 30;
    s.동허히트 = 0;
    s.동허중첩 = 0;
    // 본 신통
    record(s, dealDamage(s, 152));
    // [봉예] 32% 호무 1회
    record(s, dealDamage(s, 32, { noSkillMult: true, type: '호무' }), '봉예(호무)');
    // [검홍] HP 60% 이하 시 동허 발동당 18% 호무 × max 20회 (기댓값 합산)
    if (hpBelow(s, 0.60)) record(s, dealDamage(s, 18 * 20, { noSkillMult: true, type: '호무' }), '검홍(호무)');
  }
};
SK['중광·육요'] = {
  fam: '중광', cat: '영검', main: 150,
  cast(s, slots) {
    // [검광] 30초 창 (15+검심15), 명중 시마다 23% 호무
    s.검광End = s.t + 30;
    s._검광이미처리 = true;
    // [신력] atk 20% 5s — 시전 시 buff, record 전 부여
    applyBuff(s, '중광육요_신력', { atk: 20 }, 5);
    // [한광] HP 60% 이하 시 atk 20% 5s — 조건부 시전 시 buff
    if (hpBelow(s, 0.60)) applyBuff(s, '중광육요_한광', { atk: 20 }, 5);
    const prev = s._currentSource; s._currentSource = '검광(트리거)';
    record(s, dealDamage(s, 23, { noSkillMult: true, type: '호무' }));
    s._currentSource = prev;
    // 본 신통
    record(s, dealDamage(s, 150));
  }
};
SK['중광·환성'] = {
  fam: '중광', cat: '영검', main: 128,
  cast(s, slots) {
    // [검영] 30초 창 (15+검의15), 5히트마다 8% 호무 max 20회
    s.검영End = s.t + 30;
    s.검영히트 = 0;
    s.검영발동 = 0;
    s.파천카운터 = 0;
    s._recordHits = 4;
    // 본 신통 (4명 중복, MH[4])
    record(s, dealDamage(s, 128 * MH[4]));
    // [봉예] 32% 호무 1회
    record(s, dealDamage(s, 32, { noSkillMult: true, type: '호무' }), '봉예(호무)');
  }
};

// ---------- 화염: 열산 ----------
function prune염양방감(s) {
  if (s.염양방감 > 0 && s.염양방감EndT <= s.t) { s.염양방감 = 0; }
}
function 염양발동(s, slots) {
  // 80% × (1 + slots×10%) — 3명 4회 공격, 총 80% 피해
  // _분겁보정: 열산·염폭 [분겁] 발동 시 이번 염양 피해 +50% (max tier)
  const mult = 1 + slots * 10 / 100;
  const slotPct = slots * 10;
  const 분겁보정 = s._분겁보정 || 1;
  const total = 80 * mult * 분겁보정;
  TRACE(s, 'OPT', `🔥염양 발동: 80% × ${mult.toFixed(1)}(열산${slots}슬롯 +${slotPct}%)${분겁보정 > 1 ? ' ×1.5(분겁)' : ''} = ${total.toFixed(0)}%`);
  record(s, dealDamage(s, total, { noSkillMult: true }), '염양(유파)');
  // [순일·진공] 염양 발동 시 작열 1중첩 추가 (최대 4회)
  // [순일·순일+분궁] 염양 발동 시 30% 물리 1회 (최대 4회: 3+분궁1)
  if (s.selectedSkills && s.selectedSkills.has('열산·순일')) {
    if ((s.진공남은 || 0) > 0) {
      const used = (s.진공max || 4) - s.진공남은 + 1;
      TRACE(s, 'OPT', `🟠순일·진공 발동: 염양 조건 충족 → 작열 1중첩 62% (${used}/${s.진공max || 4}회)`);
      s.진공남은--;
      작열부여(s, 1, 62, '순일·진공');
    }
    if ((s.순일남은 || 0) > 0) {
      const used = (s.순일max || 5) - s.순일남은 + 1;
      // [순일+분궁 max] 40+20=60% 물리 (분궁 계수 +20% 덧셈)
      TRACE(s, 'OPT', `🟠순일·순일+분궁 발동: 염양 조건 충족 → 60% 물리 1회 (${used}/${s.순일max || 5}회)`);
      s.순일남은--;
      record(s, dealDamage(s, 40 + 20, { noSkillMult: true }), '순일');
    }
  }
  // [양운·양운] 염양 발동 시 atk 15% 5초 max5 (max tier)
  if (s.selectedSkills && s.selectedSkills.has('열산·양운')) {
    TRACE(s, 'OPT', `🟠양운·양운 발동: 염양 조건 충족 → atk +15% 5초 (최대 5중첩)`);
    applyBuff(s, '열산양운_양운', { atk: 15 }, 5, 5);
    if ((s.진염남은 || 0) > 0) {
      const used = (s.진염max || 3) - s.진염남은 + 1;
      TRACE(s, 'OPT', `🟠양운·진염 발동: 염양 조건 충족 → 60% 물리 1회 (${used}/${s.진염max || 3}회)`);
      s.진염남은--;
      record(s, dealDamage(s, 60, { noSkillMult: true }), '진염');
    }
  }
  // 방어력 10% 감소 디버프 (최대 3중첩, 10초)
  prune염양방감(s);
  const prev방감 = s.염양방감;
  s.염양방감 = Math.min(s.염양방감 + 1, 3);
  s.염양방감EndT = s.t + 10;
  TRACE(s, 'BUF', `🔻염양 방감 디버프: 방어력 -${s.염양방감 * 10}% (${prev방감}→${s.염양방감}중첩, 최대3) 10초`);
}
function 작열부여(s, n, perTick = 25, source) {
  // 이화 유파 slot 보너스, 열염 등은 add작열 → dealDotDamage 의 sumTypeDmg 에서 자동 합산.
  // 여기선 basePct 만 전달 (중복 방지).
  const src = source || s._currentSource || '?';
  for (let i = 0; i < n; i++) {
    add작열(s, perTick, 20, src); // basePct 저장, 1틱 피해는 add작열 내부에서 스냅샷
    // 매 stack 마다 STK trace 발생 (시간 순서 보존: stack → 폭파 → 염양 발동 순)
    const cnt = famActive(s, '열산') ? s.작열부여카운터 + 1 : 0;
    const cntStr = famActive(s, '열산') ? ` (부여카운터 ${cnt}/6)` : '';
    TRACE(s, 'STK', `🔥작열 +1 [${src}] → 현재 ${s.stacks.작열}중첩${cntStr}`);
    // 현염법체 기본(화 2+): 작열 부여 시 화상 1중첩 자동 부여
    화상부여(s, 1);
    // [형혹 유파] 작열 1중첩 부여할 때마다 60% 확률 폭파 (형혹 ≥2)
    if (famActive(s, '형혹') && seededRand(s) < 0.60) {
      폭파(s);
    }
    // [열산 유파] 신규 작열 6회 부여할 때마다 염양 발동 + 열산 상태 진입 (동시) (열산 ≥2)
    if (famActive(s, '열산')) {
      s.작열부여카운터++;
      while (s.작열부여카운터 >= 6) {
        s.작열부여카운터 -= 6;
        // 열산 상태 진입 먼저 — 염양 DMG 가 열산 +10% amp 를 받도록
        TRACE(s, 'OPT', `⚡️열산 유파: 작열 6중첩 부여 달성 → 열산 상태 진입 + 염양 발동`);
        applyBuff(s, '열산상태', { cat: 'amp', dmgMult: 10 }, 10);
        염양발동(s, s.famSlots.열산);
      }
    }
  }
}
function 열산상태(s) {
  return s.buffs.some(b => b.key === '열산상태' && b.endT > s.t);
}
SK['열산·염폭'] = {
  fam: '열산', cat: '화염', main: 225,
  cast(s, slots) {
    const startLaysan = 열산상태(s);
    if (startLaysan) TRACE(s, 'OPT', `🔥열산 상태로 시전 → 염폭/염식/분겁/진연 조건부 발동`);
    // [분겁] "본 신통 시전 시" — 즉발 (DMG 전)
    if (startLaysan) {
      TRACE(s, 'OPT', `🟠염폭·분겁 발동: 열산 상태 시전 → 즉시 염양 +50% 피해`);
      s._분겁보정 = 1.5;
      염양발동(s, slots);
      s._분겁보정 = 1;
    }
    // [염식] crRes 20% 10초 (즉발 buff)
    applyBuff(s, '열산염폭_염식', { crRes: 20 }, 10);
    // [염폭] spec: "열산 상태에서 본 신통 시전 시, 2중첩 추가 부여" — DMG 전
    if (startLaysan) 작열부여(s, 2, 44, '염폭·염폭(열산)');
    // 본 신통 DMG (+ [진연] 즉발 추가 피해)
    const bonus = startLaysan ? 150 : 0;
    record(s, dealDamage(s, 225 * MH[3]));
    if (bonus) record(s, dealDamage(s, bonus, { noSkillMult: true }), '진연');
    // === DMG 후 작열 부여 (시전 시 명시 없는 옵션) ===
    // [염폭] 기본 작열 2중첩
    작열부여(s, 2, 44, '염폭·염폭');
    // [염식] 열산 시 작열 2중첩 (spec 상 "시전 시" 명시 없음 → DMG 후)
    if (startLaysan) 작열부여(s, 2, 44, '염폭·염식(열산)');
  }
};
SK['열산·양운'] = {
  fam: '열산', cat: '화염', main: 212,
  cast(s, slots) {
    // [적염] 임의 신통 시전 시 작열 1중첩 부여 (최대 4회) — 본 cast 포함 그 이후 활성
    // (pre-cast hook 에서 sk.name === '열산·양운' 일 때 self-fire 처리)
    s.적염활성 = true;
    // [양운] 염양 발동 시 atk 15% 5초 max5 → 염양발동 훅에서 처리
    // [진염] 염양 발동 시 60% 물리 (최대 3회 — 전투 누적, simulateBuild 시작 시 초기화)
    // 본 신통 DMG
    record(s, dealDamage(s, 212));
    // === DMG 후 작열 부여 ===
    // [분령] 작열 3중첩 (max tier: 44%)
    작열부여(s, 3, 44, '양운·분령');
  }
};
SK['열산·성료'] = {
  fam: '열산', cat: '화염', main: 213,
  cast(s, slots) {
    const startLaysan = 열산상태(s);
    if (startLaysan) TRACE(s, 'OPT', `🔥열산 상태로 시전 → 성료/치운 조건부 발동`);
    // [성료] atk 30% 10초 (즉발 buff)
    applyBuff(s, '열산성료_성료', { atk: 30 }, 10);
    // [은염] defDebuff 20% 10초 (즉발 buff)
    applyBuff(s, '열산성료_은염', { defDebuff: 20 }, 10);
    // [성료] spec: "열산 상태에서 본 신통 시전 시, 작열 2중첩 부여" — 본 신통 dmg 전에 부여
    if (startLaysan) 작열부여(s, 2, 44, '성료·성료(열산)');
    // 본 신통 DMG (+ [치운] 열산 시 150% 술법 추가)
    const extra = startLaysan ? 150 : 0;
    record(s, dealDamage(s, 213 * MH[4]));
    if (extra) record(s, dealDamage(s, extra, { noSkillMult: true }), '치운');
    // === DMG 후 작열 부여 ===
    // [분령] 작열 3중첩 (spec "시전 시" 없음 → dmg 후)
    작열부여(s, 3, 44, '성료·분령');
    // [은염] 작열 2중첩 (spec "시전 시" 없음 → dmg 후)
    작열부여(s, 2, 44, '성료·은염');
  }
};
SK['열산·순일'] = {
  fam: '열산', cat: '화염', main: 225,
  cast(s, slots) {
    // [치황] 20초간 신통 시전 시 작열 1중첩 — main loop pre-cast 훅에서 처리 (sk.name 으로 본 cast 도 발동)
    applyBuff(s, '열산순일_치황', {}, 20);
    // [순일 + 분궁] 염양 발동 시 40% 물리 (최대 5회 — 전투 누적, simulateBuild 시작 시 초기화)
    // [진공] 염양 발동 시 작열 1중첩 62% (최대 4회 — 전투 누적, simulateBuild 시작 시 초기화)
    record(s, dealDamage(s, 225));
  }
};

// ---------- 화염: 형혹 (폭파 60%) ----------
function 폭파(s) {
  // 작열 1중첩 소모 → 잔여 작열 피해 즉시 적용
  // sim에서는 DoT를 작열부여 시 선계산(record)하므로 기본 잔여피해는 이미 반영됨
  // 형혹 유파 보너스(슬롯당 +10%)의 추가분만 record
  if (s.stacks.작열 <= 0) return;
  const hhSlots = famActiveSlots(s, '형혹');
  // consume작열: FIFO 소모, 실제 잔여 DoT 반환 (개별 타이머 기반 정확 계산)
  const remainingDot = consume작열(s, 1);
  // 형혹 슬롯 보너스: 잔여 작열 피해 × (hhSlots × 10%) (형혹 ≥2)
  if (hhSlots > 0 && remainingDot > 0) {
    record(s, remainingDot * (hhSlots * 10 / 100), '폭파(유파)');
  }
  // [겁염·겁염] 폭파 시 atk 8% 5초 max5 (max tier, 30초 동안 — 15+착혼15)
  if (s.selectedSkills && s.selectedSkills.has('형혹·겁염') && s.겁염End > s.t) {
    applyBuff(s, '형혹겁염_겁염', { atk: 8 }, 5, 5);
    // [붕연] 겁염 부여 시 defDebuff 8% 5초 max5 (max tier)
    applyBuff(s, '형혹겁염_붕연', { defDebuff: 8 }, 5, 5);
  }
  // [함양·함양] 폭파 시 24% 술법 (최대 5+폭열5=10회) + [염화] 3명 20% (max tier)
  if (s.selectedSkills && s.selectedSkills.has('형혹·함양') && s.함양End > s.t) {
    if ((s.함양남은 || 0) > 0) {
      const 함양used = (s.함양max || 10) - s.함양남은 + 1;
      s.함양남은--;
      TRACE(s, 'OPT', `🟠함양 발동: 폭파 → 24% 술법 + 염화 20% (${함양used}/${s.함양max || 10}회)`);
      record(s, dealDamage(s, 24, { noSkillMult: true }), '함양');
      record(s, dealDamage(s, 20, { noSkillMult: true }), '염화');
    }
  }
}
function 작열부여_형혹(s, slots, n, source) {
  // 호환성 유지용 wrapper — 실제로는 범용 작열부여가 폭파 처리 (max tier: 40% 총 피해)
  작열부여(s, n, 40, source);
}
SK['형혹·업화'] = {
  fam: '형혹', cat: '화염', main: 170,
  cast(s, slots) {
    // [업화] 본 신통 cast 후부터 활성화 — main loop pre-cast 훅에서 처리
    s.업화활성 = true;
    // 본 신통 DMG
    record(s, dealDamage(s, 170 * MH[4]));
    // === DMG 후 작열 부여 ===
    // [영염] 작열 3중첩
    작열부여_형혹(s, slots, 3, '업화·영염');
  }
};
SK['형혹·겁염'] = {
  fam: '형혹', cat: '화염', main: 170,
  cast(s, slots) {
    // [겁염] 30초 폭파 시 atk 8% (폭파() 훅) / [붕연] 겁염 부여 시 defDebuff
    s.겁염End = s.t + 30;
    // 본 신통 DMG
    record(s, dealDamage(s, 170));
    // === DMG 후 작열 부여 ===
    // [현염] 작열 3중첩
    작열부여_형혹(s, slots, 3, '겁염·현염');
  }
};
SK['형혹·흑성'] = {
  fam: '형혹', cat: '화염', main: 170,
  cast(s, slots) {
    // [혹성] 35초간 신통 시전 시 작열 1중첩 — main loop 훅
    applyBuff(s, '형혹흑성_혹성', {}, 35);
    // 본 신통 DMG
    record(s, dealDamage(s, 170));
    // === DMG 후 작열 부여 ===
    // [폭염] 작열 3중첩
    작열부여_형혹(s, slots, 3, '흑성·폭염');
  }
};
SK['형혹·함양'] = {
  fam: '형혹', cat: '화염', main: 170,
  cast(s, slots) {
    // [함양] 30초 폭파 시 24% 술법 / [염화] 함양 발동 시 3명 20%
    s.함양End = s.t + 30;
    s.함양남은 = 10; s.함양max = 10;
    // 본 신통 DMG
    record(s, dealDamage(s, 170 * MH[4]));
    // === DMG 후 작열 부여 ===
    // [천염] 작열 3중첩
    작열부여_형혹(s, slots, 3, '함양·천염');
  }
};

// ---------- 화염: 이화 (작열 DoT 증폭) ----------
function 이화sectMult(s, slots) {
  // 작열 지속 피해 +10% per slot → DoT만. 본 신통에는 영향 없음.
  // 작열이 이미 기록된 DoT에 대해 근사로 본 캐스트에 1.0x 적용.
  return 1;
}
SK['이화·풍권'] = {
  fam: '이화', cat: '화염', main: 135,
  cast(s, slots) {
    // [점화] 35초간 신통 시전 시 작열 1중첩 — main loop 훅
    applyBuff(s, '이화풍권_점화', {}, 35);
    // [통찰] cr 30% 15초 (즉발 buff)
    applyBuff(s, '이화풍권_통찰', { cr: 30 }, 15);
    // [멸신] 방어력 30% + 작열당 4% (최대 50%) (즉발 debuff)
    prune작열(s);
    const 멸신방감 = Math.min(30 + (s.stacks.작열 || 0) * 4, 50);
    applyBuff(s, '이화풍권_멸신', { defDebuff: 멸신방감 }, 10);
    // 본 신통 DMG
    record(s, dealDamage(s, 135 * MH[3]));
    // 본 신통 cast 자체에 의한 [점화] 트리거는 main loop pre-cast 훅에서 처리됨 (점화 buff 활성 시)
  }
};
SK['이화·염우'] = {
  fam: '이화', cat: '화염', main: 128,
  cast(s, slots) {
    // [열염+조염] 30초 창, 활성 중 작열 DoT +50%
    applyBuff(s, '이화염우_열염', {}, 30);
    // [염백] atk 20% + 작열당 2% (최대 30%) 10s
    prune작열(s);
    const 염백atk = Math.min(20 + (s.stacks.작열 || 0) * 2, 30);
    applyBuff(s, '이화염우_염백', { atk: 염백atk }, 10);
    // 본 신통 DMG
    record(s, dealDamage(s, 128));
    // === DMG 후 작열 부여 ===
    // [성염] 작열 2중첩 28%
    작열부여(s, 2, 28, '염우·성염');
  }
};
SK['이화·염무'] = {
  fam: '이화', cat: '화염', main: 135,
  cast(s, slots) {
    applyBuff(s, '이화염무_파군', { defDebuff: 30 }, 10); // [파군] max tier: def-30
    // 본 신통 DMG
    record(s, dealDamage(s, 135));
    // === DMG 후 작열 부여 ===
    // [분염]+[은염] = 6중첩, [요원] +110% (지속시간/피해)
    const 요원배율 = 2.1;
    for (let i = 0; i < 6; i++) {
      add작열(s, 36 * 요원배율, 20 * 요원배율, '염무·분염+은염·요원');
      s.stacks.작열 = s.작열Arr.length;
      if (famActive(s, '형혹') && seededRand(s) < 0.60) 폭파(s);
      if (famActive(s, '열산')) {
        s.작열부여카운터 = (s.작열부여카운터 || 0) + 1;
        while (s.작열부여카운터 >= 6) {
          s.작열부여카운터 -= 6;
          applyBuff(s, '열산상태', { cat: 'amp', dmgMult: 10 }, 10);
          염양발동(s, s.famSlots.열산);
        }
      }
      화상부여(s, 1);
    }
  }
};
SK['이화·삼매'] = {
  fam: '이화', cat: '화염', main: 135,
  cast(s, slots) {
    prune작열(s);
    // [현화] 3회 + [작염] max +4회 = 총 7회 (max tier)
    s.현화남은 = 7;
    // [소진] 작열 4중첩 이상 시 160% 술법 추가 (max tier) — 옵션 추가 피해
    const 소진 = s.stacks.작열 >= 4 ? 160 : 0;
    // [비화] atk 20% 5초 (max tier)
    applyBuff(s, '이화삼매_비화', { atk: 20 }, 5);
    record(s, dealDamage(s, 135));
    if (소진) record(s, dealDamage(s, 소진, { noSkillMult: true }), '소진');
  }
};

// ---------- 화염: 천로 (작열 폭파 연쇄) ----------
SK['천로·단주'] = {
  fam: '천로', cat: '화염', main: 128,
  cast(s, slots) {
    // [광염]+[충염] 8회 cap 활성화 (main loop pre-cast 훅에서 작열 부여)
    // 단주 cast 자체 광염 트리거는 main loop 에서 sk.name 으로 처리됨 — 여기선 카운터 reset 만 하지 않음
    if (s.광염남은 == null) { s.광염남은 = 8; s.광염max = 8; }
    // [파세] crRes-30% 15s, [신화] atk+20% 10s (즉발 buff)
    applyBuff(s, '천로단주_파세', { crRes: 30 }, 15);
    applyBuff(s, '천로단주_신화', { atk: 20 }, 10);
    // 본 신통 DMG
    record(s, dealDamage(s, 128 * MH[4]));
  }
};
SK['천로·직염'] = {
  fam: '천로', cat: '화염', main: 128,
  cast(s, slots) {
    prune작열(s);
    const pops = Math.min(s.stacks.작열, 3);
    // [통찰] cr 30% 15s (max tier)
    applyBuff(s, '천로직염_통찰', { cr: 30 }, 15);
    // [여진] 폭발 1중첩마다 atk 12% max5 10s (max tier)
    for (let i = 0; i < pops; i++) applyBuff(s, '천로직염_여진', { atk: 12 }, 10, 5);
    // 본 신통 (물리 4명 중복)
    record(s, dealDamage(s, 128 * MH[4]));
    // [성화] 작열 최대 3중첩 폭발 + 폭발 최종피해 +30%
    // consume작열 반환값(= 남은 DoT 피해 합) × 1.3 증폭 + 천로 유파 slot×15% 자동 적용(type:'작열폭발')
    const remainingDot = consume작열(s, pops);
    if (remainingDot > 0) {
      // 이미 atk/def 반영된 스냅샷 피해이므로 bare record (× 1.3 성화 증폭 + 유파 slot×15 수동 적용)
      const popDmg = remainingDot * 1.3 * (1 + slots * 15 / 100);
      record(s, popDmg, '성화(폭발)');
    }
    // [열기] 다음번 폭발 피해 +40% (max tier, nextCast buff) — 다음 폭발 전까지 유지
    s.nextCast.finalDmg += 40;
  }
};
SK['천로·유형'] = {
  fam: '천로', cat: '화염', main: 128,
  cast(s, slots) {
    // [파군] def-30% 10s (즉발 debuff)
    applyBuff(s, '천로유형_파군', { defDebuff: 30 }, 10);
    // 본 신통 DMG (+ [잔염] 옵션 추가 피해)
    record(s, dealDamage(s, 128 * MH[4]));
    record(s, dealDamage(s, 40, { noSkillMult: true }), '잔염');
    // === DMG 후 작열 부여 ===
    // [점화] 3중첩 + [연소] +3중첩 = 6중첩 (36%)
    작열부여(s, 6, 36, '유형·작열');
  }
};
SK['천로·운화'] = {
  fam: '천로', cat: '화염', main: 135,
  cast(s, slots) {
    prune작열(s);
    // [축염] 염폭 폭발 상한 +4 → 3 + 4 = 7중첩
    const pops = Math.min(s.stacks.작열, 7);
    // [현력] atk 20% 5s (max tier)
    applyBuff(s, '천로운화_현력', { atk: 20 }, 5);
    // 본 신통 (물리 3명)
    record(s, dealDamage(s, 135));
    // [염폭] 폭발 잔여 DoT + 폭발 최종피해 +30% + 천로 유파 slot×15%
    const remainingDot = consume작열(s, pops);
    if (remainingDot > 0) {
      const popDmg = remainingDot * 1.3 * (1 + slots * 15 / 100);
      record(s, popDmg, '염폭(폭발)');
    }
    // [양염] 4중첩 이상 폭발 시 주변 3명 120% 물리 추가 (max tier)
    if (pops >= 4) record(s, dealDamage(s, 120));
  }
};

// ---------- 뇌전: 청명 (뇌인·천뢰) ----------
function 천뢰발동(s, slots, basePct, reason) {
  // 천뢰 피해 = type:'천뢰' 로 dealDamage에 위임
  //   → sumTypeDmg('천뢰') 가 청명 유파 slot×10% + 투진 +40% 합산
  s.천뢰카운트 = (s.천뢰카운트 || 0) + 1;
  const reasonTag = reason ? ` [${reason}]` : '';
  TRACE(s, 'OPT', `⚡천뢰 방출${reasonTag} (${basePct}% 공격력 → 천뢰 유형 처리)`);
  record(s, dealDamage(s, basePct, { type: '천뢰' }), reason ? `천뢰←${reason}` : '천뢰');
  // [천노+용음 max] 천뢰 시전 시 추가 24% 물리 (용음 계수 +12% 덧셈), 최대 14회
  if (s.buffs.some(b => b.key === '청명천노_천노' && b.endT > s.t)) {
    if ((s.천노남은 || 0) > 0) {
      const used = (s.천노max || 14) - s.천노남은 + 1;
      TRACE(s, 'OPT', `🟠천노·천노+용음 발동: 추가 24% 물리 (${used}/${s.천노max || 14}회)`);
      s.천노남은--;
      record(s, dealDamage(s, 12 + 12, { type: '천뢰' }), '천노(보너스)');
    }
  }
}
function 뇌인획득(s) {
  if (!famActive(s, '청명')) return;
  // 원문: "임의의 신통으로 적을 명중 시 뇌인 1중첩 획득" — 매 신통 cast 마다 +1
  addStackTTL(s, '뇌인', 1, 4, 20);
  // 누적 카운터 — 4회 획득마다 천벌 상태 돌입 (10s간 초당 천뢰 30% 물리 × 10회)
  s.뇌인획득카운터 = (s.뇌인획득카운터 || 0) + 1;
  while (s.뇌인획득카운터 >= 4) {
    s.뇌인획득카운터 -= 4;
    TRACE(s, 'OPT', `⚡천벌 상태 돌입 (뇌인 4중첩 획득): 10초 동안 초당 천뢰 30% × 10회`);
    for (let i = 0; i < 10; i++) 천뢰발동(s, s.famSlots.청명, 30, '천벌(뇌인4)');
  }
}
SK['청명·투진'] = {
  fam: '청명', cat: '뇌전', main: 213,
  cast(s, slots) {
    applyBuff(s, '청명투진_투진', {}, 20);
    천뢰발동(s, slots, 60, '투진·명소'); // [명소] 천뢰 60% + 명중 시 5초 atk+20% (max tier)
    applyBuff(s, '청명투진_명소', { atk: 20 }, 5);
    // [경정] 투진 효과 지속 중 2초마다 천뢰 15% × 10회 (max tier)
    for (let i = 0; i < 10; i++) 천뢰발동(s, slots, 15, '투진·경정');
    // [순요] 10초 창 오픈 — 이 창 안의 매 신통 cast에서 crit 시 5초 atk+25 부여
    // (event loop에서 per-cast 트리거 처리)
    s.순요End = s.t + 10;
    // 6회 반사 → MH[6]
    record(s, dealDamage(s, 213 * MH[6]));
  }
};
SK['청명·천노'] = {
  fam: '청명', cat: '뇌전', main: 225,
  cast(s, slots) {
    // [천노 max: 12%] + [용음 max: +12% 계수, 4회] → 천노 = 12% 물리, 최대 14회 (max tier)
    applyBuff(s, '청명천노_천노', {}, 20);
    s.천노남은 = 14; s.천노max = 14;
    // [멸성] 2갈래 천뢰 50% 각 (max tier)
    천뢰발동(s, slots, 50, '천노·멸성');
    천뢰발동(s, slots, 50, '천노·멸성');
    // [복광] 60% 천뢰 + crRes 15% 10초 (max tier)
    천뢰발동(s, slots, 60, '천노·복광');
    applyBuff(s, '청명천노_복광', { crRes: 15 }, 10);
    record(s, dealDamage(s, 225));
  }
};
SK['청명·붕운'] = {
  fam: '청명', cat: '뇌전', main: 225,
  cast(s, slots) {
    const lei = s.stacks.뇌인;
    // [붕운] 뇌인당 40% 천뢰 (max tier)
    TRACE(s, 'OPT', `🟠붕운·붕운 발동: 뇌인 ${lei}중첩 → 40% 천뢰 ${lei}회`);
    for (let i = 0; i < lei; i++) 천뢰발동(s, slots, 40, '붕운·붕운');
    // [열산] 2갈래 천뢰 50% 각 (max tier)
    천뢰발동(s, slots, 50, '붕운·열산');
    천뢰발동(s, slots, 50, '붕운·열산');
    // [굉천] 1갈래 천뢰 90% + cr 20% 10초 (max tier)
    천뢰발동(s, slots, 90, '붕운·굉천');
    applyBuff(s, '청명붕운_굉천', { cr: 20 }, 10);
    record(s, dealDamage(s, 225));
    // [파정] 다음 신통 최종 cr/cd +25% (max tier) — record 후 설정해야 다음 cast에 적용
    s.nextCast.finalCR += 25;
    s.nextCast.finalCD += 25;
  }
};
SK['청명·풍뢰'] = {
  fam: '청명', cat: '뇌전', main: 225,
  cast(s, slots) {
    applyBuff(s, '청명풍뢰_풍뢰', {}, 20); // crit 시 천뢰 트리거 (별도 처리)
    s.풍뢰남은 = 14; // 발동 가능 횟수: 10 + 천적 4 (max tier)
    applyBuff(s, '청명풍뢰_환우', { cr: 20 }, 10); // [환우] cr 20% (max tier)
    applyBuff(s, '청명풍뢰_뇌벌', { atk: 30 }, 10); // [뇌벌] atk 30% (max tier)
    천뢰발동(s, slots, 60, '풍뢰·뇌벌'); // [뇌벌] 60% 물리 (max tier)
    record(s, dealDamage(s, 225));
  }
};

// ---------- 뇌전: 옥추 (옥추 스택 - 크리 기반) ----------
// 옥추 스택은 TTL 기반: 각 중첩 20s 만료, inc %는 sumBuffInc에서 stacks.옥추 × 1%로 자동 계산
function 옥추획득(s) {
  if (!famActive(s, '옥추')) return;
  addStackTTL(s, '옥추', 1, 10, 20);
}
function 옥추유파Mult(s, slots) {
  // dealDamage에서 글로벌 적용 중이므로 중복 방지
  return 1;
}
SK['옥추·황룡'] = {
  fam: '옥추', cat: '뇌전', main: 172,
  cast(s, slots) {
    // === "본 신통 시전 시" buff/debuff (record 전 부여) ===
    // [황룡] 옥추2+ 방어력 20% 10초 (max tier)
    if (s.stacks.옥추 >= 2) applyBuff(s, '옥추황룡_황룡', { defDebuff: 20 }, 10);
    // [운한] crRes 30% 15초 (max tier)
    applyBuff(s, '옥추황룡_운한', { crRes: 30 }, 15);
    // [섬천] 옥추5+ atk 30% 10초 (max tier)
    if (s.stacks.옥추 >= 5) applyBuff(s, '옥추황룡_섬천', { atk: 30 }, 10);
    // [정위] cd 30% 10초 (max tier)
    applyBuff(s, '옥추황룡_정위', { cd: 30, shintongOnly: true }, 10);
    // [운한] 옥추4+ 시 60% 술법 추가 — 시간 조건 옵션이라 record 전 (시전 시 트리거)
    if (s.stacks.옥추 >= 4) {
      TRACE(s, 'OPT', `🟠황룡·운한 발동: 옥추 ${s.stacks.옥추}중첩 ≥ 4 → 60% 술법 추가`);
      record(s, dealDamage(s, 60, { noSkillMult: true }), '운한');
    }
    // === 본 신통 (신통 피해 적용) ===
    record(s, dealDamage(s, 172));
    // [황룡] 60% 술법 추가 — 조건 없는 일반 추가 데미지, 본 신통 데미지와 함께 (record 후)
    record(s, dealDamage(s, 60, { noSkillMult: true }), '황룡');
  }
};
SK['옥추·소명'] = {
  fam: '옥추', cat: '뇌전', main: 170,
  cast(s, slots) {
    // [소명] cr 20% + [명향] 지속 연장 = 20초. 옥추2+ 시 cd 20% (max tier)
    applyBuff(s, '옥추소명_소명', { cr: 20 }, 20);
    if (s.stacks.옥추 >= 2) applyBuff(s, '옥추소명_cd', { cd: 20, shintongOnly: true }, 20); // "신통 치명타 배율"
    // [천칙] 옥추5+ 시 5초 inc +20% (max tier)
    if (s.stacks.옥추 >= 5) applyBuff(s, '옥추소명_천칙', { dmgMult: 20, cat: 'inc' }, 5);
    record(s, dealDamage(s, 170 * MH[6]));
    // [성류] 다음 신통 최종 cr +25. 옥추4+ 시 피해 +15% (max tier) — record 후 설정
    s.nextCast.finalCR += 25;
    if (s.stacks.옥추 >= 4) s.nextCast.finalDmg += 15;
  }
};
SK['옥추·수광'] = {
  fam: '옥추', cat: '뇌전', main: 170,
  cast(s, slots) {
    // [수광] 15초간 시전 시 옥추 +1 + 30% 물리 (max tier)
    applyBuff(s, '옥추수광_수광', {}, 15);
    // [운류] atk 25% 15초 (max tier) — 시전 시 buff, 모든 record 전 부여
    applyBuff(s, '옥추수광_운류', { atk: 25 }, 15);
    옥추획득(s);
    record(s, dealDamage(s, 30, { noSkillMult: true }), '수광(지속)');
    s._수광이미처리 = true;
    // [뇌격] 15초간 crit 시 8% 물리 × 20회 (max tier)
    s.뇌격End = s.t + 15;
    s.뇌격남은 = 20;
    // [천붕] 수광 효과 종료 시 옥추 2중첩당 30% (수광End 트리거에서 처리)
    s.수광End = s.t + 15;
    s.수광종료처리 = false;
    record(s, dealDamage(s, 170));
  }
};
SK['옥추·청사'] = {
  fam: '옥추', cat: '뇌전', main: 170,
  cast(s, slots) {
    const 옥추Stack = s.stacks.옥추 || 0;
    // [뇌운] 옥추4+ cd 40% (max tier)
    if (옥추Stack >= 4) {
      TRACE(s, 'BUF', `🔼버프 [옥추·청사 → 뇌운] 발동: 옥추 ${옥추Stack}중첩 ≥ 4 → cd+40% 10초`);
      applyBuff(s, '옥추청사_뇌운', { cd: 40, shintongOnly: true }, 10);
    }
    // [운청] 옥추 2중첩당 본 신통 피해 +6% (max tier) — localInc 로 신통피해 버킷에 추가
    const uc = 옥추Stack >= 2 ? Math.floor(옥추Stack / 2) * 6 : 0;
    if (uc) TRACE(s, 'BUF', `🔼버프 [옥추·청사 → 운청] 발동: 옥추 ${옥추Stack}중첩 → 본 신통 피해 +${uc}%`);
    // [명뢰] 본 신통 최종 cr +30% (max tier, 이번 cast 한정)
    TRACE(s, 'BUF', `🔼버프 [옥추·청사 → 명뢰] 본 신통 최종 cr +30% (이번 cast 한정)`);
    // 본 신통 (신통 피해 적용 + 옥추유파 slot 보너스)
    record(s, dealDamage(s, 170 * MH[4] * 옥추유파Mult(s, slots), {
      localInc: uc,
      localFinalCR: 30,
    }));
    // [청사] 60% 술법 추가 + 옥추2+ 60% 추가 — 옵션 추가 피해 (신통 증가 X)
    record(s, dealDamage(s, 60 * 옥추유파Mult(s, slots), { noSkillMult: true }), '청사');
    if (옥추Stack >= 2) record(s, dealDamage(s, 60 * 옥추유파Mult(s, slots), { noSkillMult: true }), '청사(옥추2+)');
  }
};

// ---------- 뇌전: 오뢰 (낙뢰) ----------
function 낙뢰발동(s, slots, basePct) {
  TRACE(s, 'OPT', `⚡낙뢰 방출 (${basePct}% 공격력 → 낙뢰 유형 처리)`);
  record(s, dealDamage(s, basePct, { type: '낙뢰' }), '낙뢰');
}
SK['오뢰·천강'] = {
  fam: '오뢰', cat: '뇌전', main: 128,
  cast(s, slots) {
    // [태허] 낙뢰 1~3회 × 20% (max tier: 계수 20%), 기댓값 2회
    낙뢰발동(s, slots, 20); 낙뢰발동(s, slots, 20);
    applyBuff(s, '오뢰천강_태허', { cd: 20, shintongOnly: true }, 10); // "신통 치명타 배율"
    // [통찰] 낙뢰 40% (max tier)
    낙뢰발동(s, slots, 40);
    // [운소] crRes 40% (max tier)
    applyBuff(s, '오뢰천강_운소', { crRes: 40 }, 15);
    // [굉명] 방어력 20% max3 (max tier)
    applyBuff(s, '오뢰천강_굉명', { defDebuff: 20 }, 10, 3);
    record(s, dealDamage(s, 128 * MH[6]));
  }
};
SK['오뢰·경칩'] = {
  fam: '오뢰', cat: '뇌전', main: 128,
  cast(s, slots) {
    // [뇌명] 낙뢰 × 20%, cr 7.5% (max tier)
    낙뢰발동(s, slots, 20); 낙뢰발동(s, slots, 20);
    applyBuff(s, '오뢰경칩_뇌명', { cr: 7.5 }, 10);
    // [전섬] 낙뢰 40% (max tier)
    낙뢰발동(s, slots, 40);
    // [침뢰] crRes 30% (max tier)
    applyBuff(s, '오뢰경칩_침뢰', { crRes: 30 }, 15);
    // [뇌진] atk 16% max3 (max tier)
    applyBuff(s, '오뢰경칩_뇌진', { atk: 16 }, 10, 3);
    record(s, dealDamage(s, 128));
  }
};
SK['오뢰·호후'] = {
  fam: '오뢰', cat: '뇌전', main: 135,
  cast(s, slots) {
    // [비전] 본 신통 최종cr +25 (max tier) — localFinalCR
    const 로컬FinalCR = 25;
    TRACE(s, 'BUF', `🔼버프 [오뢰·호후 → 비전] 본 신통 최종 cr +25% (이번 cast 한정)`);
    // 본 신통 cr 기댓값 계산 (비전 포함)
    const baseCR = CFG.baseCR * (1 + sumBuffCR(s) / 100) * (1 + (로컬FinalCR + s.nextCast.finalCR) / 100) * (1 + sumBuffCritRes(s) / 100);
    const crEff = Math.min(100, baseCR) / 100;
    const hits = SKILL_HITS['오뢰·호후'] || 3;  // 3명 광역
    // [뇌신] 낙뢰 35% 기본 1회 + 본 신통 치명타 발동마다 추가 1회 (최대 3회 추가)
    낙뢰발동(s, slots, 35);
    // 추가 낙뢰: hits 번 crit roll 후 실제 crit 수만큼 발동 (최대 3회)
    const 뇌신추가 = Math.min(randomTries(hits, crEff), 3);
    if (뇌신추가 > 0) 낙뢰발동(s, slots, 35 * 뇌신추가);
    // [파군] 낙뢰 40% (max tier)
    낙뢰발동(s, slots, 40);
    // [성류] 본 신통으로 치명타 2회 이상 시 낙뢰 200% 술법 추가
    if (CFG.randomCrit) {
      // 랜덤 모드: hits 번 roll, 2회 이상 crit 났으면 발동
      let critRolls = 0;
      for (let i = 0; i < hits; i++) if (Math.random() < crEff) critRolls++;
      if (critRolls >= 2) 낙뢰발동(s, slots, 200);
    } else {
      const pNone = Math.pow(1 - crEff, hits);
      const pOne = hits * crEff * Math.pow(1 - crEff, hits - 1);
      const p성류 = Math.max(0, 1 - pNone - pOne);
      if (p성류 > 0) 낙뢰발동(s, slots, 200 * p성류);
    }
    // 본 신통 (3명 광역)
    record(s, dealDamage(s, 135, { localFinalCR: 로컬FinalCR }));
  }
};
SK['오뢰·용음'] = {
  fam: '오뢰', cat: '뇌전', main: 135,
  cast(s, slots) {
    // [현력] 낙뢰 40% (max tier)
    낙뢰발동(s, slots, 40);
    applyBuff(s, '오뢰용음_뇌정', {}, 20);
    s.뇌정남은 = 12; // 뇌정 6 + 어뢰 6 (max tier)
    // [천뢰] 낙뢰 피해 +80% (max tier)
    applyBuff(s, '오뢰용음_낙뢰증폭', {}, 20);
    record(s, dealDamage(s, 135 * MH[3]));
  }
};

// ---------- 뇌전: 신소 (검심처럼 영구 자원, 무제한 누적) ----------
// spec: 신소 옵션은 "신소 1중첩 획득" 만 명시. 유지시간 X, max 명시 X.
// 신소 자원 보유 시 유파 효과 (slot×4% 신통 피해) 활성. stack 수치는 활성 여부만 의미 (유파 효과는 보유=on/off).
// stack 자체 소비는 어떤 옵션에도 명시 안 됨 — 따라서 자동 소모 X.
function 신소상태(s) {
  return s.stacks.신소 > 0;
}
function 신소유파Mult(s, slots) {
  // dealDamage에서 글로벌 적용 중이므로 중복 방지
  return 1;
}
SK['신소·운록'] = {
  fam: '신소', cat: '뇌전', main: 135,
  cast(s, slots) {
    // [뇌동] 신소 +1 획득 + cd+15% 10s 지속 버프 (shintongOnly)
    addStack(s, '신소', 1, Infinity);
    applyBuff(s, '신소운록_뇌동', { cd: 15, shintongOnly: true }, 10);
    // [벽력] crit 시 atk 40% 10초 (max tier)
    const crEff = Math.min(100, CFG.baseCR * (1 + sumBuffCR(s) / 100) * (1 + sumBuffCritRes(s) / 100)) / 100;
    const 벽력val = probScale(crEff) * 40;
    if (벽력val > 0) applyBuff(s, '신소운록_벽력', { atk: 벽력val }, 10);
    // [파군] 본 신통 cd +35 (max tier, 이번 cast 한정)
    TRACE(s, 'BUF', `🔼버프 [신소·운록 → 파군] 본 신통 cd +35% (이번 cast 한정)`);
    record(s, dealDamage(s, 135, { localCD: 35 }));
    // [전철] 범위 내 3명 81% 물리 추가
    record(s, dealDamage(s, 81, { noSkillMult: true }), '전철');
  }
};
SK['신소·천고'] = {
  fam: '신소', cat: '뇌전', main: 135,
  cast(s, slots) {
    addStack(s, '신소', 1, Infinity);
    applyBuff(s, '신소천고_뇌명', { cr: 7 }, 10); // [뇌명] cr 7% (max tier)
    // [통할] 본 신통 cd +35 (max tier, 이번 cast 한정)
    TRACE(s, 'BUF', `🔼버프 [신소·천고 → 통할] 본 신통 cd +35% (이번 cast 한정)`);
    // [경뢰] crRes 30% (max tier)
    applyBuff(s, '신소천고_경뢰', { crRes: 30 }, 15);
    // [만균] crit 시 3명에게 165% 물리 (max tier) — "치명타를 입힐 경우" = 한 cast 의 crit 1회 이상 시 발동
    const crEff = Math.min(100, CFG.baseCR * (1 + sumBuffCR(s) / 100) * (1 + sumBuffCritRes(s) / 100)) / 100;
    record(s, dealDamage(s, 135, { localCD: 35 }));
    // 발동 확률: 1 - (1 - crEff)^hits (3 hits)
    if (CFG.randomCrit) {
      let anyCrit = false;
      for (let i = 0; i < 3; i++) if (Math.random() < crEff) { anyCrit = true; break; }
      if (anyCrit) record(s, dealDamage(s, 165, { noSkillMult: true }));
    } else {
      const p만균 = 1 - Math.pow(1 - crEff, 3);
      if (p만균 > 0) record(s, dealDamage(s, 165 * p만균, { noSkillMult: true }));
    }
  }
};
SK['신소·환뢰'] = {
  fam: '신소', cat: '뇌전', main: 128,
  cast(s, slots) {
    addStack(s, '신소', 1, Infinity);
    applyBuff(s, '신소환뢰_구소', { atk: 15 }, 5); // [구소] atk 15% (max tier)
    // [뇌전] 본 신통 cd +35 (max tier, 이번 cast 한정)
    TRACE(s, 'BUF', `🔼버프 [신소·환뢰 → 뇌전] 본 신통 cd +35% (이번 cast 한정)`);
    // [호탕] crit 시 방어력 50% 감소 (max tier)
    // 기댓값: 4히트 중 ≥1 crit 확률 × 50 스케일
    // 랜덤: 4번 roll, 1회 이상 crit 이면 full 50
    const crEff = Math.min(100, CFG.baseCR * (1 + sumBuffCR(s) / 100) * (1 + sumBuffCritRes(s) / 100)) / 100;
    let 호탕val;
    if (CFG.randomCrit) {
      let anyCrit = false;
      for (let i = 0; i < 4; i++) if (Math.random() < crEff) { anyCrit = true; break; }
      호탕val = anyCrit ? 50 : 0;
    } else {
      const p호탕 = 1 - Math.pow(1 - crEff, 4);
      호탕val = 50 * p호탕;
    }
    if (호탕val > 0) applyBuff(s, '신소환뢰_호탕', { defDebuff: 호탕val }, 10);
    record(s, dealDamage(s, 128 * MH[4], { localCD: 35 }));
    // [풍세] 다음 신통 최종 피해 +20% (max tier) — record 후 설정
    s.nextCast.finalDmg += 20;
  }
};
SK['신소·청삭'] = {
  fam: '신소', cat: '뇌전', main: 128,
  cast(s, slots) {
    // [천위] 신소 상태 시 140% 물리 추가 — 신소 자원 소비 X (조건만 체크)
    const 천위활성 = 신소상태(s);
    const crEff = Math.min(100, CFG.baseCR * (1 + sumBuffCR(s) / 100) * (1 + sumBuffCritRes(s) / 100)) / 100;
    let 칙뢰, 풍뢰;
    if (CFG.randomCrit) {
      // 6회 반사 각각 crit roll → 실제 crit 수
      let critCount = 0;
      for (let i = 0; i < 6; i++) if (Math.random() < crEff) critCount++;
      // [칙뢰] 기본 24% + crit 수만큼 24% 추가 (최대 3회 추가)
      const 칙뢰추가 = Math.min(critCount, 3);
      칙뢰 = 24 * (1 + 칙뢰추가);
      // [풍뢰] crit 3회 이상 시 110%
      풍뢰 = critCount >= 3 ? 110 : 0;
    } else {
      const p = crEff;
      const q = 1 - p;
      const P_ge1 = 1 - Math.pow(q, 6);
      const P_ge2 = P_ge1 - 6 * p * Math.pow(q, 5);
      const P_ge3 = P_ge2 - 15 * p * p * Math.pow(q, 4);
      // [칙뢰] 3명 24% 물리 + 본 신통 crit마다 24% 추가 (최대 3회 추가)
      const 칙뢰추가기댓값 = P_ge1 + P_ge2 + P_ge3;
      칙뢰 = 24 * (1 + 칙뢰추가기댓값);
      // [풍뢰] 6회 반사 중 crit 3회 이상 시 3명 110% 물리 추가
      풍뢰 = 110 * P_ge3;
    }
    // [천위] 신소 상태 시 3명 140% 물리 추가
    const 천위 = 천위활성 ? 140 : 0;
    // [위능] 본 신통 cd +35 (max tier, 이번 cast 한정)
    TRACE(s, 'BUF', `🔼버프 [신소·청삭 → 위능] 본 신통 cd +35% (이번 cast 한정)`);
    // 본 신통 (6회 반사) + 위능 cd+35 localCD
    record(s, dealDamage(s, 128 * MH[6], { localCD: 35 }));
    // 추가 피해들 (모두 일반 물리, 유파 bonus는 신통피해 버킷)
    if (칙뢰) record(s, dealDamage(s, 칙뢰, { noSkillMult: true }), '칙뢰');
    if (풍뢰) record(s, dealDamage(s, 풍뢰, { noSkillMult: true }), '풍뢰');
    if (천위) record(s, dealDamage(s, 천위, { noSkillMult: true }), '천위');
  }
};

// ======================== 백족 ========================
// 주술 유파: 독고 4종(강체/환체/실혼/매혹) 부여기 — 매 시전 시 무작위 1 + 25% × 슬롯 추가
// 사해 유파: 살혼(확정 피해) 발사기 — 매 시전 시 40% × (1 + 0.10 × 사해 슬롯) 확정 피해
// 백족법체: 만고귀종(주술 2set, 독고 2중첩 격발) + 도천지세(사해 2set, 살혼 5회 누적)
const 독고_TYPES = ['강체', '환체', '실혼', '매혹'];
const 계약_TYPES = ['강령', '환생', '실혼', '매혹'];

// === 확률가중 격발 회수 (기댓값 모드용) ===
// N개 독고가 4종에 무작위 분배되었을 때, 한 종이 ≥2 도달할 확률 = 1 - P(0) - P(1)
// 격발 회수 기댓값 = 4 × P(한 종 ≥ 2)
function expectedFiresFromPool(N) {
  if (N < 2) return 0;
  const p0 = Math.pow(0.75, N);
  const p1 = N * 0.25 * Math.pow(0.75, N - 1);
  return Math.max(0, 4 * (1 - p0 - p1));
}

// fractional 중첩 지원 — applyBuff와 같지만 stack 증가량을 frac 으로 받음
function applyBuffFrac(state, key, spec, dur, maxStack, frac) {
  const ex = state.buffs.find(b => b.key === key && b.endT > state.t);
  if (ex) {
    ex.endT = state.t + dur + 0.001;
    const prev = ex.stackCount || 1;
    ex.stackCount = Math.min(prev + frac, maxStack);
    return;
  }
  state.buffs.push({ key, endT: state.t + dur + 0.001, stackCount: Math.min(frac, maxStack), maxStacks: maxStack, ...spec });
}

// 명화 살혼 발사 — 유령불 카운터(2회마다 30% 물리) 자동 처리 래퍼 (max tier)
function 명화살혼발사(s, pct) {
  살혼발사(s, pct);
  // [유령불] 명화 살혼 2회 시전마다 30% 물리 (max tier)
  s.유령불카운터 = (s.유령불카운터 || 0) + 1;
  if (s.유령불카운터 >= 2) {
    s.유령불카운터 -= 2;
    TRACE(s, 'OPT', `🟠유령불 발동: 명화 살혼 2회 → 30% 물리`);
    const prev = s._currentSource;
    s._currentSource = '유령불(트리거)';
    record(s, dealDamage(s, 30, { noSkillMult: true }));
    s._currentSource = prev;
  }
}

// 마상 — 명화 2옵션: 약화 1중첩 추가될 때마다 살혼 10% 확정 발사 (전투 내내 총 5회)
function 마상트리거(s) {
  if (!s.selectedSkills || !s.selectedSkills.has('사해·명화')) return;
  if ((s.마상남은 || 0) <= 0) return;
  if (!s.famSlots.사해) return;
  const 마상used = 5 - s.마상남은 + 1;
  s.마상남은--;
  // max tier: 약화 추가 → 살혼 20% 확정
  TRACE(s, 'OPT', `🟠명화·마상 발동: 약화 추가 → 살혼 20% 확정 (${마상used}/5회)`);
  const prevSrc = s._currentSource;
  s._currentSource = '명화·마상';
  명화살혼발사(s, 20);
  s._currentSource = prevSrc;
}
// 현화 — 이화·삼매 1옵션: 작열 1중첩 추가될 때마다 40% 술법 (max tier, 총 9회: 현화5+작염4)
function 현화트리거(s) {
  if (!s.selectedSkills || !s.selectedSkills.has('이화·삼매')) return;
  if ((s.현화남은 || 0) <= 0) return;
  const 현화used = 7 - s.현화남은 + 1;
  s.현화남은--;
  TRACE(s, 'OPT', `🟠현화 발동: 작열 추가 → 40% 술법 (${현화used}/7회)`);
  const prevSrc = s._currentSource;
  s._currentSource = '현화(트리거)';
  record(s, dealDamage(s, 40, { noSkillMult: true }));
  s._currentSource = prevSrc;
}
// 제율 — 주술·제율 1옵션: 계약 획득할 때마다 15%×1.1(혼사) 술법 (전투 내내 총 5회)
// frac: 계약 획득량 (1=정수, 0.x=확률가중 격발 fractional)
function 제율트리거(s, frac = 1) {
  if (!s.selectedSkills || !s.selectedSkills.has('주술·제율')) return;
  if ((s.제율남은 || 0) <= 0) return;
  const eff = Math.min(frac, s.제율남은);
  s.제율남은 -= eff;
  const 제율used = 5 - s.제율남은;
  // [제율+혼사 max] 30+30=60% 술법 (혼사 계수 +30% 덧셈)
  TRACE(s, 'OPT', `🟠제율 발동: 계약 +${frac.toFixed(2)} → ${(60 * eff).toFixed(0)}% 술법 (${제율used.toFixed(2)}/5회)`);
  const prevSrc = s._currentSource;
  s._currentSource = '제율(계약트리거)';
  record(s, dealDamage(s, (30 + 30) * eff, { noSkillMult: true }));
  // [고식] 5초 atk 14% (max 3중첩, max tier)
  applyBuffFrac(s, '주술제율_고식', { atk: 14 }, 5, 3, eff);
  // [저주] max tier: 독고 1 추가 + 대상 방어력 10% 감소 10초 (max 3중첩)
  applyBuffFrac(s, '주술제율_저주', { defDebuff: 10 }, 10, 3, eff);
  if (s.famSlots.주술) {
    for (const t of 독고_TYPES) {
      s.독고[t] = (s.독고[t] || 0) + eff / 4;
      s.독고EndT[t] = s.t + 20;
    }
  }
  s._currentSource = prevSrc;
}
function 살혼발사(s, overridePct) {
  // 사해 유파: 임의 신통 명중 시 살혼(공격력 40% 확정 피해), 슬롯당 +10% (사해 ≥2)
  // overridePct: 2갈래 살혼 등에서 피해 계수 오버라이드 (15% 등)
  if (!famActive(s, '사해')) return;
  const 사해Slots = s.famSlots.사해 || 0;
  const mult = 1 + 사해Slots * 10 / 100;
  const basePct = overridePct || 40;
  TRACE(s, 'OPT', `💀살혼 발사 (${basePct}% 확정피해 × 사해${사해Slots}슬롯 ×${mult.toFixed(2)})`);
  // 확정피해: defReduction 우회
  record(s, dealDamage(s, basePct * mult, { bypassDef: true, noSkillMult: true }), '살혼');
  // [폭우] 15초간 살혼 3회마다 30% 물리 (최대 5회, max tier) + [마찰 max: cr 15%] + [마심 max: atk 8%]
  if (s.폭우End > 0 && s.t < s.폭우End) {
    s.폭우살혼++;
    if (s.폭우살혼 % 3 === 0 && s.폭우발동 < 5) {
      s.폭우발동++;
      record(s, dealDamage(s, 30, { noSkillMult: true }), '폭우(발동)');
      applyBuff(s, '사해폭우_마찰', { cr: 15 }, 15, 3);
    }
  }
  // [마심] 15초간 살혼 명중마다 atk 8% 5초 (최대 5중첩, max tier)
  if (s.폭우End > 0 && s.t < s.폭우End) {
    applyBuff(s, '사해폭우_마심', { atk: 8 }, 5, 5);
  }
  // 도천지세 카운터
  s.살혼누적 = (s.살혼누적 || 0) + 1;
  if (s.catSlots.백족 >= 2 && s.famSlots.사해 >= 2 && s.살혼누적 >= 5) {
    s.살혼누적 -= 5;
    // 도천지세: 주변 3명에게 공격력 100% 확정 피해
    record(s, dealDamage(s, 100, { bypassDef: true, noSkillMult: true }), '도천지세');
  }
}

function 독고부여(s, n = 1) {
  // 주술 유파: n개 부여 + 슬롯당 25% 추가 (주술 ≥2)
  if (!famActive(s, '주술')) return;
  pruneDokgo(s);
  const slots = s.famSlots.주술 || 0;
  let traceTag = '';
  if (CFG.randomCrit) {
    // === 랜덤 모드 ===
    // base n: 매번 무작위 1종 선택 (4종 중 균등)
    // 슬롯 보너스: 슬롯당 25% 베르누이, 성공 시 무작위 1종
    let extra = 0;
    for (let i = 0; i < slots; i++) if (Math.random() < 0.25) extra++;
    const totalIntCount = n + extra;
    const drops = {};
    for (let i = 0; i < totalIntCount; i++) {
      const t = 독고_TYPES[Math.floor(Math.random() * 독고_TYPES.length)];
      const before = s.독고[t] || 0;
      s.독고[t] = before + 1;
      s.독고EndT[t] = s.t + 20;
      drops[t] = (drops[t] || 0) + 1;
      // 마상 트리거 (정수 단위 증가)
      const addedWhole = Math.floor(s.독고[t]) - Math.floor(before);
      for (let k = 0; k < addedWhole; k++) {
        if (typeof 마상트리거 === 'function') 마상트리거(s);
      }
    }
    const dropStr = Object.entries(drops).map(([k, v]) => `${k}+${v}`).join(', ') || '없음';
    traceTag = `☠️독고 +${totalIntCount} (base ${n} + 슬롯 ${slots}×25% 시행 → ${extra}추가) [${dropStr}]`;
  } else {
    // === 기댓값 모드 ===
    // 4종 균일 분포 → totalAdd/4 씩 분배
    const slotBonus = slots * 0.25;
    const totalAdd = n + slotBonus;
    for (const t of 독고_TYPES) {
      const before = s.독고[t] || 0;
      s.독고[t] = before + totalAdd / 4;
      s.독고EndT[t] = s.t + 20;
      const addedWhole = Math.floor(s.독고[t]) - Math.floor(before);
      for (let i = 0; i < addedWhole; i++) {
        if (typeof 마상트리거 === 'function') 마상트리거(s);
      }
    }
    traceTag = `☠️독고 +${totalAdd.toFixed(2)} 기댓값 (base ${n} + 슬롯 ${slots}×25% = ${slotBonus.toFixed(2)}) → 4종 균등분배 0.${(totalAdd / 4 * 100).toFixed(0).padStart(2,'0')}/종`;
  }
  const dokgoStr = 독고_TYPES.map((t) => `${t}=${(s.독고[t] || 0).toFixed(2)}`).join(', ');
  TRACE(s, 'STK', `${traceTag} → ${dokgoStr}`);
  // 만고귀종 (주술 2set + 백족 2set): 동일 유형 2중첩 이상 시 격발
  if (s.catSlots.백족 >= 2 && s.famSlots.주술 >= 2) {
    격발체크(s);
  }
}
// 격발 체크 — 두 가지 모드
// - 랜덤 모드 (CFG.randomCrit): 기존 per-type 정수 격발, while 루프로 연쇄 격발
// - 기댓값 모드: 풀 사이즈로부터 binomial 확률 가중 격발 회수 계산 (fractional)
function 격발체크(s) {
  if (CFG.randomCrit) {
    // === 랜덤 모드 — 기존 per-type 정수 격발 ===
    let safety = 20;
    let continued = true;
    while (continued && safety-- > 0) {
      continued = false;
      for (let i = 0; i < 독고_TYPES.length; i++) {
        const t = 독고_TYPES[i];
        if (s.독고[t] >= 2) {
          s.독고[t] -= 2;
          TRACE(s, 'STK', `💥격발 [${t}] 독고 -2 (잔여 ${(s.독고[t] || 0).toFixed(2)}) → 만고귀종 75% + 계약·${계약_TYPES[i]} +1`);
          record(s, dealDamage(s, 75, { noSkillMult: true }), '만고귀종');
          계약획득(s, 계약_TYPES[i], 1);
          onGyeokbal(s, 1);
          continued = true;
        }
      }
    }
    return;
  }
  // === 기댓값 모드 — 확률가중 격발 회수 (단일 패스) ===
  // 풀 N으로부터 E[격발 회수] = 4 × P(Bin(N, 1/4) ≥ 2) 만큼 fractional 격발
  // 단일 패스: 원한/제율이 추가하는 독고는 다음 독고부여 시점에 다시 평가됨 (피드백 루프 차단)
  let pool = 0;
  for (const t of 독고_TYPES) pool += Math.max(0, s.독고[t] || 0);
  const fires = expectedFiresFromPool(pool);
  if (fires < 0.05) return;
  // 풀에서 2 × fires 차감 (4종 균등)
  const consume = Math.min(2 * fires, pool);
  const consumePerType = consume / 4;
  for (const t of 독고_TYPES) {
    s.독고[t] = Math.max(0, (s.독고[t] || 0) - consumePerType);
  }
  TRACE(s, 'STK', `💥격발(기댓값) ${fires.toFixed(2)}회 (풀 ${pool.toFixed(2)} → 한 종 ≥2 확률 ${((fires / 4) * 100).toFixed(1)}%) → 독고 -${consume.toFixed(2)}`);
  // 만고귀종: 75% × fires
  record(s, dealDamage(s, 75 * fires, { noSkillMult: true }), '만고귀종');
  // 계약 4종 균등 분배 (fires/4 each)
  for (let i = 0; i < 계약_TYPES.length; i++) {
    계약획득(s, 계약_TYPES[i], fires / 4);
  }
  // onGyeokbal × fires (원한 추가 독고는 다음 cast 시 격발체크에서 평가)
  onGyeokbal(s, fires);
}
// 격발 1회당 주술 연공 효과 발동 (제율은 이제 계약획득 훅에서 발동, 여기서 제거)
// frac: 격발 회수 (1=정수, 0.x=fractional)
function onGyeokbal(s, frac = 1) {
  const sel = s.selectedSkills || new Set();
  // [경선+주견 max] 독고 격발 시 40+20=60% 술법 (주견 계수 +20% 덧셈), 최대 4+3=7회
  if (sel.has('주술·경선')) {
    const start = s.경선발동 || 0;
    const cap = Math.max(0, 7 - start);
    const eff = Math.min(frac, cap);
    if (eff > 0) {
      s.경선발동 = start + eff;
      record(s, dealDamage(s, (40 + 20) * eff, { noSkillMult: true }), '경선(격발)');
    }
  }
  // [원한] 격발 시 독고 1 추가 (max tier: 6회/cycle)
  if (sel.has('주술·경선')) {
    const start = s.원한발동 || 0;
    const cap = Math.max(0, 6 - start);
    const eff = Math.min(frac, cap);
    if (eff > 0) {
      s.원한발동 = start + eff;
      for (const t of 독고_TYPES) {
        s.독고[t] = (s.독고[t] || 0) + eff / 4;
        s.독고EndT[t] = s.t + 20;
      }
    }
  }
}

// 계약 4종을 정식 applyBuff로 처리. 각 키별로 5중첩 max, 20s TTL 부여 시 갱신.
// 강령(피해 감면 +6% — 자기 방어): 공격엔 무효 → 무시
// 환생(방어 +6% — 자기 방어): 공격엔 무효 → 무시
// 실혼 계약: cr +6%/스택
// 매혹 계약: 신통 피해 심화 +6%/스택 (amp)
// 계약 획득 — frac=1 정수, frac<1 은 확률가중 격발용 fractional
function 계약획득(s, ct, frac = 1) {
  if (frac <= 0) return;
  if (ct === '실혼') {
    applyBuffFrac(s, '계약·실혼', { cr: 6 }, 20, 5, frac);
  } else if (ct === '매혹') {
    applyBuffFrac(s, '계약·매혹', { cat: 'amp', dmgMult: 6 }, 20, 5, frac);
  } else {
    // 강령/환생: 자기 방어 버프, 공격엔 영향 X. 카운터만 유지 (계약합 계산용)
    applyBuffFrac(s, '계약·' + ct, {}, 20, 5, frac);
  }
  const fmt = frac >= 1 ? frac.toFixed(0) : frac.toFixed(2);
  TRACE(s, 'BUF', `📜[계약·${ct}] +${fmt} → 계약합 ${계약합(s).toFixed(2)}/20 (20초)`);
  // 제율 — 계약 획득할 때마다 15% 술법 (전투 최대 5회)
  if (typeof 제율트리거 === 'function') 제율트리거(s, frac);
}
// 현재 계약 총 중첩수 (4종 합산)
function 계약합(s) {
  let sum = 0;
  for (const ct of 계약_TYPES) {
    const b = s.buffs.find(b => b.key === '계약·' + ct && b.endT > s.t);
    if (b) sum += b.stackCount || 1;
  }
  return sum;
}

// 주술 (4)
SK['주술·제율'] = {
  fam: '주술', cat: '백족', main: 300,
  cast(s, slots) {
    // (독고는 본문 공통 트리거에서 자동 부여, 제율 효과는 격발 훅에서 발동)
    // [제율] 시전 시마다 5회로 리셋
    s.제율남은 = 5;
    // cycle당 제율 발동 카운터 초기화 (본 신통 cast 시)
    s.제율발동 = 0;
    record(s, dealDamage(s, 300));
  }
};
SK['주술·태사'] = {
  fam: '주술', cat: '백족', main: 270,
  cast(s, slots) {
    const 합2 = 계약합(s);
    // [태사] 계약당 10s atk 7% (max 35%, max tier)
    applyBuff(s, '주술태사_태사', { atk: 7 * Math.min(합2, 5) }, 10);
    // 본 신통 main — 3명 광역 물리 270%
    record(s, dealDamage(s, 270));
    const prev = s._currentSource;
    // [독고 저주] 계약 2중첩 이상 시 100% 추가 물리 + 2독고 (max tier)
    if (합2 >= 2) {
      s._currentSource = '독고저주(계약2+)';
      TRACE(s, 'OPT', `🟠독고저주 발동: 계약 ${합2}중첩 → 100% 물리 + 2독고`);
      record(s, dealDamage(s, 100, { noSkillMult: true }), '독고저주');
      독고부여(s, 2);
    }
    // [겁인] 계약당 30% 추가 물리 × 최대 5회 (max tier)
    if (합2 > 0) {
      const cnt = Math.min(합2, 5);
      s._currentSource = '겁인(계약당)';
      TRACE(s, 'OPT', `🟠겁인 발동: 계약 ${합2}중첩 → 30% × ${cnt}회 물리`);
      record(s, dealDamage(s, 30 * cnt, { noSkillMult: true }), '겁인');
    }
    // [망식] 계약 3중첩 이상 시 180% 물리 1회 (max tier)
    if (합2 >= 3) {
      s._currentSource = '망식(계약3+)';
      TRACE(s, 'OPT', `🟠망식 발동: 계약 ${합2}중첩 → 180% 물리`);
      record(s, dealDamage(s, 180, { noSkillMult: true }), '망식');
    }
    s._currentSource = prev;
  }
};
SK['주술·경선'] = {
  fam: '주술', cat: '백족', main: 270,
  cast(s, slots) {
    s.경선발동 = 0;
    s.원한발동 = 0;
    // 본 신통 main — 3명 광역 2회 술법 270% (총합)
    record(s, dealDamage(s, 270));
    // [심장] 1~3 독고 부여 + 40% 술법 × 평균 2회 (max tier)
    독고부여(s, 2);
    const prev = s._currentSource;
    s._currentSource = '심장(평균2회)';
    record(s, dealDamage(s, 40 * 2, { noSkillMult: true }), '심장');
    s._currentSource = prev;
  }
};
SK['주술·유식'] = {
  fam: '주술', cat: '백족', main: 300,
  cast(s, slots) {
    // 본 신통 main — 4회 공격 총합 300% 물리
    record(s, dealDamage(s, 300));
    const prev = s._currentSource;
    // [유식] 본 신통 시전 시 1독고 + 30% 추가 물리 (최대 3회 발동, max tier)
    // "최대 3회 발동" = per cast 최대 3회 (4회 공격 중 3회 발동 상한)
    for (let i = 0; i < 3; i++) 독고부여(s, 1);
    s._currentSource = '유식(효과)';
    record(s, dealDamage(s, 30 * 3, { noSkillMult: true }), '유식');
    // [심장] 1~3 독고 + 40% × 평균 2회 물리 (max tier)
    독고부여(s, 2);
    s._currentSource = '심장(평균2회)';
    record(s, dealDamage(s, 40 * 2, { noSkillMult: true }), '심장');
    s._currentSource = prev;
    // [독주] 본 신통 시전 15초 후 발동 예약 (계약합 snapshot은 발동 시점 기준)
    s.독주FireT = s.t + 15;
  }
};

// 사해 (4)
SK['사해·열천'] = {
  fam: '사해', cat: '백족', main: 187,
  cast(s, slots) {
    // [열천] 15초간 10히트마다 살혼 10% (max tier) + [마념] 살혼 2회마다 24% 술법 (max tier)
    s.열천End = s.t + 15;
    s.열천히트 = 0;
    s.열천발동 = 0;
    s.마념카운터 = 0;
    // [마위] 2갈래 살혼 (1갈래당 30% 확정, max tier)
    살혼발사(s, 30);
    살혼발사(s, 30);
    // [천살] 본 신통 피해 +15% (max tier)
    record(s, dealDamage(s, 187 * 1.15));
  }
};
SK['사해·폭우'] = {
  fam: '사해', cat: '백족', main: 220,
  cast(s, slots) {
    // [폭우] 15초간 살혼 3회마다 30% 물리 (max tier, 최대 5회)
    s.폭우End = s.t + 15;
    s.폭우살혼 = 0;
    s.폭우발동 = 0;
    // [살진] 2갈래 살혼 (1갈래당 30% 확정, max tier)
    살혼발사(s, 30);
    살혼발사(s, 30);
    record(s, dealDamage(s, 220));
  }
};
SK['사해·업련'] = {
  fam: '사해', cat: '백족', main: 187,
  cast(s, slots) {
    // [업련] 방어력 15% 감소 + 살혼 30% 확정 (max tier)
    applyBuff(s, '사해업련_업련', { defDebuff: 15 }, 10);
    살혼발사(s, 30);
    // [살심] atk 30% + 살혼 30% (max tier)
    applyBuff(s, '사해업련_살심', { atk: 30 }, 10);
    살혼발사(s, 30);
    // [연탄] crRes 15% + 살혼 30% (max tier)
    applyBuff(s, '사해업련_연탄', { crRes: 15 }, 15);
    살혼발사(s, 30);
    // [암염] 2갈래 살혼 (1갈래당 30% 확정, max tier)
    살혼발사(s, 30);
    살혼발사(s, 30);
    record(s, dealDamage(s, 187));
  }
};
// 약화 효과 중첩수: 속성 하락(defDebuff, crRes) + 지속 피해(작열, 독고)
function count약화(s) {
  let cnt = 0;
  // 활성 defDebuff/crRes 버프: 중첩수만큼 카운트 (1 debuff × N stacks = N 약화)
  for (const b of s.buffs) {
    if (b.endT <= s.t) continue;
    const sc = b.stackCount || 1;
    if (b.defDebuff) cnt += sc;
    if (b.crRes) cnt += sc;
  }
  // 작열 스택: 각 스택 = 1 약화
  cnt += s.stacks.작열 || 0;
  // 독고 4종: 각 타입의 중첩수
  for (const t of 독고_TYPES) {
    cnt += s.독고[t] || 0;
  }
  return cnt;
}
SK['사해·명화'] = {
  fam: '사해', cat: '백족', main: 198,
  cast(s, slots) {
    // [2마상] 시전 시마다 5회로 리셋
    s.마상남은 = 5;
    // [명화] 30초(15+암용15, max tier) 동안 신통 시전 시 살혼 20% 확정 (max tier)
    // [유령불] 명화 살혼 2회마다 30% 물리 (max tier) — 명화살혼발사 래퍼에서 자동 처리
    s.명화End = s.t + 30;
    s.유령불카운터 = 0;
    const prevSrc = s._currentSource;
    s._currentSource = '명화(지속)';
    명화살혼발사(s, 20); // max tier: 20% 확정
    s._currentSource = prevSrc;
    s._명화이미처리 = true;
    s._recordHits = 3;
    record(s, dealDamage(s, 198 * MH[3]));
  }
};

// ======================== 법보 ========================
// 모든 법보: base 5.64억 절대값 + 호신강기에 추가 4.52억 (대상 보유 시), 32s CD, 5s 공통쿨 공유
// 원문: "재사용 시간: 32초, 적군에게 5.64억의 피해를 입히고, 호신강기에 추가로 4.52억의 피해를 입힌다"
// 법보: 공격력 100% 기반 (신통과 동일 시스템)
const TREASURES = {
  환음요탑: {
    name: '환음요탑',
    cast(s) {
      // 대상 호신강기 보유 시 본 법보 피해 +25%
      // 기댓값: 확률 × 25 / 랜덤: 주사위 roll → 발동 시 full 25
      const mult = 1 + 0.25 * probScale(CFG.호신강기대상확률);
      record(s, dealDamage(s, 100 * mult));
    }
  },
  참원선검: {
    name: '참원선검',
    cast(s) {
      // 본 법보 피해 +10%~+20% (대상 현재 체력% 낮을수록 증가) — 실시간 HP 기반 선형
      const mult = 1 + (0.10 + 0.10 * hpLowFactor(s));
      record(s, dealDamage(s, 100 * mult));
    }
  },
  유리옥호: {
    name: '유리옥호',
    cast(s) {
      record(s, dealDamage(s, 100));
      // 10초간 자가 cr+15, cd+15 (신통/법보 치명타 피해 배율 +15%)
      applyBuff(s, '유리옥호_버프', { cr: 15, cd: 15, shintongOnly: true }, 10); // "신통/법보 치명타 피해 배율"
    }
  },
  오염혁선: {
    name: '오염혁선',
    cast(s) {
      // 자신 호신강기 보유 시 본 법보 피해 +15%
      // 기댓값: 확률 × 15 / 랜덤: 주사위 roll → 발동 시 full 15
      const mult = 1 + 0.15 * probScale(CFG.자신호신강기확률);
      record(s, dealDamage(s, 100 * mult));
    }
  },
};
const ALL_TREASURES = Object.keys(TREASURES);

// ======================== 유파 메타 ========================
const FAMILIES = {
  복룡: { cat: '영검', skills: ['복룡·절화','복룡·약영','복룡·결운','복룡·붕산'] },
  균천: { cat: '영검', skills: ['균천·진악','균천·현봉','균천·파월','균천·관일'] },
  참허: { cat: '영검', skills: ['참허·횡추','참허·단진','참허·엄동','참허·분광'] },
  중광: { cat: '영검', skills: ['중광·귀사','중광·투영','중광·육요','중광·환성'] },
  열산: { cat: '화염', skills: ['열산·염폭','열산·양운','열산·성료','열산·순일'] },
  형혹: { cat: '화염', skills: ['형혹·업화','형혹·겁염','형혹·흑성','형혹·함양'] },
  이화: { cat: '화염', skills: ['이화·풍권','이화·염우','이화·염무','이화·삼매'] },
  천로: { cat: '화염', skills: ['천로·단주','천로·직염','천로·유형','천로·운화'] },
  청명: { cat: '뇌전', skills: ['청명·투진','청명·천노','청명·붕운','청명·풍뢰'] },
  옥추: { cat: '뇌전', skills: ['옥추·황룡','옥추·소명','옥추·수광','옥추·청사'] },
  오뢰: { cat: '뇌전', skills: ['오뢰·천강','오뢰·경칩','오뢰·호후','오뢰·용음'] },
  신소: { cat: '뇌전', skills: ['신소·운록','신소·천고','신소·환뢰','신소·청삭'] },
  주술: { cat: '백족', skills: ['주술·제율','주술·태사','주술·경선','주술·유식'] },
  사해: { cat: '백족', skills: ['사해·열천','사해·폭우','사해·업련','사해·명화'] },
};

// ======================== 빌드 시뮬 ========================
function selectSkillsForBuild(build) {
  // build = [[famKey, slots], ...]  총 6
  // 각 유파에서 raw main이 높은 상위 slots개 선택
  const chosen = [];
  for (const [f, s] of build) {
    const skills = FAMILIES[f].skills.slice();
    skills.sort((a, b) => SK[b].main - SK[a].main);
    chosen.push(...skills.slice(0, s).map(n => ({ name: n, fam: f })));
  }
  return chosen;
}
function simulateBuild(build, treasures, orderOverride, skillsOverride, opts) {
  // skillsOverride: [{name, fam}, ...] 6개. 지정 시 자동선택 대신 사용.
  // opts.maxTime: 시뮬 조기 종료 시간 (초). 랭킹 속도 향상용 (예: 60초 기준이면 maxTime:60)
  // opts.targetLawBody: 상대 법체 ('영검'|'화염'|'뇌전'|'백족'|null) — 상성 +20% 계산
  const chosen = skillsOverride || selectSkillsForBuild(build); // 6 신통
  const state = newState();
  state.build = build;
  state.treasures = treasures;
  state.selectedSkills = new Set(chosen.map(c => c.name));
  state.targetLawBody = (opts && opts.targetLawBody) || null;
  // 호신강기 / HP 풀 초기화
  state.shieldRem = CFG.baseShield;
  state.hpRem = CFG.baseHP;
  // 트리거 조건 옵션 초기화 — 신통 장착만으로 활성 (cast 무관)
  if (state.selectedSkills.has('균천·관일')) {
    state.검망남은 = 6; state.검망max = 6; state.검망증폭 = 60;
  }
  if (state.selectedSkills.has('열산·양운')) state.진염남은 = 3;
  if (state.selectedSkills.has('열산·순일')) { state.진공남은 = 4; state.순일남은 = 5; }
  // 불씨 — opts 로 전달된 경우만 활성 (수동 시뮬), 자동 탐색에서는 기본 CFG(전부 0) 적용
  if (opts && opts.불씨) state.불씨 = opts.불씨;
  불씨검증(state);
  // 불씨 타임라인 표시용: 상시 적용(패시브)인 세트는 시뮬 전체 지속 BUF 로 emit
  // 진무절화는 "3번째 신통 소비 시점" 에 dealDamage 내부에서 별도 TRACE 발동 → 여기서 제외
  // 진마성화는 세션 내내 장착 상태이므로 세션 바로 표시 + 실제 스택 변화는 STK 로그(자원 스택 행)
  {
    const simDur = (opts && opts.maxTime) ? opts.maxTime : 180;
    const 불씨Meta = [
      { name: '통명묘화', tiers: [4, 6, 8], max: 3, label: '신통 심화피해' },
      { name: '태현잔화', tiers: [4, 6, 8], max: 3, label: '신통 입히는피해 기댓값 (0~2배 랜덤)' },
      { name: '유리현화', tiers: [5, 10, 15], max: 3, label: '신통 심화피해' },
      { name: '진마성화', tiers: [1, 3, 3], max: 6, label: '신통 1회마다 심화피해/스택 (최대 10중첩)' },
    ];
    for (const m of 불씨Meta) {
      const val = 불씨급수값(state, m.name, m.tiers);
      const cnt = (state.불씨 && state.불씨[m.name]) || 0;
      if (cnt > 0 && val > 0) {
        TRACE(state, 'BUF', `🔼버프 [불씨 ${m.name}] ${m.label} +${val}% (${cnt}/${m.max}) (${simDur}초)`);
      }
    }
  }
  for (const [f, s] of build) state.famSlots[f] = s;
  for (const [f, s] of build) {
    const cat = FAMILIES[f].cat;
    state.catSlots[cat] = (state.catSlots[cat] || 0) + s;
  }
  // === 신통 장착 시 활성화되는 옵션 카운터 초기화 ===
  // spec 상 시간 윈도우 없이 "(최대 N회)" 만 명시된 옵션들은 신통 장착 시 전투 내내 활성 (cast 전에도 트리거 가능).
  // 신통 cast() 본문에서 카운터 set 만 하면 cast 전 트리거 시 발동 안 함 → 여기서 미리 초기화.
  // (시간 윈도우 있는 [업화]/[흑성]/[함양] 같은 옵션은 cast 시점에 *End 로 활성화되므로 여기서 set 안 함)
  if (state.selectedSkills) {
    if (state.selectedSkills.has('열산·순일')) {
      state.진공남은 = 4; state.진공max = 4;        // [진공] (최대 4회)
      state.순일남은 = 5; state.순일max = 5;        // [순일+분궁] (최대 5회)
    }
    if (state.selectedSkills.has('열산·양운')) {
      state.진염남은 = 3; state.진염max = 3;        // [진염] (최대 3회 — 염양 시 발동, 신통 장착 즉시 활성)
      // [적염] 은 [단진]/[파월] 패턴 — 양운 cast 후부터 활성. 양운 cast() 본문에서 적염활성=true.
    }
  }

  // 이벤트 스케줄 생성: 9개 슬롯 순차 발동 (5s 공통쿨 공유).
  // orderOverride = [{kind:'skill'|'treasure', idx}, ...] 길이 9 (선택)
  // 미지정 시 기본: 신통6 → 법보3
  let order = orderOverride;
  if (!order) {
    order = [];
    for (let i = 0; i < 6; i++) order.push({ kind: 'skill', idx: i });
    // 법보가 있으면 3개까지 추가 (없으면 skill만 6개)
    const trLen = (treasures && treasures.length) ? Math.min(3, treasures.length) : 0;
    for (let i = 0; i < trLen; i++) order.push({ kind: 'treasure', idx: i });
  }
  const events = [];
  // 시뮬 시간 = maxTime 정확히. 이벤트 루프는 maxT 이후 break 하므로 버퍼 불필요.
  const simMaxTime = (opts && opts.maxTime) ? opts.maxTime : 180;
  const totalSec = simMaxTime;
  // cast 이벤트: 5초 간격으로 order 순환 (신통6+법보3 = 9cast = 45s/cyc)
  let castIdx = 0;
  for (let t = 0; t < totalSec; t += 5) {
    events.push({ t, kind: order[castIdx].kind, idx: order[castIdx].idx });
    castIdx = (castIdx + 1) % order.length;
  }
  // 작열 틱 이벤트: 매 초, 부여 후 1초 뒤 첫 틱
  for (let sec = 1; sec < totalSec; sec++) {
    events.push({ t: sec, kind: '작열tick', pri: 1 });
  }
  // 평타 이벤트: 60초에 40회 = 1.5초 간격
  const 평타간격 = 60 / 40; // 1.5초
  for (let t = 평타간격; t < totalSec; t += 평타간격) {
    events.push({ t: t, kind: '평타', pri: 2 });
  }
  // 정렬: 같은 시간이면 pri 오름차순 (시전=0 → 작열=1 → 평타=2)
  events.sort((a, b) => a.t - b.t || (a.pri || 0) - (b.pri || 0));

  // maxTime 옵션: 지정 시간 이후 이벤트 스킵 (조기 종료)
  const maxT = (opts && opts.maxTime) ? opts.maxTime + 0.001 : Infinity;

  for (const ev of events) {
    if (ev.t > maxT) break;
    state.t = ev.t;
    state.buffs = state.buffs.filter(b => b.endT > state.t - 0.1);
    // TTL 스택 만료 처리 (검세/뇌인/옥추 개별 20s)
    pruneStackTTL(state);
    // 작열 개별 타이머 만료 처리
    prune작열(state);
    // 검심통명 플래그를 버프와 동기화 (10s 만료 시 자동 off)
    state.stacks.검심통명 = state.buffs.some(b => b.key === '검심통명' && b.endT > state.t) ? 1 : 0;
    if (CFG.preEvent) CFG.preEvent(state, ev);
    // 관일 종료 체크 (천연: 검세 1중첩당 30% 호무, 최대 5회) max tier
    if (state.관일End > 0 && state.t >= state.관일End && !state.관일종료처리) {
      const js = Math.min(state.stacks.검세, 5);
      const _prevSrc = state._currentSource;
      const _prevAct = state._activeCast;
      state._activeCast = '균천·관일';
      for (let i = 0; i < js; i++) {
        record(state, dealDamage(state, 30, { noSkillMult: true, type: '호무' }), `천연(호무) ${i+1}/${js}`);
      }
      state._currentSource = _prevSrc;
      state._activeCast = _prevAct;
      // [천연] 만 처리. 검망/쇄일 은 관일 창과 무관 — 잔여 리셋 안 함.
      state.관일종료처리 = true;
    }
    // [주술·유식 독주] 본 신통 시전 15초 후 발동 (발동 시점 계약합 기준)
    if (state.독주FireT > 0 && state.t >= state.독주FireT) {
      const 합 = 계약합(state);
      const doksu = 30 * Math.min(합, 5); // 최대 5중첩
      if (doksu > 0) {
        const prev = state._currentSource;
        state._currentSource = '독주(15s지연)';
        TRACE(state, 'OPT', `🟠독주 발동: 유식 15s 후, 계약 ${합}중첩 → ${doksu}% 물리`);
        record(state, dealDamage(state, doksu, { noSkillMult: true }), '독주');
        // [고담] 독주 발동 시점에 계약 3중첩 이상이면 180% 추가 물리 (max tier)
        if (합 >= 3) {
          state._currentSource = '고담(독주+3중첩)';
          TRACE(state, 'OPT', `🟠고담 발동: 독주+계약 ${합}중첩 → 180% 물리`);
          record(state, dealDamage(state, 180, { noSkillMult: true }), '고담');
        }
        state._currentSource = prev;
      }
      state.독주FireT = 0;
    }
    // [옥추·수광 천붕] 수광 종료 시 옥추 2중첩당 30% 물리 (max tier)
    if (state.수광End > 0 && state.t >= state.수광End && !state.수광종료처리) {
      const 천붕 = state.stacks.옥추 >= 2 ? Math.floor(state.stacks.옥추 / 2) * 30 : 0;
      if (천붕 > 0) {
        const prev = state._currentSource;
        state._currentSource = '천붕(수광종료)';
        TRACE(state, 'OPT', `🟠천붕 발동: 수광 종료, 옥추 ${state.stacks.옥추}중첩 → ${천붕}% 물리`);
        record(state, dealDamage(state, 천붕, { noSkillMult: true }));
        state._currentSource = prev;
      }
      state.수광종료처리 = true;
    }
    if (ev.kind === '평타') {
      state._currentSource = '평타';
      // 평타: 공격력 100% 물리, noSkillMult (atk + crit + def만 적용)
      // 평타 95% 대미지 감소 적용
      record(state, dealDamage(state, 100, { noSkillMult: true }) * 0.05);
      continue;
    }
    if (ev.kind === '작열tick') {
      tick작열(state);
      continue;
    }
    if (ev.kind === 'skill') {
      const sk = chosen[ev.idx];
      if (sk) {
        const slots = state.famSlots[sk.fam];
        // 시전 전 스냅샷 (자원/대상)
        prune작열(state); prune화상(state); pruneDokgo(state);
        const beforeRsrc = `검세=${state.stacks.검세||0}, 검심=${state.stacks.검심||0}, 뇌인=${state.stacks.뇌인||0}, 옥추=${state.stacks.옥추||0}, 신소=${state.stacks.신소||0}`;
        const beforeDokgo = Object.values(state.독고||{}).reduce((a,b)=>a+b,0);
        const before계약 = 계약합(state);
        let before약화 = 0;
        for (const b of state.buffs) {
          if (b.endT <= state.t) continue;
          if (b.defDebuff || b.crRes) before약화 += b.stackCount || 1;
        }
        const beforeDebuffs = `작열=${state.stacks.작열||0}(부여카운터=${state.작열부여카운터||0}/6), 화상=${state.화상||0}, 독고=${beforeDokgo.toFixed(1)}, 계약=${before계약}, 약화디버프=${before약화}`;
        // 헤더 (시전 시작, 시전 전 상태)
        TRACE(state, 'CST', `▶ ${sk.name}\n           [시전 전 자원] ${beforeRsrc}\n           [시전 전 대상] ${beforeDebuffs}`);
        state.castCounts = state.castCounts || {};
        state.castCounts[sk.name] = (state.castCounts[sk.name] || 0) + 1;
        // === 사이클 (45초) 경계마다 옵션 카운터 reset ===
        // "신통 시전 시 (최대 N회)" 류는 cast 마다 reset 이라 여기 제외.
        // 사이클 reset 대상: 다른 트리거 (천검 발동 시 / 염양 발동 시) 로 발동되는 옵션
        // [검망] (관일, 천검 시) / [진염] (양운, 염양 시) / [진공]·[순일+분궁] (순일, 염양 시)
        const cycleIdx = Math.floor(state.t / 45);
        if (cycleIdx > (state._lastCycleResetIdx || 0)) {
          state._lastCycleResetIdx = cycleIdx;
          const sel = state.selectedSkills || new Set();
          const cast = state.castCounts || {};
          // [검망] (관일 신통 장착 시 항상 활성, 천검 발동 시 fire — 관일 cast 무관)
          if (sel.has('균천·관일')) { state.검망남은 = 6; state.검망증폭 = 60; }
          // [진염] (양운 장착 시 항상 활성, 염양 발동 시 fire)
          if (sel.has('열산·양운')) state.진염남은 = 3;
          // [진공]·[순일+분궁] (순일 장착 시 항상 활성, 염양 발동 시 fire)
          if (sel.has('열산·순일')) { state.진공남은 = 4; state.순일남은 = 5; }
        }
        // 활성 cast 신통명 — 이 cast 동안의 모든 record() 에 attached (DamageBreakdown 그룹화용)
        state._activeCast = sk.name;
        // === 이 cast 의 crit 추적 + 확률 roll 초기화 ===
        state._castAnyCrit = false;
        state._castCritCount = 0;
        // SNAP buff/stack 캡처 플래그 리셋 — record() 첫 호출 시 스냅샷 저장
        state._snapBuffsCaptured = false;
        state._snapBuffsAtDmg = null;
        state._snapStacksAtDmg = null;
        state._snapNextCastConsumed = null;  // nextCast 소비 스냅샷 리셋
        state._consumedNextCastSources = [];  // 이전 cast 의 소비 source 가 stale 로 남지 않도록 리셋
        state._inMainCast = false;  // pre-cast hook 단계에선 false (메인 cast 진입 시 true)
        // 태현잔화: cast 시작 시 1회 roll (랜덤 모드에서만), 캐시해서 dealDamage 여러 번 호출돼도 동일 값
        if (CFG.randomCrit) {
          const 태현기댓값 = 불씨급수값(state, '태현잔화', [4, 6, 8]);
          if (태현기댓값 > 0) {
            // 기댓값이 절반이므로 원문 max 는 2× 기댓값 → 0 ~ 2*expected 로 roll
            state._tahyunRoll = Math.random() * 2 * 태현기댓값;
          } else {
            state._tahyunRoll = null;
          }
        } else {
          state._tahyunRoll = null;
        }
        // === 시전시 per-cast 작열부여 트리거 (cast 전에 즉발) ===
        // [열산·순일 치황] per-cast: 20s 동안 신통 시전 시 작열 1중첩 44%
        // 본 신통(순일) cast 자체에도 적용되도록 sk.name 체크 추가
        if (sk.name === '열산·순일' || state.buffs.some(b => b.key === '열산순일_치황' && b.endT > state.t)) {
          if (state.selectedSkills && state.selectedSkills.has('열산·순일')) {
            작열부여(state, 1, 44, '순일·치황');
          }
        }
        // [형혹·흑성 혹성] per-cast: 35s 동안 신통 시전 시 작열 1중첩 40% + [성염] 20% 물리
        if (sk.name === '형혹·흑성' || state.buffs.some(b => b.key === '형혹흑성_혹성' && b.endT > state.t)) {
          if (state.selectedSkills && state.selectedSkills.has('형혹·흑성')) {
            작열부여(state, 1, 40, '흑성·혹성');
            state._currentSource = '성염';
            record(state, dealDamage(state, 20, { noSkillMult: true }));
          }
        }
        // [이화·풍권 점화] per-cast: 35s 동안 신통 시전 시 작열 1중첩 36%
        if (sk.name === '이화·풍권' || state.buffs.some(b => b.key === '이화풍권_점화' && b.endT > state.t)) {
          if (state.selectedSkills && state.selectedSkills.has('이화·풍권')) {
            작열부여(state, 1, 36, '풍권·점화');
          }
        }
        // [천로·단주 광염+충염] 8회 신통 명중 시 작열 1중첩 (단주 cast 포함, [단진]/[파월] 패턴)
        if (sk.name === '천로·단주' && state.selectedSkills && state.selectedSkills.has('천로·단주')) {
          state.광염남은 = 8; state.광염max = 8;
        }
        if ((state.광염남은 || 0) > 0 && state.selectedSkills && state.selectedSkills.has('천로·단주')) {
          const 광염used = (state.광염max || 8) - state.광염남은 + 1;
          TRACE(state, 'OPT', `🟠단주·광염 발동: 신통 명중 → 작열 1중첩 36% (${광염used}/${state.광염max || 8}회)`);
          state.광염남은--;
          작열부여(state, 1, 36, '단주·광염');
        }
        // [균천·파월 → 제월] 즉시 (조건 없음) — 파월 cast 시 가장 먼저 발동 (시전 시 트리거보다 빠름).
        // atk+26 buff 가 본 신통 데미지에 반영, 천검도 가장 먼저 발동되어 [검망] cascade 가 본 신통 전 처리.
        if (sk.name === '균천·파월' && state.famSlots.균천) {
          TRACE(state, 'OPT', `🟠파월·제월 발동: 즉시 → 천검 1회 + atk 26% 5s`);
          applyBuff(state, '균천파월_제월', { atk: 26 }, 5);
          천검발동(state, state.famSlots.균천, 0, '천검(제월)');
        }
        // [참허·단진+연광] per-cast: 6회 신통 시전 시 검심+1 + atk 12% 5s (단진 cast 포함)
        // pre-DMG 위치 — 본 신통 record 전에 buff 적용되어 자기 cast 데미지에도 반영
        if (sk.name === '참허·단진' && state.famSlots.참허) {
          state.단진남은 = 6; state.단진max = 6;
        }
        if (state.famSlots.참허 && (state.단진남은 || 0) > 0) {
          const 단진used = (state.단진max || 6) - state.단진남은 + 1;
          TRACE(state, 'OPT', `🟠단진·단진 발동: 신통 시전 → 검심+1 + atk 12% 5s (${단진used}/${state.단진max || 6}회)`);
          state.단진남은--;
          검심획득(state, 1);
          applyBuff(state, '참허단진_단진_' + state.단진남은, { atk: 12 }, 5);
        }
        // [균천·파월] per-cast: 4회 신통 시전 시 검세+1 + atk 15% 5s (파월 cast 포함)
        if (sk.name === '균천·파월' && state.famSlots.균천) {
          state.파월남은 = 4; state.파월max = 4;
        }
        if (state.famSlots.균천 && (state.파월남은 || 0) > 0) {
          const 파월used = (state.파월max || 4) - state.파월남은 + 1;
          TRACE(state, 'OPT', `🟠파월·파월 발동: 신통 시전 → 검세+1 + atk 15% 5s (${파월used}/${state.파월max || 4}회)`);
          state.파월남은--;
          검세획득_균천(state, state.famSlots.균천, 1);
          applyBuff(state, '균천파월_파월_' + state.파월남은, { atk: 15 }, 5);
        }
        // [열산·양운 적염] per-cast: 임의 신통 시전 시 작열 1중첩 44% (최대 4회 발동, 전투 누적)
        // 단, 양운이 한 번이라도 cast 된 후부터 활성화 (sk.name === '열산·양운' 이면 그 cast 부터 활성)
        if ((state.적염활성 || sk.name === '열산·양운') && state.selectedSkills && state.selectedSkills.has('열산·양운')) {
          if (state.적염남은 == null) state.적염남은 = 4;
          if (state.적염남은 > 0) {
            state.적염남은--;
            const used = 4 - state.적염남은;
            TRACE(state, 'OPT', `🟠양운·적염 발동: 신통 시전 → 작열 1중첩 44% (${used}/4회)`);
            작열부여(state, 1, 44, `양운·적염 (${used}/4)`);
          }
        }
        // [형혹·업화 업화] per-cast: 임의 신통 시전 시 작열 1중첩 40% (최대 4회 + [연염] +4회 = 8회 cap)
        if ((state.업화활성 || sk.name === '형혹·업화') && state.selectedSkills && state.selectedSkills.has('형혹·업화')) {
          if (state.업화남은 == null) state.업화남은 = 8;
          if (state.업화남은 > 0) {
            state.업화남은--;
            const used = 8 - state.업화남은;
            TRACE(state, 'OPT', `🟠업화·업화 발동: 신통 시전 → 작열 1중첩 40% (${used}/8회)`);
            const prevSrc = state._currentSource;
            state._currentSource = '업화(트리거)';
            작열부여_형혹(state, state.famSlots.형혹 || 0, 1, `업화·업화 (${used}/8)`);
            // [염혼] 업화로 작열 부여 시 atk 10% 10초 max3
            applyBuff(state, '형혹업화_염혼', { atk: 10 }, 10, 3);
            state._currentSource = prevSrc;
          }
        }
        // === cast 실행 ===
        state._currentSource = sk.name;
        // _inMainCast: 본 신통 cast 실행 중에만 true.
        // record() 가 _snapBuffsCaptured 를 set 하는 조건과 applyBuff [post] 태깅 조건의
        // 기준이 되는 플래그 — pre-cast hook 의 폭파 record / applyBuff 와 구분하기 위함.
        state._inMainCast = true;
        SK[sk.name].cast(state, slots);
        state._inMainCast = false;
        // 청명 유파: 임의 신통 명중 시 뇌인 1중첩 획득
        뇌인획득(state);
        // 활성 버프 수치 스냅샷 — DMG 적용 시점 상태 (post-DMG 트리거 buff/stack 제외)
        // 본 cast 데미지에 실제로 영향을 준 buff 만 표시 — post-dmg buff 는 다음 cast 위치 막대에서 확인 가능
        {
          // 기여 소스별 분해 (툴팁 용)
          const bd = { atk: [], inc: [], amp: [], dealt: [], cr: [], cd: [], crRes: [], defDebuff: [], finalCR: [], finalCD: [], finalDmg: [] };
          const pushBuff = (field, key, val) => { if (val) bd[field].push({ src: key, val }); };
          // SNAP 용 buff/stack: record() 첫 호출 시점 캡처본 사용 (post-DMG 폭파/트리거 buff 제외)
          const snapBuffs = state._snapBuffsAtDmg || state.buffs;
          const snapStacks = state._snapStacksAtDmg || state.stacks;
          // applyBuff 기반 버프/디버프
          for (const b of snapBuffs) {
            if (b.endT <= state.t) continue;
            const stack = b.stackCount || 1;
            const label = (b.key || '?') + (stack > 1 ? `×${stack}` : '');
            if (b.atk) pushBuff('atk', label, b.atk * stack);
            if (b.cr && !b.shintongOnly) pushBuff('cr', label, b.cr * stack);
            if (b.cr && b.shintongOnly) pushBuff('cr', label + '(신통)', b.cr * stack);
            if (b.cd) pushBuff('cd', label, b.cd * stack);
            if (b.crRes) pushBuff('crRes', label, b.crRes * stack);
            if (b.defDebuff) pushBuff('defDebuff', label, b.defDebuff * stack);
            if (b.cat === 'amp' && b.dmgMult) pushBuff('amp', label, b.dmgMult * stack);
            if (b.cat === 'inc' && b.dmgMult) pushBuff('inc', label, b.dmgMult * stack);
            if (b.cat === 'dealt' && b.dmgMult) pushBuff('dealt', label, b.dmgMult * stack);
            if (b.dealt) pushBuff('dealt', label, b.dealt * stack);  // legacy fallback
          }
          // 유파/공명/불씨 패시브 — 스택은 snapStacks 기준
          if (famActive(state, '청명') && snapStacks.뇌인) pushBuff('cr', `뇌인×${snapStacks.뇌인}`, snapStacks.뇌인 * 5);
          if ((state.catSlots.뇌전 || 0) >= 2) pushBuff('cr', `뇌전공명(${state.catSlots.뇌전}슬롯)`, 11);
          if (famActive(state, '옥추') && snapStacks.옥추) pushBuff('inc', `옥추×${snapStacks.옥추}`, snapStacks.옥추);
          if (famActive(state, '옥추') && snapStacks.옥추 > 0) pushBuff('inc', `옥추슬롯×${state.famSlots.옥추}`, state.famSlots.옥추 * 2.5);
          if (famActive(state, '신소') && snapStacks.신소 > 0) pushBuff('inc', `신소슬롯×${state.famSlots.신소}`, state.famSlots.신소 * 4);
          if (famActive(state, '참허') && snapStacks.검심통명) pushBuff('inc', `참허슬롯×${state.famSlots.참허}`, state.famSlots.참허 * 3);
          const 영검공명 = 공명inc(state);
          if (영검공명) pushBuff('inc', `영검공명(${state.catSlots.영검}슬롯)`, 영검공명);
          if (famActive(state, '균천') && snapStacks.검세) pushBuff('amp', `검세×${snapStacks.검세}`, snapStacks.검세 * 1.5);
          // 불씨
          const 통명 = 불씨급수값(state, '통명묘화', [4, 6, 8]);
          if (통명) pushBuff('amp', '불씨·통명묘화', 통명);
          const 유리 = 불씨급수값(state, '유리현화', [5, 10, 15]);
          if (유리) pushBuff('amp', '불씨·유리현화', 유리);
          const 태현 = 불씨급수값(state, '태현잔화', [4, 6, 8]);
          if (태현) pushBuff('inc', '불씨·태현잔화(기댓값)', 태현);
          const 진마Per = 불씨급수값(state, '진마성화', [1, 3, 3]);
          if (진마Per && state.진마성화스택) pushBuff('amp', `불씨·진마성화×${state.진마성화스택}`, 진마Per * state.진마성화스택);
          if (state.진무절화스택) pushBuff('dealt', '불씨·진무절화', state.진무절화스택);
          // nextCast (다음 신통 1회 소비)
          if (state.nextCast) {
            // nextCast (다음 신통 — 현미/풍세/파정) 와 localFinal* (본 cast — 통백 등) 을 각각 표시.
            // 본 cast dealDamage 가 nextCast 를 소비했으므로 _snapNextCastConsumed 사용.
            const nc = state.nextCast || {};
            const ncSnap = state._snapNextCastConsumed || {};
            // 다음 cast 용 (미소비) — 'nextCast' 라벨
            if (nc.cr) pushBuff('cr', 'nextCast (다음)', nc.cr);
            if (nc.cd) pushBuff('cd', 'nextCast (다음)', nc.cd);
            if (nc.finalCR) pushBuff('finalCR', 'nextCast (다음)', nc.finalCR);
            if (nc.finalCD) pushBuff('finalCD', 'nextCast (다음)', nc.finalCD);
            if (nc.finalDmg) pushBuff('finalDmg', 'nextCast (다음)', nc.finalDmg);
            // 본 cast 가 소비한 nextCast 분 — source 라벨로 표시
            if (ncSnap.consumedSources && ncSnap.consumedSources.length > 0) {
              for (const src of ncSnap.consumedSources) {
                const field = src.field || 'finalDmg';
                pushBuff(field, src.key, src.pct || 0);
              }
            } else {
              // source 없으면 fallback (구버전 호환)
              if (ncSnap.cr) pushBuff('cr', 'nextCast (소비)', ncSnap.cr);
              if (ncSnap.cd) pushBuff('cd', 'nextCast (소비)', ncSnap.cd);
              if (ncSnap.finalCR) pushBuff('finalCR', 'nextCast (소비)', ncSnap.finalCR);
              if (ncSnap.finalCD) pushBuff('finalCD', 'nextCast (소비)', ncSnap.finalCD);
              if (ncSnap.finalDmg) pushBuff('finalDmg', 'nextCast (소비)', ncSnap.finalDmg);
            }
            // 본 cast 한정 localFinalDmg ([통백] 등) — source 라벨 사용
            if (ncSnap.localFinalDmg) {
              pushBuff('finalDmg', ncSnap.localFinalDmgSrc || '본 cast 한정', ncSnap.localFinalDmg);
            }
          }
          // 합계
          const sum = (arr) => arr.reduce((a, b) => a + b.val, 0);
          const snap = {
            atk: sum(bd.atk), inc: sum(bd.inc), amp: sum(bd.amp), dealt: sum(bd.dealt),
            cr: sum(bd.cr), cd: sum(bd.cd), crRes: sum(bd.crRes), defDebuff: sum(bd.defDebuff),
            finalCR: sum(bd.finalCR), finalCD: sum(bd.finalCD), finalDmg: sum(bd.finalDmg),
            bd,
          };
          TRACE(state, 'SNAP', JSON.stringify(snap));
        }
        // crit 기댓값 트리거 (풍뢰 / 뇌정)
        state._currentSource = '풍뢰/뇌정(crit)';
        tickCritTriggers(state);
        // [관일] 지속 트리거: 15s간 신통 시전마다 20% 호무 + 검세 +1
        if (state.관일End > 0 && state.t < state.관일End - 0.1) {
          if (!state._관일이미처리) {
            state._currentSource = '관일(지속)';
            record(state, dealDamage(state, 40, { noSkillMult: true, type: '호무' })); // max tier: 40% 호무
            if (state.famSlots.균천) 검세획득_균천(state, state.famSlots.균천, 1);
          }
        }
        state._관일이미처리 = false;
        // [분광] 지속 트리거: 30s간 신통 시전마다 검심 +1 + 24% 호무 (max tier)
        if (state.famSlots.참허 && state.분광End > 0 && state.t < state.분광End - 0.1) {
          if (!state._분광이미처리) {
            검심획득(state, 1);
            state._currentSource = '분광(지속)';
            record(state, dealDamage(state, 24, { noSkillMult: true, type: '호무' }));
          }
        }
        state._분광이미처리 = false;
        // [단진]/[파월] 리필 트리거는 pre-DMG 섹션으로 이동 (자기 cast 포함하여 본 신통 데미지에 반영)
        // [사해·명화] per-cast: 30s간(15+암용15, max tier) 시전마다 살혼 20% 확정 (max tier)
        // [유령불] 명화 살혼 2회마다 30% 물리 (max tier) — 명화살혼발사에서 자동 처리
        if (state.명화End > 0 && state.t < state.명화End - 0.1) {
          if (!state._명화이미처리) {
            state._currentSource = '명화(지속)';
            명화살혼발사(state, 20);
          }
        }
        state._명화이미처리 = false;
        // (작열부여 per-cast 트리거는 cast 전에 이미 처리됨)
        // [옥추·수광 수광] 지속: 15s간 시전마다 옥추 +1 + 30% 물리 (max tier)
        if (state.famSlots.옥추 && state.buffs.some(b => b.key === '옥추수광_수광' && b.endT > state.t)) {
          if (!state._수광이미처리) {
            옥추획득(state);
            state._currentSource = '수광(지속)';
            record(state, dealDamage(state, 30, { noSkillMult: true }));
          }
        }
        state._수광이미처리 = false;
        // [중광·육요 검광] 지속: 30s간 신통 시전마다 23% 호무 (max tier)
        if (state.famSlots.중광 && state.검광End > 0 && state.t < state.검광End - 0.1) {
          if (!state._검광이미처리) {
            const prev = state._currentSource;
            state._currentSource = '검광(지속)';
            record(state, dealDamage(state, 23, { noSkillMult: true, type: '호무' }));
            state._currentSource = prev;
            // [한광] 검광 발동 시 HP 60% 이하 atk 20% 5s (max tier)
            if (hpBelow(state, 0.60)) applyBuff(state, '중광육요_한광', { atk: 20 }, 5);
          }
        }
        state._검광이미처리 = false;
        // [뇌격] 지속 crit 트리거: 15s간 crit 시 8% 물리 × 최대 20회
        if (state.famSlots.옥추 && state.뇌격End > state.t && state.뇌격남은 > 0) {
          if (CFG.randomCrit) {
            // 랜덤 모드: 이번 cast에서 실제 발생한 crit 횟수만큼 발동 (남은 제한 내)
            const trigCount = Math.min(state._castCritCount || 0, state.뇌격남은);
            if (trigCount > 0) {
              state.뇌격남은 -= trigCount;
              state._currentSource = '뇌격(지속)';
              for (let i = 0; i < trigCount; i++) {
                record(state, dealDamage(state, 8, { noSkillMult: true }));
              }
            }
          } else {
            const crEff = Math.min(100, CFG.baseCR * (1 + sumBuffCR(state) / 100) * (1 + state.nextCast.finalCR / 100) * (1 + sumBuffCritRes(state) / 100)) / 100;
            const _hits뇌격 = (sk && SKILL_HITS[sk.name]) || 1;
            const expectedCrits = Math.min(_hits뇌격 * crEff, state.뇌격남은);
            state.뇌격남은 -= expectedCrits;
            state._currentSource = '뇌격(지속)';
            record(state, dealDamage(state, 8 * expectedCrits, { noSkillMult: true }));
          }
        }
        // 백족 공통 트리거 (살혼은 사해 ≥2 시 모든 신통 명중에서 발동)
        state._currentSource = '살혼';
        if (famActive(state, '사해')) 살혼발사(state);
        // 주술 유파 효과: 임의의 신통 시전 시 무작위 1독고 + 슬롯당 25% 추가 (주술 ≥2)
        state._currentSource = '독고부여';
        if (famActive(state, '주술')) 독고부여(state, 1);
        // 유파 공통 트리거 (모두 ≥2 활성 조건)
        state._currentSource = '검세(천검)';
        if (famActive(state, '균천')) 검세획득_균천(state, state.famSlots.균천, 1);
        state._currentSource = '검심';
        if (famActive(state, '참허')) 검심획득(state, 1);
        if (famActive(state, '옥추')) {
          // 치명타 입히면 옥추 +1 — 멀티히트 스킬은 히트당 독립 판정
          // 기댓값 방식: hits × crEff 만큼 누적하여 1 이상이면 정수만큼 획득 (잔여분수 유지)
          const crEff = Math.min(100, CFG.baseCR * (1 + sumBuffCR(state) / 100) * (1 + state.nextCast.finalCR / 100) * (1 + sumBuffCritRes(state) / 100)) / 100;
          const hits = SKILL_HITS[sk.name] || 1;
          state._옥추분수 = (state._옥추분수 || 0) + hits * crEff;
          const gained = Math.floor(state._옥추분수);
          if (gained > 0) {
            state._옥추분수 -= gained;
            for (let i = 0; i < gained; i++) 옥추획득(state);
          }
        }
        // 불씨 진무절화: 매 2번째 신통 시전마다 "다음 신통" 에 증강 (3의 배수 cast 에 적용).
        // 증강받은 cast 는 본인 카운터 +1 하지 않고 리셋 (증강 소비 후 카운터 0).
        const 진무절화Pct = 불씨급수값(state, '진무절화', [16, 32, 48]);
        if (state._진무절화소비) {
          state.진무절화스택 = 0;
          state._진무절화소비 = false;
          state.진무절화카운터 = 0;  // 증강받은 cast → 카운터 완전 리셋
        } else if (진무절화Pct > 0) {
          state.진무절화카운터 = (state.진무절화카운터 || 0) + 1;
          if (state.진무절화카운터 >= 2) {
            state.진무절화카운터 = 0;
            state.진무절화스택 = 진무절화Pct;
            // TRACE 는 실제 사용되는 (다음 신통) 시점에 발동 — 아래 dealDamage 내 소비 위치에서 출력
          }
        }
        // [청명·투진 순요] 10초 창 안의 매 신통 cast에서 crit 시 atk+25 5초 부여 (max tier)
        // 원문: "10초 동안 신통으로 적에게 치명타를 입힐 경우, 5초간 자신의 공격력이 25% 증가"
        // 창은 투진 cast 시점부터 열림 → 투진 자신 cast도 창에 포함 (crit 발생 시 5초 buff 시작)
        // 순요End > 0 체크 필수 — 초기값 0 이면 아직 투진 cast 안 됨
        if (state.순요End > 0 && state.순요End > state.t - 0.1) {
          if (CFG.randomCrit) {
            // 랜덤 모드: 이번 cast 에서 crit 1회 이상 났으면 full atk+25 buff 발동
            if (state._castAnyCrit) {
              applyBuff(state, '청명투진_순요', { atk: 25 }, 5);
            }
          } else {
            const crEff순요 = Math.min(100, CFG.baseCR * (1 + sumBuffCR(state) / 100) * (1 + state.nextCast.finalCR / 100) * (1 + sumBuffCritRes(state) / 100)) / 100;
            const hits순요 = SKILL_HITS[sk.name] || 1;
            const p순요 = 1 - Math.pow(1 - crEff순요, hits순요);
            if (p순요 > 0) {
              applyBuff(state, '청명투진_순요', { atk: 25 * p순요 }, 5);
            }
          }
        }
        // 불씨 진마성화: 신통 1 cast마다 amp 스택 +1 (max 10). 3개→1%/스택, 6개→3%/스택
        const 진마성화Per = 불씨급수값(state, '진마성화', [1, 3, 3]);
        if (진마성화Per > 0) {
          const prev = state.진마성화스택 || 0;
          if (prev < 10) {
            state.진마성화스택 = prev + 1;
            TRACE(state, 'STK', `진마성화 ${prev}→${state.진마성화스택}/10 (amp +${진마성화Per}%/스택 = 현재 +${state.진마성화스택 * 진마성화Per}%)`);
          }
        }
        // 시전 후 상태 요약 (END 로그)
        prune작열(state); prune화상(state); pruneDokgo(state);
        const afterRsrc = `검세=${state.stacks.검세||0}, 검심=${state.stacks.검심||0}, 뇌인=${state.stacks.뇌인||0}, 옥추=${state.stacks.옥추||0}, 신소=${state.stacks.신소||0}`;
        const afterDokgo = Object.values(state.독고||{}).reduce((a,b)=>a+b,0);
        const after계약 = 계약합(state);
        let after약화 = 0;
        for (const b of state.buffs) {
          if (b.endT <= state.t) continue;
          if (b.defDebuff || b.crRes) after약화 += b.stackCount || 1;
        }
        const afterDebuffs = `작열=${state.stacks.작열||0}(부여카운터=${state.작열부여카운터||0}/6), 화상=${state.화상||0}, 독고=${afterDokgo.toFixed(1)}, 계약=${after계약}, 약화디버프=${after약화}`;
        TRACE(state, 'END', `◀ ${sk.name} 시전 완료 후\n           [시전 후 자원] ${afterRsrc}\n           [시전 후 대상] ${afterDebuffs}`);
        state._activeCast = null;
      }
    } else {
      const trName = treasures[ev.idx];
      TRACE(state, 'CST', `📿 ${trName} 법보`);
      state.castCounts = state.castCounts || {};
      const trSrc = `법보:${trName}`;
      state.castCounts[trSrc] = (state.castCounts[trSrc] || 0) + 1;
      state._currentSource = trSrc;
      state._activeCast = trSrc;
      TREASURES[trName].cast(state);
      state._activeCast = null;
    }
    // nextCast는 dealDamage에서 consume 되므로 별도 post-cast 리셋 불필요.
    // cast 도중 현미·풍세·파정·성류 등 옵션이 state.nextCast.X += ... 로 설정하면
    // 다음 cast의 첫 dealDamage에서 그대로 소비된다.
  }

  // 마커별 누적 피해 (t ≤ marker). 45s=1cyc, 60s, 120s, 180s
  const markers = [45, 60, 120, 180];
  const cumByMarker = markers.map(m =>
    (state.dmgEvents || []).filter(e => e.t < m + 0.001).reduce((a, e) => a + e.amt, 0)
  );
  return { cumByMarker, dmgEvents: state.dmgEvents || [], castCounts: state.castCounts || {} };
}

// ======================== 실행 ========================
const ALL_FAMS = Object.keys(FAMILIES);
// 제약: 주술 최대 2슬롯
const MAX_주술 = 2;
function checkConstraint(build) {
  for (const [f, s] of build) {
    if (f === '주술' && s > MAX_주술) return false;
  }
  return true;
}
const builds = [];
for (const fa of ALL_FAMS) for (const fb of ALL_FAMS) {
  if (fa === fb) continue;
  const b = [[fa, 4], [fb, 2]];
  if (checkConstraint(b)) builds.push({ type: '4+2', b, label: `${fa} 4 + ${fb} 2` });
}
for (let i = 0; i < ALL_FAMS.length; i++)
  for (let j = i + 1; j < ALL_FAMS.length; j++)
    for (let k = j + 1; k < ALL_FAMS.length; k++) {
      const b = [[ALL_FAMS[i], 2], [ALL_FAMS[j], 2], [ALL_FAMS[k], 2]];
      if (checkConstraint(b)) builds.push({
        type: '2+2+2',
        b,
        label: `${ALL_FAMS[i]} 2 + ${ALL_FAMS[j]} 2 + ${ALL_FAMS[k]} 2`
      });
    }

if (typeof module !== 'undefined' && require.main !== module) {
  module.exports = { CFG, SK, FAMILIES, TREASURES, simulateBuild, selectSkillsForBuild };
  return;
}

// 법보 조합 생성 (4종 중 3종)
const 법보조합 = [];
for (let i = 0; i < ALL_TREASURES.length; i++)
  for (let j = i + 1; j < ALL_TREASURES.length; j++)
    for (let k = j + 1; k < ALL_TREASURES.length; k++)
      법보조합.push([ALL_TREASURES[i], ALL_TREASURES[j], ALL_TREASURES[k]]);

// 신통 빌드 × 법보 조합 = 전체 빌드
const fullBuilds = [];
for (const bd of builds) {
  for (const tr of 법보조합) {
    fullBuilds.push({
      type: bd.type,
      b: bd.b,
      treasures: tr,
      label: `${bd.label} + ${tr.map(n => n[0]).join('')}`,
    });
  }
}

// ---- 순열 생성 유틸 ----
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

// 법보 위치 조합 C(9,3) = 84가지
function treasureCombinations() {
  const result = [];
  for (let i = 0; i < 9; i++)
    for (let j = i + 1; j < 9; j++)
      for (let k = j + 1; k < 9; k++)
        result.push([i, j, k]);
  return result;
}
const ALL_TR_COMBOS = treasureCombinations(); // 84개

function buildOrder(skillPerm, trSlots) {
  const order = new Array(9);
  const trSet = new Set(trSlots);
  let si = 0, ti = 0;
  for (let i = 0; i < 9; i++) {
    if (trSet.has(i)) {
      order[i] = { kind: 'treasure', idx: ti++ };
    } else {
      order[i] = { kind: 'skill', idx: skillPerm[si++] };
    }
  }
  return order;
}

// ---- 2단계 분리 최적화 ----
// Phase 1: 신통 순열 720개 (법보 후방 고정) → 최적 신통 순서
// Phase 2: 최적 신통 순서로 법보 위치 84개 탐색 → 최적 배치
const TRIALS_SCREEN = 2;   // 프리스크린
const TRIALS_FINAL = 20;   // 최종 정밀
const TOP_N = 5;

const DETAIL_ONLY = process.env.DETAIL_ONLY === '1';
if (DETAIL_ONLY) {
  console.log('DETAIL_ONLY 모드: 1위 빌드(첫 빌드) 상세 분석만 실행');
  // 첫 빌드에 대해 기본 순서로 간단 측정
  const bd0 = fullBuilds[0];
  const defaultOrder = buildOrder([0,1,2,3,4,5], [6,7,8]);
  let s2 = 0;
  for (let t = 0; t < 20; t++) {
    s2 += simulateBuild(bd0.b, bd0.treasures, defaultOrder).cumByMarker[2];
  }
  bd0.c2 = s2 / 20;
  bd0.bestOrder = defaultOrder;
  fullBuilds.sort((a, b) => (b.c2||0) - (a.c2||0));
} else {
console.log(`시전 순서 최적화 중... (빌드 ${fullBuilds.length}개)`);
let bdIdx = 0;
for (const bd of fullBuilds) {
  bdIdx++;
  if (bdIdx % 50 === 0) process.stderr.write(`  ${bdIdx}/${fullBuilds.length}\n`);

  const skillIndices = [0,1,2,3,4,5];
  const allPerms = permutations(skillIndices);
  const defaultTr = [6,7,8]; // 법보 후방 고정

  // Phase 1: 신통 순열 720개 × 2회 → 상위 5개
  let phase1 = [];
  for (const perm of allPerms) {
    const order = buildOrder(perm, defaultTr);
    let score = 0;
    for (let t = 0; t < TRIALS_SCREEN; t++) {
      score += simulateBuild(bd.b, bd.treasures, order).cumByMarker[2];
    }
    phase1.push({ perm, score: score / TRIALS_SCREEN });
  }
  phase1.sort((a, b) => b.score - a.score);
  const topPerms = phase1.slice(0, TOP_N).map(x => x.perm);

  // Phase 2: 상위 신통순서 × 법보 위치 84개 × 2회
  let phase2 = [];
  for (const perm of topPerms) {
    for (const trCombo of ALL_TR_COMBOS) {
      const order = buildOrder(perm, trCombo);
      let score = 0;
      for (let t = 0; t < TRIALS_SCREEN; t++) {
        score += simulateBuild(bd.b, bd.treasures, order).cumByMarker[2];
      }
      phase2.push({ perm, trCombo, order, score: score / TRIALS_SCREEN });
    }
  }
  phase2.sort((a, b) => b.score - a.score);

  // Phase 3: 상위 5개를 20회 정밀 측정
  const finalists = phase2.slice(0, TOP_N);
  let best = null;
  for (const c of finalists) {
    let s1 = 0, s15 = 0, s2 = 0;
    for (let t = 0; t < TRIALS_FINAL; t++) {
      const res = simulateBuild(bd.b, bd.treasures, c.order);
      const [c1, c15, c2] = res.cumByMarker;
      s1 += c1; s15 += c15; s2 += c2;
    }
    const avg2 = s2 / TRIALS_FINAL;
    if (!best || avg2 > best.c2) {
      best = { c1: s1 / TRIALS_FINAL, c15: s15 / TRIALS_FINAL, c2: avg2, order: c.order, perm: c.perm, trCombo: c.trCombo };
    }
  }
  bd.c1 = best.c1;
  bd.c15 = best.c15;
  bd.c2 = best.c2;
  bd.bestOrder = best.order;
  bd.bestPerm = best.perm;
  bd.bestTrCombo = best.trCombo;
}

} // end if (!DETAIL_ONLY)

// 2사이클 기준 정렬 (전체 누적 피해가 가장 많은 빌드 상위)
fullBuilds.sort((a, b) => (b.c2||0) - (a.c2||0));
const builds2 = fullBuilds;
// 시전 순서 표시 헬퍼
function orderLabel(bd) {
  if (!bd.bestOrder) return '';
  const chosen = selectSkillsForBuild(bd.b);
  return bd.bestOrder.map(o => {
    if (o.kind === 'skill') return chosen[o.idx] ? chosen[o.idx].name.replace(/.*·/, '') : '?';
    return `[법${o.idx + 1}]`;
  }).join('→');
}

if (!DETAIL_ONLY) {
console.log('=== 시뮬 TOP 10 (누적 피해 / 2사이클, 시전순서 최적화) ===');
for (let i = 0; i < 10; i++) {
  const bd = builds2[i];
  console.log(
    `${String(i + 1).padStart(3)} | ${bd.label.padEnd(42)} | ${bd.type.padEnd(6)} | 2cyc ${String(bd.c2.toFixed(0)).padStart(13)}`
  );
  console.log(`      시전순서: ${orderLabel(bd)}`);
}

// 1사이클 기준 별도 정렬 (버스트 기준)
const burstSort = [...builds2].sort((a, b) => b.c1 - a.c1);
console.log('\n=== 1사이클 (버스트) TOP 10 ===');
for (let i = 0; i < 10; i++) {
  const bd = burstSort[i];
  console.log(
    `${String(i + 1).padStart(3)} | ${bd.label.padEnd(54)} | 1cyc ${bd.c1.toFixed(0)} / 2cyc ${bd.c2.toFixed(0)}`
  );
}
// ======================== 계열별 Top 5 ========================
function getBuildCats(bd) {
  const cats = {};
  for (const [f, s] of bd.b) {
    const cat = FAMILIES[f].cat;
    cats[cat] = (cats[cat] || 0) + s;
  }
  return cats;
}
for (const catName of ['영검', '화염', '뇌전', '백족']) {
  const filtered = builds2.filter(bd => {
    const cats = getBuildCats(bd);
    return (cats[catName] || 0) >= 4;
  });
  filtered.sort((a, b) => (b.c2||0) - (a.c2||0));
  console.log(`\n=== ${catName} 계열 주력 빌드 Top 5 (슬롯 4+) ===`);
  for (let i = 0; i < Math.min(5, filtered.length); i++) {
    const bd = filtered[i];
    console.log(
      `${String(i + 1).padStart(3)} | ${bd.label.padEnd(42)} | ${bd.type.padEnd(6)} | 2cyc ${String((bd.c2||0).toFixed(0)).padStart(13)}`
    );
    console.log(`      시전순서: ${orderLabel(bd)}`);
  }
  if (filtered.length === 0) console.log('  (해당 계열 4슬롯 이상 빌드 없음)');
}

} // end if (!DETAIL_ONLY) for ranking display

// ======================== 1위 빌드 상세 분석 ========================
{
  const top = builds2[0];
  console.log(`\n=== 1위 빌드 상세 분석: ${top.label} ===`);
  // 50회 돌려서 소스별 평균
  const DETAIL_TRIALS = 50;
  const srcTotals = {};
  const srcRecordCounts = {};
  const srcCastCounts = {};
  let grandTotal = 0;
  for (let t = 0; t < DETAIL_TRIALS; t++) {
    const res = simulateBuild(top.b, top.treasures, top.bestOrder);
    for (const ev of res.dmgEvents) {
      const src = ev.src || '?';
      srcTotals[src] = (srcTotals[src] || 0) + ev.amt;
      srcRecordCounts[src] = (srcRecordCounts[src] || 0) + 1;
      grandTotal += ev.amt;
    }
    for (const [src, cnt] of Object.entries(res.castCounts)) {
      srcCastCounts[src] = (srcCastCounts[src] || 0) + cnt;
    }
  }
  const entries = Object.keys(srcTotals).map(src => ({
    src,
    avgDmg: srcTotals[src] / DETAIL_TRIALS,
    avgRecords: srcRecordCounts[src] / DETAIL_TRIALS,
    avgCasts: (srcCastCounts[src] || 0) / DETAIL_TRIALS,
    pct: srcTotals[src] / grandTotal * 100,
  }));
  entries.sort((a, b) => b.avgDmg - a.avgDmg);
  console.log('소스                  | 시전횟수 | 피해기록수 | 평균 피해        | 비율');
  console.log('─'.repeat(85));
  for (const e of entries) {
    const castStr = e.avgCasts > 0 ? e.avgCasts.toFixed(1) : '-';
    console.log(
      `${e.src.padEnd(20)} | ${castStr.padStart(8)} | ${e.avgRecords.toFixed(1).padStart(10)} | ${e.avgDmg.toFixed(0).padStart(16)} | ${e.pct.toFixed(1).padStart(5)}%`
    );
  }
  const totalAvg = entries.reduce((a, e) => a + e.avgDmg, 0);
  console.log('─'.repeat(85));
  console.log(`${'합계'.padEnd(20)} | ${''.padStart(8)} | ${''.padStart(10)} | ${totalAvg.toFixed(0).padStart(16)} | 100.0%`);
}
