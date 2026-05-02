import { useState, useCallback, useRef } from 'react';
import { CFG, simulateBuild } from '../engine';

// 랜덤 크리 모드로 N회 반복 시뮬
export function useRandomSim() {
  const [results, setResults] = useState([]); // [{c60, c120, c180}, ...]
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const cancelRef = useRef(false);

  const run = useCallback(async ({
    build, treasures, order, trials,
    skills = null, maxTime = null, targetLawBody = null, 불씨 = null,
    randomCrit = true,
  }) => {
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setProgress({ current: 0, total: trials });
    const prev = CFG.randomCrit;
    CFG.randomCrit = randomCrit;
    const simOpts = {};
    if (maxTime) simOpts.maxTime = maxTime;
    if (targetLawBody) simOpts.targetLawBody = targetLawBody;
    if (불씨) simOpts.불씨 = 불씨;
    const collected = [];
    const BATCH = 20;
    try {
      for (let i = 0; i < trials; i++) {
        if (cancelRef.current) break;
        const r = simulateBuild(build, treasures, order, skills, simOpts);
        collected.push({
          c60: r.cumByMarker[0],
          c120: r.cumByMarker[1],
          c180: r.cumByMarker[2],
        });
        if ((i + 1) % BATCH === 0 || i === trials - 1) {
          setProgress({ current: i + 1, total: trials });
          setResults(collected.slice());
          // UI 업데이트 허용
          await new Promise((res) => setTimeout(res, 0));
        }
      }
    } finally {
      CFG.randomCrit = prev;
      setRunning(false);
    }
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { results, running, progress, run, cancel };
}

// 통계 헬퍼
export function computeStats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / sorted.length;
  const stdev = Math.sqrt(variance);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  return { min: sorted[0], max: sorted[sorted.length - 1], mean, stdev, median, p10, p90, n: sorted.length };
}

export function computeHistogram(values, bins = 20) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ x: min, count: values.length }];
  const w = (max - min) / bins;
  const hist = Array.from({ length: bins }, (_, i) => ({
    x: min + w * (i + 0.5),
    x0: min + w * i,
    x1: min + w * (i + 1),
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / w);
    if (idx >= bins) idx = bins - 1;
    hist[idx].count++;
  }
  return hist;
}
