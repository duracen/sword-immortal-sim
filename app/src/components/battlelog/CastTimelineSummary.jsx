import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FAMILIES, SK, TREASURE_NAMES } from '../../engine';
import { lookupOption, SKILL_OPTIONS, STACK_DESCS, TRIGGER_DESCS, TREASURE_DESCS } from '../../utils/skillOptions';

const TREASURE_PREFIXES = new Set(Object.keys(TREASURE_DESCS));

// rawKey → canonical display key (같은 옵션의 spec별 분할 버프를 하나로 묶음)
function canonicalDisplayKey(rawKey) {
  if (!rawKey) return rawKey;
  // "유파·신통 → 옵션" 형식 (applyBuff 에서 자동 생성)
  if (rawKey.includes('→')) {
    const parts = rawKey.split('→').map((s) => s.trim());
    const skillFull = parts[0];  // "옥추·소명" 또는 "유리·옥호"
    const suffix = parts[1];     // "소명" or "cd" or "버프"
    // 법보 체크 (유리·옥호 → 유리옥호)
    const joined = skillFull.replace(/·/g, '');
    if (TREASURE_PREFIXES.has(joined)) return joined;
    const opts = SKILL_OPTIONS[skillFull];
    if (opts && opts[suffix]) return suffix;
    // 옵션명 아님 (cd/cr 같은 기술적 접미) → 신통 뒷부분으로 수렴
    const shortName = skillFull.split('·').pop();
    return shortName;
  }
  if (!rawKey.includes('_')) return rawKey;
  const idx = rawKey.indexOf('_');
  const prefix = rawKey.substring(0, idx);
  const suffix = rawKey.substring(idx + 1).replace(/_\d+$/, '');
  // 법보 버프 (예: "유리옥호_버프") → 법보명 그대로 표시
  if (TREASURE_PREFIXES.has(prefix)) return prefix;
  if (prefix.length >= 3) {
    const skillFull = `${prefix.substring(0, 2)}·${prefix.substring(2)}`;
    const opts = SKILL_OPTIONS[skillFull];
    if (opts && opts[suffix]) return suffix;
    return prefix.substring(2);
  }
  return suffix;
}

// STK 메시지에서 자원명과 증감량 파싱
function parseStkMsg(msg) {
  // 선두 이모지/심볼 제거 (🔥 ☠️ 💥 등)
  const stripped = msg.replace(/^[^\p{Letter}\p{Number}]+/u, '');
  // "💥격발 [강령] 독고 -2 (잔여 0.50) → 만고귀종..." — 격발은 자원 차감으로 처리
  let m = stripped.match(/^격발\s*\[([^\]]+)\]\s*독고\s*-(\d+(?:\.\d+)?)/);
  if (m) return { key: `독고·${m[1]}`, delta: -parseFloat(m[2]), refresh: false };
  // "독고 +2.50 (요청 ...) → ..." — 4종 균등분포이므로 delta/4 씩 4개로 처리하지 않고 합계로 표시
  m = stripped.match(/^독고\s*\+(\d+(?:\.\d+)?)/);
  if (m) return { key: '독고', delta: parseFloat(m[1]), refresh: false };
  // "작열 +1 [src] → 현재 3중첩..." 등 일반 +N 패턴
  m = stripped.match(/^([^\s+]+)\s*\+(\d+(?:\.\d+)?)/);
  if (m) return { key: m[1], delta: parseFloat(m[2]), refresh: false };
  // "검세 1→2" / "검세 1→2 (TTL=20s reset)"
  m = stripped.match(/^([^\s]+)\s+(\d+(?:\.\d+)?)→(\d+(?:\.\d+)?)/);
  if (m) return { key: m[1], delta: parseFloat(m[3]) - parseFloat(m[2]), refresh: false };
  // "뇌인 4↻ (TTL=20s reset, 최대치 유지)" — 최대치 유지 중 TTL 갱신
  m = stripped.match(/^([^\s]+)\s+(\d+(?:\.\d+)?)↻/);
  if (m) return { key: m[1], delta: 0, refresh: true };
  return null;
}

