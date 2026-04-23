// rank_thunder.js — 뇌전 빌드 9! 전수탐색 순서 최적화
// 사용법: node rank_thunder.js [60|120|180]  (기본값 60초)
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/sim2.js', 'utf8');
const m = {};
const fn = new Function('module', 'require', 'process', '__dirname', '__filename', 'exports', src);
try { fn(m, require, { env: {}, stderr: { write: () => {} } }, __dirname, __filename, m.exports || {}); } catch(e) {}
const { CFG, SK, FAMILIES, TREASURES, simulateBuild, selectSkillsForBuild } = m.exports;

// 마커 인덱스: 0=60s, 1=120s, 2=180s
const TARGET_SEC = parseInt(process.argv[2]) || 60;
const MI = [60, 120, 180].indexOf(TARGET_SEC);
if (MI < 0) { console.error('유효한 값: 60, 120, 180'); process.exit(1); }

const ALL_FAMS = Object.keys(FAMILIES);
const ALL_TREASURES = Object.keys(TREASURES);
const 법보조합 = [];
for (let i = 0; i < ALL_TREASURES.length; i++)
  for (let j = i + 1; j < ALL_TREASURES.length; j++)
    for (let k = j + 1; k < ALL_TREASURES.length; k++)
      법보조합.push([ALL_TREASURES[i], ALL_TREASURES[j], ALL_TREASURES[k]]);

// 뇌전 빌드: 뇌전 계열 유파 4슬롯 + 아무 유파 2슬롯
const 뇌전유파 = ALL_FAMS.filter(f => FAMILIES[f].cat === '뇌전');
const builds = [];
for (const main of 뇌전유파) {
  for (const sub of ALL_FAMS) {
    if (sub === main) continue;
    builds.push({ b: [[main, 4], [sub, 2]], label: `${main} 4 + ${sub} 2` });
  }
}

const totalBuilds = builds.length;
const totalStart = Date.now();
console.error(`뇌전 빌드 ${totalBuilds}개 × 법보 ${법보조합.length}개 | 기준: ${TARGET_SEC}초`);

// 기본 순서
function defaultOrder() {
  const order = [];
  for (let i = 0; i < 6; i++) order.push({ kind: 'skill', idx: i });
  for (let i = 0; i < 3; i++) order.push({ kind: 'treasure', idx: i });
  return order;
}

// 9! 순열 생성
function* permutations(arr) {
  if (arr.length <= 1) { yield arr.slice(); return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

const defOrd = defaultOrder();
const TRIALS = 10;
const results = [];

for (let bi = 0; bi < totalBuilds; bi++) {
  const bd = builds[bi];
  const buildStart = Date.now();

  // 1단계: 법보 선별 (기본순서 2회)
  let bestTr = null, bestTrScore = -1;
  for (const tr of 법보조합) {
    let s = 0;
    for (let t = 0; t < 2; t++) s += simulateBuild(bd.b, tr, defOrd).cumByMarker[MI];
    if (s > bestTrScore) { bestTrScore = s; bestTr = tr; }
  }

  // 2단계: 9! 전수탐색
  const slots = [];
  for (let i = 0; i < 6; i++) slots.push({ kind: 'skill', idx: i });
  for (let i = 0; i < 3; i++) slots.push({ kind: 'treasure', idx: i });

  let bestScore = -1, bestOrd = null;
  let count = 0;
  for (const perm of permutations(slots)) {
    const res = simulateBuild(bd.b, bestTr, perm);
    const score = res.cumByMarker[MI];
    if (score > bestScore) { bestScore = score; bestOrd = perm.slice(); }
    count++;
  }

  // 3단계: 최적 순서로 10회 정밀
  const sums = [0, 0, 0];
  for (let t = 0; t < TRIALS; t++) {
    const res = simulateBuild(bd.b, bestTr, bestOrd);
    for (let k = 0; k < 3; k++) sums[k] += res.cumByMarker[k];
  }

  const chosen = selectSkillsForBuild(bd.b);
  const toName = (o) => o.kind === 'skill' ? chosen[o.idx].name : bestTr[o.idx];
  const orderStr = bestOrd.map(toName).join('→');

  const buildSec = ((Date.now() - buildStart) / 1000).toFixed(1);
  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(0);
  const estRemain = ((Date.now() - totalStart) / (bi + 1) * (totalBuilds - bi - 1) / 1000 / 60).toFixed(1);
  process.stderr.write(`[${bi+1}/${totalBuilds}] ${bd.label.padEnd(25)} ${buildSec}s | ${TARGET_SEC}s최적: ${bestScore.toLocaleString('en',{maximumFractionDigits:0})} | 경과 ${totalElapsed}s 남은예상 ${estRemain}분\n`);

  results.push({
    label: bd.label,
    treasures: bestTr.join('+'),
    s60: sums[0] / TRIALS,
    s120: sums[1] / TRIALS,
    s180: sums[2] / TRIALS,
    order: orderStr,
  });
}

results.sort((a, b) => b[`s${TARGET_SEC}`] - a[`s${TARGET_SEC}`]);

function fmt(n) { return n.toLocaleString('en', { maximumFractionDigits: 0 }); }

const totalMin = ((Date.now() - totalStart) / 60000).toFixed(1);
console.log('========================================');
console.log(`  뇌전 빌드 순위 (9! 전수탐색, ${TARGET_SEC}초 기준) — 총 ${totalMin}분`);
console.log('========================================');
for (let i = 0; i < Math.min(10, results.length); i++) {
  const r = results[i];
  console.log(`${String(i+1).padStart(2)}위 | ${r.label.padEnd(25)} | 법보: ${r.treasures.padEnd(20)} | 60s: ${fmt(r.s60).padStart(15)} | 120s: ${fmt(r.s120).padStart(15)} | 180s: ${fmt(r.s180).padStart(15)}`);
  console.log(`      ${TARGET_SEC}s최적순서: ${r.order}`);
}
