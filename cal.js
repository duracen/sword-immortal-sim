// cal.js — 인게임 대조 보정 (복룡2/청명2/옥추2 빌드)
// 인게임 시전순서: 오염혁선13 풍뢰16 투진19 소명22 청사25 약영28 붕산31 비파34 선검37 혁선45 풍뢰50 투진53 소명56
// 노치명 측정: 크리는 자연 굴림(옥추 큐 등 자원 누적용) 하되, 데미지 cMult=1·유뢰법체Final=0 강제.
const fs = require('fs');
let src = fs.readFileSync(__dirname + '/sim2.js', 'utf8');

// --- 소스 주입 (테스트 하네스 전용, 디스크 sim2.js 미변경) ---
// 1) 노치명 모드: 크리 굴림은 그대로(옥추 큐 자원 누적용) cMult 만 1 강제
src = src.replace(
  'cMult = (CFG._ncMode ? 1 : (isCrit ? (cd_effective / 100) : 1));',
  'cMult = (CFG._ncMode ? 1 : (isCrit ? (cd_effective / 100) : 1));'
).replace(
  'cMult = isCrit ? (cd_effective / 100) : 1;',
  'cMult = (CFG._ncMode ? 1 : (isCrit ? (cd_effective / 100) : 1));'
);
// 2) 노치명 모드: 유뢰법체Final 0 강제
src = src.replace(
  '유뢰법체Final = (CFG.randomCrit ? (isCrit ? 1 : 0) : crEff) * CFG.유뢰법체_계열4개_최종피해;',
  '유뢰법체Final = (CFG._ncMode ? 0 : (CFG.randomCrit ? (isCrit ? 1 : 0) : crEff)) * CFG.유뢰법체_계열4개_최종피해;'
);

const m = { exports: {} };
const fn = new Function('module', 'require', 'process', '__dirname', '__filename', 'exports', src);
try { fn(m, require, { env: {}, stderr: { write: () => {} } }, __dirname, 'cal', m.exports); }
catch (e) { console.error('LOAD ERR', e); }
const { CFG, SK, simulateBuild } = m.exports;

// 인게임 대조 하네스 — 법보는 인게임 +150 calibration 수치 사용 (풀강 공식 아님)
CFG.법보인게임수치 = true;

const build = [['복룡', 2], ['청명', 2], ['옥추', 2]];
const treasures = ['오염혁선', '경몽비파', '참원선검'];
const skills = [
  { name: '청명·풍뢰', fam: '청명' }, { name: '청명·투진', fam: '청명' },
  { name: '옥추·소명', fam: '옥추' }, { name: '옥추·청사', fam: '옥추' },
  { name: '복룡·약영', fam: '복룡' }, { name: '복룡·붕산', fam: '복룡' },
];
const order = [
  { kind: 'treasure', idx: 0 }, { kind: 'skill', idx: 0 }, { kind: 'skill', idx: 1 },
  { kind: 'skill', idx: 2 }, { kind: 'skill', idx: 3 }, { kind: 'skill', idx: 4 },
  { kind: 'skill', idx: 5 }, { kind: 'treasure', idx: 1 }, { kind: 'treasure', idx: 2 },
  { kind: 'treasure', idx: 0 }, { kind: 'skill', idx: 0 }, { kind: 'skill', idx: 1 },
  { kind: 'skill', idx: 2 },
];
const opts = {
  maxTime: 70,
  defenseTreasures: ['성해천경', '경화령도', '명공현주'],
  attackSetMode: '현명',   // 현명 3셋 (술법 피해 심화 +5% / 감면 +5%)
  불씨: { 통명묘화: 3, 총성급: 12 },   // 통명묘화 3-set max → 신통 피해 심화 +8%
  bisul: { self: [
    { master: '탁천', branch: '무' }, { master: '식혼', branch: '진' }, { master: '악신', branch: '진' },
  ], enemy: [] },
  법상: { name: '천봉', tiers: { 실체: true, 의념: true, 진령: true } },  // 인게임 천봉 사용 중 (2026-05-18)
};
const TARGETS = {
  '13s 오염혁선 호신강기': 78.48, '16s 풍뢰 per-hit 호신강기': 2.99,
  '19s 투진 1타 체력': 19.08, '22s 소명 1타 체력': 23.45, '28s 약영 체력': 20.28,
  '37s 참원선검 체력': 63.60, '45s 오염혁선 체력': 46.93, '50s 풍뢰 per-hit 체력': 3.99,
};

function pick(ev) {
  const at = (t) => ev.filter(e => Math.abs(e.t - t) < 0.6);
  const find = (list, sub) => list.filter(e => e.src && e.src.includes(sub) && !e.src.includes('분신'));
  const sum = (list) => list.reduce((a, e) => a + e.amt, 0) / 1e8;
  const r = {};
  r['13s 오염혁선 호신강기'] = sum(find(at(13), '오염혁선'));
  { const h = find(at(16), '청명·풍뢰').filter(e => e.src.includes('hit')); r['16s 풍뢰 per-hit 호신강기'] = h.length ? sum(h) / h.length : 0; }
  r['19s 투진 1타 체력'] = sum(find(at(19), '청명·투진').filter(e => e.src.includes('hit 1/')));
  r['22s 소명 1타 체력'] = sum(find(at(22), '옥추·소명').filter(e => e.src.includes('hit 1/')));
  r['28s 약영 체력'] = sum(find(at(28), '복룡·약영'));
  r['37s 참원선검 체력'] = sum(find(at(37), '참원선검'));
  r['45s 오염혁선 체력'] = sum(find(at(45), '오염혁선'));
  { const h = find(at(48), '청명·풍뢰').filter(e => e.src.includes('hit')); r['50s 풍뢰 per-hit 체력'] = h.length ? sum(h) / h.length : 0; }
  return r;
}

function run() {
  CFG.randomCrit = true;     // 크리 자연 굴림 → 옥추 큐 자원 누적
  CFG._ncMode = true;        // 데미지 cMult=1, 유뢰Final=0 (노치명 측정)
  const events = [];
  CFG.trace = (t, tag, msg) => events.push({ t, tag, msg });
  const res = simulateBuild(build, treasures, order, skills, opts);
  CFG.trace = null;
  // 22s 소명 직전 옥추 큐 추출
  let 옥추At소명 = null;
  for (const e of events) {
    if (e.tag === 'STK' && e.t >= 21.9 && e.t <= 22.1 && /옥추/.test(e.msg)) 옥추At소명 = e.msg;
  }
  return { res, events };
}

// 랜덤이라 N회 평균
const N = 200;
const acc = {}, accCnt = {};
const 옥추소명List = [];
for (let i = 0; i < N; i++) {
  const { res, events } = run();
  const p = pick(res.dmgEvents || []);
  for (const k of Object.keys(TARGETS)) { acc[k] = (acc[k] || 0) + (p[k] || 0); accCnt[k] = (accCnt[k] || 0) + 1; }
}
console.log(`\n=== 노치명 인게임 대조 (랜덤 크리 굴림 ${N}회 평균, 옥추 큐 = 실제 멀티히트 크리 누적) ===`);
console.log('  포인트                          sim평균    인게임     오차');
for (const k of Object.keys(TARGETS)) {
  const sv = acc[k] / accCnt[k], tg = TARGETS[k];
  const d = (sv - tg) / tg * 100;
  console.log(`  ${k.padEnd(28)} ${sv.toFixed(2).padStart(8)}  ${tg.toFixed(2).padStart(8)}  ${(d >= 0 ? '+' : '') + d.toFixed(1)}%`);
}
