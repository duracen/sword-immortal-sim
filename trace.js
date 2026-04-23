// trace.js — 1위 빌드(열산4+청명2+참유오) 1회 상세 로그
// 신통/법보 시전을 기준으로 섹션 분할, 작열DoT/평타는 매초마다 뭉쳐서 요약

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/sim2.js', 'utf8');
const m = { exports: {} };
const fn = new Function('module', 'require', 'process', '__dirname', '__filename', 'exports', src);
try {
  fn(m, require, { env: {}, stderr: { write: () => {} } }, __dirname, __filename, m.exports);
} catch (e) {}
const { CFG, SK, FAMILIES, TREASURES, simulateBuild } = m.exports;

const build = [['열산', 4], ['청명', 2]];
const treasures = ['참원선검', '유리옥호', '오염혁선'];
// selectSkillsForBuild main 내림차순:
//   열산 [염폭(225), 순일(225), 성료(213), 양운(212)] → idx 0,1,2,3
//   청명 [천노(225), 붕운(225), 풍뢰(225), 투진(213)] slots=2라 앞 2개 → idx 4=천노, 5=붕운
// 새 최적 시전순서: 순일→천노→양운→성료→염폭→붕운→[참원]→[유리]→[오염]
const order = [
  { kind: 'skill', idx: 1 },     // 순일
  { kind: 'skill', idx: 4 },     // 천노
  { kind: 'skill', idx: 3 },     // 양운
  { kind: 'skill', idx: 2 },     // 성료
  { kind: 'skill', idx: 0 },     // 염폭
  { kind: 'skill', idx: 5 },     // 붕운
  { kind: 'treasure', idx: 0 },  // 참원선검
  { kind: 'treasure', idx: 1 },  // 유리옥호
  { kind: 'treasure', idx: 2 },  // 오염혁선
];

// 랜덤 치명타 모드 활성화
CFG.randomCrit = true;
// 이벤트 수집
const events = [];
CFG.trace = (t, tag, msg) => {
  events.push({ t, tag, msg });
};

const res = simulateBuild(build, treasures, order);

// === 출력 포매팅 ===
console.log('==================================================================');
console.log('  빌드: 열산 4 + 청명 2  /  법보: 참원선검 + 유리옥호 + 오염혁선');
console.log('  시전순서: 순일→천노→양운→성료→염폭→붕운→[참원선검]→[유리옥호]→[오염혁선]');
console.log('  시뮬: 2사이클(90s)  /  랜덤 치명타 모드 (매 피해마다 실제 굴림)');
console.log('==================================================================');
console.log('  CST 시전  BUF 버프  STK 스택  OPT 옵션/유파 발동  DMG 피해 (💥=치명타, 일반=치명타 굴림 실패)');
console.log('==================================================================\n');

// 이벤트 시간순 정렬 (안정적)
events.sort((a, b) => a.t - b.t);

// 주요 CST 시점(신통/법보)을 기준으로 섹션 분할
const sections = [];
let cur = null;
for (const ev of events) {
  if (ev.tag === 'CST' && /^▶/.test(ev.msg)) {
    if (cur) sections.push(cur);
    cur = { castT: ev.t, castMsg: ev.msg, events: [ev] };
  } else {
    if (!cur) { cur = { castT: 0, castMsg: '(pre)', events: [] }; }
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
console.log(`  1사이클(45s) 누적:   ${res.cumByMarker[0].toLocaleString('en', { maximumFractionDigits: 0 })}`);
console.log(`  1.5사이클(67.5s):   ${res.cumByMarker[1].toLocaleString('en', { maximumFractionDigits: 0 })}`);
console.log(`  2사이클(90s) 누적:   ${res.cumByMarker[2].toLocaleString('en', { maximumFractionDigits: 0 })}`);
console.log('==================================================================');

// 소스별 피해 요약
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
