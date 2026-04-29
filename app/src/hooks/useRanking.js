import { useState, useRef, useCallback, useEffect } from 'react';
import { FAMILIES, SK } from '../engine';

// 조합 수 C(n,k)
function C(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let num = 1, den = 1;
  for (let i = 0; i < k; i++) { num *= (n - i); den *= (i + 1); }
  return Math.floor(num / den);
}

// raw 조합 수 (필터 미적용)
function rawComboCount(skillPool) {
  if (!skillPool || skillPool.length < 6) return 0;
  return C(skillPool.length, 6);
}

// 풀 + 법체 필터를 통과하는 모든 유파 구조(= [[fam, slots], ...]) 열거.
// 각 구조의 총 신통 조합 수 = ∏ C(poolPerFam[fam], slots).
// 6으로 partition 된 slot 분포 모두 시도.
// 유파 시너지 필수 신통 — 해당 유파 슬롯이 이 숫자 이상일 때만 사용 가능.
// 1슬롯 유파에서 선택되면 주효과가 거의 발동 못 하는 신통들 (격발/통명/스택 의존).
export const STRICT_SKILL_MIN_FAM_SLOTS = {
  // 균천 (검세 3+/5+ 조건)
  '균천·진악': 2,
  '균천·현봉': 2,
  // 참허 (검심통명 의존)
  '참허·횡추': 2,
  '참허·엄동': 2,
  // 옥추 (옥추 스택 소비 주력)
  '옥추·황룡': 2,
  '옥추·소명': 2,
  '옥추·청사': 2,
  // 주술 (격발/계약 = 주술 2+ 필요)
  '주술·제율': 2,
  '주술·태사': 2,
  '주술·경선': 2,
  '주술·유식': 2,
  // 신소 (신소 자원 의존)
  '신소·운록': 2,
  '신소·천고': 2,
  '신소·환뢰': 2,
  '신소·청삭': 2,
};

// strictSkillMin: 특정 신통의 최소 유파 슬롯 요구. null 이면 필터 없음.
// 해당 필터 적용 시 "그 구조에서 사용 가능한 skill 수"로 total 신통조합을 계산.
function enumerateValidStructures(skillPool, requiredLawBody, famCatMap, strictSkillMin = null) {
  const poolPerFam = {};
  for (const n of skillPool) {
    const fam = famCatMap.SK[n].fam;
    poolPerFam[fam] = (poolPerFam[fam] || 0) + 1;
  }
  const fams = Object.keys(poolPerFam);
  // 6의 partitions — 구조는 전부 유지.
  const partitions = [
    [4, 2], [4, 1, 1], [3, 3], [3, 2, 1], [3, 1, 1, 1],
    [2, 2, 2], [2, 2, 1, 1], [2, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1],
  ];
  // 특정 구조 + 유파 에서 사용 가능한 skill 수 계산 — strictSkillMin 필터 적용
  function availableSkillsCount(fam, famSlotsInBuild) {
    const famSkills = (famCatMap.FAMILIES[fam]?.skills || []).filter((n) => skillPool.includes(n));
    if (!strictSkillMin) return famSkills.length;
    return famSkills.filter((n) => !strictSkillMin[n] || strictSkillMin[n] <= famSlotsInBuild).length;
  }
  const out = [];
  // 같은 값끼리 묶어서 그룹 안에서는 조합(순서무관), 그룹 간에는 모두 distinct fam
  function assign(parts) {
    const groups = {};
    for (const v of parts) groups[v] = (groups[v] || 0) + 1;
    const groupEntries = Object.entries(groups).map(([v, k]) => [Number(v), k]);
    const used = new Set();
    const assignments = []; // [[value, famList], ...]
    function pickGroup(gIdx) {
      if (gIdx === groupEntries.length) {
        // 구조 완성 — passLawBody 체크
        const build = [];
        for (const [v, flist] of assignments) for (const f of flist) build.push([f, v]);
        const catSlots = {};
        for (const [f, s] of build) {
          const c = famCatMap.FAMILIES[f].cat;
          catSlots[c] = (catSlots[c] || 0) + s;
        }
        let passes;
        if (!requiredLawBody) passes = true;
        else if (requiredLawBody === 'any') passes = Object.values(catSlots).some((s) => s >= 4);
        else passes = (catSlots[requiredLawBody] || 0) >= 4;
        if (!passes) return;
        // total combos 계산 — strictSkillMin 필터 적용한 가용 skill 수 기준
        let total = 1;
        for (const [f, s] of build) {
          const avail = availableSkillsCount(f, s);
          total *= C(avail, s);
        }
        if (total === 0) return;
        const label = build.map(([f, s]) => `${f} ${s}`).join(' + ');
        out.push({ build, label, total });
        return;
      }
      const [value, count] = groupEntries[gIdx];
      // 후보: poolPerFam[fam] >= value, 아직 사용 안 함
      const cands = fams.filter((f) => !used.has(f) && (poolPerFam[f] || 0) >= value);
      // count 개 조합
      function pick(startIdx, chosen) {
        if (chosen.length === count) {
          assignments.push([value, chosen.slice()]);
          for (const f of chosen) used.add(f);
          pickGroup(gIdx + 1);
          for (const f of chosen) used.delete(f);
          assignments.pop();
          return;
        }
        for (let i = startIdx; i < cands.length; i++) {
          chosen.push(cands[i]);
          pick(i + 1, chosen);
          chosen.pop();
        }
      }
      pick(0, []);
    }
    pickGroup(0);
  }
  for (const p of partitions) assign(p);
  return out;
}

