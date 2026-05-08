import { TREASURE_SETS } from '../../engine';

// 세트 모드 선택 (단독 / 천강 / 현명) — 공격법보/방어법보 양쪽 공통 컴포넌트
export default function TreasureSetPicker({ value, onChange, label, accentColor = 'amber' }) {
  const sets = TREASURE_SETS || {
    '단독': { name: '단독', desc: '세트 효과 없음' },
    '천강': { name: '천강', desc: '물리 계열' },
    '현명': { name: '현명', desc: '술법 계열' },
  };
  const colorMap = {
    amber: { active: 'bg-amber-500/20 border-amber-500 text-amber-300', label: 'text-amber-400' },
    cyan: { active: 'bg-cyan-500/20 border-cyan-500 text-cyan-300', label: 'text-cyan-400' },
  };
  const c = colorMap[accentColor] || colorMap.amber;

  return (
    <div className="mb-2">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className={`font-semibold ${c.label}`}>{label}:</span>
        {Object.keys(sets).map((key) => {
          const set = sets[key];
          const on = value === key;
          return (
            <label
              key={key}
              className="flex items-center gap-1 cursor-pointer text-slate-300"
              title={set.desc}
            >
              <input
                type="radio"
                name={label}
                checked={on}
                onChange={() => onChange(key)}
              />
              <span
                className={`px-2 py-0.5 rounded border ${
                  on ? c.active : 'border-slate-700 bg-slate-800/60'
                }`}
              >
                {set.name === '단독' ? '단독 (세트 X)' : `${set.name} 3셋`}
              </span>
            </label>
          );
        })}
      </div>
      {value && value !== '단독' && (
        <div className="mt-1 text-[11px] text-amber-300 ml-1">
          ✓ {sets[value]?.desc || ''} (sim 적용 — {value === '천강' ? '물리' : '술법'} 타입 피해에만 +5%)
        </div>
      )}
    </div>
  );
}