// 버프/스택 이벤트에서 key 와 지속시간 파싱.
function parseEvents(events) {
  if (!events || events.length === 0) return { casts: [], buffs: [], maxT: 0 };
  const casts = [];
  const buffMap = new Map();

  // 먼저 CST 와 그 외 이벤트 분리
  const castRaws = [];
  const triggers = [];  // 천벌/천검/염양 등 특별 트리거
  // 각 트리거의 지속 시간 (초) — 0 이면 순간 발동
  const TRIG_DUR = { 천벌: 10, 염양: 10, 천검: 0, 열산: 10 };
  // 같은 시각/종류 트리거는 합쳐서 count 누적 (×N 표시용)
  function pushTrigger(tg) {
    const last = triggers[triggers.length - 1];
    // 같은 t (±0.05s) 와 같은 kind 면 병합
    for (let i = triggers.length - 1; i >= 0; i--) {
      const e = triggers[i];
      if (e.kind === tg.kind && Math.abs(e.t - tg.t) < 0.05) {
        e.count = (e.count || 1) + 1;
        return;
      }
      // 너무 멀리 있는 경우 검색 중단 (성능)
      if (tg.t - e.t > 0.5) break;
    }
    triggers.push({ ...tg, count: 1 });
  }
  for (const ev of events) {
    if (ev.tag === 'CST') {
      const m = ev.msg.match(/^▶\s*([^\s\n]+)/);
      const tr = ev.msg.match(/^📿\s*([^\s\n]+)/);
      castRaws.push({ t: ev.t, name: m ? m[1] : (tr ? tr[1] : '?'), isTreasure: !!tr, stks: {}, snap: null });
    } else if (ev.tag === 'SNAP') {
      // 직전 CST 와 같은 t 에 매핑
      try {
        const snap = JSON.parse(ev.msg);
        // 가장 가까운 이전 CST 에 붙임
        for (let i = castRaws.length - 1; i >= 0; i--) {
          if (Math.abs(castRaws[i].t - ev.t) < 0.05) {
            castRaws[i].snap = snap;
            break;
          }
        }
      } catch (_) { /* ignore */ }
    } else if (ev.tag === 'TRG' && ev.msg.includes('천검발동')) {
      pushTrigger({ t: ev.t, kind: '천검', label: '천검', dur: TRIG_DUR.천검 });
    } else if (ev.tag === 'OPT' && ev.msg.includes('⚡천벌')) {
      pushTrigger({ t: ev.t, kind: '천벌', label: '천벌 10s', dur: TRIG_DUR.천벌 });
    } else if (ev.tag === 'OPT' && ev.msg.includes('🔥염양')) {
      // 염양은 본 신통 DMG 후에 발동 → 시각상 cast 라인보다 살짝 뒤에 표시
      // (이번 신통에는 buff 미적용 의미)
      pushTrigger({ t: ev.t + 0.4, kind: '염양', label: '염양 10s', dur: TRIG_DUR.염양 });
    }
    // 열산상태 / 검심통명 등 유파 효과 buff 는 BUF 이벤트에서 처리
  }
  // STK 이벤트 → (1) cast 창에 매핑 (뱃지용), (2) 자원별 활성 구간 (막대용)
  const stackSpans = {};    // resource → [{start, end}] — 스택 > 0 인 구간
  const stackState = {};    // resource → 현재 count
  for (const ev of events) {
    if (ev.tag !== 'STK') continue;
    const parsed = parseStkMsg(ev.msg);
    if (!parsed) continue;
    // 1) cast 창 매핑 (뱃지)
    let idx = -1;
    for (let i = castRaws.length - 1; i >= 0; i--) {
      if (ev.t >= castRaws[i].t - 0.01) { idx = i; break; }
    }
    if (idx >= 0) {
      castRaws[idx].stks[parsed.key] = (castRaws[idx].stks[parsed.key] || 0) + parsed.delta;
    }
    // 2) 자원 활성 구간 (막대)
    const before = stackState[parsed.key] || 0;
    const after = parsed.refresh ? before : before + parsed.delta;
    stackState[parsed.key] = Math.max(0, after);
    if (!stackSpans[parsed.key]) stackSpans[parsed.key] = [];
    const arr = stackSpans[parsed.key];
    const last = arr[arr.length - 1];
    if (after > 0) {
      const ttlEnd = ev.t + 20;
      if (!last || last.end !== null) {
        arr.push({ start: ev.t, end: null, ttlEnd, peak: after, counts: [{ t: ev.t, n: after }] });
      } else {
        last.ttlEnd = ttlEnd;
        if (after > (last.peak || 0)) last.peak = after;
        last.counts.push({ t: ev.t, n: after });
      }
    } else {
      if (last && last.end === null) {
        last.end = ev.t;
        last.counts.push({ t: ev.t, n: 0 });
      }
    }
  }
  for (const key in stackSpans) {
    const arr = stackSpans[key];
    for (const s of arr) {
      if (s.end === null) s.end = s.ttlEnd ?? s.start + 20;
    }
  }
  for (const c of castRaws) casts.push(c);

  // 유파 효과 buff key → trigger lane 으로 승격할 키 (열산상태/검심통명 등)
  // 모든 유파 효과는 트리거 lane 으로 통합 표시.
  const FAMILY_EFFECT_BUFF_KEYS = new Set(['열산상태', '검심통명']);
  for (const ev of events) {
    if (ev.tag === 'BUF') {
      // 정보성 BUF 라인 (예: "🔼버프 [...] 발동: 옥추 4중첩 ≥ 4 → ...") 은 applyBuff 가 따로 호출되어
      // 별도 BUF 이벤트가 한 번 더 들어옴. 중복 카운트 방지를 위해 발동 안내 라인은 무시.
      if (ev.msg.includes(' 발동:')) continue;
      const keyMatch = ev.msg.match(/\[([^\]]+)\]/);
      const durMatch = ev.msg.match(/(\d+(?:\.\d+)?)\s*초/);
      if (!keyMatch) continue;
      const rawKey = keyMatch[1];
      const displayKey = canonicalDisplayKey(rawKey);
      // 유파 효과 buff 는 트리거 lane 으로 승격
      if (FAMILY_EFFECT_BUFF_KEYS.has(displayKey)) {
        const dur = durMatch ? parseFloat(durMatch[1]) : 10;
        // 동일 시각 중복 부여 방지
        const last = triggers[triggers.length - 1];
        if (!last || last.kind !== displayKey || Math.abs(last.t - ev.t) > 0.05) {
          triggers.push({ t: ev.t, kind: displayKey, label: `${displayKey} ${dur}s`, dur });
        } else {
          // 갱신: end 만 늘림
          last.dur = Math.max(last.dur, ev.t - last.t + dur);
        }
        continue;
      }
      // 메시지에 "N초" 없음 = 본 신통 한정 버프 (applyBuff 아닌 nextCast 류)
      // 시각상 짧은 바(2초)로 표시, 실제 지속시간 개념 없음
      const isThisCastOnly = !durMatch;
      const dur = durMatch ? parseFloat(durMatch[1]) : 2;  // 본 신통 한정이면 2초 시각
      // [post] 플래그: 본 cast 의 dealDamage 후 부여 — 본 cast 영향 X, 다음 cast 부터 적용
      // 염양 트리거처럼 +0.4s 살짝 offset 시켜 시각적으로 "post-cast" 임을 표현
      const isPostDmg = ev.msg.includes('[post]');
      const start = isPostDmg ? ev.t + 0.4 : ev.t;
      const end = start + dur;
      // stack 정보:
      //   stack: 이벤트 직후 stack 수 (UI 툴팁용)
      //   delta: 이 이벤트가 stack 을 얼마나 증가시켰는지 (1→2 = +1, ↻갱신 = 0, 🔼버프 신규 = 1)
      //   stackCap: 이 buff 의 maxStack (트레이스의 "(중첩최대N)" 에서 추출, 없으면 1)
      // fire 횟수는 span 내 이벤트 수로 계산 (stack 5/5 유지도 폭파 1회로 카운트)
      let stack = 1;
      let delta = 1;  // 신규 (🔼버프) 기본 +1
      let stackCap = 1;
      const capDef = ev.msg.match(/중첩최대\s*(\d+(?:\.\d+)?)/);
      if (capDef) stackCap = parseFloat(capDef[1]);
      // 정수/소수 모두 매칭 (주술 fractional 격발 buff 대응)
      const stkM = ev.msg.match(/(\d+(?:\.\d+)?)→(\d+(?:\.\d+)?)/);
      if (stkM) {
        const before = parseFloat(stkM[1]);
        stack = parseFloat(stkM[2]);
        delta = stack - before;
        stackCap = Math.max(stackCap, stack);
      } else {
        const cap = ev.msg.match(/중첩\s*(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/);
        if (cap) { stack = parseFloat(cap[1]); delta = 0; stackCap = Math.max(stackCap, parseFloat(cap[2])); }
      }
      if (!buffMap.has(displayKey)) buffMap.set(displayKey, []);
      const spans = buffMap.get(displayKey);
      const last = spans[spans.length - 1];
      // 같은 timestamp 의 동일 buff 만 병합 (같은 cast 내 중복 이벤트 정리)
      // 다른 timestamp 의 재갱신/재발동은 별도 block 으로 분리 (영염처럼 각 발동 시각화)
      if (last && Math.abs(last.start - start) < 0.05) {
        last.end = Math.max(last.end, end);
        last.maxStack = Math.max(last.maxStack || 1, stack);
        last.stackCap = Math.max(last.stackCap || 1, stackCap);
        last.fires = (last.fires || 1) + 1;
        last.deltaSum = (last.deltaSum || 0) + delta;
        if (isPostDmg) last.isPostDmg = true;
      } else {
        spans.push({ start, end, rawKey, isThisCastOnly, maxStack: stack, stackCap, fires: 1, deltaSum: delta, isPostDmg });
      }
    }
  }

  // maxT 계산 — 원본 events 의 최대 t 기준 (= sim 종료 시점)
  // buff/trigger 의 end 시간은 sim 종료 후로 연장되더라도 sim 시간 내에서만 표시
  let maxT = 0;
  for (const ev of events) {
    if (typeof ev.t === 'number') maxT = Math.max(maxT, ev.t);
  }
  // 3초 단위 올림 (cast 글로벌 CD 가 3초) + 1초 버퍼
  maxT = Math.ceil((maxT + 1) / 3) * 3;
  if (maxT < 10) maxT = 10;
  // buff/stack/trigger 의 end 시간은 maxT 로 clip
  for (const [, spans] of buffMap) {
    for (const s of spans) if (s.end > maxT) s.end = maxT;
  }
  for (const key in stackSpans) {
    for (const s of stackSpans[key]) if (s.end > maxT) s.end = maxT;
  }
  for (const t of triggers) {
    const tEnd = t.t + (t.dur || 0);
    if (tEnd > maxT) t.dur = Math.max(0, maxT - t.t);
  }

  // 유파 효과 (트리거 lane 에 별도 표시) — 버프 lane 에서 제외
  const FAMILY_EFFECT_KEYS = new Set(['열산상태', '열산']);
  // buffs 배열로 변환 — 불씨/유파효과/일반 분리
  const buffs = [];
  const bulssi = [];
  for (const [key, spans] of buffMap) {
    for (const s of spans) {
      const item = { key, start: s.start, end: s.end, rawKey: s.rawKey, isThisCastOnly: s.isThisCastOnly, maxStack: s.maxStack || 1, stackCap: s.stackCap || 1, fires: s.fires || 1, deltaSum: s.deltaSum || 0, isPostDmg: !!s.isPostDmg };
      if (s.rawKey && s.rawKey.startsWith('불씨 ')) bulssi.push(item);
      else if (FAMILY_EFFECT_KEYS.has(key)) continue; // 유파 효과 lane 에서 처리
      else buffs.push(item);
    }
  }
  // 시작 시간 오름차순
  buffs.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));

  // 대상 디버프 막대 — 작열/화상/독고 등 적에게 부여하는 디버프만 (자원 스택 lane 대신)
  // 자기 자원 (검세/검심/뇌인/옥추/신소) 은 제외 — 데미지 계산에 직간접 반영되지만 시각화 별도 lane 불필요
  const DEBUFF_TARGET_KEYS = new Set(['작열', '화상', '독고']);
  const stacks = [];
  for (const key in stackSpans) {
    // 독고·강령 / 독고·환체 등도 포함 (prefix 매칭)
    const baseKey = key.split('·')[0];
    if (!DEBUFF_TARGET_KEYS.has(baseKey)) continue;
    for (const s of stackSpans[key]) stacks.push({ key, start: s.start, end: s.end, peak: s.peak, counts: s.counts });
  }
  // defDebuff / crRes spec 가진 buff 도 대상 디버프로 포함 (예: 둔검, 파세, 검흔, 저주)
  for (const [key, spans] of buffMap) {
    for (const s of spans) {
      if (!s.rawKey) continue;
      const debuffKeywords = ['둔검', '파세', '검흔', '저주', '약화', '붕연', '봉예'];
      if (debuffKeywords.some((kw) => s.rawKey.includes(kw) || key.includes(kw))) {
        stacks.push({
          key,
          rawKey: s.rawKey,  // tooltip 에서 lookupOption 으로 옵션 설명 조회
          start: s.start,
          end: s.end,
          peak: s.maxStack || 1,
          counts: [{ t: s.start, n: s.maxStack || 1 }],
          isBuffDebuff: true,
        });
      }
    }
  }
  stacks.sort((a, b) => a.key.localeCompare(b.key) || a.start - b.start);

  return { casts, buffs, bulssi, triggers, stacks, maxT };
}