// 법체 필터 통과하는 유효 빌드 수 정확히 계산 (O(1))
// 특정 cat 필터면: 타겟 cat 에서 k개(4~6) + 나머지 cat 에서 (6-k)개
// 'any' 이면: "어떤 cat 이든 4+ 있는" combos = 포함-배제 원리
function countValidBuilds(skillPool, requiredLawBody) {
  const total = rawComboCount(skillPool);
  if (!requiredLawBody) return total;
  // 풀을 cat 별로 카운트
  const catCount = { 영검: 0, 화염: 0, 뇌전: 0, 백족: 0 };
  for (const n of skillPool) {
    const cat = FAMILIES[SK[n].fam].cat;
    catCount[cat] = (catCount[cat] || 0) + 1;
  }
  if (requiredLawBody !== 'any') {
    // 특정 cat: 해당 cat 에서 4+, 나머지에서 나머지
    const t = catCount[requiredLawBody] || 0;
    const o = skillPool.length - t;
    let count = 0;
    for (let k = 4; k <= 6; k++) count += C(t, k) * C(o, 6 - k);
    return count;
  }
  // 'any': 어떤 cat 이든 4+ 통과. 포함-배제 사용.
  // |A ∪ B ∪ C ∪ D| = Σ|A| - Σ|A∩B| + Σ|A∩B∩C| - |A∩B∩C∩D|
  // 단, 6슬롯 중 4+인 cat 이 2 개 이상이 되려면 최소 8슬롯 필요 → 교집합은 전부 0.
  // 따라서 '어떤 cat ≥ 4' combos 수 = Σ 각 cat 의 '해당 cat ≥ 4' combos.
  const cats = ['영검', '화염', '뇌전', '백족'];
  let sum = 0;
  for (const cat of cats) {
    const t = catCount[cat] || 0;
    const o = skillPool.length - t;
    for (let k = 4; k <= 6; k++) sum += C(t, k) * C(o, 6 - k);
  }
  return sum;
}

