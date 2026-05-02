import { useMemo, useState, useEffect } from 'react';
import { CFG, simulateBuild } from '../../engine';
import Timeline from './Timeline.jsx';
import EventFilter from './EventFilter.jsx';
import CastTimelineSummary from './CastTimelineSummary.jsx';
import DamageBreakdown from '../simulator/DamageBreakdown.jsx';

// 빌드/스킬/순서/법보 조합으로 trace 실행 → 로그 렌더
// props: { build, skills, treasures, order, onClose, randomCrit }
export default function BattleLogPanel({ build, skills, treasures, order, title, onClose, targetLawBody, maxTime, 불씨, bisul, 법상, randomCrit = false }) {
  const [events, setEvents] = useState([]);
  const [dmgEvents, setDmgEvents] = useState([]);
  const [filter, setFilter] = useState({ CST: true, BUF: true, STK: true, DMG: true, OPT: true });
  const [err, setErr] = useState(null);

  function runTrace() {
    const collected = [];
    const prevTrace = CFG.trace;
    const prevRandom = CFG.randomCrit;
    CFG.trace = (t, tag, msg) => collected.push({ t, tag, msg });
    CFG.randomCrit = randomCrit;
    try {
      const simOpts = {};
      if (targetLawBody) simOpts.targetLawBody = targetLawBody;
      if (maxTime) simOpts.maxTime = maxTime;
      if (불씨) simOpts.불씨 = 불씨;
      if (bisul && (bisul.self?.length || bisul.enemy?.length)) simOpts.bisul = bisul;
      if (법상 && 법상.name) simOpts.법상 = 법상;
      const r = simulateBuild(build, treasures, order, skills, simOpts);
      setEvents(collected);
      setDmgEvents(r.dmgEvents || []);
      setErr(null);
    } catch (e) {
      console.error(e);
      setErr(e.message);
      setEvents([]);
      setDmgEvents([]);
    } finally {
      CFG.trace = prevTrace;
      CFG.randomCrit = prevRandom;
    }
  }

  // 빌드/스킬/순서/법보/불씨/시간/법체 변경 시 자동 재실행
  useEffect(() => {
    runTrace();
    /* eslint-disable-next-line */
  }, [
    JSON.stringify(build),
    JSON.stringify(skills?.map((s) => s.name)),
    JSON.stringify(treasures),
    JSON.stringify(order),
    JSON.stringify(불씨),
    JSON.stringify(bisul),
    JSON.stringify(법상),
    targetLawBody,
    maxTime,
    randomCrit,
  ]);

  const counts = useMemo(() => {
    const c = {};
    for (const e of events) c[e.tag] = (c[e.tag] || 0) + 1;
    return c;
  }, [events]);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-amber-400">🎬 전투 로그 {title ? `— ${title}` : ''}</h3>
        {onClose && (
          <button onClick={onClose} className="text-sm px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded">
            닫기
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-300">
          신통 {skills.map((s) => s.name).join(', ')} / 법보 {treasures.join(', ')}
          {randomCrit && <span className="ml-2 text-amber-400">· 🎲 랜덤 크리</span>}
        </span>
      </div>

      {err && <div className="bg-red-950/50 border border-red-700 rounded p-3 text-red-300 text-sm">에러: {err}</div>}

      {events.length > 0 && <CastTimelineSummary events={events} />}
      {dmgEvents.length > 0 && <DamageBreakdown dmgEvents={dmgEvents} />}

      {events.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="font-semibold text-sm">이벤트 {events.length}개</div>
            <EventFilter filter={filter} onChange={setFilter} counts={counts} />
          </div>
          <div className="bg-slate-950 rounded border border-slate-800 overflow-hidden">
            <Timeline events={events} filter={filter} />
          </div>
        </div>
      )}
    </div>
  );
}