// 자원별 색상
const STACK_STYLE = {
  뇌인: 'bg-purple-600/70 border-purple-400/60 text-purple-100',
  옥추: 'bg-indigo-600/70 border-indigo-400/60 text-indigo-100',
  검세: 'bg-blue-600/70 border-blue-400/60 text-blue-100',
  검심: 'bg-cyan-600/70 border-cyan-400/60 text-cyan-100',
  신소: 'bg-teal-600/70 border-teal-400/60 text-teal-100',
  작열: 'bg-orange-600/70 border-orange-400/60 text-orange-100',
  화상: 'bg-red-600/70 border-red-400/60 text-red-100',
};

// 트리거 스타일
const TRIGGER_STYLE = {
  천벌: { bg: 'bg-purple-500', icon: '⚡', ring: 'ring-purple-300' },
  천검: { bg: 'bg-blue-500', icon: '🗡', ring: 'ring-blue-300' },
  염양: { bg: 'bg-red-500', icon: '🔥', ring: 'ring-red-300' },
  열산상태: { bg: 'bg-orange-500', icon: '🔥', ring: 'ring-orange-300' },
  검심통명: { bg: 'bg-cyan-500', icon: '🗡', ring: 'ring-cyan-300' },
};
const DEFAULT_TRIGGER_STYLE = { bg: 'bg-slate-500', icon: '✨', ring: 'ring-slate-300' };

