// Web Worker: 자동 탐색 (선택한 신통 풀에서 C(N,6) 조합 × 순서 전수탐색)
import simSource from '../../../sim2.js?raw';

const m = { exports: {} };
const fakeRequire = () => { throw new Error('no require'); };
const fakeProcess = { env: {}, stderr: { write: () => {} }, argv: [] };
new Function('module', 'require', 'process', '__dirname', '__filename', 'exports', simSource)
  (m, fakeRequire, fakeProcess, '/', 'sim2.js', m.exports);

const { FAMILIES, TREASURES, SK, simulateBuild } = m.exports;

let cancelled = false;

// 법체(4세트) 활성 판정
// requiredLawBody: null (무필터) | 'any' (아무거나 4+) | '영검'/'화염'/'뇌전'/'백족' (특정 계열 4+)
function passLawBody(build, requiredLawBody) {
  if (!requiredLawBody) return true;
  const catSlots = {};
  for (const [f, s] of build) {
    const cat = FAMILIES[f].cat;
    catSlots[cat] = (catSlots[cat] || 0) + s;
  }
  if (requiredLawBody === 'any') return Object.values(catSlots).some((s) => s >= 4);
  return (catSlots[requiredLawBody] || 0) >= 4;
}

function buildFromSkills(skillNames) {
  const map = {};
  for (const n of skillNames) {
    const fam = SK[n].fam;
    map[fam] = (map[fam] || 0) + 1;
  }
  return Object.entries(map); // [[fam, count], ...]
}

// C(n, k) — 이항계수 (워커에서 unrank 할 때 사용)
function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let num = 1, den = 1;
  for (let i = 0; i < k; i++) { num *= (n - i); den *= (i + 1); }
  return Math.floor(num / den);
}

// Unrank: lex 순서에서 rank 번째 조합의 인덱스 배열 반환.
// 각 워커가 자신의 시작 rank 로 "즉시 점프" 하기 위해 사용.
function unrankCombination(n, k, rank) {
  const idx = new Array(k);
  let start = 0;
  let r = rank;
  for (let i = 0; i < k; i++) {
    let c = start;
    // c 가 가능한 마지막 값(n - (k - i)) 까지 증가하면서 skip 량이 r 보다 크면 멈춤
    while (c <= n - (k - i)) {
      const cnt = binomial(n - c - 1, k - i - 1);
      if (cnt > r) break;
      r -= cnt;
      c++;
    }
    idx[i] = c;
    start = c + 1;
  }
  return idx;
}

