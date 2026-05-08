import { DEFENSE_TREASURES, DEFENSE_TREASURE_NAMES } from '../../engine';
import HoverTooltip from '../common/HoverTooltip';

export default function DefenseTreasurePicker({ selected, onChange, maxSelect = 3 }) {
  function toggle(name) {
    if (selected.includes(name)) {
      onChange(selected.filter((t) => t !== name));
    } else if (selected.length < maxSelect) {
      onChange([...selected, name]);
    }
  }

  // 호신강기 합산
  const totalShield = selected.reduce((sum, name) => {
    const dt = DEFENSE_TREASURES[name];
    return sum + (dt ? dt.shield : 0);
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="text-sm text-slate-300">
          선택된 방어법보: <span className="font-bold text-cyan-400">{selected.length}</span>/{maxSelect}
          {selected.length > 0 && (
            <span className="ml-3 text-xs text-amber-300">
              호신강기 합산: <span className="font-bold">{(totalShield / 1e8).toFixed(2)}억</span>
            </span>
          )}
        </div>
        <button
          onClick={() => onChange([])}
          className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
        >
          전체 해제
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {DEFENSE_TREASURE_NAMES.map((name) => {
          const dt = DEFENSE_TREASURES[name];
          if (!dt) return null;
          const on = selected.includes(name);
          const idx = selected.indexOf(name);
          return (
            <HoverTooltip
              key={name}
              className="border-cyan-600"
              maxWidth={420}
              content={
                <>
                  <div className="text-xs font-bold text-cyan-300 mb-1">
                    🛡️ {dt.name}
                  </div>
                  <div className="text-[12px] text-amber-300 mb-1">
                    호신강기 {(dt.shield / 1e8).toFixed(2)}억 · 재사용 {dt.cd}초
                  </div>
                  <div className="text-[12px] text-slate-200 leading-relaxed whitespace-pre-line">{dt.desc}</div>
                </>
              }
            >
              <button
                onClick={() => toggle(name)}
                className={`relative px-3 py-2 rounded-md border font-medium text-sm cursor-help ${
                  on
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {dt.name}
                {on && (
                  <span className="ml-2 text-xs bg-cyan-500 text-slate-950 rounded-full w-4 h-4 inline-flex items-center justify-center">
                    {idx + 1}
                  </span>
                )}
              </button>
            </HoverTooltip>
          );
        })}
      </div>
    </div>
  );
}