// 버프 lane 배정 — 같은 lane 에 겹치지 않게 배치 (first-fit)
function assignLanes(buffs) {
  const lanes = []; // 각 lane 의 마지막 end
  for (const b of buffs) {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      if (b.start >= lanes[i] - 0.01) {
        b.lane = i;
        lanes[i] = b.end;
        placed = true;
        break;
      }
    }
    if (!placed) {
      b.lane = lanes.length;
      lanes.push(b.end);
    }
  }
  return lanes.length;
}

// 트리거 lane 배정 — 같은 종류는 같은 lane (천검=lane 0, 천벌=lane 1, 염양=2, 열산상태=3 ...)
function assignTriggerLanes(triggers) {
  const kindLane = {};
  let nextLane = 0;
  for (const tg of triggers) {
    if (!(tg.kind in kindLane)) kindLane[tg.kind] = nextLane++;
    tg.lane = kindLane[tg.kind];
  }
  return nextLane;
}

function detectCat(name) {
  if (TREASURE_NAMES.includes(name)) return '법보';
  return FAMILIES[SK[name]?.fam]?.cat || null;
}

const CAT_COLOR = {
  영검: 'bg-blue-500',
  화염: 'bg-red-500',
  뇌전: 'bg-purple-500',
  백족: 'bg-emerald-500',
  법보: 'bg-amber-500',
};

