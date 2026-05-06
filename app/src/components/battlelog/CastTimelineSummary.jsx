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
    const skillFull = parts[0];  // "옥추·소명" 또는 "유리·옥호" 또는 "법상·진룡"
    const suffix = parts[1].replace(/_\d+$/, '');  // "소명" / "cd" / "진룡각인" / "진령"
    // 법보 체크 (유리·옥호 → 유리옥호)
    const joined = skillFull.replace(/·/g, '');
    if (TREASURE_PREFIXES.has(joined)) return joined;
    // 법상 (법상·진룡 → 진룡각인 / 법상·청반의 → 입히는피해 등) — keyword 그대로
    if (skillFull.startsWith('법상·')) return suffix;
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
  // 비술 buff (식혼진_cr, 분혼무_봉인 등) → '마주·갈래' 형식 (신통이 아니므로 별도 처리)
  const bisulMatch = prefix.match(/^(분혼|식혼|탁천|악신|혼원|업화)([무허진])$/);
  if (bisulMatch) return `${bisulMatch[1]}·${bisulMatch[2]}`;
  // 법상 buff (법상청교_교혼, 법상진룡_진룡각인, 법상청반의_입히는피해 등) → keyword 이름 (suffix) 그대로
  // tier suffix '의'/'진' (의념/진령) 도 prefix 의 일부 (법상청반의 / 법상청교진)
  const lawMatch = prefix.match(/^법상(..)([의진])?$/);
  if (lawMatch) return suffix;
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
  // "독고 -N [type] (TTL 만료) → 합계 X" — 자연 만료 (silent prune drift 방지)
  m = stripped.match(/^독고\s*-(\d+(?:\.\d+)?)\s*\[[^\]]*\]\s*\(TTL 만료\)\s*→\s*합계\s*(\d+(?:\.\d+)?)/);
  if (m) return { key: '독고', delta: -parseFloat(m[1]), refresh: false, absolute: parseFloat(m[2]) };
  // "작열 +1 [src] → 현재 3중첩..." / "계약 +0.50 → 현재 12.50/20" — absolute 추출
  m = stripped.match(/^([^\s+]+)\s*\+(\d+(?:\.\d+)?)\s*(?:\[[^\]]*\])?\s*→\s*현재\s*(\d+(?:\.\d+)?)/);
  if (m) return { key: m[1], delta: parseFloat(m[2]), refresh: false, absolute: parseFloat(m[3]) };
  // "계약 -0.50 → 현재 11.50/20 (TTL 만료)" — 부정 delta + absolute
  m = stripped.match(/^([^\s]+)\s*-(\d+(?:\.\d+)?)\s*→\s*현재\s*(\d+(?:\.\d+)?)/);
  if (m) return { key: m[1], delta: -parseFloat(m[2]), refresh: false, absolute: parseFloat(m[3]) };
  // "key +N" 일반 패턴 (absolute 없음)
  m = stripped.match(/^([^\s+]+)\s*\+(\d+(?:\.\d+)?)/);
  if (m) return { key: m[1], delta: parseFloat(m[2]), refresh: false };
  // "검세 1→2" / "검세 1→2 (TTL=20s reset)" — absolute 값 우선 (TTL 만료로 인한 sync drift 방지)
  m = stripped.match(/^([^\s]+)\s+(\d+(?:\.\d+)?)→(\d+(?:\.\d+)?)/);
  if (m) return { key: m[1], delta: parseFloat(m[3]) - parseFloat(m[2]), refresh: false, absolute: parseFloat(m[3]) };
  // "뇌인 4↻ (TTL=20s reset, 최대치 유지)" — 최대치 유지 중 TTL 갱신
  m = stripped.match(/^([^\s]+)\s+(\d+(?:\.\d+)?)↻/);
  if (m) return { key: m[1], delta: 0, refresh: true, absolute: parseFloat(m[2]) };
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
  // 비술: 분혼(15초 봉인+심화), 악신(15초 분신), 업화(10초 DoT)
  // 법상: 모두 20초 빙의
  const TRIG_DUR = { 천벌: 10, 염양: 10, 천검: 0, 열산: 10,
    분혼마주: 15, 악신마주: 15, 업화마주: 10,
    탁천마주: 6,    // 진의 피해감면 6초 (1초 면역은 sim 미모델, 자기 효과 미발동)
    식혼마주: 140,  // 진/허/무 모두 140초 (cr/감면/호신강기 흡수 buff)
    혼원마주: 12,   // 허의 12초 신통/치명타 차단 (자기 효과)
    청교룡: 20, 적난새: 20, 청반룡: 20, 금오: 20,
    청룡: 20, 주작: 20, 진룡: 20, 봉황: 20,
    영역: 10 };     // 영역 발동 — 자기 버프 10초 지속
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
      // 천검 — sim 의 [post] 태그로 timing 결정 (record 전: cast 시점 / record 후: +0.4)
      const offset = ev.msg.includes('[post]') ? 0.4 : 0;
      pushTrigger({ t: ev.t + offset, kind: '천검', label: '천검', dur: TRIG_DUR.천검 });
    } else if (ev.tag === 'OPT' && ev.msg.includes('⚡천벌')) {
      // 천벌 — 뇌인 4중첩 도달 시 발동. 뇌인은 청명 유파 "신통 명중 시"만 누적 → 항상 cast 후 trigger
      pushTrigger({ t: ev.t + 0.4, kind: '천벌', label: '천벌 10s', dur: TRIG_DUR.천벌 });
    } else if (ev.tag === 'OPT' && ev.msg.includes('🔥염양')) {
      // 염양 — sim 의 [post] 태그로 timing 결정 (record 전: cast 시점 / record 후: +0.4)
      const offset = ev.msg.includes('[post]') ? 0.4 : 0;
      pushTrigger({ t: ev.t + offset, kind: '염양', label: '염양 10s', dur: TRIG_DUR.염양 });
    } else if (ev.tag === 'OPT' && /(?:🐉|🦅)법상·/.test(ev.msg) && ev.msg.includes('빙의 시작')) {
      // 법상 빙의 시작 — 첫 공격 cast 직후 (cast 자체엔 effect 미적용)
      // 시각상 cast 라인보다 살짝 뒤(+0.4s)에 표시 (염양 패턴 — 이번 cast 영향 X 의미)
      const m = ev.msg.match(/(🐉|🦅)법상·([가-힣]+) 빙의 시작/);
      const tMatch = ev.msg.match(/@([\d.]+)s/);
      if (m) {
        const name = m[2];
        const startT = tMatch ? parseFloat(tMatch[1]) : ev.t;
        pushTrigger({ t: startT + 0.4, kind: name, label: `${m[1]}법상·${name} 20s`, dur: TRIG_DUR[name] || 20 });
      }
    } else if (ev.tag === 'OPT' && ev.msg.includes('🔮')) {
      // 비술 발동 — cast 후 효과 적용 (이번 cast 영향 X)
      // 시각상 cast 라인보다 살짝 뒤(+0.4s)에 표시 (염양/법상 패턴)
      const m = ev.msg.match(/🔮(분혼|식혼|탁천|악신|혼원|업화)마주·([무허진])/);
      if (m) {
        const masterKey = `${m[1]}마주`;
        const dur = TRIG_DUR[masterKey] || 1;
        pushTrigger({ t: ev.t + 0.4, kind: masterKey, label: `${masterKey}·${m[2]} ${dur}s`, dur, branch: m[2] });
      }
    } else if (ev.tag === 'OPT' && /🌐영역 \[([^\]]+)\] 발동/.test(ev.msg)) {
      // 영역 (법칙) 발동 — 누적 10회 시전 + CD 180s. 자기 버프 10초 지속
      const m = ev.msg.match(/🌐영역 \[([^\]]+)\] 발동/);
      if (m) {
        const name = m[1];
        pushTrigger({ t: ev.t, kind: '영역', label: `영역·${name} ${TRIG_DUR.영역}s`, dur: TRIG_DUR.영역, branch: name });
      }
    } else if (ev.tag === 'OPT' && /⚔️영역대결 \[([^\]]+)\]/.test(ev.msg)) {
      // 영역대결 — 영역 발동 시 시전 차단 5초 (영압대결과 별도 lane, 동일 색/아이콘)
      const m = ev.msg.match(/⚔️영역대결 \[([^\]]+)\]/);
      if (m) {
        pushTrigger({ t: ev.t, kind: '영역대결', label: `영역대결 5s`, dur: 5, count: 1 });
      }
    }
    // 열산상태 / 검심통명 등 유파 효과 buff 는 BUF 이벤트에서 처리
  }
  // 영압대결 — 항상 0~10s (이벤트로 emit 안 되므로 강제 push)
  triggers.unshift({ t: 0, kind: '영압대결', label: '영압 10s', dur: 10, count: 1 });
  // 불씨 BUF 이벤트 → trigger lane 으로 승격 (별도 lane 제거됨)
  // 형식: "🔼버프 [불씨 통명묘화] <label> +N% (cnt/max) (dur초)"
  // <label> 은 괄호 포함 가능 (예: 태현잔화 "기댓값 (0~2배 랜덤)") → 끝에서 매칭
  for (const ev of events) {
    if (ev.tag !== 'BUF') continue;
    const nameMatch = ev.msg.match(/\[불씨 ([가-힣]+)\]/);
    if (!nameMatch) continue;
    // 마지막 두 개의 () group 매칭: (cnt/cap) (dur초)
    const tailMatch = ev.msg.match(/\((\d+)\/(\d+)\)\s*\((\d+(?:\.\d+)?)\s*초\)\s*$/);
    if (!tailMatch) continue;
    const name = nameMatch[1];   // 통명묘화/태현잔화/유리현화/진마성화 등
    const cnt = tailMatch[1];    // 현재 장착 수
    const cap = tailMatch[2];    // 최대
    const dur = parseFloat(tailMatch[3]);
    triggers.push({ t: ev.t, kind: '불씨', branch: name, label: `불씨·${name} ${cnt}/${cap}`, dur, count: 1 });
  }
  // STK 이벤트 → (1) cast 창에 매핑 (뱃지용), (2) 자원별 활성 구간 (막대용)
  const stackSpans = {};    // resource → [{start, end}] — 스택 > 0 인 구간
  const stackState = {};    // resource → 현재 count
  for (const ev of events) {
    if (ev.tag !== 'STK') continue;
    const parsed = parseStkMsg(ev.msg);
    if (!parsed) continue;
    // 1) cast 창 매핑 (뱃지) — TTL 만료/누적카운터 같이 cast 행동과 무관한 STK 는 제외
    //    cast 본인의 add (acquire) 만 delta 로 표시
    const isExpireOrCounter = /TTL 만료|뇌인_누적/.test(ev.msg);
    let idx = -1;
    for (let i = castRaws.length - 1; i >= 0; i--) {
      if (ev.t >= castRaws[i].t - 0.01) { idx = i; break; }
    }
    if (idx >= 0 && !isExpireOrCounter) {
      castRaws[idx].stks[parsed.key] = (castRaws[idx].stks[parsed.key] || 0) + parsed.delta;
    }
    // 2) 자원 활성 구간 (막대)
    const before = stackState[parsed.key] || 0;
    // absolute 값이 있으면 우선 사용 (TTL 만료 silent prune 으로 인한 drift 방지)
    let after;
    if (parsed.absolute !== undefined) {
      after = parsed.absolute;
    } else if (parsed.refresh) {
      after = before;
    } else {
      after = before + parsed.delta;
    }
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
      // 같은 rawKey 의 연속 갱신 → 동일 span 으로 병합 (만료 전 재적용 케이스 — 진룡각인/적혼/봉황각인 등)
      // 만료 후 재적용 (gap 발생) 시에만 새 span 시작
      // 0.1s 버퍼: catch-up emit / 동시 cast 시 약간의 timing 오차 흡수
      if (last && last.rawKey === rawKey && start <= last.end + 0.1) {
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
  // 3초 단위 올림 (cast 글로벌 CD 가 3초) + 5초 버퍼 (마지막 cast 의 버프/트리거 표시 여유)
  maxT = Math.ceil((maxT + 5) / 3) * 3;
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
  // buffs 배열로 변환 — 불씨는 trigger lane 으로 통합, 유파효과/일반 분리
  const buffs = [];
  for (const [key, spans] of buffMap) {
    for (const s of spans) {
      const item = { key, start: s.start, end: s.end, rawKey: s.rawKey, isThisCastOnly: s.isThisCastOnly, maxStack: s.maxStack || 1, stackCap: s.stackCap || 1, fires: s.fires || 1, deltaSum: s.deltaSum || 0, isPostDmg: !!s.isPostDmg };
      if (s.rawKey && s.rawKey.startsWith('불씨 ')) continue; // 불씨는 trigger lane 으로 통합 (별도 emit)
      else if (FAMILY_EFFECT_KEYS.has(key)) continue; // 유파 효과 lane 에서 처리
      else buffs.push(item);
    }
  }
  // 시작 시간 오름차순
  buffs.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));

  // 대상 디버프 / 자원 막대 — 작열/화상/독고 (적 디버프) + 계약 (자기 자원)
  // 자기 자원 검세/검심/뇌인/옥추/신소 등은 제외 — 데미지 계산에 직간접 반영되어 시각화 별도 lane 불필요
  const DEBUFF_TARGET_KEYS = new Set(['작열', '화상', '독고', '계약']);
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

  return { casts, buffs, triggers, stacks, stackSpans, maxT };
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
  독고: 'bg-emerald-600/70 border-emerald-400/60 text-emerald-100',
  계약: 'bg-pink-600/70 border-pink-400/60 text-pink-100',
};

