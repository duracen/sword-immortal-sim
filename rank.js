// rank.js — sim2.js 기반 랭킹 (순서 최적화 포함)
// 전체 Top 5 + 계열별(영검/화염/뇌전/백족) Top 5

const fs = require('fs');
let src = fs.readFileSync(__dirname + '/sim2.js', 'utf8');
const m = {};
const fn = new Function('module', 'require', 'process', '__dirname', '__filename', 'exports', src);
try {
  fn(m, require, { env: {}, stderr: { write: () => {} } }, __dirname, __filename, m.exports || {});
} catch (e) {}
const { CFG, SK, FAMILIES, TREASURES, simulateBuild, selectSkillsForBuild } = m.exports;

// 빌드 생성
const ALL_FAMS = Object.keys(FAMILIES);
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
      if (checkConstraint(b)) builds.push({ type: '2+2+2', b, label: `${ALL_FAMS[i]} 2 + ${ALL_FAMS[j]} 2 + ${ALL_FAMS[k]} 2` });
    }

// 법보 조합
const ALL_TREASURES = Object.keys(TREASURES);
const 법보조합 = [];
for (let i = 0; i < ALL_TREASURES.length; i++)
  for (let j = i + 1; j < ALL_TREASURES.length; j++)
    for (let k = j + 1; k < ALL_TREASURES.length; k++)
      법보조합.push([ALL_TREASURES[i], ALL_TREASURES[j], ALL_TREASURES[k]]);

// 기본 시전순서
function defaultOrder() {
  const order = [];
  for (let i = 0; i < 6; i++) order.push({ kind: 'skill', idx: i });
  for (let i = 0; i < 3; i++) order.push({ kind: 'treasure', idx: i });
  return order;
}

// Fisher-Yates 셔플
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 순서 최적화: 랜덤 N개 + 휴리스틱 순서 시도, 최고 점수 순서 반환
const ORDER_TRIES = 30;
function findBestOrder(build, treasures) {
  const base = defaultOrder();
  const skills = base.filter(o => o.kind === 'skill');
  const trItems = base.filter(o => o.kind === 'treasure');

  let bestScore = -1, bestOrder = base;

  // 기본 순서
  const s0 = simulateBuild(build, treasures, base).cumByMarker[2];
  if (s0 > bestScore) { bestScore = s0; bestOrder = base; }

  // 휴리스틱: 스킬 역순 (마지막 스킬을 먼저)
  const rev = skills.slice().reverse().concat(trItems);
  const s1 = simulateBuild(build, treasures, rev).cumByMarker[2];
  if (s1 > bestScore) { bestScore = s1; bestOrder = rev; }

  // 휴리스틱: 법보를 스킬 사이에 배치 (4신통→법보3→2신통)
  const mid1 = skills.slice(0, 4).concat(trItems).concat(skills.slice(4));
  const s2 = simulateBuild(build, treasures, mid1).cumByMarker[2];
  if (s2 > bestScore) { bestScore = s2; bestOrder = mid1; }

  // 휴리스틱: 3신통→법보→3신통
  const mid2 = skills.slice(0, 3).concat(trItems).concat(skills.slice(3));
  const s3 = simulateBuild(build, treasures, mid2).cumByMarker[2];
  if (s3 > bestScore) { bestScore = s3; bestOrder = mid2; }

  // 랜덤 셔플
  for (let i = 0; i < ORDER_TRIES; i++) {
    const rndOrder = shuffle(skills).concat(shuffle(trItems));
    const sc = simulateBuild(build, treasures, rndOrder).cumByMarker[2];
    if (sc > bestScore) { bestScore = sc; bestOrder = rndOrder; }
  }

  // 법보 위치도 셔플 (스킬 사이 랜덤 삽입)
  for (let i = 0; i < ORDER_TRIES; i++) {
    const sk = shuffle(skills);
    const tr = shuffle(trItems);
    // 법보를 랜덤 위치에 삽입
    const combined = [];
    let ti = 0;
    const insertPoints = new Set();
    while (insertPoints.size < 3) insertPoints.add(Math.floor(Math.random() * 9));
    const sortedInserts = [...insertPoints].sort((a, b) => a - b);
    let si = 0;
    for (let pos = 0; pos < 9; pos++) {
      if (sortedInserts.includes(pos) && ti < 3) {
        combined.push(tr[ti++]);
      } else if (si < 6) {
        combined.push(sk[si++]);
      } else if (ti < 3) {
        combined.push(tr[ti++]);
      }
    }
    while (ti < 3) combined.push(tr[ti++]);
    while (si < 6) combined.push(sk[si++]);
    if (combined.length === 9) {
      const sc = simulateBuild(build, treasures, combined).cumByMarker[2];
      if (sc > bestScore) { bestScore = sc; bestOrder = combined; }
    }
  }

  return { bestOrder, bestScore };
}