export default function CastTimelineSummary({ events }) {
  const { casts, buffs, bulssi, triggers, stacks, maxT } = useMemo(() => parseEvents(events), [events]);
  const laneCount = useMemo(() => assignLanes(buffs), [buffs]);
  const stackLaneCount = useMemo(() => assignLanes(stacks), [stacks]);
  const bulssiLaneCount = useMemo(() => assignLanes(bulssi), [bulssi]);
  const triggerLaneCount = useMemo(() => assignTriggerLanes(triggers), [triggers]);
  // 활성 버프 수치 hover tooltip — overflow-x-auto 안에서 빠져나오기 위해 portal 로 렌더
  const [snapTip, setSnapTip] = useState(null);

  if (!events || events.length === 0) return null;

  // 그리드 눈금 (3초 간격, cast 글로벌 CD 와 동일)
  const ticks = [];
  for (let t = 0; t <= maxT; t += 3) ticks.push(t);

  return (
    <div className="bg-slate-900 rounded-xl p-2 sm:p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span>🎞️</span>
          <span className="font-bold text-slate-100 text-sm sm:text-base">시전 타임라인</span>
          <span className="text-[11px] sm:text-xs text-slate-300">
            {casts.length}회 시전 · {buffs.length}개 버프
          </span>
        </div>
      </div>

      {/* 모바일에서 가로 스크롤 가능하도록 overflow-x-auto + min-width */}
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <div className="relative bg-slate-950 rounded-lg p-3 min-w-[760px] mx-2 sm:mx-0">
        {/* 시간축 라벨 */}
        <div className="relative h-5 mb-1 border-b border-slate-700">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute text-[11px] text-slate-300 font-mono"
              style={{ left: `${(t / maxT) * 100}%`, transform: 'translateX(-50%)' }}
            >
              {t}s
            </div>
          ))}
        </div>

        {/* 세로 그리드 선 (배경) */}
        <div className="absolute left-3 right-3 top-8 bottom-3 pointer-events-none">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute top-0 bottom-0 border-l border-slate-800"
              style={{ left: `${(t / maxT) * 100}%` }}
            />
          ))}
        </div>

        {/* 영압 대결 (전투 시작 0~6초): cast 가 발사 안 되는 구간 */}
        {maxT >= 6 && (
          <div className="relative mb-1" style={{ height: '20px' }}>
            <div
              className="absolute top-0 bottom-0 rounded bg-gradient-to-r from-violet-700/60 to-violet-500/60 border border-violet-400/70 flex items-center justify-center"
              style={{
                left: '0%',
                width: `${(6 / maxT) * 100}%`,
                minWidth: '50px',
              }}
              title="영압 대결: 전투 시작 후 6초간 cast 발사 불가 (평타만 발사)"
            >
              <span className="text-[11px] text-white font-semibold whitespace-nowrap px-1 truncate">
                ⚔️ 영압 6s
              </span>
            </div>
          </div>
        )}

        {/* 시전 마커 (상단) — stack 뱃지가 많을 수 있어 동적 높이 (각 cast 의 최대 stack 수 기준) */}
        <div
          className="relative mb-2"
          style={{
            // 시전 마커: dot+시간+이름 ≈ 36px + stack 뱃지당 18px (line-height + gap-0.5) + 하단 여유 12px
            height: `${48 + Math.max(0, ...casts.map((c) => Object.entries(c.stks || {}).filter(([, v]) => v !== 0).length)) * 18}px`,
          }}
        >
          {casts.map((c, i) => {
            const cat = detectCat(c.name) || '법보';
            const color = CAT_COLOR[cat];
            const stkEntries = Object.entries(c.stks || {}).filter(([, v]) => v !== 0);
            const leftPct = (c.t / maxT) * 100;
            const tooltipSide = leftPct > 60 ? 'right-0' : 'left-0';
            // 모든 cast 라벨을 left-anchor 로 통일 (0s 처럼) — 잘림 방지 + 시각 통일
            // 툴팁 내용: 법보면 법보 설명, 신통이면 모든 옵션 설명
            const treasureDesc = c.isTreasure ? (TREASURE_DESCS[c.name] || '') : '';
            const skillOpts = !c.isTreasure ? (SKILL_OPTIONS[c.name] || null) : null;
            return (
              <div
                key={i}
                className="absolute flex flex-col items-start group cursor-help hover:z-[200]"
                style={{ left: `${leftPct}%` }}
              >
                <div className={`w-2 h-2 rounded-full ${color} ring-2 ring-slate-900`} />
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  {c.t.toFixed(0)}s
                </div>
                <div className="text-[11px] text-slate-200 mt-0.5 whitespace-nowrap">
                  {c.isTreasure ? '📿' : ''}{c.name}
                </div>
                {stkEntries.length > 0 && (
                  <div className="mt-0.5 flex flex-col gap-0.5 items-center">
                    {stkEntries.map(([k, v]) => (
                      <span
                        key={k}
                        className={`text-[10px] px-1 rounded font-mono ${
                          v > 0
                            ? 'bg-sky-900/70 text-sky-200 border border-sky-700/60'
                            : 'bg-rose-900/70 text-rose-200 border border-rose-700/60'
                        }`}
                      >
                        {k}{v > 0 ? '+' : ''}{v}
                      </span>
                    ))}
                  </div>
                )}
                {/* 시전 툴팁 */}
                {(treasureDesc || skillOpts) && (
                  <div
                    className={`hidden group-hover:block group-focus-within:block absolute ${tooltipSide} top-6 z-[200] w-96 p-3 bg-slate-950 border border-yellow-600 rounded-lg shadow-xl pointer-events-none`}
                  >
                    <div className="text-xs font-bold text-yellow-300 mb-1">
                      {c.isTreasure ? '📿' : '▶'} {c.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mb-2">
                      ⏱ {c.t.toFixed(1)}s 시전
                    </div>
                    {treasureDesc && (
                      <div className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {treasureDesc}
                      </div>
                    )}
                    {skillOpts && Object.keys(skillOpts).length > 0 && (
                      <div className="text-[13px] text-slate-200 leading-relaxed space-y-1">
                        {Object.entries(skillOpts).map(([opt, d]) => (
                          <div key={opt}>
                            <span className="font-bold text-yellow-200">[{opt}]</span>{' '}
                            <span className="text-slate-300">{d}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>


        {/* 유파 효과 (천검=균천, 천벌=청명, 염양/열산상태=열산 등) — 종류별 lane 분리 */}
        {triggers.length > 0 && (
          <div
            className="relative mb-2 border-t border-dashed border-slate-700 pt-2"
            style={{ height: `${Math.max(1, triggerLaneCount) * 22 + 8}px` }}
          >
            <div className="absolute -top-[9px] left-0 text-[10px] text-slate-300 bg-slate-950 px-1">
              유파 효과
            </div>
            {triggers.map((tg, i) => {
              const style = TRIGGER_STYLE[tg.kind] || DEFAULT_TRIGGER_STYLE;
              const dur = tg.dur || 0;
              const desc = TRIGGER_DESCS[tg.kind] || '';
              const leftPct = (tg.t / maxT) * 100;
              const tooltipSide = leftPct > 60 ? 'right-0' : 'left-0';
              const laneTop = (tg.lane || 0) * 22 + 2;
              const count = tg.count || 1;
              const countLabel = count > 1 ? ` ×${count}` : '';
              if (dur > 0) {
                const width = (dur / maxT) * 100;
                return (
                  <div
                    key={i}
                    className={`absolute h-[18px] rounded ${style.bg} border ${style.ring}/60 flex items-center px-1 cursor-help group hover:z-[200]`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${width}%`,
                      top: `${laneTop}px`,
                      minWidth: '30px',
                    }}
                  >
                    <span className="text-[11px] text-white font-semibold truncate">
                      {style.icon} {tg.kind}{countLabel} ·{dur}s
                    </span>
                    <div
                      className={`hidden group-hover:block group-focus-within:block absolute ${tooltipSide} top-5 z-[200] w-72 p-3 bg-slate-950 border border-orange-600 rounded-lg shadow-xl pointer-events-none`}
                    >
                      <div className="text-xs font-bold text-orange-300 mb-1">
                        {style.icon} {tg.kind}{count > 1 ? ` ×${count}회 발동` : ''}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mb-2">
                        ⏱ {tg.t.toFixed(1)}s 발동 · 지속 {dur}초
                      </div>
                      {desc && (
                        <div className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                          {desc}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className="absolute flex flex-col items-center cursor-help group hover:z-[200]"
                  style={{ left: `${leftPct}%`, top: `${laneTop}px`, transform: 'translateX(-50%)' }}
                >
                  <div className="relative">
                    <div className={`w-5 h-5 rounded-full ${style.bg} ring-2 ring-slate-900 flex items-center justify-center text-[11px]`}>
                      {style.icon}
                    </div>
                    {count > 1 && (
                      <span className="absolute -top-1 -right-2 text-[10px] font-bold bg-amber-500 text-slate-950 rounded-full px-1 leading-tight border border-slate-900">
                        ×{count}
                      </span>
                    )}
                  </div>
                  <div
                    className={`hidden group-hover:block group-focus-within:block absolute ${tooltipSide} top-6 z-[200] w-72 p-3 bg-slate-950 border border-orange-600 rounded-lg shadow-xl pointer-events-none`}
                  >
                    <div className="text-xs font-bold text-orange-300 mb-1">
                      {style.icon} {tg.kind}{count > 1 ? ` ×${count}회 발동` : ''}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mb-2">
                      ⏱ {tg.t.toFixed(1)}s 발동
                    </div>
                    {desc && (
                      <div className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {desc}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 자원 스택 막대 (뇌인/옥추/검세/검심/작열 등) */}
        {stacks.length > 0 && (
          <div
            className="relative mb-2 border-t border-dashed border-slate-700 pt-2"
            style={{ height: `${Math.max(1, stackLaneCount) * 20 + 8}px` }}
          >
            <div className="absolute -top-[9px] left-0 text-[10px] text-slate-300 bg-slate-950 px-1">
              대상 디버프
            </div>
            {stacks.map((s, i) => {
              const width = ((s.end - s.start) / maxT) * 100;
              const style = STACK_STYLE[s.key] || 'bg-slate-600/70 border-slate-500 text-slate-100';
              // buff 유래 디버프는 lookupOption 으로 옵션 설명 조회 (저주/둔검 등)
              // 일반 stack 디버프는 STACK_DESCS 에서 (작열/화상/독고)
              const lookup = s.rawKey ? lookupOption(s.rawKey) : null;
              const baseHeader = lookup?.skill ? `${lookup.skill} [${lookup.option}]` : s.key;
              const desc = lookup?.desc || STACK_DESCS[s.key] || '';
              const leftPct = (s.start / maxT) * 100;
              const tooltipSide = leftPct > 60 ? 'right-0' : 'left-0';
              const trajectory = (s.counts || [])
                .map((c) => `${c.t.toFixed(1)}s: ${typeof c.n === 'number' && c.n % 1 !== 0 ? c.n.toFixed(2) : c.n}`)
                .join(' → ');
              return (
                <div
                  key={i}
                  className={`absolute h-[16px] rounded border cursor-help group hover:z-[200] ${style}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${width}%`,
                    top: `${s.lane * 20 + 4}px`,
                    minWidth: '16px',
                  }}
                >
                  <span className="text-[11px] font-mono pl-1 truncate block leading-[16px]">
                    {s.key} {s.peak}중첩 ·{(s.end - s.start).toFixed(0)}s
                  </span>
                  <div
                    className={`hidden group-hover:block group-focus-within:block absolute ${tooltipSide} top-5 z-[200] w-80 p-3 bg-slate-950 border border-sky-600 rounded-lg shadow-xl pointer-events-none`}
                  >
                    <div className="text-xs font-bold text-sky-300 mb-1">
                      🔷 {baseHeader} (최대 {typeof s.peak === 'number' && s.peak % 1 !== 0 ? s.peak.toFixed(2) : s.peak}중첩)
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mb-2">
                      ⏱ {s.start.toFixed(1)}s ~ {s.end.toFixed(1)}s · {(s.end - s.start).toFixed(1)}초
                    </div>
                    {desc && (
                      <div className="text-[13px] text-slate-200 leading-relaxed mb-2 whitespace-pre-wrap">
                        {desc}
                      </div>
                    )}
                    {trajectory && (
                      <div className="text-[11px] text-slate-300 font-mono leading-tight mt-1 border-t border-slate-800 pt-1">
                        📈 {trajectory}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 불씨 세트 효과 */}
        {bulssi.length > 0 && (
          <div
            className="relative mb-2 border-t border-dashed border-slate-700 pt-2"
            style={{ height: `${Math.max(1, bulssiLaneCount) * 20 + 8}px` }}
          >
            <div className="absolute -top-[9px] left-0 text-[10px] text-slate-300 bg-slate-950 px-1">
              불씨
            </div>
            {bulssi.map((b, i) => {
              const realDur = b.end - b.start;
              const width = (realDur / maxT) * 100;
              const lookup = lookupOption(b.rawKey);
              const header = lookup?.skill ? `${lookup.skill} [${lookup.option}]` : b.key;
              const leftPct = (b.start / maxT) * 100;
              const tooltipSide = leftPct > 60 ? 'right-0' : 'left-0';
              return (
                <div
                  key={i}
                  className={`absolute h-[16px] rounded transition-colors cursor-help group hover:z-[200] ${
                    b.isThisCastOnly
                      ? 'bg-pink-500/60 border border-pink-400/70 border-dashed hover:bg-pink-400/70'
                      : 'bg-pink-600/70 border border-pink-400/80 hover:bg-pink-500/80'
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${width}%`,
                    top: `${b.lane * 20 + 4}px`,
                    minWidth: '20px',
                  }}
                >
                  <span className="text-[11px] text-white font-mono pl-1 truncate block leading-[16px]">
                    🔥 {b.key}{b.isThisCastOnly ? ' *' : ` ·${realDur.toFixed(0)}s`}
                  </span>
                  <div
                    className={`hidden group-hover:block group-focus-within:block absolute ${tooltipSide} top-5 z-[200] w-72 p-3 bg-slate-950 border border-pink-600 rounded-lg shadow-xl pointer-events-none`}
                  >
                    <div className="text-xs font-bold text-pink-300 mb-1">🔥 {header}</div>
                    <div className="text-[11px] text-slate-400 font-mono mb-2">
                      {b.isThisCastOnly
                        ? `⏱ ${b.start.toFixed(1)}s (본 신통 한정)`
                        : `⏱ ${b.start.toFixed(1)}s ~ ${b.end.toFixed(1)}s · ${realDur.toFixed(1)}초`}
                    </div>
                    {lookup?.desc ? (
                      <div className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {lookup.desc}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-300 italic">불씨 설명 없음</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 버프 간트 바들 */}
        <div
          className="relative mb-1 border-t border-dashed border-slate-700 pt-2"
          style={{ height: `${Math.max(1, laneCount) * 20 + 8}px` }}
        >
          <div className="absolute -top-[9px] left-0 text-[10px] text-slate-300 bg-slate-950 px-1">
            버프
          </div>
          {buffs.map((b, i) => {
            const realDur = b.end - b.start;
            const width = (realDur / maxT) * 100;
            const lookup = lookupOption(b.rawKey);
            const baseHeader = lookup?.skill
              ? `${lookup.skill} [${lookup.option}]`
              : b.key;
            // 본 span 의 폭파 발동 횟수 (BUF event 수). cap 도달 후 ↻갱신 도 폭파 1회로 카운트
            const fires = b.fires || 1;
            // 누적 stack 은 실제 stack 이 2 이상일 때만 의미 있음 (fractional 도 표시)
            const firesPart = fires > 1 ? ` ×${fires}회 발동` : '';
            const stackVal = b.maxStack || 1;
            const stackStr = stackVal % 1 === 0 ? stackVal.toString() : stackVal.toFixed(2);
            const stackPart = stackVal > 1 ? ` (누적 ${stackStr})` : '';
            const header = `${baseHeader}${firesPart}${stackPart}`;
            const leftPct = (b.start / maxT) * 100;
            // tooltip 위치: 바 왼쪽이 화면 중앙 넘어가면 오른쪽에서 띄움
            const tooltipSide = leftPct > 60 ? 'right-0' : 'left-0';
            return (
              <div
                key={i}
                className={`absolute h-[16px] rounded transition-colors cursor-help group hover:z-[200] ${
                  b.isThisCastOnly
                    ? 'bg-teal-500/60 border border-teal-400/70 border-dashed hover:bg-teal-400/70'
                    : 'bg-emerald-500/70 border border-emerald-400/80 hover:bg-emerald-400/80'
                }`}
                style={{
                  left: `${leftPct}%`,
                  width: `${width}%`,
                  top: `${b.lane * 20 + 4}px`,
                  minWidth: '20px',
                }}
              >
                <span className="text-[11px] text-white font-mono pl-1 truncate block leading-[16px]">
                  {b.key}{fires > 1 ? ` ×${fires}` : ''}{b.isThisCastOnly ? ' *' : ` ·${realDur.toFixed(0)}s`}
                </span>
                {/* 커스텀 툴팁 — hover 시 즉시 표시 */}
                <div
                  className={`hidden group-hover:block group-focus-within:block absolute ${tooltipSide} top-5 z-[200] w-72 p-3 bg-slate-950 border border-emerald-600 rounded-lg shadow-xl pointer-events-none`}
                >
                  <div className="text-xs font-bold text-emerald-300 mb-1">{header}</div>
                  <div className="text-[11px] text-slate-400 font-mono mb-2">
                    {b.isThisCastOnly
                      ? `⏱ ${b.start.toFixed(1)}s (본 신통 한정)`
                      : `⏱ ${b.start.toFixed(1)}s ~ ${b.end.toFixed(1)}s · ${realDur.toFixed(1)}초`}
                  </div>
                  {lookup?.desc ? (
                    <div className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {lookup.desc}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-300 italic">옵션 설명 없음</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 활성 버프 수치 히트맵 — stat 별 행, cast 시점 별 셀 (색 농도 = 수치 크기) */}
        {casts.some((c) => c.snap) && (() => {
          const labels = [
            { key: 'atk', label: '공격력', baseRgb: '245, 158, 11' },         // amber-500
            { key: 'inc', label: '신통 피해 증가', baseRgb: '239, 68, 68' },   // red-500
            { key: 'amp', label: '신통 피해 심화', baseRgb: '217, 70, 239' }, // fuchsia-500
            { key: 'dealt', label: '입히는 피해', baseRgb: '249, 115, 22' },  // orange-500
            { key: 'finalDmg', label: '최종 피해', baseRgb: '244, 63, 94' },  // rose-500
            { key: 'cr', label: '치명타율', baseRgb: '6, 182, 212' },          // cyan-500
            { key: 'cd', label: '치명타 배율', baseRgb: '99, 102, 241' },     // indigo-500
            { key: 'finalCR', label: '최종 치명타율', baseRgb: '8, 145, 178' }, // cyan-700
            { key: 'finalCD', label: '최종 치명타 배율', baseRgb: '79, 70, 229' }, // indigo-600
            { key: 'defDebuff', label: '방어력 감소', baseRgb: '139, 92, 246' }, // violet-500
            { key: 'crRes', label: '치명타 저항 감소', baseRgb: '20, 184, 166' }, // teal-500
          ];
          // 각 stat 별 max 값 계산 — 색 농도 정규화에 사용
          const statMax = {};
          for (const l of labels) {
            let m = 0;
            for (const c of casts) {
              const v = c.snap?.[l.key];
              if (v && Math.abs(v) > m) m = Math.abs(v);
            }
            statMax[l.key] = m;
          }
          // 모든 cast 에서 0인 stat 은 행 자체 숨김
          const visibleLabels = labels.filter((l) => statMax[l.key] > 0.01);
          if (visibleLabels.length === 0) return null;

          return (
            <div className="relative mt-2 border-t border-dashed border-slate-700 pt-3">
              <div className="absolute -top-[9px] left-0 text-[10px] text-slate-300 bg-slate-950 px-1">
                활성 버프 수치 히트맵 (시전 직후 · 색 농도 = 수치 크기)
              </div>
              {visibleLabels.map((label) => (
                <div
                  key={label.key}
                  className="relative mb-[2px]"
                  style={{ height: '20px' }}
                >
                  {/* 셀 — cast 시간 기준으로 절대 위치 */}
                  {casts.map((c, ci) => {
                    if (!c.snap) return null;
                    const v = c.snap[label.key];
                    if (!v || Math.abs(v) < 0.01) return null;
                    const startT = c.t;
                    const endT = casts[ci + 1] ? casts[ci + 1].t : maxT;
                    const leftPct = (startT / maxT) * 100;
                    const widthPct = ((endT - startT) / maxT) * 100;
                    const intensity = Math.abs(v) / (statMax[label.key] || 1);
                    const opacity = 0.25 + intensity * 0.65;
                    const bd = c.snap.bd?.[label.key] || [];
                    const bdLines = bd.map((r) => `${r.src}: +${r.val.toFixed(1)}`).join('\n');
                    const tipId = `${ci}-${label.key}`;
                    return (
                      <div
                        key={ci}
                        className="absolute top-0 bottom-0 rounded-sm flex items-center justify-center cursor-help font-mono text-[10px] text-white border border-slate-900/40 hover:ring-1 hover:ring-white/40"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: `rgba(${label.baseRgb}, ${opacity})`,
                        }}
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setSnapTip({
                            id: tipId,
                            label: label.label,
                            value: v,
                            bdLines,
                            x: r.left + r.width / 2,
                            y: r.top,
                          });
                        }}
                        onMouseLeave={() => setSnapTip((t) => (t?.id === tipId ? null : t))}
                      >
                        {Math.round(v)}
                      </div>
                    );
                  })}
                  {/* Stat 라벨 — 좌측 overlay (어두운 반투명 배경으로 가독성 확보) */}
                  <div
                    className="absolute left-0 top-0 bottom-0 flex items-center text-[10px] text-slate-100 font-semibold pointer-events-none z-10 px-1.5"
                    style={{ background: 'linear-gradient(to right, rgba(2,6,23,0.95) 70%, rgba(2,6,23,0))' }}
                  >
                    {label.label}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        </div>
      </div>

      <div className="text-[11px] text-slate-300 mt-2 flex items-center gap-3 flex-wrap">
        <span>🔵 영검</span>
        <span>🔴 화염</span>
        <span>🟣 뇌전</span>
        <span>🟢 백족</span>
        <span>🟡 법보</span>
        <span className="ml-2">| 녹색 바 = 버프 지속 시간</span>
      </div>
      {snapTip && typeof document !== 'undefined' && createPortal(
        (() => {
          // 화면 밖으로 나가지 않게 좌우 클램프
          const W = 288; // w-72 = 18rem ≈ 288px
          const margin = 8;
          const halfW = W / 2;
          const vw = window.innerWidth;
          let left = snapTip.x;
          if (left - halfW < margin) left = margin + halfW;
          if (left + halfW > vw - margin) left = vw - margin - halfW;
          return (
            <div
              className="fixed z-[9999] w-72 p-3 bg-slate-950 border border-slate-600 rounded-lg shadow-xl pointer-events-none"
              style={{
                left: `${left}px`,
                top: `${snapTip.y - 8}px`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="text-xs font-bold text-slate-100 mb-1">
                {snapTip.label} <span className="text-amber-300">+{snapTip.value.toFixed(2)}%</span>
              </div>
              {snapTip.bdLines ? (
                <div className="text-[12px] text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                  {snapTip.bdLines}
                </div>
              ) : (
                <div className="text-[11px] text-slate-300 italic">분해 정보 없음</div>
              )}
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}
