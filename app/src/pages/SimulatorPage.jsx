import { useState, useMemo, useEffect, useRef } from 'react';
import SkillPicker from '../components/simulator/SkillPicker.jsx';
import SkillPoolPicker from '../components/simulator/SkillPoolPicker.jsx';
import TreasurePicker from '../components/simulator/TreasurePicker.jsx';
import OrderEditor from '../components/simulator/OrderEditor.jsx';
import BulssiPicker from '../components/simulator/BulssiPicker.jsx';
import BisulPicker from '../components/simulator/BisulPicker.jsx';
import ResultSummary from '../components/simulator/ResultSummary.jsx';
import RankingTable from '../components/ranking/RankingTable.jsx';
import WinnerPodium from '../components/ranking/WinnerPodium.jsx';
import BattleLogPanel from '../components/battlelog/BattleLogPanel.jsx';
import { useSimulation } from '../hooks/useSimulation';
import { useRanking } from '../hooks/useRanking';
import { validateBuild, buildArray, buildLabel, defaultOrder } from '../utils/buildHelpers';
import { TREASURE_NAMES, FAMILIES, SK, CFG } from '../engine';
import { formatDuration } from '../utils/formatting';

const TARGET_LAW_OPTIONS = [
  { key: null, label: '없음' },
  { key: '영검', label: '영검법체' },
  { key: '화염', label: '현염법체' },
  { key: '뇌전', label: '유뢰법체' },
  // 백족법체는 상성 삼각(영검-유뢰-현염)과 별개 축이므로 상대 법체 옵션에서 제외
];

// 내 카테고리 4+ 법체 → 상대가 이 계열이면 +20%
const COUNTER_OF = { 뇌전: '화염', 화염: '영검', 영검: '뇌전' };