// 트리거 스타일
const TRIGGER_STYLE = {
  천벌: { bg: 'bg-purple-500', icon: '⚡', ring: 'ring-purple-300' },
  천검: { bg: 'bg-blue-500', icon: '🗡', ring: 'ring-blue-300' },
  염양: { bg: 'bg-red-500', icon: '🔥', ring: 'ring-red-300' },
  열산상태: { bg: 'bg-orange-500', icon: '🔥', ring: 'ring-orange-300' },
  검심통명: { bg: 'bg-cyan-500', icon: '🗡', ring: 'ring-cyan-300' },
  // 비술 — 마주별 색 구분 + 🔮 아이콘
  분혼마주: { bg: 'bg-fuchsia-600', icon: '🔮', ring: 'ring-fuchsia-300' },
  악신마주: { bg: 'bg-rose-600', icon: '🔮', ring: 'ring-rose-300' },
  업화마주: { bg: 'bg-amber-600', icon: '🔮', ring: 'ring-amber-300' },
  탁천마주: { bg: 'bg-violet-600', icon: '🔮', ring: 'ring-violet-300' },
  식혼마주: { bg: 'bg-pink-600', icon: '🔮', ring: 'ring-pink-300' },
  혼원마주: { bg: 'bg-indigo-600', icon: '🔮', ring: 'ring-indigo-300' },
  // 법상 — 용 (cyan), 새 (rose/amber)
  청교룡: { bg: 'bg-cyan-700', icon: '🐉', ring: 'ring-cyan-300' },
  적난새: { bg: 'bg-rose-700', icon: '🦅', ring: 'ring-rose-300' },
  청반룡: { bg: 'bg-cyan-600', icon: '🐉', ring: 'ring-cyan-300' },
  금오:   { bg: 'bg-amber-700', icon: '🦅', ring: 'ring-amber-300' },
  청룡:   { bg: 'bg-cyan-500', icon: '🐉', ring: 'ring-cyan-300' },
  주작:   { bg: 'bg-rose-600', icon: '🦅', ring: 'ring-rose-300' },
  진룡:   { bg: 'bg-cyan-400', icon: '🐉', ring: 'ring-cyan-300' },
  봉황:   { bg: 'bg-rose-500', icon: '🦅', ring: 'ring-rose-300' },
  // 영역 (법칙) — 보라계열 + 🌐 아이콘
  영역:   { bg: 'bg-violet-700', icon: '🌐', ring: 'ring-violet-300' },
  // 영압대결 — 전투 시작 0~6초간 cast 발사 불가 (평타만)
  영압대결: { bg: 'bg-violet-500', icon: '⚔️', ring: 'ring-violet-300' },
  // 영역대결 — 영역 발동 시 시전 차단 3초 (같은 보라색 + ⚔️)
  영역대결: { bg: 'bg-violet-600', icon: '⚔️', ring: 'ring-violet-300' },
  // 불씨 — 분홍계열 + 🔥 아이콘 (이전 별도 lane 색상 유지)
  불씨:   { bg: 'bg-pink-600', icon: '🔥', ring: 'ring-pink-300' },
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
  // 같은 kind+branch 는 같은 lane (예: 불씨·통명묘화 끼리만 lane 공유, 영역·제왕의 정 끼리만 lane 공유)
  // kind 만 다른 (천검/천벌/염양 등) 은 자체 kind 가 lane key
  const laneKey = {};
  let nextLane = 0;
  for (const tg of triggers) {
    const key = tg.branch ? `${tg.kind}·${tg.branch}` : tg.kind;
    if (!(key in laneKey)) laneKey[key] = nextLane++;
    tg.lane = laneKey[key];
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
  const { casts, buffs, triggers, stacks, stackSpans, maxT } = useMemo(() => parseEvents(events), [events]);
  const laneCount = useMemo(() => assignLanes(buffs), [buffs]);
  const stackLaneCount = useMemo(() => assignLanes(stacks), [stacks]);
  const triggerLaneCount = useMemo(() => assignTriggerLanes(triggers), [triggers]);
  // 활성 버프 수치 hover tooltip — overflow-x-auto 안에서 빠져나오기 위해 portal 로 렌더
  const [snapTip, setSnapTip] = useState(null);

  if (!events || events.length === 0) return null;

  // 그리드 눈금 — 실제 cast 시점에 맞춤 (3초 고정 간격이 아니라 신통/법보 시전 시각)
  // 0s 시작 + 각 cast 시점 (중복 제거 + 너무 가까운 라벨 dedupe)
  // maxT 끝점은 last cast 와 너무 가까우면 생략 (라벨 겹침 방지)
  const tickRaw = [0, ...casts.map((c) => Math.round(c.t * 10) / 10)];
  tickRaw.sort((a, b) => a - b);
  // 인접 tick 간 거리가 2초 미만이면 후자 제외 (라벨 겹침 방지)
  const ticks = [];
  for (const t of tickRaw) {
    if (ticks.length === 0 || t - ticks[ticks.length - 1] >= 2.0) ticks.push(t);
  }
  // maxT 는 마지막 tick 이 maxT-2 이상이면 추가 X (겹침 방지)
  if (ticks.length === 0 || maxT - ticks[ticks.length - 1] >= 2.0) ticks.push(maxT);

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
        {/* 시간축 라벨 — cast 시점 기준, 정수면 정수 표시 / 소수점 있으면 소수점 1자리 */}
        <div className="relative h-5 mb-1 border-b border-slate-700">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute text-[11px] text-slate-300 font-mono"
              style={{ left: `${(t / maxT) * 100}%`, transform: 'translateX(-50%)' }}
            >
              {Number.isInteger(t) ? t : t.toFixed(1)}s
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

        {/* 영압 대결은 효과 (trigger) lane 으로 이동 (영압대결 trigger) */}

        {/* 시전 마커 (상단) — dot+시간+이름만 (스택 뱃지는 별도 lane 으로 분리) */}
        <div
          className="relative mb-2"
          style={{
            // 시전 마커: dot+시간+이름 ≈ 48px (고정)
            height: `48px`,
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
                className="absolute flex flex-col items-start hover:z-[200]"
                style={{ left: `${leftPct}%` }}
              >
                {/* 시전 마커 (dot+time+name) — 자체 group/cast, hover 시 신통 툴팁 */}
                <div className="relative group/cast cursor-help flex flex-col items-start">
                  <div className={`w-2 h-2 rounded-full ${color} ring-2 ring-slate-900`} />
                  <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                    {c.t.toFixed(0)}s
                  </div>
                  <div className="text-[11px] text-slate-200 mt-0.5 whitespace-nowrap">
                    {c.isTreasure ? '📿' : ''}{c.name}
                  </div>
                  {/* 시전 툴팁 — dot/time/name hover 시에만 표시 (stack 뱃지는 별도 group) */}
                  {(treasureDesc || skillOpts) && (
                    <div
                      className={`hidden group-hover/cast:block group-focus-within/cast:block absolute ${tooltipSide} top-6 z-[200] w-96 p-3 bg-slate-950 border border-yellow-600 rounded-lg shadow-xl pointer-events-none`}
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
              </div>
            );
          })}
        </div>

        {/* 스택 누적 heatmap — cast 시점별 각 stack 의 누적 수치, 활성 버프 수치 와 동일 형식 */}
        {(() => {
          // 1) 각 cast 시점별 stack 누적 수 계산 (stackSpans 의 counts 사용)
          // cumByCast[castIdx][stackKey] = count
          const cumByCast = casts.map(() => ({}));
          const stackKeySet = new Set();
          for (const key in stackSpans) {
            for (const span of stackSpans[key]) {
              for (let ci = 0; ci < casts.length; ci++) {
                const t = casts[ci].t;
                if (t < span.start || t >= span.end) continue;
                // Find latest count entry where entry.t <= t
                let count = 0;
                for (const c of span.counts) {
                  if (c.t <= t + 0.001) count = c.n;
                  else break;
                }
                if (count > 0) {
                  cumByCast[ci][key] = (cumByCast[ci][key] || 0) + count;
                  stackKeySet.add(key);
                }
              }
            }
          }
          const stackKeys = Array.from(stackKeySet);
          // 자원 스택 정렬 우선순위 (자기 자원 → 적 디버프)
          const order = ['검세', '검심', '뇌인', '옥추', '신소', '계약', '진마성화스택', '작열', '화상', '독고'];
          stackKeys.sort((a, b) => {
            const ai = order.indexOf(a); const bi = order.indexOf(b);
            if (ai === -1 && bi === -1) return a.localeCompare(b);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          });
          if (stackKeys.length === 0) return null;
          // 각 stack 의 max 값 (색 농도 정규화)
          const stackMax = {};
          for (const k of stackKeys) {
            let m = 0;
            for (const cb of cumByCast) {
              if ((cb[k] || 0) > m) m = cb[k];
            }
            stackMax[k] = m;
          }
          // stack 별 색상 (rgb)
          const STACK_RGB = {
            검세: '14, 165, 233',  // sky
            검심: '6, 182, 212',  // cyan
            뇌인: '168, 85, 247',  // purple
            옥추: '139, 92, 246',  // violet
            신소: '20, 184, 166',  // teal
            계약: '236, 72, 153',  // pink
            진마성화스택: '244, 114, 182',  // pink-rose
            작열: '249, 115, 22',  // orange
            화상: '239, 68, 68',  // red
            독고: '34, 197, 94',  // emerald
          };
          return (
            <div
              className="relative mb-2 border-t border-dashed border-slate-700 pt-2"
              style={{ height: `${stackKeys.length * 16 + 8}px` }}
            >
              <div className="absolute -top-[9px] left-0 text-[10px] text-slate-300 bg-slate-950 px-1">
                스택 (누적)
              </div>
              {stackKeys.map((k, ki) => {
                const rgb = STACK_RGB[k] || '148, 163, 184';
                return (
                  <div
                    key={k}
                    className="absolute left-0 right-0"
                    style={{ top: `${ki * 16 + 4}px`, height: '14px' }}
                  >
                    {casts.map((c, ci) => {
                      const v = cumByCast[ci][k] || 0;
                      if (!v) return null;
                      const delta = (c.stks && c.stks[k]) || 0;
                      const startT = c.t;
                      const endT = casts[ci + 1] ? casts[ci + 1].t : maxT;
                      const leftPct = (startT / maxT) * 100;
                      const widthPct = ((endT - startT) / maxT) * 100;
                      const intensity = v / (stackMax[k] || 1);
                      const opacity = 0.25 + intensity * 0.65;
                      const tooltipSide = leftPct > 60 ? 'right-0' : 'left-0';
                      const fmt = (n) => typeof n === 'number' && n % 1 !== 0 ? n.toFixed(1) : n;
                      const displayText = delta !== 0 ? `${fmt(v)}(${delta > 0 ? '+' : ''}${fmt(delta)})` : `${fmt(v)}`;
                      return (
                        <div
                          key={ci}
                          className="absolute top-0 bottom-0 rounded-sm flex items-center justify-center cursor-help font-mono text-[10px] text-white border border-slate-900/40 hover:ring-1 hover:ring-white/40 group/stack"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            backgroundColor: `rgba(${rgb}, ${opacity})`,
                          }}
                        >
                          {displayText}
                          {STACK_DESCS[k] && (
                            <div
                              className={`hidden group-hover/stack:block absolute ${tooltipSide} top-4 z-[300] w-72 p-3 bg-slate-950 border border-sky-600 rounded-lg shadow-xl pointer-events-none`}
                            >
                              <div className="text-xs font-bold text-sky-300 mb-1">
                                🔷 {k} ({c.t.toFixed(1)}s 시점 누적 {fmt(v)}중첩{delta !== 0 ? `, 이번 cast ${delta > 0 ? '+' : ''}${fmt(delta)}` : ''})
                              </div>
                              <div className="text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                                {STACK_DESCS[k]}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* 좌측 라벨 overlay */}
                    <div
                      className="absolute left-0 top-0 bottom-0 flex items-center text-[10px] text-slate-100 font-semibold pointer-events-none z-10 px-1.5"
                      style={{ background: 'linear-gradient(to right, rgba(2,6,23,0.95) 70%, rgba(2,6,23,0))' }}
                    >
                      {k}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* 효과 (유파 트리거 + 비술 발동 등) — 종류별 lane 분리 */}
        {triggers.length > 0 && (
          <div
            className="relative mb-2 border-t border-dashed border-slate-700 pt-2"
            style={{ height: `${Math.max(1, triggerLaneCount) * 22 + 8}px` }}
          >
            <div className="absolute -top-[9px] left-0 text-[10px] text-slate-300 bg-slate-950 px-1">
              효과
            </div>
            {triggers.map((tg, i) => {
              const style = TRIGGER_STYLE[tg.kind] || DEFAULT_TRIGGER_STYLE;
              const dur = tg.dur || 0;
              // 영역/불씨/비술 같이 branch (특정 영역/마주명) 가 있는 trigger 는 branch 별 desc 우선 lookup
              const desc =
                (tg.branch && TRIGGER_DESCS[`${tg.kind}·${tg.branch}`]) ||
                (tg.branch && TRIGGER_DESCS[tg.branch]) ||
                TRIGGER_DESCS[tg.kind] || '';
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
                      {style.icon} {tg.kind}{tg.branch ? `·${tg.branch}` : ''}{countLabel} ·{Math.round(dur)}s
                    </span>
                    <div
                      className={`hidden group-hover:block group-focus-within:block absolute ${tooltipSide} top-5 z-[200] w-72 p-3 bg-slate-950 border border-orange-600 rounded-lg shadow-xl pointer-events-none`}
                    >
                      <div className="text-xs font-bold text-orange-300 mb-1">
                        {style.icon} {tg.kind}{tg.branch ? `·${tg.branch}` : ''}{count > 1 ? ` ×${count}회 발동` : ''}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mb-2">
                        ⏱ {tg.t.toFixed(1)}s 발동 · 지속 {Math.round(dur)}초
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
              // STACK_DESCS 우선 (스택 자체 설명) → 없으면 lookupOption (옵션 설명)
              // 헤더는 stack key 기준 (둔검/파세/검흔 등) — 신통 출처 표시 안 함
              const lookup = s.rawKey ? lookupOption(s.rawKey) : null;
              const stackDesc = STACK_DESCS[s.key];
              const baseHeader = stackDesc ? s.key : (lookup?.skill ? `${lookup.skill} [${lookup.option}]` : s.key);
              const desc = stackDesc || lookup?.desc || '';
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
                      ⏱ {s.start.toFixed(1)}s ~ {s.end.toFixed(1)}s · {(s.end - s.start).toFixed(0)}초
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

        {/* 불씨는 효과 (trigger) lane 으로 통합됨 — 별도 lane 제거 */}

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
                      : `⏱ ${b.start.toFixed(1)}s ~ ${b.end.toFixed(1)}s · ${realDur.toFixed(0)}초`}
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
          // 표시 규약: shintongKey 가 있으면 "메인값(신통값)" 형식 — sim2.js snap 의 cr/cd/dealt 는 이미 합산값,
          // crShintong/cdShintong/dealtShintong 은 신통 전용분만 따로 노출됨.
          // 행 순서: 피해(공격력 → 피해 증가 → 심화 → 최종 피해) → 크리(치명타율 → 최종치명 → 배율 → 최종배율) → 적 디버프
          const labels = [
            { key: 'atk', label: '공격력', baseRgb: '245, 158, 11' },         // amber-500
            { key: 'dealt', label: '피해 증가(신통)', shintongKey: 'dealtShintong', baseRgb: '249, 115, 22' },  // orange-500
            { key: 'amp', label: '신통 피해 심화', baseRgb: '217, 70, 239' }, // fuchsia-500
            { key: 'finalDmg', label: '최종 피해', baseRgb: '244, 63, 94' },  // rose-500
            { key: 'cr', label: '치명타율(신통)', shintongKey: 'crShintong', baseRgb: '6, 182, 212' },          // cyan-500
            { key: 'finalCR', label: '최종 치명타율', baseRgb: '8, 145, 178' }, // cyan-700
            { key: 'cd', label: '치명타 배율(신통)', shintongKey: 'cdShintong', baseRgb: '99, 102, 241' },     // indigo-500
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
                    const vShin = label.shintongKey ? (c.snap[label.shintongKey] || 0) : 0;
                    if (!v || Math.abs(v) < 0.01) return null;
                    const startT = c.t;
                    const endT = casts[ci + 1] ? casts[ci + 1].t : maxT;
                    const leftPct = (startT / maxT) * 100;
                    const widthPct = ((endT - startT) / maxT) * 100;
                    const intensity = Math.abs(v) / (statMax[label.key] || 1);
                    const opacity = 0.25 + intensity * 0.65;
                    // 분해 (툴팁): 일반 + 신통 전용 buff 모두 표시
                    const bdGen = c.snap.bd?.[label.key] || [];
                    const bdShin = label.shintongKey ? (c.snap.bd?.[label.shintongKey] || []) : [];
                    // 합치면서 신통 전용은 (신통) 마커 추가
                    const bdAll = [
                      ...bdGen.map((r) => ({ ...r, _shin: false })),
                      ...bdShin.map((r) => ({ ...r, _shin: true })),
                    ];
                    const bdLines = bdAll.map((r) => `${r._shin ? '🔮 ' : '   '}${r.src}: +${r.val.toFixed(1)}${r._shin ? ' (신통)' : ''}`).join('\n');
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
                            valueShintong: vShin,
                            hasShintong: !!label.shintongKey,
                            bdLines,
                            x: r.left + r.width / 2,
                            y: r.top,
                          });
                        }}
                        onMouseLeave={() => setSnapTip((t) => (t?.id === tipId ? null : t))}
                      >
                        {label.shintongKey && vShin > 0.01 ? `${Math.round(v)}(${Math.round(vShin)})` : Math.round(v)}
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
                {snapTip.label}{' '}
                <span className="text-amber-300">+{snapTip.value.toFixed(2)}%</span>
                {snapTip.hasShintong && snapTip.valueShintong > 0.01 && (
                  <span className="text-purple-300 ml-1">(신통 +{snapTip.valueShintong.toFixed(2)}%)</span>
                )}
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