// C(n, k) 조합 lazy generator. startRank 부터 시작 (기본 0).
// 메모리 O(k), 시작 위치로의 도약은 O(n·k) — 32M 범위도 1ms 미만.
function* combinationsGen(arr, k, startRank = 0) {
  const n = arr.length;
  if (k < 0 || k > n) return;
  if (k === 0) { if (startRank === 0) yield []; return; }
  const idx = unrankCombination(n, k, startRank);
  // startRank 가 total 을 벗어나면 unrank 가 유효하지 않을 수 있으니 가드
  if (idx[0] >= n) return;
  while (true) {
    const out = new Array(k);
    for (let i = 0; i < k; i++) out[i] = arr[idx[i]];
    yield out;
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function enumerateTreasures(pool) {
  const tr = pool && pool.length >= 3 ? pool : Object.keys(TREASURES);
  if (tr.length < 3) return [tr];
  const out = [];
  for (let i = 0; i < tr.length; i++)
    for (let j = i + 1; j < tr.length; j++)
      for (let k = j + 1; k < tr.length; k++)
        out.push([tr[i], tr[j], tr[k]]);
  return out;
}

// Heap's Algorithm — in-place 반복 순열
function* permutations(arr) {
  const a = arr.slice();
  const n = a.length;
  const c = new Array(n).fill(0);
  yield a;
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      const k = (i & 1) === 0 ? 0 : c[i];
      const tmp = a[k]; a[k] = a[i]; a[i] = tmp;
      yield a;
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

function defaultOrder() {
  const o = [];
  for (let i = 0; i < 6; i++) o.push({ kind: 'skill', idx: i });
  for (let i = 0; i < 3; i++) o.push({ kind: 'treasure', idx: i });
  return o;
}

let FIXED_TREASURES = ['환음요탑', '유리옥호', '참원선검'];
let G_TREASURE_POOL = null;  // fixedTreasures ON + user-selected pool (array of names, size >=3)
const MARKER_TIME = [45, 60, 120, 180];
function getMaxTime(markerIdx) { return MARKER_TIME[markerIdx]; }

let G_TARGET_LAW = null; // worker 전역 (start 시 세팅)
let G_BULSSI = null;     // 불씨 세트 (start 시 세팅)
function simOptsFor(markerIdx) {
  const o = { maxTime: getMaxTime(markerIdx) };
  if (G_TARGET_LAW) o.targetLawBody = G_TARGET_LAW;
  if (G_BULSSI) o.불씨 = G_BULSSI;
  return o;
}

// 순서 전수탐색 — topK 상위 순서를 유지 (기본 1개, 작은 탐색에선 10개)
async function optimizeOrderExhaustive(build, treasures, markerIdx, skillsOverride, isCancelled, fixedTreasures, onOrderProgress, topK = 1, onTopUpdate = null) {
  const simOpts = simOptsFor(markerIdx);
  // topResults: { score, ord }[] — score 내림차순
  const topResults = [];
  let topChanged = false;
  function consider(score, ord) {
    if (topResults.length < topK) {
      topResults.push({ score, ord: ord.slice() });
      topResults.sort((a, b) => b.score - a.score);
      topChanged = true;
    } else if (score > topResults[topResults.length - 1].score) {
      topResults[topResults.length - 1] = { score, ord: ord.slice() };
      topResults.sort((a, b) => b.score - a.score);
      topChanged = true;
    }
  }
  let counter = 0;
  const YIELD_EVERY = onOrderProgress ? 100 : 2000;
  // 법보 고정: 위치만 고정 (7/8/9). 법보 순서는 permute → 6! × 3! = 4,320
  // 법보 미고정: 모든 위치 interleave → 9! = 362,880
  const PERM_TOTAL = fixedTreasures ? 4320 : 362880;

  if (fixedTreasures) {
    const skillSlots = [0, 1, 2, 3, 4, 5].map((i) => ({ kind: 'skill', idx: i }));
    const treasureSlots = [0, 1, 2].map((i) => ({ kind: 'treasure', idx: i }));
    for (const skPerm of permutations(skillSlots)) {
      for (const trPerm of permutations(treasureSlots)) {
        if (isCancelled()) return { topResults, cancelled: true };
        const full = skPerm.concat(trPerm);
        const sc = simulateBuild(build, treasures, full, skillsOverride, simOpts).cumByMarker[markerIdx];
        consider(sc, full);
        counter++;
        if (counter % YIELD_EVERY === 0) {
          if (onOrderProgress) onOrderProgress(counter, PERM_TOTAL, topResults[0]?.score ?? -1);
          if (onTopUpdate && topChanged) { onTopUpdate(topResults); topChanged = false; }
          await new Promise((r) => setTimeout(r, 0));
          if (isCancelled()) return { topResults, cancelled: true };
        }
      }
    }
  } else {
    // 법보 미고정: 9! = 362,880 — 신통+법보 모든 위치 전수탐색
    const slots = defaultOrder();
    for (const perm of permutations(slots)) {
      if (isCancelled()) return { topResults, cancelled: true };
      const sc = simulateBuild(build, treasures, perm, skillsOverride, simOpts).cumByMarker[markerIdx];
      consider(sc, perm);
      counter++;
      if (counter % YIELD_EVERY === 0) {
        if (onOrderProgress) onOrderProgress(counter, PERM_TOTAL, topResults[0]?.score ?? -1);
        if (onTopUpdate && topChanged) { onTopUpdate(topResults); topChanged = false; }
        await new Promise((r) => setTimeout(r, 0));
        if (isCancelled()) return { topResults, cancelled: true };
      }
    }
  }
  // 마지막 잔여 emit
  if (onTopUpdate && topChanged) onTopUpdate(topResults);
  if (onOrderProgress) onOrderProgress(PERM_TOTAL, PERM_TOTAL, topResults[0]?.score ?? -1);
  return {
    topResults,
    bestOrd: topResults[0]?.ord,
    bestScore: topResults[0]?.score ?? -1,
  };
}

// === 빠른 순서 탐색: main damage desc 초기 + 2-swap local search ===
// onOrderProgress(simDone, simTotal, best) — 주기적 UI 업데이트용 콜백 (선택)
async function fastOrderSearch(build, skills, treasures, markerIdx, fixedTreasures, isCancelled, onOrderProgress) {
  const simOpts = simOptsFor(markerIdx);
  // 초기 순서: 신통은 main desc, 법보는 뒤에
  const skillIdx = skills.map((sk, i) => ({ idx: i, main: SK[sk.name]?.main ?? 0 }))
    .sort((a, b) => b.main - a.main)
    .map((x) => ({ kind: 'skill', idx: x.idx }));
  const trTail = [0, 1, 2].map((i) => ({ kind: 'treasure', idx: i }));
  let order = skillIdx.concat(trTail);
  const swapRange = fixedTreasures ? 6 : 9;
  const swapsPerRound = (swapRange * (swapRange - 1)) / 2;
  const MAX_ROUNDS = 8;
  const estTotal = 1 + swapsPerRound * MAX_ROUNDS;  // 대략 분모
  let simCount = 0;
  let bestScore = simulateBuild(build, treasures, order, skills, simOpts).cumByMarker[markerIdx];
  simCount++;
  if (onOrderProgress) onOrderProgress(simCount, estTotal, bestScore);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (isCancelled && isCancelled()) return { bestOrd: order, bestScore, cancelled: true };
    let bestSwapScore = bestScore;
    let bestSwappedOrder = null;
    for (let i = 0; i < swapRange; i++) {
      for (let j = i + 1; j < swapRange; j++) {
        const newOrder = order.slice();
        const tmp = newOrder[i]; newOrder[i] = newOrder[j]; newOrder[j] = tmp;
        const sc = simulateBuild(build, treasures, newOrder, skills, simOpts).cumByMarker[markerIdx];
        simCount++;
        if (sc > bestSwapScore) {
          bestSwapScore = sc; bestSwappedOrder = newOrder;
        }
      }
    }
    if (bestSwappedOrder) {
      order = bestSwappedOrder;
      bestScore = bestSwapScore;
      if (onOrderProgress) onOrderProgress(simCount, estTotal, bestScore);
    } else {
      if (onOrderProgress) onOrderProgress(estTotal, estTotal, bestScore);  // 수렴 → 100%
      break;
    }
  }
  return { bestOrd: order, bestScore };
}

// 빠른 탐색: 법보 조합마다 fastOrderSearch 후 최고 선택 (topK/onOrderProgress 는 무시)
async function optimizeBuildFast(build, skillsOverride, markerIdx, fixedTreasures, isCancelled, _topK, onOrderProgress) {
  const treasureCombos = fixedTreasures
    ? (G_TREASURE_POOL && G_TREASURE_POOL.length >= 3 ? enumerateTreasures(G_TREASURE_POOL) : [FIXED_TREASURES])
    : (G_TREASURE_POOL && G_TREASURE_POOL.length >= 3 ? enumerateTreasures(G_TREASURE_POOL) : enumerateTreasures());
  let bestScore = -1, bestOrd = null, bestTr = null;
  for (const tr of treasureCombos) {
    if (isCancelled && isCancelled()) return { bestOrd, bestScore, bestTr, cancelled: true };
    const res = await fastOrderSearch(build, skillsOverride, tr, markerIdx, fixedTreasures, isCancelled, onOrderProgress);
    if (res.cancelled) return { ...res, bestTr };
    if (res.bestScore > bestScore) {
      bestScore = res.bestScore;
      bestOrd = res.bestOrd;
      bestTr = tr;
    }
  }
  return { bestOrd, bestScore, bestTr };
}

// 한 빌드에 대해: 법보 × 순서 전수탐색 → 최적 찾기
// topK: Top K 순서 유지 (기본 1). onOrderProgress: 순서 탐색 진행률 콜백 (법보 전체 누적).
// onPartialTop: 법보 조합마다 호출 — (globalTop) → void. 중간 순위 업데이트용.
async function optimizeBuild(build, skillsOverride, markerIdx, fixedTreasures, isCancelled, topK = 1, onOrderProgress, onPartialTop) {
  const treasureCombos = fixedTreasures
    ? (G_TREASURE_POOL && G_TREASURE_POOL.length >= 3 ? enumerateTreasures(G_TREASURE_POOL) : [FIXED_TREASURES])
    : (G_TREASURE_POOL && G_TREASURE_POOL.length >= 3 ? enumerateTreasures(G_TREASURE_POOL) : enumerateTreasures());
  const PERM_PER_TREASURE = fixedTreasures ? 4320 : 362880;
  const GRAND_TOTAL = treasureCombos.length * PERM_PER_TREASURE;
  let treasureIdx = 0;
  // 전체 top K across treasure combos: { score, ord, bestTr }[]
  let globalTop = [];
  for (const tr of treasureCombos) {
    if (isCancelled()) return { bestOrd: globalTop[0]?.ord, bestScore: globalTop[0]?.score ?? -1, bestTr: globalTop[0]?.bestTr, topResults: globalTop, cancelled: true };
    const tIdxLocal = treasureIdx;
    const wrappedProgress = onOrderProgress ? (done, total, best) => {
      onOrderProgress(tIdxLocal * PERM_PER_TREASURE + done, GRAND_TOTAL, best);
    } : null;
    // 실시간 Top K emit — perm 진행 중 새 best 발견 시 (Top K 변동분만 부분 emit)
    const onLiveTopUpdate = onPartialTop ? (currentTop) => {
      // 현재 treasure combo 의 top + 이미 누적된 globalTop 통합 후 Top K
      const currentList = currentTop.map((r) => ({ score: r.score, ord: r.ord, bestTr: tr }));
      const merged = globalTop.concat(currentList).sort((a, b) => b.score - a.score).slice(0, topK);
      onPartialTop(merged);
    } : null;
    const res = await optimizeOrderExhaustive(build, tr, markerIdx, skillsOverride, isCancelled, fixedTreasures, wrappedProgress, topK, onLiveTopUpdate);
    treasureIdx++;
    if (res.cancelled) {
      return { bestOrd: globalTop[0]?.ord, bestScore: globalTop[0]?.score ?? -1, bestTr: globalTop[0]?.bestTr, topResults: globalTop, cancelled: true };
    }
    // 이번 법보 조합의 topK (tr 같이 묶어서)
    const treasureTop = res.topResults.map((r) => ({ score: r.score, ord: r.ord, bestTr: tr }));
    for (const r of treasureTop) globalTop.push(r);
    globalTop.sort((a, b) => b.score - a.score);
    if (globalTop.length > topK) globalTop = globalTop.slice(0, topK);
    // 법보 1개 끝날 때마다 해당 법보의 Top K 를 그대로 emit (법보 고정 모드처럼 바로바로 노출)
    if (onPartialTop) onPartialTop(treasureTop);
  }
  return {
    bestOrd: globalTop[0]?.ord,
    bestScore: globalTop[0]?.score ?? -1,
    bestTr: globalTop[0]?.bestTr,
    topResults: globalTop,
  };
}

// 유파 시너지 필수 신통 (worker 용 사본 — useRanking.js 와 동일 내용).
// 1슬롯 유파에서 선택되면 주효과가 사실상 발동 불가.
const STRICT_SKILL_MIN_FAM_SLOTS = {
  '균천·진악': 2, '균천·현봉': 2,
  '참허·횡추': 2, '참허·엄동': 2,
  '옥추·황룡': 2, '옥추·소명': 2, '옥추·청사': 2,
  '주술·제율': 2, '주술·태사': 2, '주술·경선': 2, '주술·유식': 2,
  '신소·운록': 2, '신소·천고': 2, '신소·환뢰': 2, '신소·청삭': 2,
};

// 구조(= [[fam, slots], ...]) 에 해당하는 모든 신통 조합을 yield.
// strictSkillMin: { [skillName]: minFamSlots } 맵 — 해당 skill 은 그 유파가 minFamSlots 이상일 때만 사용.
function* skillCombosForStructure(skillPool, build, strictSkillMin = null) {
  const famSlotsInBuild = {};
  for (const [f, s] of build) famSlotsInBuild[f] = s;
  const skillsByFam = {};
  for (const n of skillPool) {
    const fam = SK[n].fam;
    // strict 필터: 해당 skill 의 최소 유파 슬롯 조건을 만족하지 못하면 제외
    if (strictSkillMin && strictSkillMin[n] && (famSlotsInBuild[fam] || 0) < strictSkillMin[n]) continue;
    if (!skillsByFam[fam]) skillsByFam[fam] = [];
    skillsByFam[fam].push(n);
  }
  function* pickKof(arr, k) {
    const n = arr.length;
    if (k < 0 || k > n) return;
    if (k === 0) { yield []; return; }
    const idx = new Array(k);
    for (let i = 0; i < k; i++) idx[i] = i;
    while (true) {
      yield idx.map((i) => arr[i]);
      let i = k - 1;
      while (i >= 0 && idx[i] === n - k + i) i--;
      if (i < 0) return;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  function* recur(idx, chosen) {
    if (idx === build.length) { yield chosen.flat(); return; }
    const [fam, slots] = build[idx];
    const famSkills = skillsByFam[fam] || [];
    for (const subset of pickKof(famSkills, slots)) {
      chosen.push(subset);
      yield* recur(idx + 1, chosen);
      chosen.pop();
    }
  }
  yield* recur(0, []);
}

self.onmessage = async (e) => {
  try {
    await handleMessage(e);
  } catch (err) {
    console.error('[worker] unhandled error:', err);
    self.postMessage({ type: 'workerError', error: String(err?.stack || err), workerId: (e.data?.config?.workerId ?? -1) });
  }
};

// 한 신통 조합 평가 → 최대 topK 개의 결과 배열 반환 (서로 다른 순서별 Top K).
// optimizeFn 은 topK + onOrderProgress (+ onPartialTop) 를 전달받을 수 있어야 함.
async function evaluateSkillCombo(bd, markerIdx, fixedTreasures, isCancelled, optimizeFn, topK, onOrderProgress, onPartialTop) {
  const res = await optimizeFn(bd.build, bd.skills, markerIdx, fixedTreasures, isCancelled, topK, onOrderProgress, onPartialTop);
  if (res.cancelled) return { cancelled: true };
  // cat 계산
  let cat = null;
  const catSlots = {};
  for (const [f, s] of bd.build) {
    const c = FAMILIES[f].cat;
    catSlots[c] = (catSlots[c] || 0) + s;
  }
  for (const [c, s] of Object.entries(catSlots)) {
    if (s >= 4) { cat = c; break; }
  }
  if (!cat) {
    const primary = bd.build.slice().sort((a, b) => b[1] - a[1])[0][0];
    cat = FAMILIES[primary].cat;
  }
  const simOpts = simOptsFor(markerIdx);
  // topResults 가 없으면 (예전 fast 경로) bestOrd/bestScore 만으로 1건 구성
  const topArr = res.topResults && res.topResults.length > 0
    ? res.topResults
    : [{ score: res.bestScore, ord: res.bestOrd, bestTr: res.bestTr }];
  const outResults = [];
  for (let idx = 0; idx < topArr.length; idx++) {
    const t = topArr[idx];
    if (!t.ord) continue;
    const tr = t.bestTr || res.bestTr;
    const r = simulateBuild(bd.build, tr, t.ord, bd.skills, simOpts);
    const cum = r.cumByMarker;
    const toName = (o) => (o.kind === 'skill' ? bd.skills[o.idx].name : (tr[o.idx] || '?'));
    const orderStr = t.ord.map(toName).join(' → ');
    outResults.push({
      label: bd.label,
      skillLabel: bd.skillLabel,
      skills: bd.skills.map((x) => x.name),
      build: bd.build,
      treasures: tr && tr.length ? tr.join(' + ') : '-',
      treasuresArr: tr || [],
      orderArr: t.ord,
      orderRank: idx + 1,   // 이 신통 조합 내에서 몇 번째 우수 순서인지
      s45: markerIdx === 0 ? cum[0] : null,
      s60: markerIdx === 1 ? cum[1] : null,
      s120: markerIdx === 2 ? cum[2] : null,
      s180: markerIdx === 3 ? cum[3] : null,
      order: orderStr,
      cat,
    });
  }
  return { results: outResults };
}

async function handleMessage(e) {
  const msg = e.data;
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'startRanking') return;
  cancelled = false;

  const {
    markerIdx = 1,
    skillPool = [],
    fixedTreasures = false,
    fixedTreasureList = null,
    treasurePool = null,
    targetLawBody = null,
    workerId = 0,
    structures = [],
    searchMode: userSearchMode = 'fast',
    pass2TopK = 100,
    orderTopK: userOrderTopK,
    불씨 = null,
  } = msg.config || {};
  G_TARGET_LAW = targetLawBody;
  G_BULSSI = 불씨;
  if (fixedTreasures && Array.isArray(fixedTreasureList) && fixedTreasureList.length === 3) {
    FIXED_TREASURES = fixedTreasureList.slice();
  }
  G_TREASURE_POOL = Array.isArray(treasurePool) && treasurePool.length >= 3 ? treasurePool.slice() : null;

  const totalCombos = structures.reduce((a, s) => a + s.total, 0);
  // 작은 탐색: exhaustive 강제 + 순서 Top 10 모두 노출
  const smallSearch = totalCombos <= 50;
  const searchMode = smallSearch ? 'exhaustive' : userSearchMode;
  const orderTopK = userOrderTopK !== undefined ? userOrderTopK : (smallSearch ? 10 : 1);
  self.postMessage({ type: 'start', total: totalCombos, workerId, searchMode, orderTopK });

  let validProcessed = 0;
  const sortKey = `s${[45, 60, 120, 180][markerIdx]}`;
  const pass1Results = (searchMode === 'fast') ? [] : null;

  // === Pass 1 (fast 모드) 또는 단일 패스 (exhaustive 모드) ===
  const pass1Optimize = searchMode === 'fast' ? optimizeBuildFast : optimizeBuild;
  // 정밀 탐색 시 유파 시너지 필수 신통은 1슬롯 유파에서 제외 — 단, 사용자가 직접 선택한 작은 풀(<=10) 은 그대로 존중.
  const strictSkillMin = (searchMode === 'exhaustive' && skillPool.length > 10) ? STRICT_SKILL_MIN_FAM_SLOTS : null;

  for (const structure of structures) {
    if (cancelled) { self.postMessage({ type: 'cancelled' }); return; }
    const { build, label, total: structTotal } = structure;
    let structIdx = 0;

    for (const comboNames of skillCombosForStructure(skillPool, build, strictSkillMin)) {
      if (cancelled) { self.postMessage({ type: 'cancelled' }); return; }
      structIdx++;
      const skills = comboNames.map((n) => ({ name: n, fam: SK[n].fam }));
      // skillLabel 생성
      const skillsByFam = {};
      for (const sk of skills) {
        const fam = sk.fam;
        const shortName = sk.name.split('·')[1] || sk.name;
        if (!skillsByFam[fam]) skillsByFam[fam] = [];
        skillsByFam[fam].push(shortName);
      }
      const skillLabel = Object.entries(skillsByFam)
        .map(([f, list]) => `${f}(${list.join(',')})`)
        .join(' + ');
      const bd = { build, label, skills, skillLabel };

      self.postMessage({
        type: 'subProgress',
        workerId,
        buildIdx: validProcessed,
        buildLabel: bd.label,
        buildStructure: bd.build,
        skillLabel,
        subDone: structIdx,
        subTotal: structTotal,
        bestSoFar: -1,
      });

      // 작은 탐색 시 order 진행률을 subProgress 로 실시간 업데이트
      const onOrderProgress = smallSearch ? (done, total, best) => {
        self.postMessage({
          type: 'subProgress',
          workerId,
          buildIdx: validProcessed,
          buildLabel: bd.label,
          buildStructure: bd.build,
          skillLabel,
          subDone: structIdx,
          subTotal: structTotal,
          orderDone: done,
          orderTotal: total,
          bestSoFar: best,
        });
      } : null;

      // 법보 조합 끝날 때마다 해당 법보의 Top K 를 순위 테이블에 바로 emit
      // (smallSearch 에만 국한하지 않고 항상 활성 — 법보 고정 모드처럼 실시간 표시)
      const onPartialTop = (globalTop) => {
        if (!globalTop || globalTop.length === 0) return;
        const simOpts = simOptsFor(markerIdx);
        const partialResults = [];
        for (let idx = 0; idx < globalTop.length; idx++) {
          const t = globalTop[idx];
          if (!t.ord) continue;
          const r = simulateBuild(bd.build, t.bestTr, t.ord, bd.skills, simOpts);
          const cum = r.cumByMarker;
          const toName = (o) => (o.kind === 'skill' ? bd.skills[o.idx].name : (t.bestTr[o.idx] || '?'));
          const orderStr = t.ord.map(toName).join(' → ');
          let cat = null;
          const catSlots = {};
          for (const [f, s] of bd.build) {
            const c = FAMILIES[f].cat;
            catSlots[c] = (catSlots[c] || 0) + s;
          }
          for (const [c, s] of Object.entries(catSlots)) if (s >= 4) { cat = c; break; }
          if (!cat) {
            const primary = bd.build.slice().sort((a, b) => b[1] - a[1])[0][0];
            cat = FAMILIES[primary].cat;
          }
          partialResults.push({
            label: bd.label,
            skillLabel,
            skills: bd.skills.map((x) => x.name),
            build: bd.build,
            treasures: t.bestTr && t.bestTr.length ? t.bestTr.join(' + ') : '-',
            treasuresArr: t.bestTr || [],
            orderArr: t.ord,
            orderRank: idx + 1,
            s45: markerIdx === 0 ? cum[0] : null,
            s60: markerIdx === 1 ? cum[1] : null,
            s120: markerIdx === 2 ? cum[2] : null,
            s180: markerIdx === 3 ? cum[3] : null,
            order: orderStr,
            cat,
            partial: true,
          });
        }
        for (const result of partialResults) {
          self.postMessage({
            type: 'progress',
            current: validProcessed,
            total: totalCombos,
            validProcessed,
            buildLabel: bd.label,
            buildStructure: bd.build,
            skillLabel,
            subDone: structIdx,
            subTotal: structTotal,
            newResult: result,
            workerId,
            phase: 'partial',
          });
        }
      };

      const evalRes = await evaluateSkillCombo(bd, markerIdx, fixedTreasures, () => cancelled, pass1Optimize, orderTopK, onOrderProgress, onPartialTop);
      if (evalRes.cancelled) { self.postMessage({ type: 'cancelled' }); return; }
      validProcessed++;

      // evaluate 결과는 최대 orderTopK 개 — 각각 별도 result 로 전송
      const resultsArr = evalRes.results || [];
      if (pass1Results) {
        // Pass 2 용 후보는 순서별 Top 1 만 저장 (재검증 시 전수탐색 다시 하므로 충분)
        if (resultsArr[0]) pass1Results.push(resultsArr[0]);
      }
      for (const result of resultsArr) {
        self.postMessage({
          type: 'progress',
          current: validProcessed,
          total: totalCombos,
          validProcessed,
          buildLabel: bd.label,
          buildStructure: bd.build,
          skillLabel,
          subDone: structIdx,
          subTotal: structTotal,
          newResult: result,
          workerId,
          phase: searchMode === 'fast' ? 'pass1' : 'single',
        });
      }
    }
  }

  // === Pass 2 (fast 모드 전용): 상위 K 를 exhaustive 로 재평가 ===
  if (searchMode === 'fast' && pass1Results && pass1Results.length > 0) {
    pass1Results.sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
    const topK = pass1Results.slice(0, pass2TopK);
    self.postMessage({ type: 'phaseChange', workerId, phase: 'pass2', topK: topK.length });

    for (let i = 0; i < topK.length; i++) {
      if (cancelled) { self.postMessage({ type: 'cancelled' }); return; }
      const candidate = topK[i];
      const bd = {
        build: candidate.build,
        label: candidate.label,
        skills: candidate.skills.map((n) => ({ name: n, fam: SK[n].fam })),
        skillLabel: candidate.skillLabel,
      };
      self.postMessage({
        type: 'subProgress',
        workerId,
        buildIdx: validProcessed,
        buildLabel: bd.label,
        buildStructure: bd.build,
        skillLabel: bd.skillLabel,
        subDone: i + 1,
        subTotal: topK.length,
        bestSoFar: candidate[sortKey] ?? -1,
        phase: 'pass2',
      });
      const refined = await evaluateSkillCombo(bd, markerIdx, fixedTreasures, () => cancelled, optimizeBuild, 1, null);
      if (refined.cancelled) { self.postMessage({ type: 'cancelled' }); return; }
      const refinedResult = (refined.results && refined.results[0]) || null;
      if (!refinedResult) continue;
      self.postMessage({
        type: 'progress',
        current: validProcessed,
        total: totalCombos,
        validProcessed,
        buildLabel: bd.label,
        buildStructure: bd.build,
        skillLabel: bd.skillLabel,
        subDone: i + 1,
        subTotal: topK.length,
        newResult: refinedResult,
        workerId,
        phase: 'pass2',
      });
    }
  }

  self.postMessage({ type: 'done', workerId, consumed: validProcessed, validProcessed });
}
