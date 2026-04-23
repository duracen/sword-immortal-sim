import { useState, useCallback } from 'react';
import { CFG, simulateBuild, selectSkillsForBuild } from '../engine';

// 여러 번 돌려 평균 결과 반환
export function useSimulation() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(({ build, treasures, order, skills: skillsOverride, trials = 1, maxTime, targetLawBody, 불씨, randomCrit }) => {
    setRunning(true);
    setTimeout(() => {
      const prevRandom = CFG.randomCrit;
      if (typeof randomCrit === 'boolean') CFG.randomCrit = randomCrit;
      try {
        const skills = skillsOverride || selectSkillsForBuild(build);
        const simOpts = { };
        if (maxTime) simOpts.maxTime = maxTime;
        if (targetLawBody) simOpts.targetLawBody = targetLawBody;
        if (불씨) simOpts.불씨 = 불씨;
        let sumCum = [0, 0, 0, 0];
        let lastEvents = null;
        let castCounts = {};
        for (let t = 0; t < trials; t++) {
          const r = simulateBuild(build, treasures, order, skills, simOpts);
          for (let i = 0; i < 4; i++) sumCum[i] += r.cumByMarker[i];
          if (t === trials - 1) {
            lastEvents = r.dmgEvents;
            castCounts = r.castCounts;
          }
        }
        setResult({
          cumByMarker: sumCum.map((x) => x / trials),
          dmgEvents: lastEvents,
          castCounts,
          skills,
          trials,
          maxTime: maxTime || null,
        });
      } catch (e) {
        console.error(e);
        setResult({ error: e.message });
      } finally {
        CFG.randomCrit = prevRandom;
        setRunning(false);
      }
    }, 10);
  }, []);

  return { result, running, run };
}
