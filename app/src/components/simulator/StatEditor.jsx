import { useEffect, useState, useRef } from 'react';
import { CFG, refreshBaseCritRate, compute영혼의불씨강도Reduction, compute겁규어령Reduction, compute도의경지Increase, compute천마위압Increase, compute성물억제도법보Increase, compute법상위세Increase, DEFAULT_STAT } from '../../engine';
import useLocalStorage from '../../hooks/useLocalStorage';

// 기준 스탯 — CFG 직접 수정 (main thread sim 영향)
// worker 에는 별도 전달 (useRanking / useSimulation 에서 stat 포함)
// localStorage 자동 저장/로드 (StatEditor 상위에서 useLocalStorage 로 관리)

// DEFAULT_STAT (기준 스탯 단일 출처) 은 sim2.js 에 정의 — 여기선 re-export 만 (기존 import 경로 호환).
export { DEFAULT_STAT };

// CFG 에 stat 적용 (main thread)
export function applyStatToCFG(stat) {
  CFG.baseATK = (stat.baseATK ?? 2) * 1e8;
  CFG.base진원 = (stat.base진원 ?? 22) * 1e8;
  CFG.baseHP = (stat.baseHP ?? 330) * 1e8;
  CFG.baseDEF = (stat.baseDEF ?? 1) * 1e8;
  CFG.baseCR = stat.baseCR ?? 553.80;       // 치명타 stat (만)
  CFG.baseCRRes = stat.baseCRRes ?? 460.74; // 치명타 저항 stat (만)
  CFG.baseCD_신통 = stat.baseCD_신통 ?? 185;
  CFG.baseCD_법보 = stat.baseCD_법보 ?? 185;
  CFG.baseCD = stat.baseCD_신통 ?? 185;  // legacy 호환 (sim2.js 의 CFG.baseCD 사용 코드 안전망)
  CFG.baseCRBlock_신통 = stat.baseCRBlock_신통 ?? 0;
  CFG.baseCRBlock_법보 = stat.baseCRBlock_법보 ?? 0;
  // crit_buff_* 제거: CRIT 시 최종피해는 유뢰법체 4셋 효과 (CFG.유뢰법체_계열4개_최종피해)
  // 사용자 stat 으로 가산하면 double-count 됨 — set 효과만 적용
  CFG.자기_피해심화_신통 = stat.자기_피해심화_신통 ?? 0;
  CFG.받는_피해감면_신통 = stat.받는_피해감면_신통 ?? 0;
  CFG.자기_피해심화_법보 = stat.자기_피해심화_법보 ?? 0;
  CFG.받는_피해감면_법보 = stat.받는_피해감면_법보 ?? 0;
  // 법보 위능(고정 피해) / 법보 수호(고정 호신강기) — 만 단위, CFG 엔 ×1e4 로 저장
  CFG.법보위능 = (stat.법보위능 ?? 0) * 1e4;
  CFG.법보수호 = (stat.법보수호 ?? 0) * 1e4;
  // 속성/계열/법체/법상/비술/영역 stat
  CFG.자기_피해심화_술법 = stat.자기_피해심화_술법 ?? 0;
  CFG.받는_피해감면_술법 = stat.받는_피해감면_술법 ?? 0;
  CFG.자기_피해심화_물리 = stat.자기_피해심화_물리 ?? 0;
  CFG.받는_피해감면_물리 = stat.받는_피해감면_물리 ?? 0;
  CFG.자기_피해심화_영검 = stat.자기_피해심화_영검 ?? 0;
  CFG.받는_피해감면_영검 = stat.받는_피해감면_영검 ?? 0;
  CFG.자기_피해심화_뇌전 = stat.자기_피해심화_뇌전 ?? 0;
  CFG.받는_피해감면_뇌전 = stat.받는_피해감면_뇌전 ?? 0;
  CFG.자기_피해심화_화염 = stat.자기_피해심화_화염 ?? 0;
  CFG.받는_피해감면_화염 = stat.받는_피해감면_화염 ?? 0;
  CFG.자기_법체_현염 = stat.자기_법체_현염 ?? 0;
  CFG.받는_법체_현염 = stat.받는_법체_현염 ?? 0;
  CFG.자기_법체_유뢰 = stat.자기_법체_유뢰 ?? 0;
  CFG.받는_법체_유뢰 = stat.받는_법체_유뢰 ?? 0;
  CFG.자기_법체_영검 = stat.자기_법체_영검 ?? 0;
  CFG.받는_법체_영검 = stat.받는_법체_영검 ?? 0;
  CFG.자기_법체_백족 = stat.자기_법체_백족 ?? 0;
  CFG.받는_법체_백족 = stat.받는_법체_백족 ?? 0;
  CFG.자기_피해심화_법상 = stat.자기_피해심화_법상 ?? 0;
  CFG.받는_피해감면_법상 = stat.받는_피해감면_법상 ?? 0;
  CFG.자기_피해심화_비술 = stat.자기_피해심화_비술 ?? 0;
  CFG.받는_피해감면_비술 = stat.받는_피해감면_비술 ?? 0;
  CFG.자기_피해심화_영역 = stat.자기_피해심화_영역 ?? 0;
  CFG.받는_피해감면_영역 = stat.받는_피해감면_영역 ?? 0;
  // 영혼의 불씨 강도 → CFG.받는_피해감소_신통/법보 둘 다 derive (사양: 신통/법보/법상 공통)
  // 사용자 사양 (2026-05): mirror 모델 — 자기 강도 = 적 강도 동일 default
  //   → 자기 강도 > 0 이면 25% base 자동 적용 (모든 사용자 데미지 -25%)
  //   → 강도 비율 1% 초과당 추가 -0.15% (자기 < 적 일 경우)
  CFG.영혼의불씨강도 = stat.영혼의불씨강도 ?? 0;
  CFG.적_영혼의불씨강도 = stat.적_영혼의불씨강도 ?? CFG.영혼의불씨강도;  // mirror default
  // 겁규 어령 — 신통 전용 base -10% + scaling (사용자 사양 2026-05-20)
  CFG.겁규어령 = stat.겁규어령 ?? 0;
  CFG.적_겁규어령 = stat.적_겁규어령 ?? CFG.겁규어령;
  const _불씨reduce = compute영혼의불씨강도Reduction ? compute영혼의불씨강도Reduction() : (CFG.영혼의불씨강도 > 0 ? 25 : 0);
  const _겁규reduce = compute겁규어령Reduction ? compute겁규어령Reduction() : 10;
  CFG.받는_피해감소_신통 = _불씨reduce + _겁규reduce;  // 신통 = 영혼불씨 + 겁규어령
  CFG.받는_피해감소_법보 = _불씨reduce;  // 법보 = 영혼불씨만 (겁규어령 = 신통 전용)
  // 도의 경지 (대도 진의) — 자기 도의경지가 적을 1% 초과당 입히는 신통 피해 +1%
  CFG.도의경지 = stat.도의경지 ?? 0;
  CFG.적_도의경지 = stat.적_도의경지 ?? CFG.도의경지;  // mirror default (= 자기)
  CFG.도의경지_신통증가 = compute도의경지Increase ? compute도의경지Increase() : 0;
  // 법상 위세 (진령 법상 피해 증가) — 도의경지의 법상 버전 — 2026-05-22
  CFG.법상위세 = stat.법상위세 ?? 0;
  CFG.적_법상위세 = stat.적_법상위세 ?? CFG.법상위세;
  CFG.법상위세_법상증가 = compute법상위세Increase ? compute법상위세Increase() : 0;
  // 천마 위압 (모든 type 최종피해 증가) — 적보다 1 높을 때마다 +0.1% (max +10%) — 2026-05-20
  CFG.천마위압 = stat.천마위압 ?? 0;
  CFG.적_천마위압 = stat.적_천마위압 ?? CFG.천마위압;
  CFG.천마위압_최종증가 = compute천마위압Increase ? compute천마위압Increase() : 0;
  // 성물 총 억제도 (자기 입히는 법보 피해 증가) — 적보다 1% 초과당 +1% — 2026-05-20
  CFG.성물억제도 = stat.성물억제도 ?? 0;
  CFG.적_성물억제도 = stat.적_성물억제도 ?? CFG.성물억제도;
  CFG.성물억제도_법보증가 = compute성물억제도법보Increase ? compute성물억제도법보Increase() : 0;
  // 영압 / 영역 위압 — 데이터 보존용 (인게임 툴팁 미확인 → sim 효과 미구현) — 2026-05-21
  CFG.영압 = stat.영압 ?? 0;
  CFG.적_영압 = stat.적_영압 ?? CFG.영압;
  CFG.영역위압 = stat.영역위압 ?? 0;
  CFG.적_영역위압 = stat.적_영역위압 ?? CFG.영역위압;
  // 최종 피해 (fmM) + 위압류 — 데이터 보존용 (효과 미구현, 위압류 PvP) — 2026-05-22
  CFG.최종_피해_심화 = stat.최종_피해_심화 ?? 0;
  CFG.받는_최종_피해_감면 = stat.받는_최종_피해_감면 ?? 0;
  CFG.영압대결증가 = stat.영압대결증가 ?? 0;
  CFG.기맥위압증가 = stat.기맥위압증가 ?? 0;
  CFG.영역위압증가 = stat.영역위압증가 ?? 0;
  CFG.삼방만법위압 = stat.삼방만법위압 ?? 0;
  CFG.역외위압 = stat.역외위압 ?? 0;
  CFG.극경공격위압 = stat.극경공격위압 ?? 0;
  CFG.천도위압 = stat.천도위압 ?? 0;
  // baseCR / baseCRRes 변경 후 baseCritRate 재계산
  // 공식: 10 + 120 × (CR - CRRes) / (CR + CRRes), clamp [0, 100]
  if (refreshBaseCritRate) refreshBaseCritRate();
}