function TargetLawBodyPicker({ value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">
        상대 법체 <span className="text-slate-300">(내가 상성 우위면 입히는 피해 +20%)</span>
      </label>
      <div className="flex gap-1 flex-wrap">
        {TARGET_LAW_OPTIONS.map((o) => (
          <button
            key={o.key || 'none'}
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 rounded text-sm ${
              value === o.key ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  const [mode, setMode] = useState('auto');
  const [targetLawBody, setTargetLawBody] = useState(null);

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-slate-700">
        <TabButton active={mode === 'auto'} onClick={() => setMode('auto')}>
          🔍 자동 탐색 (최적 빌드 찾기)
        </TabButton>
        <TabButton active={mode === 'manual'} onClick={() => setMode('manual')}>
          🛠 수동 시뮬 (원하는 조합 직접 실행)
        </TabButton>
      </div>
      {/* 둘 다 항상 마운트 — 탭 전환 시 진행 중인 자동탐색/워커/결과가 날아가지 않도록
          active 가 아닌 탭은 CSS 로 숨김 (state 유지) */}
      <div style={{ display: mode === 'auto' ? 'block' : 'none' }}>
        <AutoSearch targetLawBody={targetLawBody} setTargetLawBody={setTargetLawBody} />
      </div>
      <div style={{ display: mode === 'manual' ? 'block' : 'none' }}>
        <ManualSim targetLawBody={targetLawBody} setTargetLawBody={setTargetLawBody} />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 sm:px-4 py-2 rounded-t-lg font-semibold transition border-b-2 text-xs sm:text-base ${
        active
          ? 'bg-slate-800 text-amber-300 border-amber-500'
          : 'text-slate-400 hover:text-slate-200 border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

/* ─────────────────  자동 탐색  ───────────────── */
function AutoSearch({ targetLawBody, setTargetLawBody }) {
  const MARKER_TIMES = [34, 60, 120, 180];
  const MARKER_LABELS = ['34초 (1사이클)', '60초', '120초', '180초'];
  const [markerIdx, setMarkerIdx] = useState(0);  // 34초 (1사이클) 기본
  // 기본은 아무것도 선택 안 된 빈 상태. 사용자가 직접 "전체 선택" 또는 카테고리/유파별로 추가.
  const [pool, setPool] = useState(() => new Set());
  // requiredLawBody: null (무필터) | 'any' (아무거나 4+) | '영검'/'화염'/'뇌전'/'백족' (특정)
  const [requiredLawBody, setRequiredLawBody] = useState('any');
  const [fixedTreasures, setFixedTreasures] = useState(false);
  const [treasures, setTreasures] = useState([]);
  const [searchMode, setSearchMode] = useState('fast');  // 'fast' | 'exhaustive'
  // 자동 탐색 전체에 동일 불씨 세트 적용 — 실 인게임에서 불씨는 고정됨
  const [불씨, set불씨] = useState({
    통명묘화: 0, 진무절화: 0, 태현잔화: 0, 유리현화: 0, 진마성화: 0,
  });
  // 비술 — { self: [...], enemy: [...] } (각 max 3개)
  const [bisul, setBisul] = useState({ self: [], enemy: [] });
  const [selected, setSelected] = useState(null); // 로그 보기용
  const battleLogRef = useRef(null);
  // selected 변경 → BattleLogPanel 영역으로 스크롤
  useEffect(() => {
    if (selected && battleLogRef.current) {
      // 약간의 지연 (BattleLogPanel 렌더링 완료 대기)
      const t = setTimeout(() => {
        battleLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [selected]);
  const { results, progress, subProgress, running, cancelling, startTime, start, cancel, workerCount, error, phase } = useRanking();

  const sortBy = ['34', '60', '120', '180'][markerIdx];

  function handleStart() {
    setSelected(null);
    start({
      markerIdx,
      skillPool: Array.from(pool),
      requiredLawBody,
      fixedTreasures,
      // 선택된 법보 풀 — 고정 시 여기서만 C(N,3) 조합 탐색
      // 사용자가 선택한 법보 풀 — 고정 시 C(N,3) 조합 / 미고정 시도 동일하게 선택된 풀 내에서만 탐색
      treasurePool: treasures.length >= 3 ? treasures : null,
      targetLawBody,
      searchMode,
      불씨,
      bisul,
    });
  }

  const elapsedSec = startTime && running ? (Date.now() - startTime) / 1000 : 0;
  // 빌드 완료 + 진행 중 빌드의 순서 탐색 진행률(fractional)을 합산해 effective progress 계산
  // → 빌드 1개도 완료 안 됐을 때도 남은 시간 추정 가능 (특히 9! 전수탐색 시)
  let effectiveDone = progress.current;
  for (const sp of Object.values(subProgress || {})) {
    if (sp.orderTotal > 0) effectiveDone += sp.orderDone / sp.orderTotal;
  }
  // 0.001 threshold (단순 빌드 시 1.45M perms × 0.001 = 1,450 perms 만에 표시 시작)
  const estRemainSec =
    startTime && running && effectiveDone > 0.001 && progress.total > 0
      ? (elapsedSec / effectiveDone) * (progress.total - effectiveDone)
      : 0;
  // 진행률: 완료 빌드 + 진행 중 빌드의 fractional 진행 (단일 빌드 시 진행 바가 멈추지 않도록)
  const pct = progress.total > 0 ? Math.min(100, (effectiveDone / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-lg font-bold text-amber-400 mb-1">🔍 최적 빌드 자동 탐색</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          선택한 신통 풀에서 6개 조합을 만들고, 법보 조합 × 시전 순서를 자동으로 돌려 최고 데미지 빌드를 찾아줍니다.<br />
          상위 랭킹은 탐색이 끝나기 전에도 실시간으로 갱신됩니다.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-amber-400">1. 신통 풀 선택</h2>
        <div className="text-xs text-slate-400 mb-2 leading-relaxed">
          ※ 신통 최대 강화 기준입니다. 피해 수치는 노강 에서 일괄적으로 +200 를 더한 수치입니다.
          <br />
          ※ 기준 스탯 — 공격력 {(CFG.baseATK / 1e8).toFixed(1)}억 · 치명타율 {CFG.baseCR}% · 치명타 배율 {CFG.baseCD}% · 체력 {(CFG.baseHP / 1e8).toFixed(0)}억 · 호신강기 {(CFG.baseShield / 1e8).toFixed(0)}억.
        </div>
        <SkillPoolPicker pool={pool} onChange={setPool} />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-amber-400">2. 법보 풀 선택</h2>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <label
            className="flex items-center gap-2 text-xs text-slate-300 select-none cursor-pointer"
            title="체크 시: 법보가 시전 순서의 7/8/9번(후순위)에 위치 고정됩니다. 신통 6! × 법보 3! = 4,320회 시뮬 — 법보 미고정(9!=362,880) 대비 약 84배 빠름."
          >
            <input
              type="checkbox"
              checked={fixedTreasures}
              onChange={(e) => {
                const on = e.target.checked;
                setFixedTreasures(on);
                // 체크 시 아무 법보도 선택 안 됐으면 기본 세팅 (탑/호/검) 자동 선택
                if (on && treasures.length === 0) {
                  setTreasures(['환음요탑', '유리옥호', '참원선검']);
                }
              }}
            />
            <span className="font-semibold">법보 위치 고정</span>
            <span className="text-[11px] text-slate-300">
              (체크 시 법보는 7/8/9번 위치만 사용 · 법보 순서는 전수탐색 → 신통 6! × 법보 3! = 4,320 / 미고정 9!=362,880 대비 84배 빠름)
            </span>
          </label>
          <div className="text-xs text-slate-400">※ 법보끼리의 시전 순서는 알고리즘이 자동 결정합니다</div>
        </div>
        <TreasurePicker selected={treasures} onChange={setTreasures} showOrder={false} maxSelect={4} minSelect={3} />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-amber-400">3. 불씨 선택</h2>
        <BulssiPicker value={불씨} onChange={set불씨} />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-amber-400">4. 비술 선택 <span className="text-xs text-slate-400 font-normal">(자기/상대 각 최대 3개, 각 마주 무·허·진 1갈래)</span></h2>
        <BisulPicker value={bisul} onChange={setBisul} />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-amber-400">5. 탐색 설정</h2>
        <div className="flex flex-wrap items-end gap-6 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">기준 시간</label>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <button
                  key={i}
                  onClick={() => setMarkerIdx(i)}
                  className={`px-3 py-1.5 rounded text-sm ${
                    markerIdx === i ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-700'
                  }`}
                >
                  {MARKER_LABELS[i]}
                </button>
              ))}
            </div>
          </div>
          <TargetLawBodyPicker value={targetLawBody} onChange={setTargetLawBody} />
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              내 법체 활성화 조건 <span className="text-slate-300">(4슬롯 이상일 때 법체 효과 발동)</span>
            </label>
            <div className="flex gap-1 flex-wrap">
              {[
                { key: null, label: '제한 없음', hint: '법체 효과 없는 빌드도 포함 (모든 분포 탐색)' },
                { key: 'any', label: '아무거나 하나 활성', hint: '4계열 중 최소 1개가 4슬롯 이상인 빌드만' },
                { key: '영검', label: '영검법체 활성', hint: '영검 계열 4슬롯 이상 빌드만' },
                { key: '화염', label: '현염법체 활성', hint: '화염 계열 4슬롯 이상 빌드만' },
                { key: '뇌전', label: '유뢰법체 활성', hint: '뇌전 계열 4슬롯 이상 빌드만' },
                { key: '백족', label: '백족법체 활성', hint: '백족 계열 4슬롯 이상 빌드만' },
              ].map((o) => (
                <button
                  key={o.key || 'none'}
                  onClick={() => setRequiredLawBody(o.key)}
                  title={o.hint}
                  className={`px-3 py-1.5 rounded text-sm ${
                    requiredLawBody === o.key
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-700'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 탐색 모드 (경고 문구 공간 확보 위해 별도 행) */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">탐색 방식</label>
          <div className="flex gap-1">
            {[
              { key: 'fast', label: '⚡ 빠른 탐색 (추천)', hint: '대략적인 순서를 휴리스틱으로 빠르게 찾고, 상위 50개만 정밀 재검증합니다. 오차 약 1%, 신통 풀이 커도 몇 분 내 완료.' },
              { key: 'exhaustive', label: '🔬 정밀 탐색', hint: '모든 시전 순서 전수탐색 (법보 위치 고정 시 6!×3!=4,320 / 미고정 시 9!=362,880, 법보조합당). 진행 중 Top 10 실시간 갱신.' },
            ].map((o) => (
              <button
                key={o.key}
                onClick={() => setSearchMode(o.key)}
                title={o.hint}
                className={`px-3 py-1.5 rounded text-sm ${
                  searchMode === o.key
                    ? (o.key === 'fast' ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-amber-500 text-slate-950 font-bold')
                    : 'bg-slate-700'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            {searchMode === 'fast'
              ? '빠른 탐색: 휴리스틱으로 전체 빌드를 1차 평가 → 상위 50개 빌드만 정밀 재검증. 결과 오차 약 1% 이내, 시간 효율 최고.'
              : '정밀 탐색: 모든 빌드 × 모든 시전 순서를 전수탐색. 유파 1슬롯에서 시너지가 필수인 신통 15개 (예: 균천·진악, 주술·제율 등) 는 자동 제외 (단, 풀이 10개 이하면 그대로 포함).'}
          </div>
          {searchMode === 'exhaustive' && (
            <div className="text-[11px] text-amber-400 mt-1 leading-relaxed bg-amber-950/20 border border-amber-700/40 rounded p-2">
              ⚠ <strong>정밀 탐색은 매우 오래 걸립니다</strong> (9! = 362,880 순열 × 법보 조합).<br />
              · 신통 6개 선택: 약 10~15분 (1 빌드 × 1,451,520회 시뮬)<br />
              · 신통 풀이 커질수록 시간이 기하급수적으로 증가<br />
              · 권장: 신통 풀을 6~12개로 좁혀서 사용. 그 외엔 빠른 탐색을 추천.
            </div>
          )}
        </div>

        {/* 기댓값 모드 안내 (확률·랜덤 효과 처리 방식) */}
        <details className="mt-3 text-[11px] text-slate-300 bg-slate-800/40 border border-slate-700 rounded">
          <summary className="cursor-pointer px-3 py-2 hover:bg-slate-700/40 select-none">
            ℹ️ <strong className="text-amber-300">기댓값 계산 방식</strong> — 자동 탐색이 사용하는 시뮬 모드 안내
          </summary>
          <div className="px-3 py-2 leading-relaxed space-y-2 border-t border-slate-700">
            <p>
              자동 탐색은 <strong className="text-emerald-300">기댓값 모드</strong> 로 시뮬합니다.
              크리티컬, 격발, 만고귀종 등 확률 기반 효과를 <strong>발생 확률 × 효과값</strong> 으로 평균 계산합니다.
            </p>
            <div className="bg-slate-900/60 rounded p-2 space-y-1">
              <div className="text-amber-200 font-semibold">예시: 만고귀종 (백족법체) 격발 → 계약 4종 (강령/환생/실혼/매혹)</div>
              <ul className="list-disc ml-4 text-slate-300">
                <li><strong className="text-emerald-300">기댓값 모드</strong> (자동 탐색): 격발 확률에 비례한 fractional 중첩 (예: 4종 각 +0.26 → cr+1.6%, amp+1.6%) — <span className="text-slate-400">실제 sim 데미지에도 그 낮은 수치 그대로 반영</span></li>
                <li><strong className="text-purple-300">랜덤 모드</strong>: 격발 시 1 type 만 +1 (full +6% cr 또는 amp) — 확률은 시뮬 시점에 주사위, 분산 큼</li>
              </ul>
            </div>
            <p>
              <strong>요약</strong>: 자동 탐색의 데미지 값은 격발/크리 확률을 평균낸 <strong>장기 기대값</strong>입니다.
              실제 인게임 한 판 한 판은 운에 따라 더 높거나 낮을 수 있습니다.
            </p>
            <p className="text-slate-400">
              타임라인의 활성 버프 수치도 동일하게 기댓값 처리되어,
              "계약 cr+1.6%" 같은 수치는 <strong>확률로 낮아진 실제 적용값</strong>입니다.
            </p>
          </div>
        </details>
      </section>

      {/* 탐색 시작 / 중지 (진행바 위) */}
      <section className="flex flex-col items-center justify-center pt-2 pb-2 border-t border-slate-800 gap-2">
        {!running ? (
          <>
            <button
              onClick={handleStart}
              disabled={pool.size < 6 || treasures.length < 3}
              className="px-10 py-4 bg-amber-500 text-slate-950 font-bold text-lg rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            >
              🔍 탐색 시작
            </button>
            {(pool.size < 6 || treasures.length < 3) && (
              <div className="text-sm text-amber-300">
                {pool.size < 6 && `신통 최소 ${6 - pool.size}개 더 선택 필요`}
                {pool.size < 6 && treasures.length < 3 && ' · '}
                {treasures.length < 3 && `법보 최소 ${3 - treasures.length}개 더 선택 필요`}
              </div>
            )}
          </>
        ) : (
          <button
            onClick={cancel}
            disabled={cancelling}
            className={`px-10 py-4 font-bold text-lg rounded-lg shadow-lg flex items-center gap-2 ${
              cancelling
                ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-400'
            }`}
          >
            {cancelling ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                중지 중...
              </>
            ) : (
              '■ 중지'
            )}
          </button>
        )}
      </section>

      {error && (
        <div className="bg-red-950/50 border border-red-700 rounded-lg p-4 text-red-200 text-sm">
          <div className="font-bold mb-1">⚠️ 탐색 실패</div>
          {error}
        </div>
      )}

      {(running || progress.total > 0) && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>
              진행: <span className="font-bold">{progress.current} / {progress.total}</span> 빌드 ({pct.toFixed(1)}%)
              {workerCount > 1 && (
                <span className="ml-2 text-xs text-purple-300">· {workerCount}개 워커 병렬</span>
              )}
            </span>
            <span className="text-slate-400">
              경과 {formatDuration(elapsedSec)} · 남은 약 {formatDuration(estRemainSec)}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded h-2 overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          {Object.keys(subProgress || {}).length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-slate-700 pt-3">
              <div className="text-xs text-slate-400 mb-1">각 워커 현재 빌드 진행:</div>
              {Object.entries(subProgress).map(([wid, sp]) => {
                const structPct = sp.structTotal > 0 ? (sp.structIdx / sp.structTotal) * 100 : 0;
                const orderPct = sp.orderTotal > 0 ? (sp.orderDone / sp.orderTotal) * 100 : 0;
                const workerPhase = phase[parseInt(wid)];
                const phaseLabel = workerPhase === 'pass2' ? '2차정밀' : workerPhase === 'pass1' ? '1차빠른' : null;
                // 행 높이 고정 — 빌드 전환 시 layout shift 방지 (모든 element 항상 렌더, 빈 값은 placeholder)
                return (
                  <div key={wid} className="text-xs min-h-[68px]">
                    <div className="flex justify-between text-slate-300">
                      <span className="truncate min-w-0 mr-2">
                        <span className="text-purple-300">W{parseInt(wid) + 1}</span>{' '}
                        {phaseLabel && (
                          <span className={`text-[10px] px-1 rounded mr-1 ${workerPhase === 'pass2' ? 'bg-amber-700 text-amber-200' : 'bg-emerald-700 text-emerald-100'}`}>
                            {phaseLabel}
                          </span>
                        )}
                        <span className="font-mono">{sp.buildLabel || '—'}</span>
                      </span>
                      <span className="text-slate-400 shrink-0">
                        {sp.structIdx ?? 0} / {sp.structTotal ?? '-'} 신통조합 ({structPct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono mt-0.5 truncate min-h-[14px]">
                      {sp.skillLabel || ' '}
                    </div>
                    <div className="w-full bg-slate-900 rounded h-1 overflow-hidden mt-0.5">
                      <div className="h-full bg-purple-500 transition-all" style={{ width: `${structPct}%` }} />
                    </div>
                    {/* 순서 전수탐색 진행률 — 항상 자리 차지 (값 없으면 0%, 텍스트 placeholder) */}
                    <div className="mt-0.5">
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                        <span>순서 전수탐색</span>
                        <span>
                          {sp.orderTotal > 0
                            ? `${sp.orderDone.toLocaleString()} / ${sp.orderTotal.toLocaleString()} (${orderPct.toFixed(1)}%)`
                            : ' '}
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 rounded h-1 overflow-hidden">
                        <div className="h-full bg-amber-500 transition-all" style={{ width: `${orderPct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <>
          <WinnerPodium results={results} sortBy={sortBy} />
          {(!requiredLawBody || requiredLawBody === 'any') ? (
            <SplitRankings
              results={results}
              sortBy={sortBy}
              markerTime={MARKER_TIMES[markerIdx]}
              onRowClick={(r) => setSelected(r)}
            />
          ) : (
            <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-bold text-slate-200">전체 순위</span>
                <span className="text-sm text-slate-400 ml-auto">
                  기준: {MARKER_TIMES[markerIdx]}초 / 결과 {results.length}개
                </span>
              </div>
              <RankingTable
                results={results}
                sortBy={sortBy}
                onRowClick={(r) => setSelected(r)}
                limit={10}
              />
            </div>
          )}

          {selected && (
            <div ref={battleLogRef}>
              <BattleLogPanel
                title={selected.label}
                build={selected.build}
                skills={selected.skills.map((n) => ({ name: n, fam: SK[n].fam }))}
                treasures={selected.treasuresArr}
                order={selected.orderArr}
                targetLawBody={targetLawBody}
                maxTime={MARKER_TIMES[markerIdx]}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────  SplitRankings (전체 5 + 법체별 5)  ───────── */
const LAW_BODY_CATS = [
  { cat: '영검', label: '영검법체', color: 'bg-blue-900/40 border-blue-700' },
  { cat: '화염', label: '현염법체', color: 'bg-red-900/40 border-red-700' },
  { cat: '뇌전', label: '유뢰법체', color: 'bg-purple-900/40 border-purple-700' },
  { cat: '백족', label: '백족법체', color: 'bg-emerald-900/40 border-emerald-700' },
];

function getBuildLawCat(build) {
  // build = [[fam, slots], ...]
  // returns category name if any cat has 4+, else null
  const catSlots = {};
  for (const [f, s] of build) {
    const cat = FAMILIES[f].cat;
    catSlots[cat] = (catSlots[cat] || 0) + s;
  }
  for (const [cat, s] of Object.entries(catSlots)) {
    if (s >= 4) return cat;
  }
  return null;
}

function SplitRankings({ results, sortBy, markerTime, onRowClick }) {
  const key = `s${sortBy}`;
  const sortedAll = useMemo(() => [...results].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)), [results, key]);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-lg p-4 border-2 border-amber-700/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-bold text-amber-300">🏆 전체 순위</span>
          <span className="text-sm text-slate-400 ml-auto">
            기준: {markerTime}초 / 결과 {results.length}개
          </span>
        </div>
        <RankingTable results={sortedAll} sortBy={sortBy} onRowClick={onRowClick} limit={10} />
      </div>

      <div className="space-y-3">
        {LAW_BODY_CATS.map(({ cat, label, color }) => {
          const filtered = sortedAll.filter((r) => getBuildLawCat(r.build) === cat);
          if (filtered.length === 0) return null;
          return (
            <div key={cat} className={`rounded-lg p-3 sm:p-4 border ${color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-slate-100">{label}</span>
                <span className="text-xs text-slate-400 ml-auto">
                  {filtered.length}개 빌드
                </span>
              </div>
              <RankingTable
                results={filtered}
                sortBy={sortBy}
                onRowClick={onRowClick}
                limit={10}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────  수동 시뮬  ───────────────── */
const MANUAL_MARKER_TIMES = [34, 60, 120, 180];
const MANUAL_MARKER_LABELS = ['34초 (1사이클)', '60초', '120초', '180초'];

function ManualSim({ targetLawBody, setTargetLawBody }) {
  const [skillSel, setSkillSel] = useState({});
  // 법보는 기본 미선택 — 사용자가 직접 3개 선택해야 시뮬 실행 가능
  const [treasures, setTreasures] = useState([]);
  const [order, setOrder] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [markerIdx, setMarkerIdx] = useState(0); // 34초 (1사이클) 기본
  const [randomCrit, setRandomCrit] = useState(false);
  // 불씨 세트 장착 (총 9 슬롯). 개수별 최대 급수 효과 적용.
  const [불씨, set불씨] = useState({
    통명묘화: 0, 진무절화: 0, 태현잔화: 0, 유리현화: 0, 진마성화: 0,
  });
  const 불씨_총합 = (불씨.통명묘화||0)+(불씨.진무절화||0)+(불씨.태현잔화||0)+(불씨.유리현화||0)+(불씨.진마성화||0);
  // 비술
  const [bisul, setBisul] = useState({ self: [], enemy: [] });

  // skillSel 에서 slotMap 자동 유도 (유파별 신통 수)
  const slotMap = useMemo(() => {
    const m = {};
    for (const [f, arr] of Object.entries(skillSel)) {
      if (arr && arr.length > 0) m[f] = arr.length;
    }
    return m;
  }, [skillSel]);

  const build = useMemo(() => buildArray(slotMap), [slotMap]);
  const validationErr = useMemo(() => validateBuild(slotMap), [slotMap]);
  const totalSkillCount = useMemo(
    () => Object.values(skillSel).reduce((a, arr) => a + (arr?.length || 0), 0),
    [skillSel]
  );

  const canRun = totalSkillCount === 6 && !validationErr && treasures.length === 3;
  // 신통 6개만 선택해도 시전 순서 편집 가능 (법보는 나중에 추가)
  const canEditOrder = totalSkillCount === 6 && !validationErr;

  const selectedSkills = useMemo(() => {
    const out = [];
    for (const [f] of build) for (const n of skillSel[f] || []) out.push({ name: n, fam: f });
    return out;
  }, [build, skillSel]);

  // 시전 순서 초기화는 신통/법보 "내용" 변경 시에만 수행
  // 시간(markerIdx)이나 상대 법체(targetLawBody) 변경엔 영향 없음
  const orderSig = useMemo(
    () => selectedSkills.map((s) => s.name).join('|') + '||' + treasures.join('|'),
    [selectedSkills, treasures]
  );
  const lastSigRef = useRef(null);
  useEffect(() => {
    if (!canEditOrder) return;
    if (lastSigRef.current === orderSig) return; // 같은 빌드·법보 조합이면 사용자가 편집한 순서 유지
    lastSigRef.current = orderSig;
    // 신통 6개 + 법보 선택 수만큼의 순서 배열 생성 (법보 부족해도 신통만으로 표시)
    const ord = [];
    for (let i = 0; i < 6; i++) ord.push({ kind: 'skill', idx: i });
    for (let i = 0; i < treasures.length; i++) ord.push({ kind: 'treasure', idx: i });
    const decorated = ord.map((it) => {
      if (it.kind === 'skill') {
        const s = selectedSkills[it.idx];
        return { ...it, label: s?.name || `skill${it.idx}`, cat: s?.fam };
      }
      return { ...it, label: treasures[it.idx], cat: '법보' };
    });
    setOrder(decorated);
  }, [canEditOrder, orderSig, selectedSkills, treasures]);

  const { result, running, run } = useSimulation();

  // 시뮬 실행 시점의 입력 스냅샷 (이후 UI 변경은 스냅샷에 영향 안 줌)
  const [simSnap, setSimSnap] = useState(null);

  function handleRun() {
    if (!canRun || !order) return;
    const rawOrder = order.map((o) => ({ kind: o.kind, idx: o.idx }));
    setShowLog(false);
    const snapshot = {
      build,
      treasures: [...treasures],
      order: rawOrder,
      skills: selectedSkills,
      maxTime: MANUAL_MARKER_TIMES[markerIdx],
      markerIdx,
      targetLawBody,
      불씨: { ...불씨 },
      bisul: { self: [...(bisul.self||[])], enemy: [...(bisul.enemy||[])] },
      randomCrit,
      slotMap: { ...slotMap },
    };
    setSimSnap(snapshot);
    run({
      build: snapshot.build,
      treasures: snapshot.treasures,
      order: snapshot.order,
      skills: snapshot.skills,
      trials: 1,
      maxTime: snapshot.maxTime,
      targetLawBody: snapshot.targetLawBody,
      불씨: snapshot.불씨,
      bisul: snapshot.bisul,
      randomCrit: snapshot.randomCrit,
    });
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-amber-400">1. 신통 선택</h2>
          {totalSkillCount > 0 && (
            <span className="text-sm text-emerald-400">{buildLabel(slotMap)}</span>
          )}
        </div>
        <div className="text-xs text-slate-400 mb-2 leading-relaxed">
          ※ 신통 최대 강화 기준입니다. 피해 수치는 노강 에서 일괄적으로 +200 를 더한 수치입니다.
          <br />
          ※ 기준 스탯 — 공격력 {(CFG.baseATK / 1e8).toFixed(1)}억 · 치명타율 {CFG.baseCR}% · 치명타 배율 {CFG.baseCD}% · 체력 {(CFG.baseHP / 1e8).toFixed(0)}억 · 호신강기 {(CFG.baseShield / 1e8).toFixed(0)}억.
        </div>
        <SkillPicker skillSel={skillSel} onChange={setSkillSel} maxTotal={6} />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-amber-400">2. 법보 선택</h2>
        <TreasurePicker selected={treasures} onChange={setTreasures} />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-amber-400">3. 불씨 선택</h2>
        <BulssiPicker value={불씨} onChange={set불씨} />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3 text-amber-400">4. 비술 선택 <span className="text-xs text-slate-400 font-normal">(자기/상대 각 최대 3개)</span></h2>
        <BisulPicker value={bisul} onChange={setBisul} />
      </section>

      {canEditOrder && order && (
        <section>
          <h2 className="text-lg font-bold mb-3 text-amber-400">4. 시전 순서 (드래그로 변경)</h2>
          <OrderEditor items={order} onChange={setOrder} />
        </section>
      )}

      <section className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-slate-400 mb-1">시뮬 시간</label>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                onClick={() => setMarkerIdx(i)}
                className={`px-3 py-1.5 rounded text-sm ${
                  markerIdx === i ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-700'
                }`}
              >
                {MANUAL_MARKER_LABELS[i]}
              </button>
            ))}
          </div>
        </div>
        <TargetLawBodyPicker value={targetLawBody} onChange={setTargetLawBody} />
        <div>
          <label className="block text-xs text-slate-400 mb-1">확률 계산 방식</label>
          <div className="flex gap-1">
            {[
              { key: false, label: '📊 기댓값 (기본)', hint: '모든 확률 기반 효과 (치명타, 태현잔화 랜덤 inc, 유뢰법체 crit 조건, 순요/풍뢰/뇌정/뇌격 crit 트리거, 뇌신·성류·호탕·칙뢰·풍뢰 다중 확률, 벽력, 환음요탑/오염혁선 호신강기 확률 등) 를 확률 × 값 스케일로 계산. 결정적이라 빌드 비교에 적합.' },
              { key: true, label: '🎲 랜덤 시행', hint: '모든 확률 기반 효과를 실제 주사위 (Math.random) 로 roll 하여 발동 여부 결정. 매 실행마다 결과가 달라져 실전 변동성 체감 가능.' },
            ].map((o) => (
              <button
                key={String(o.key)}
                onClick={() => setRandomCrit(o.key)}
                title={o.hint}
                className={`px-3 py-1.5 rounded text-sm ${
                  randomCrit === o.key
                    ? (o.key === false ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-amber-500 text-slate-950 font-bold')
                    : 'bg-slate-700'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
            {randomCrit
              ? '※ 모든 확률 기반 효과 (치명타·태현잔화·유뢰법체 조건·crit 트리거류 등) 를 주사위로 roll. 매 실행마다 다른 값.'
              : '※ 모든 확률 기반 효과 (치명타·태현잔화·유뢰법체 조건·crit 트리거류 등) 를 기댓값으로 스케일 계산. 결정적 (형혹 60% 폭파만 예외로 항상 랜덤).'}
          </div>
        </div>

        {/* 기댓값 vs 랜덤 모드 동작 안내 (자동 탐색과 동일 내용) */}
        <details className="text-[11px] text-slate-300 bg-slate-800/40 border border-slate-700 rounded mt-2">
          <summary className="cursor-pointer px-3 py-2 hover:bg-slate-700/40 select-none">
            ℹ️ <strong className="text-amber-300">기댓값 vs 랜덤 모드 — 동작 방식 안내</strong>
          </summary>
          <div className="px-3 py-2 leading-relaxed space-y-2 border-t border-slate-700">
            <p>
              확률 기반 효과 (만고귀종 격발, 크리티컬 트리거, 태현잔화 등) 는 모드에 따라 다르게 계산됩니다.
            </p>
            <div className="bg-slate-900/60 rounded p-2 space-y-1">
              <div className="text-amber-200 font-semibold">예시: 만고귀종 (백족법체) 격발 → 계약 4종</div>
              <ul className="list-disc ml-4 text-slate-300">
                <li><strong className="text-emerald-300">기댓값 모드</strong>: 확률 가중 fractional 발동 (예: 4종 각 +0.26 → cr+1.6%, amp+1.6%) — 분산 작음, 빌드 비교 적합</li>
                <li><strong className="text-purple-300">랜덤 모드</strong>: 격발 시 1 type 만 +1 (full +6% cr 또는 amp) — 매 실행 다름, 실전 변동성 체감</li>
              </ul>
            </div>
            <p>
              <strong>총량은 동일</strong>: 횟수 cap 옵션 (제율 5회, 검망 6회 등) 은 fractional 카운터로 분할 소진되어 장기 누적 데미지가 같습니다 (랜덤 5회 × full = 기댓값 多회 × frac).
            </p>
            <p className="text-slate-400">
              타임라인의 활성 버프 수치도 모드에 따라 다르게 표시됩니다.
              기댓값 모드의 "계약 cr+1.6%" 같은 수치는 <strong>확률로 낮아진 실제 적용값</strong>입니다.
            </p>
          </div>
        </details>
      </section>

      {/* 시뮬 실행 버튼 (결과/로그 위) */}
      <section className="flex items-center justify-center pt-4 border-t border-slate-800">
        <button
          onClick={handleRun}
          disabled={!canRun || running}
          className="px-10 py-4 bg-amber-500 text-slate-950 font-bold text-lg rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          {running ? '시뮬 실행 중...' : '▶ 시뮬 실행'}
        </button>
      </section>

      {result && !result.error && simSnap && (
        <>
          <ResultSummary result={result} highlight={simSnap.maxTime} />
          {/* 전투 로그 — 시뮬 실행 시점의 스냅샷 사용, 이후 UI 변경은 반영 X */}
          <BattleLogPanel
            title={buildLabel(simSnap.slotMap)}
            build={simSnap.build}
            skills={simSnap.skills}
            treasures={simSnap.treasures}
            order={simSnap.order}
            targetLawBody={simSnap.targetLawBody}
            maxTime={simSnap.maxTime}
            불씨={simSnap.불씨}
            randomCrit={simSnap.randomCrit}
          />
        </>
      )}
      {result?.error && (
        <div className="bg-red-950/50 border border-red-700 rounded p-4 text-red-300">
          에러: {result.error}
        </div>
      )}
    </div>
  );
}
