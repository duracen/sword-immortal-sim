// trace_thunder.js — 뇌전 1위 빌드(청명4+열산2+참유오) 1회 상세 로그

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/sim2.js', 'utf8');
const m = { exports: {} };
const fn = new Function('module', 'require', 'process', '__dirname', '__filename', 'exports', src);
try {
  fn(m, require, { env: {}, stderr: { write: () => {} } }, __dirname, __filename, m.exports);
} catch (e) {}
const { CFG, SK, FAMILIES, TREASURES, simulateBuild } = m.exports;

// === 뇌전 1위 빌드: 청명 4 + 주술 2 + 환참유 ===
const build = [['청명', 4], ['주술', 2]];
const treasures = ['환음요탑', '참원선검', '유리옥호'];

// selectSkillsForBuild main 내림차순:
//   청명 [천노(225), 붕운(225), 풍뢰(225), 투진(213)] → idx 0,1,2,3
//   주술 [제율(300), 유식(300)] → idx 4,5
// 시전순서: 천노→풍뢰→투진→제율→유식→붕운→법보 (붕운은 뇌인 최대한 쌓고 마지막)
const order = [
  { kind: 'skill', idx: 0 },     // 천노
  { kind: 'skill', idx: 2 },     // 풍뢰
  { kind: 'skill', idx: 3 },     // 투진
  { kind: 'skill', idx: 4 },     // 제율
  { kind: 'skill', idx: 5 },     // 유식
  { kind: 'skill', idx: 1 },     // 붕운
  { kind: 'treasure', idx: 0 },  // 환음요탑
  { kind: 'treasure', idx: 1 },  // 참원선검
  { kind: 'treasure', idx: 2 },  // 유리옥호
];

// 랜덤 치명타 모드 활성화 (실제 치명타 굴림)
CFG.randomCrit = true;

const events = [];
CFG.trace = (t, tag, msg) => events.push({ t, tag, msg });

const res = simulateBuild(build, treasures, order);

console.log('==================================================================');
console.log('  [뇌전 1위] 청명 4 + 주술 2  /  법보: 환음요탑+참원선검+유리옥호');
console.log('  시전순서: 천노→풍뢰→투진→제율→유식→붕운→[환음요탑]→[참원선검]→[유리옥호]');
console.log('  시뮬: 2사이클(90s)  /  피해는 기댓값 (치명타 확률×배율로 섞음)');
console.log('==================================================================');
console.log('  CST 시전  BUF 버프  STK 스택  OPT 옵션/유파 발동  DMG 피해 (💥=치명타, 일반=치명타 굴림 실패)');
console.log('==================================================================');

events.sort((a, b) => a.t - b.t);

const sections = [];
let cur = null;
for (const ev of events) {
  if (ev.tag === 'CST' && /^▶/.test(ev.msg)) {
    if (cur) sections.push(cur);
    cur = { castT: ev.t, castMsg: ev.msg, events: [ev] };
  } else {
    if (!cur) cur = { castT: 0, castMsg: '(pre)', events: [] };
    cur.events.push(ev);
  }
}
if (cur) sections.push(cur);

// 모든 이벤트 개별 출력 (요약 없음)
for (const sec of sections) {
  console.log(`\n━━━━━━ [${sec.castT.toFixed(2)}s] ${sec.castMsg.replace('▶ ', '▶ 시전: ')} ━━━━━━`);
  for (const ev of sec.events) {
    if (ev.tag === 'CST' && ev === sec.events[0]) continue;
    console.log(`  [${ev.t.toFixed(2).padStart(6)}s] ${ev.tag.padEnd(3)} ${ev.msg}`);
  }
}

console.log('\n==================================================================');
console.log(`  1사이클(45s) 누적:  ${res.cumByMarker[0].toLocaleString('en', { maximumFractionDigits: 0 })}`);
console.log(`  1.5사이클(67.5s):  ${res.cumByMarker[1].toLocaleString('en', { maximumFractionDigits: 0 })}`);
console.log(`  2사이클(90s) 누적:  ${res.cumByMarker[2].toLocaleString('en', { maximumFractionDigits: 0 })}`);
console.log('==================================================================');

const srcMap = {};
for (const ev of res.dmgEvents) srcMap[ev.src] = (srcMap[ev.src] || 0) + ev.amt;
const entries = Object.entries(srcMap).sort((a, b) => b[1] - a[1]);
const total = entries.reduce((a, e) => a + e[1], 0);
console.log('\n=== 소스별 피해 요약 ===');
for (const [s, amt] of entries) {
  const pct = (amt / total * 100).toFixed(1);
  console.log(`  ${s.padEnd(22)} ${amt.toFixed(0).padStart(16)}  (${pct.padStart(5)}%)`);
}
console.log(`  ${'합계'.padEnd(22)} ${total.toFixed(0).padStart(16)}`);