// 숫자 입력 필드 (모듈 레벨 — 안정적 컴포넌트 타입, 리마운트 없음).
//   편집 중엔 raw 문자열을 로컬 state 에 보관 → "2.0", "2." 같은 중간 입력이
//   parseFloat 로 즉시 깎여 되돌아가는 문제 방지.
//   포커스 중엔 외부 value 변경이 입력칸을 덮어쓰지 않음. blur 시 정규값으로 동기화.
function StatField({ label, field, unit, stat, onCommit }) {
  const value = stat[field];
  const fmt = (v) => (v == null || Number.isNaN(v) ? '' : String(v));
  const [text, setText] = useState(() => fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    // 포커스 안 된 상태에서 외부 value 가 바뀌면 (초기화 등) 입력칸 동기화
    if (!focused.current && parseFloat(text) !== value) setText(fmt(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] text-slate-400">{label} <span className="text-slate-500">({unit})</span></span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; setText(fmt(value)); }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const num = parseFloat(t);
          if (!Number.isNaN(num)) onCommit(field, num);
        }}
        className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-amber-200 focus:border-amber-500 focus:outline-none"
      />
    </label>
  );
}

export default function StatEditor({ stat, onChange }) {
  // 페이지 로드 시 / stat 변경 시 CFG 에 즉시 적용
  useEffect(() => {
    applyStatToCFG(stat);
  }, [stat]);

  const update = (field, num) => {
    // 함수형 — stale closure 회피 (여러 input 동시 변경 시 update 누락 방지)
    onChange((prev) => ({ ...prev, [field]: num }));
  };

  const reset = () => onChange(DEFAULT_STAT);

  // ── 기준 스탯 프리셋 (이름으로 저장/불러오기) ──
  const [presets, setPresets] = useLocalStorage('statPresets', {});
  const [presetName, setPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  // 최초 마운트 시 프리셋이 비어 있으면 현재 값을 '듀라센' 으로 시드
  useEffect(() => {
    if (Object.keys(presets).length === 0) {
      setPresets({ '듀라센': stat });
      setSelectedPreset('듀라센');
    } else if (!selectedPreset) {
      const first = Object.keys(presets)[0];
      if (first) setSelectedPreset(first);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadPreset = (name) => {
    setSelectedPreset(name);
    if (name && presets[name]) onChange({ ...DEFAULT_STAT, ...presets[name] });
  };
  const savePreset = () => {
    const name = (presetName.trim() || selectedPreset).trim();
    if (!name) return;
    setPresets({ ...presets, [name]: stat });
    setSelectedPreset(name);
    setPresetName('');
  };
  const deletePreset = () => {
    if (!selectedPreset || !presets[selectedPreset]) return;
    const next = { ...presets };
    delete next[selectedPreset];
    setPresets(next);
    setSelectedPreset(Object.keys(next)[0] || '');
  };

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-md p-3 mb-3">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-xs font-semibold text-amber-400">⚙ 기준 스탯 <span className="text-slate-400 font-normal">(이름으로 저장/불러오기 · 자동 저장)</span></div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={selectedPreset}
            onChange={(e) => loadPreset(e.target.value)}
            className="text-[11px] px-2 py-1 bg-slate-800 border border-slate-700 rounded text-amber-200 focus:border-amber-500 focus:outline-none"
            title="저장된 프리셋 불러오기"
          >
            <option value="">— 프리셋 선택 —</option>
            {Object.keys(presets).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="저장할 이름"
            className="w-28 text-[11px] px-2 py-1 bg-slate-800 border border-slate-700 rounded text-amber-200 focus:border-amber-500 focus:outline-none"
            onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); }}
          />
          <button
            onClick={savePreset}
            className="text-[11px] px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded text-amber-100"
            title="현재 스탯을 이 이름으로 저장"
          >
            저장
          </button>
          <button
            onClick={deletePreset}
            className="text-[11px] px-2 py-1 bg-slate-700 hover:bg-rose-800 rounded text-slate-300"
            title="선택한 프리셋 삭제"
          >
            삭제
          </button>
          <button
            onClick={reset}
            className="text-[11px] px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
            title="기본값으로 초기화 (저장된 프리셋 유지)"
          >
            기본값
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {/* 속성 (인게임 캐릭터 화면 분류) */}
        <div>
          <div className="text-xs text-amber-300/90 mb-1.5 font-bold border-b border-slate-700 pb-1">속성</div>
          <div className="flex flex-wrap gap-3">
            <StatField label="생명력" field="baseHP" unit="억" stat={stat} onCommit={update} />
            <StatField label="진원" field="base진원" unit="억" stat={stat} onCommit={update} />
            <StatField label="공격" field="baseATK" unit="억" stat={stat} onCommit={update} />
            <StatField label="방어력" field="baseDEF" unit="억" stat={stat} onCommit={update} />
            <StatField label="영압" field="영압" unit="수치" stat={stat} onCommit={update} />
            <StatField label="도의 경지" field="도의경지" unit="수치" stat={stat} onCommit={update} />
          </div>
        </div>
        {/* 기타 속성 */}
        <div>
          <div className="text-xs text-amber-300/90 mb-1.5 font-bold border-b border-slate-700 pb-1">기타 속성</div>
          <div className="flex flex-wrap gap-3">
            <StatField label="치명타" field="baseCR" unit="만" stat={stat} onCommit={update} />
            <StatField label="치명타 저항" field="baseCRRes" unit="만" stat={stat} onCommit={update} />
            <StatField label="신통 치명타 배율" field="baseCD_신통" unit="%" stat={stat} onCommit={update} />
            <StatField label="신통 치명타 차단" field="baseCRBlock_신통" unit="%" stat={stat} onCommit={update} />
            <StatField label="법보 치명타 배율" field="baseCD_법보" unit="%" stat={stat} onCommit={update} />
            <StatField label="법보 치명타 차단" field="baseCRBlock_법보" unit="%" stat={stat} onCommit={update} />
            <StatField label="성물 총 억제도" field="성물억제도" unit="수치" stat={stat} onCommit={update} />
            <StatField label="법상 위세" field="법상위세" unit="수치" stat={stat} onCommit={update} />
            <StatField label="영혼의 불씨 강도" field="영혼의불씨강도" unit="수치" stat={stat} onCommit={update} />
            <StatField label="영역 위압" field="영역위압" unit="수치" stat={stat} onCommit={update} />
            <StatField label="법보 위능" field="법보위능" unit="만" stat={stat} onCommit={update} />
            <StatField label="법보 수호" field="법보수호" unit="만" stat={stat} onCommit={update} />
            <StatField label="겁규 어령" field="겁규어령" unit="수치" stat={stat} onCommit={update} />
            <StatField label="천마 위압" field="천마위압" unit="수치" stat={stat} onCommit={update} />
          </div>
          <div className="text-[10px] text-slate-500 mt-1 ml-1">
            미러 기본(적=자기): 영혼의 불씨(받는 -25% base) · 천마 위압(최종+0.1%/1) · 성물 억제도(법보+1%/1%) · 겁규 어령(받는 신통 -10% base) · 영압/영역 위압(미구현·보존)
          </div>
        </div>
        {/* 특수 속성 */}
        <div>
          <div className="text-xs text-amber-300/90 mb-1.5 font-bold border-b border-slate-700 pb-1">특수 속성</div>
          <div className="flex flex-wrap gap-3">
            <StatField label="신통 피해 심화" field="자기_피해심화_신통" unit="%" stat={stat} onCommit={update} />
            <StatField label="신통 피해 감면" field="받는_피해감면_신통" unit="%" stat={stat} onCommit={update} />
            <StatField label="법보 피해" field="자기_피해심화_법보" unit="%" stat={stat} onCommit={update} />
            <StatField label="법보 피해 감면" field="받는_피해감면_법보" unit="%" stat={stat} onCommit={update} />
            <StatField label="술법 피해 심화" field="자기_피해심화_술법" unit="%" stat={stat} onCommit={update} />
            <StatField label="술법 피해 감면" field="받는_피해감면_술법" unit="%" stat={stat} onCommit={update} />
            <StatField label="물리 피해 심화" field="자기_피해심화_물리" unit="%" stat={stat} onCommit={update} />
            <StatField label="물리 피해 감면" field="받는_피해감면_물리" unit="%" stat={stat} onCommit={update} />
            <StatField label="영검 피해 심화" field="자기_피해심화_영검" unit="%" stat={stat} onCommit={update} />
            <StatField label="영검 피해 감면" field="받는_피해감면_영검" unit="%" stat={stat} onCommit={update} />
            <StatField label="뇌전 피해 심화" field="자기_피해심화_뇌전" unit="%" stat={stat} onCommit={update} />
            <StatField label="뇌전 피해 감면" field="받는_피해감면_뇌전" unit="%" stat={stat} onCommit={update} />
            <StatField label="화염 피해 심화" field="자기_피해심화_화염" unit="%" stat={stat} onCommit={update} />
            <StatField label="화염 피해 감면" field="받는_피해감면_화염" unit="%" stat={stat} onCommit={update} />
            <StatField label="현염 법체 피해 +" field="자기_법체_현염" unit="%" stat={stat} onCommit={update} />
            <StatField label="현염 법체 피해 -" field="받는_법체_현염" unit="%" stat={stat} onCommit={update} />
            <StatField label="유뢰 법체 피해 +" field="자기_법체_유뢰" unit="%" stat={stat} onCommit={update} />
            <StatField label="유뢰 법체 피해 -" field="받는_법체_유뢰" unit="%" stat={stat} onCommit={update} />
            <StatField label="영검 법체 피해 +" field="자기_법체_영검" unit="%" stat={stat} onCommit={update} />
            <StatField label="영검 법체 피해 -" field="받는_법체_영검" unit="%" stat={stat} onCommit={update} />
            <StatField label="백족 법체 피해 +" field="자기_법체_백족" unit="%" stat={stat} onCommit={update} />
            <StatField label="백족 법체 피해 -" field="받는_법체_백족" unit="%" stat={stat} onCommit={update} />
            <StatField label="법상 피해 심화" field="자기_피해심화_법상" unit="%" stat={stat} onCommit={update} />
            <StatField label="법상 피해 감면" field="받는_피해감면_법상" unit="%" stat={stat} onCommit={update} />
            <StatField label="비술 피해 심화" field="자기_피해심화_비술" unit="%" stat={stat} onCommit={update} />
            <StatField label="비술 피해 감면" field="받는_피해감면_비술" unit="%" stat={stat} onCommit={update} />
            <StatField label="영역 피해 심화" field="자기_피해심화_영역" unit="%" stat={stat} onCommit={update} />
            <StatField label="영역 피해 감면" field="받는_피해감면_영역" unit="%" stat={stat} onCommit={update} />
            <StatField label="최종 피해 심화" field="최종_피해_심화" unit="%" stat={stat} onCommit={update} />
            <StatField label="최종 피해 감면" field="받는_최종_피해_감면" unit="%" stat={stat} onCommit={update} />
            <StatField label="영압 대결 증가" field="영압대결증가" unit="%" stat={stat} onCommit={update} />
            <StatField label="기맥 위압 증가" field="기맥위압증가" unit="%" stat={stat} onCommit={update} />
            <StatField label="영역 위압 증가" field="영역위압증가" unit="%" stat={stat} onCommit={update} />
            <StatField label="삼방/만법 위압" field="삼방만법위압" unit="%" stat={stat} onCommit={update} />
            <StatField label="역외 위압" field="역외위압" unit="%" stat={stat} onCommit={update} />
            <StatField label="극경 공격 위압" field="극경공격위압" unit="%" stat={stat} onCommit={update} />
            <StatField label="천도 위압" field="천도위압" unit="%" stat={stat} onCommit={update} />
          </div>
          <div className="text-[10px] text-slate-500 mt-1 ml-1">
            영압 대결~천도 위압은 인게임 툴팁 미확인 → sim 미구현 (데이터 보존)
          </div>
        </div>
      </div>
    </div>
  );
}
