import { TREASURE_NAMES } from '../../engine';
import { TREASURE_DESCS } from '../../utils/skillOptions';

// 표시 순서 (시전 기본 순서와 동일): 환음요탑 → 유리옥호 → 참원선검 → 오염혁선
const DISPLAY_ORDER = ['환음요탑', '유리옥호', '참원선검', '오염혁선'];
const TREASURE_DISPLAY = DISPLAY_ORDER.filter((t) => TREASURE_NAMES.includes(t));

export default function TreasurePicker({ selected, onChange, showOrder = true, maxSelect = 3 }) {
  function toggle(tr) {
    if (selected.includes(tr)) {
      onChange(selected.filter((t) => t !== tr));
    } else if (selected.length < maxSelect) {
      onChange([...selected, tr]);
    }
  }

  return (
    <div>
      <div className="text-sm text-slate-400 mb-2">
        법보 선택 ({selected.length}/{maxSelect})
      </div>
      <div className="flex flex-wrap gap-2">
        {TREASURE_DISPLAY.map((tr) => {
          const on = selected.includes(tr);
          const idx = selected.indexOf(tr);
          const desc = TREASURE_DESCS[tr];
          return (
            <div key={tr} className="relative group">
              <button
                onClick={() => toggle(tr)}
                className={`relative px-3 py-2 rounded-md border font-medium text-sm cursor-help ${
                  on
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {tr}
                {on && showOrder && (
                  <span className="ml-2 text-xs bg-amber-500 text-slate-950 rounded-full w-4 h-4 inline-flex items-center justify-center">
                    {idx + 1}
                  </span>
                )}
                {on && !showOrder && (
                  <span className="ml-2 text-xs text-amber-400">✓</span>
                )}
              </button>
              {desc && (
                <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-[200] w-[90vw] max-w-72 p-3 bg-slate-950 border border-yellow-600 rounded-lg shadow-xl pointer-events-none">
                  <div className="text-xs font-bold text-yellow-300 mb-1">📿 {tr}</div>
                  <div className="text-[11px] text-slate-200 leading-relaxed">{desc}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