export function useRanking() {
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [subProgress, setSubProgress] = useState({});
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [workerCount, setWorkerCount] = useState(0);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState({});  // { [workerId]: 'pass1' | 'pass2' | 'single' }
  const workersRef = useRef([]);
  const perWorkerProgressRef = useRef([]);
  const perWorkerResultsRef = useRef([]);
  const cancelTimeoutRef = useRef(null);

  useEffect(() => () => {
    workersRef.current.forEach((w) => w.terminate());
    if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
  }, []);

  const start = useCallback((config) => {
    // 이전 취소의 강제종료 타이머가 살아있으면 새 워커도 죽일 수 있으니 먼저 해제
    if (cancelTimeoutRef.current) {
      clearTimeout(cancelTimeoutRef.current);
      cancelTimeoutRef.current = null;
    }
    setCancelling(false);
    workersRef.current.forEach((w) => w.terminate());
    workersRef.current = [];

    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    // CPU 코어의 2/3 사용 (UI/OS 여유 확보, 최소 1 / 최대 16)
    const cpuCount = Math.max(1, Math.min(16, Math.floor((cores * 2) / 3)));

    // 구조(= 유파 분포) 단위로 enumerate — 각 구조의 총 신통 조합 수 계산.
    // 정밀 탐색 시 유파 시너지 필수 신통을 1슬롯 유파에서 제외 — 단 작은 풀(<=10) 은 사용자 직접 선택이므로 그대로 존중.
    const strictSkillMin = (config.searchMode === 'exhaustive' && (config.skillPool?.length || 0) > 10) ? STRICT_SKILL_MIN_FAM_SLOTS : null;
    const allStructures = enumerateValidStructures(config.skillPool, config.requiredLawBody, { SK, FAMILIES }, strictSkillMin);
    const validTotal = allStructures.reduce((a, s) => a + s.total, 0);
    const N = Math.min(cpuCount, Math.max(1, allStructures.length || 1));
    setWorkerCount(N);

    setResults([]);
    setProgress({ current: 0, total: validTotal, label: '' });
    setSubProgress({});
    setPhase({});
    setError(null);
    setRunning(true);
    setStartTime(Date.now());

    // 조합 수가 아주 많을 때(C(56,6)=32M급) 워커는 이제 stream 방식으로 돌기 때문에
    // 메모리는 O(1) 고정. 다만 실행 시간은 순서 탐색(6!=720)까지 곱해 사용자가 기다릴 수
    // 있는 한도를 넘을 수 있다. 여기서는 탐색을 막지 않고, 워커 스트리밍이 처리한다.
    perWorkerProgressRef.current = new Array(N).fill(0);
    perWorkerResultsRef.current = new Array(N).fill(null).map(() => []);
    let doneCount = 0;

    // 구조를 워커에 배분 —
    // 1) 분배 단계: 큰 구조부터 가장 한가한 워커에 배정 (greedy load balance)
    // 2) 각 워커 내부 처리 순서: 작은 구조부터 → Top 결과가 빠르게 테이블에 채워짐 (UX)
    const byBig = allStructures.slice().sort((a, b) => b.total - a.total);
    const workerBuckets = new Array(N).fill(null).map(() => ({ structures: [], load: 0 }));
    for (const st of byBig) {
      let minIdx = 0;
      for (let i = 1; i < N; i++) if (workerBuckets[i].load < workerBuckets[minIdx].load) minIdx = i;
      workerBuckets[minIdx].structures.push(st);
      workerBuckets[minIdx].load += st.total;
    }
    // 각 워커가 받은 구조는 작은 것부터 처리하도록 정렬
    for (const b of workerBuckets) b.structures.sort((a, b2) => a.total - b2.total);
    const ranges = workerBuckets.map((b) => ({ structures: b.structures, load: b.load }));
    // 워커별 raw consumed (chunk 진행도) 와 valid processed (유효 빌드 평가 완료) 분리 트래킹
    const perWorkerValidRef = { current: new Array(N).fill(0) };
    // Pass 2 (정밀 재검증) 진행도 별도 트래킹 — Pass 1 끝나도 진행률 멈추지 않도록
    const perWorkerPass2Ref = { current: new Array(N).fill({ done: 0, total: 0 }) };
    // 워커별 "현재 구조(label) 안에서 몇 번째 신통조합 보고 있는지" — label 바뀌면 리셋
    const perWorkerStructureRef = {
      current: new Array(N).fill(null).map(() => ({ label: null, count: 0 })),
    };

    // 풀에서 각 유파(fam)가 몇 개 신통을 가지고 있는지 사전 계산 → 구조별 총 신통조합 수 계산에 사용
    const poolPerFam = {};
    for (const n of config.skillPool) {
      const fam = SK[n].fam;
      poolPerFam[fam] = (poolPerFam[fam] || 0) + 1;
    }
    // 구조(= fam 분포)의 총 신통 조합 수 = ∏ C(poolPerFam[fam], slots)
    function totalCombosForStructure(build) {
      if (!build) return 1;
      let total = 1;
      for (const [fam, slots] of build) total *= C(poolPerFam[fam] || 0, slots);
      return total;
    }

    // 버킷별 Top 10 유지 — 전체/영검/화염/뇌전/백족 각각 독립.
    // 전체 = 법체 무관하게 sortKey 기준 Top 10
    // 카테고리별 = 해당 cat 의 빌드 중 Top 10
    // aggregateResults 시 5 버킷 union 후 setResults
    const sortKey = `s${['45','60','120','180'][config.markerIdx || 0]}`;
    const BUCKET_LIMIT = 10;
    const CATS = ['영검', '화염', '뇌전', '백족'];
    function makeBucket() {
      return { map: new Map(), lowScore: -Infinity, lowKey: null };
    }
    const buckets = {
      overall: makeBucket(),
      영검: makeBucket(),
      화염: makeBucket(),
      뇌전: makeBucket(),
      백족: makeBucket(),
    };
    function recomputeLow(bucket) {
      let lo = Infinity, loK = null;
      for (const [k, v] of bucket.map) {
        const s = v[sortKey] ?? 0;
        if (s < lo) { lo = s; loK = k; }
      }
      bucket.lowScore = lo;
      bucket.lowKey = loK;
    }
    function tryInsert(bucket, k, r, score) {
      const ex = bucket.map.get(k);
      if (ex) {
        if (score > (ex[sortKey] ?? 0)) {
          bucket.map.set(k, r);
          if (k === bucket.lowKey) recomputeLow(bucket);
          return true;
        }
        return false;
      }
      if (bucket.map.size < BUCKET_LIMIT) {
        bucket.map.set(k, r);
        if (score < bucket.lowScore) { bucket.lowScore = score; bucket.lowKey = k; }
        return true;
      }
      if (score <= bucket.lowScore) return false;
      bucket.map.delete(bucket.lowKey);
      bucket.map.set(k, r);
      recomputeLow(bucket);
      return true;
    }
    let resultsDirty = false;
    const aggregateResults = () => {
      if (!resultsDirty) return;
      // 5 버킷 union — 같은 key 면 중복 1개만 유지
      const all = new Map();
      for (const b of Object.values(buckets)) {
        for (const [k, v] of b.map) all.set(k, v);
      }
      setResults(Array.from(all.values()));
      resultsDirty = false;
    };
    const flushInterval = setInterval(aggregateResults, 250);
    const stopFlush = () => { clearInterval(flushInterval); };
    const onNewResult = (r) => {
      if (!r) return;
      const skillKey = (r.skills || []).slice().sort().join(',');
      const orderKey = (r.orderArr || [])
        .map((o) => (o.kind === 'skill' ? `s${o.idx}` : `t${o.idx}`))
        .join('>');
      const k = skillKey + '|' + r.treasures + '|' + orderKey;
      const score = r[sortKey] ?? 0;
      let changed = tryInsert(buckets.overall, k, r, score);
      if (r.cat && buckets[r.cat]) {
        if (tryInsert(buckets[r.cat], k, r, score)) changed = true;
      }
      if (changed) resultsDirty = true;
    };
    const aggregateProgress = () => {
      // 화면에 표시되는 진행률은 유효 빌드(법체 통과) 평가 완료 수 기준 + Pass 2 진행분.
      const validDone = perWorkerValidRef.current.reduce((a, b) => a + b, 0);
      const pass2Done = perWorkerPass2Ref.current.reduce((a, b) => a + (b.done || 0), 0);
      const pass2Total = perWorkerPass2Ref.current.reduce((a, b) => a + (b.total || 0), 0);
      setProgress({ current: validDone + pass2Done, total: validTotal + pass2Total, label: '' });
    };

    ranges.forEach((range, idx) => {
      const w = new Worker(new URL('../engine/worker.js', import.meta.url), { type: 'module' });
      workersRef.current.push(w);
      // 워커 내부 예외 (OOM 등) 를 메인 쓰레드로 올림 — 흰화면 대신 에러 메시지를 표시.
      w.onerror = (err) => {
        console.error('ranking worker error:', err);
        setError(`탐색 중 오류: ${err.message || err.filename || '알 수 없는 오류'} — 신통 풀을 줄여 주세요.`);
        setRunning(false);
        workersRef.current.forEach((ww) => ww.terminate());
        workersRef.current = [];
      };
      w.onmessageerror = (err) => {
        console.error('ranking worker message error:', err);
        setError('워커 메시지 디코딩 실패 — 브라우저 콘솔을 확인해 주세요.');
        setRunning(false);
      };
      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          // 증분 방식: 방금 완료한 result 1건을 global map 에 반영.
          perWorkerProgressRef.current[idx] = msg.current;
          if (msg.validProcessed !== undefined) perWorkerValidRef.current[idx] = msg.validProcessed;
          // Pass 2 진행률 추적
          if (msg.phase === 'pass2' && msg.pass2Done !== undefined) {
            perWorkerPass2Ref.current[idx] = { done: msg.pass2Done, total: msg.pass2Total || 0 };
          }
          if (msg.newResult) onNewResult(msg.newResult);
          if (msg.phase) setPhase((prev) => prev[idx] === msg.phase ? prev : ({ ...prev, [idx]: msg.phase }));
          aggregateProgress();
          // setResults 는 250ms throttle 로 자동 flush (aggregateResults 호출 안 함)
        } else if (msg.type === 'scanHeartbeat') {
          // 구조 단위 enumerate 에선 이 메시지 안 옴 (유지용 no-op)
          perWorkerProgressRef.current[idx] = msg.current;
        } else if (msg.type === 'phaseChange') {
          setPhase((prev) => ({ ...prev, [idx]: msg.phase }));
        } else if (msg.type === 'subProgress') {
          // 구조(label) 가 바뀌면 카운터 리셋 + 새 구조 시작; 같은 구조 내 같은 skillLabel은 중복 카운트하지 않음.
          const cur = perWorkerStructureRef.current[idx];
          if (cur.label !== msg.buildLabel) {
            cur.label = msg.buildLabel;
            cur.count = 1;
            cur.curSkill = msg.skillLabel;
          } else if (cur.curSkill !== msg.skillLabel) {
            cur.count += 1;
            cur.curSkill = msg.skillLabel;
          }
          const structTotal = totalCombosForStructure(msg.buildStructure);
          setSubProgress((prev) => ({
            ...prev,
            [idx]: {
              buildLabel: msg.buildLabel,
              skillLabel: msg.skillLabel,
              subDone: msg.subDone,
              subTotal: msg.subTotal,
              bestSoFar: msg.bestSoFar,
              structIdx: cur.count,
              structTotal,
              orderDone: msg.orderDone ?? null,
              orderTotal: msg.orderTotal ?? null,
            },
          }));
        } else if (msg.type === 'done') {
          perWorkerProgressRef.current[idx] = msg.consumed ?? 0;
          perWorkerValidRef.current[idx] = msg.validProcessed ?? 0;
          // Pass 2 최종 카운트 — done 시점에 pass2Done = pass2Total 로 마무리
          if (msg.pass2Total !== undefined) {
            perWorkerPass2Ref.current[idx] = { done: msg.pass2Done || 0, total: msg.pass2Total || 0 };
          }
          doneCount++;
          aggregateProgress();
          // 모든 worker done 시 progress 강제 100% (남은 sliver 정리)
          if (doneCount >= ranges.length) {
            const fullValid = perWorkerValidRef.current.reduce((a, b) => a + b, 0);
            const fullPass2 = perWorkerPass2Ref.current.reduce((a, b) => a + (b.total || 0), 0);
            setProgress({ current: fullValid + fullPass2, total: fullValid + fullPass2, label: '' });
          }
          // 워커 자기 담당 구간 완료 → 해당 워커의 subProgress 행 제거
          setSubProgress((prev) => { const n = { ...prev }; delete n[idx]; return n; });
          if (doneCount >= ranges.length) {
            stopFlush();
            aggregateResults();  // 최종 flush
            setRunning(false);
          }
        } else if (msg.type === 'workerDebug') {
          console.log(`[worker ${msg.workerId}] ${msg.msg}`);
        } else if (msg.type === 'workerError') {
          console.error('[useRanking] worker reported error:', msg.error);
          setError(`워커 ${idx + 1} 내부 에러: ${msg.error}`);
          setRunning(false);
          workersRef.current.forEach((ww) => ww.terminate());
          workersRef.current = [];
        } else if (msg.type === 'cancelled') {
          doneCount++;
          if (doneCount >= ranges.length) {
            stopFlush();
            aggregateResults();  // 마지막 flush
            setRunning(false);
            workersRef.current.forEach((w) => w.terminate());
            workersRef.current = [];
          }
        }
      };
      w.postMessage({
        type: 'startRanking',
        config: {
          ...config,
          workerId: idx,
          workerCount: N,
          structures: range.structures,
        },
      });
    });
  }, []);

  const cancel = useCallback(() => {
    setCancelling(true);
    const cancelledWorkers = workersRef.current;
    cancelledWorkers.forEach((w) => w.postMessage({ type: 'cancel' }));
    if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
    cancelTimeoutRef.current = setTimeout(() => {
      cancelTimeoutRef.current = null;
      // 새 탐색이 시작되어 workersRef 가 교체됐을 수 있음 — cancelledWorkers 만 종료
      cancelledWorkers.forEach((w) => w.terminate());
      // 현재 활성 워커가 cancelledWorkers 와 동일할 때만 상태 리셋
      if (workersRef.current === cancelledWorkers) {
        workersRef.current = [];
        setRunning(false);
      }
      setCancelling(false);
    }, 3000);
  }, []);

  return { results, progress, subProgress, running, cancelling, startTime, start, cancel, workerCount, error, phase };
}
