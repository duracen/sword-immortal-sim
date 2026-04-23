// TOP 10 빌드에 대해 9! 순열 전수 탐색으로 최적 시전 순서 찾기
const { CFG, SK, FAMILIES, TREASURES, simulateBuild, selectSkillsForBuild } = require('./sim2.js');

// --- 시드 고정 난수 (재현성 확보) ---
const origRandom = Math.random;
let seedState = 12345;
function seededRandom() {
  seedState = (seedState * 1664525 + 1013904223) >>> 0;
  return seedState / 0x100000000;
}

// --- 전체 빌드 리스트 생성 (sim2.js와 동일 로직) ---
const ALL_TREASURES = Object.keys(TREASURES);
const 법보조합 = [];
for (let i = 0; i < ALL_TREASURES.length; i++)
  for (let j = i + 1; j < ALL_TREASURES.length; j++)
    for (let k = j + 1; k < ALL_TREASURES.length; k++)
      법보조합.push([ALL_TREASURES[i], ALL_TREASURES[j], ALL_TREASURES[k]]);

const famKeys = Object.keys(FAMILIES);
const builds = [];
// 4+2
for (const a of famKeys) for (const b of famKeys) if (a !== b) {
  builds.push({ b: [[a, 4], [b, 2]], label: `${a} 4 + ${b} 2`, type: '4+2' });
}
// 2+2+2
for (let i = 0; i < famKeys.length; i++)
  for (let j = i + 1; j < famKeys.length; j++)
    for (let k = j + 1; k < famKeys.length; k++) {
      const a = famKeys[i], b = famKeys[j], c = famKeys[k];
      builds.push({ b: [[a, 2], [b, 2], [c, 2]], label: `${a}·${b}·${c} 2+2+2`, type: '2+2+2' });
    }

const fullBuilds = [];
for (const bd of builds) for (const tr of 법보조합) {
  fullBuilds.push({ type: bd.type, b: bd.b, treasures: tr,
    label: `${bd.label} + ${tr.map(n => n[0]).join('')}` });
}

// --- 1차: 기본 순서로 평균 점수 계산 ---
Math.random = seededRandom;
const TRIALS = 20;
for (const bd of fullBuilds) {
  let s1 = 0, s2 = 0;
  seedState = 12345;
  for (let t = 0; t < TRIALS; t++) {
    const [c1, , c2] = simulateBuild(bd.b, bd.treasures);
    s1 += c1; s2 += c2;
  }
  bd.base_c1 = s1 / TRIALS;
  bd.base_c2 = s2 / TRIALS;
}
fullBuilds.sort((a, b) => b.base_c2 - a.base_c2);

console.log('=== 1차 (기본 순서) TOP 10 ===');
for (let i = 0; i < 10; i++) {
  const bd = fullBuilds[i];
  console.log(`${String(i+1).padStart(2)} | ${bd.label.padEnd(50)} | 1cyc ${bd.base_c1.toFixed(0).padStart(6)} | 2cyc ${bd.base_c2.toFixed(0).padStart(6)}`);
}

// --- 순열 생성 (9!) ---
function* permutations(arr) {
  if (arr.length <= 1) { yield arr.slice(); return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) yield [arr[i]].concat(p);
  }
}

// --- TOP 10에 대해 9! 브루트포스 ---
const TOP_N = 10;
console.log('\n=== 2차: TOP 10 순열 최적화 (9! = 362880 per build) ===');
console.log('   (시드 고정, 1 trial per permutation)\n');

const results = [];
const startT = Date.now();
for (let rank = 0; rank < TOP_N; rank++) {
  const bd = fullBuilds[rank];
  const chosen = selectSkillsForBuild(bd.b); // 6 신통
  const slots = [];
  for (let i = 0; i < 6; i++) slots.push({ kind: 'skill', idx: i });
  for (let i = 0; i < 3; i++) slots.push({ kind: 'treasure', idx: i });

  let bestC1 = -1, bestC2 = -1, bestOrderC1 = null, bestOrderC2 = null;
  let count = 0;
  for (const perm of permutations(slots)) {
    seedState = 12345;
    const [c1, , c2] = simulateBuild(bd.b, bd.treasures, perm);
    if (c2 > bestC2) { bestC2 = c2; bestOrderC2 = perm.slice(); }
    if (c1 > bestC1) { bestC1 = c1; bestOrderC1 = perm.slice(); }
    count++;
  }
  const elapsed = ((Date.now() - startT) / 1000).toFixed(1);
  console.log(`[${rank+1}/${TOP_N}] ${bd.label.padEnd(40)} | 기본 ${bd.base_c2.toFixed(0).padStart(5)} → 최적 ${bestC2.toFixed(0).padStart(5)} (+${(bestC2-bd.base_c2).toFixed(0)})  | ${count}개 탐색, ${elapsed}s`);

  const toName = (ev) => ev.kind === 'skill' ? chosen[ev.idx].name : bd.treasures[ev.idx];
  results.push({
    label: bd.label, baseC1: bd.base_c1, baseC2: bd.base_c2,
    bestC1, bestC2,
    orderC1: bestOrderC1.map(toName),
    orderC2: bestOrderC2.map(toName),
  });
}

// --- 최적 순서 결과 ---
console.log('\n=== 최적 순서 적용 후 2사이클 재랭킹 ===');
const reranked = [...results].sort((a, b) => b.bestC2 - a.bestC2);
for (let i = 0; i < reranked.length; i++) {
  const r = reranked[i];
  console.log(`${String(i+1).padStart(2)} | ${r.label.padEnd(40)} | 기본 ${r.baseC2.toFixed(0)} → 최적 ${r.bestC2.toFixed(0)} (+${(r.bestC2-r.baseC2).toFixed(0)})`);
  console.log(`     최적 시전 순서: ${r.orderC2.join(' → ')}`);
}

console.log('\n=== 1사이클 (버스트) 최적 순서 ===');
const burstRanked = [...results].sort((a, b) => b.bestC1 - a.bestC1);
for (let i = 0; i < burstRanked.length; i++) {
  const r = burstRanked[i];
  console.log(`${String(i+1).padStart(2)} | ${r.label.padEnd(40)} | 기본 ${r.baseC1.toFixed(0)} → 최적 ${r.bestC1.toFixed(0)} (+${(r.bestC1-r.baseC1).toFixed(0)})`);
  console.log(`     최적 시전 순서: ${r.orderC1.join(' → ')}`);
}

Math.random = origRandom;