const TRIALS = 10;

console.error(`빌드 ${builds.length}개 × 법보 ${법보조합.length}개 = ${builds.length * 법보조합.length}개 조합`);
console.error('법보 선별 → 순서 최적화(~60회 시도) → 정밀 측정(10회)');

const results = [];
let idx = 0;
for (const bd of builds) {
  idx++;
  if (idx % 10 === 0) process.stderr.write(`  ${idx}/${builds.length}\r`);

  // 단계 1: 법보 선별 (기본순서, 2회 trial)
  const defOrd = defaultOrder();
  let bestTr = null, bestTrScore = -1;
  for (const tr of 법보조합) {
    let s = 0;
    for (let t = 0; t < 2; t++) {
      s += simulateBuild(bd.b, tr, defOrd).cumByMarker[2];
    }
    if (s > bestTrScore) { bestTrScore = s; bestTr = tr; }
  }

  // 단계 2: 최적 법보로 순서 최적화
  const { bestOrder } = findBestOrder(bd.b, bestTr);

  // 단계 3: 최적 순서로 10회 정밀 측정
  let s1 = 0, s2 = 0;
  for (let t = 0; t < TRIALS; t++) {
    const res = simulateBuild(bd.b, bestTr, bestOrder);
    s1 += res.cumByMarker[0];
    s2 += res.cumByMarker[2];
  }

  // 계열 분류
  const cats = {};
  for (const [f, s] of bd.b) {
    const cat = FAMILIES[f].cat;
    cats[cat] = (cats[cat] || 0) + s;
  }

  // 순서 이름 변환
  const chosen = selectSkillsForBuild(bd.b);
  const orderNames = bestOrder.map(o =>
    o.kind === 'skill' ? chosen[o.idx].name.split('·')[1] : bestTr[o.idx]
  ).join('→');

  results.push({
    label: bd.label,
    type: bd.type,
    treasures: bestTr.join('+'),
    c1: s1 / TRIALS,
    c2: s2 / TRIALS,
    cats,
    order: orderNames,
  });
}

process.stderr.write('\n');
results.sort((a, b) => b.c2 - a.c2);

function fmt(n) { return n.toLocaleString('en', { maximumFractionDigits: 0 }); }

// 전체 Top 5
console.log('========================================');
console.log('  전체 순위 Top 5 (2사이클 누적 피해)');
console.log('========================================');
for (let i = 0; i < Math.min(5, results.length); i++) {
  const r = results[i];
  console.log(`${i+1}위 | ${r.label.padEnd(35)} | 법보: ${r.treasures.padEnd(20)} | 2cyc: ${fmt(r.c2).padStart(15)} | 1cyc: ${fmt(r.c1).padStart(15)}`);
  console.log(`     순서: ${r.order}`);
}

// 계열별 Top 5
for (const cat of ['영검', '화염', '뇌전', '백족']) {
  const filtered = results.filter(r => (r.cats[cat] || 0) >= 4);
  filtered.sort((a, b) => b.c2 - a.c2);

  console.log(`\n========================================`);
  console.log(`  ${cat} 계열 주력 빌드 Top 5 (슬롯 4+)`);
  console.log(`========================================`);
  for (let i = 0; i < Math.min(5, filtered.length); i++) {
    const r = filtered[i];
    console.log(`${i+1}위 | ${r.label.padEnd(35)} | 법보: ${r.treasures.padEnd(20)} | 2cyc: ${fmt(r.c2).padStart(15)} | 1cyc: ${fmt(r.c1).padStart(15)}`);
    console.log(`     순서: ${r.order}`);
  }
  if (filtered.length === 0) console.log('  (해당 계열 4슬롯 이상 빌드 없음)');
}
