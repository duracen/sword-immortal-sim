import { BULSSI_DESCS } from '../../utils/skillOptions';
import HoverTooltip from '../common/HoverTooltip';

// 불씨 세트 장착 (총 9 슬롯 한도). 개수별 탑티어 효과 적용.
// AutoSearch / ManualSim 양쪽에서 재사용.
export default function BulssiPicker({ value, onChange }) {
  const total = (value.통명묘화||0)+(value.진무절화||0)+(value.태현잔화||0)+(value.유리현화||0)+(value.진마성화||0);
  const sets = [
    { key: '통명묘화', choices: [0, 3], desc: '3개: amp +8 (신통 피해 심화)' },
    { key: '진무절화', choices: [0, 3, 6], desc: '3개: 2cast마다 +16 dealt / 6개: +48 dealt (다음 신통)' },
    { key: '태현잔화', choices: [0, 3], desc: '3개: 신통 시전 시 dealt 0~16 랜덤 (기댓값 +8)' },
    { key: '유리현화', choices: [0, 3], desc: '3개: amp +15 (신통 피해 심화)' },
    { key: '진마성화', choices: [0, 3, 6], desc: '3개: 신통 cast당 amp +1%/스택 / 6개: +3%/스택 (max 10중첩)' },
  ];
  return (
    <div>
      <div className="text-sm text-slate-400 mb-2">
        불씨 세트 장착 (<span className={total > 9 ? 'text-red-400' : ''}>{total}</span>/9)
      </div>
      <div className="flex flex-wrap gap-2">
        {sets.map(({ key, choices, desc }) => (
          <HoverTooltip
            key={key}
            className="border-pink-600"
            maxWidth={320}
            content={BULSSI_DESCS[key] ? (
              <>
                <div className="text-xs font-bold text-pink-300 mb-1">🔥 불씨 · {key}</div>
                <div className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {BULSSI_DESCS[key]}
                </div>
              </>
            ) : null}
          >
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 cursor-help">
              <span className="font-medium text-slate-100 text-sm">{key}</span>
              <div className="flex gap-1">
                {choices.map((n) => (
                  <button
                    key={n}
                    onClick={() => onChange({ ...value, [key]: n })}
                    className={`px-2.5 h-7 text-xs rounded font-semibold ${
                      (value[key] || 0) === n
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </HoverTooltip>
        ))}
      </div>
      {total > 9 && (
        <div className="mt-2 text-xs text-red-400">⚠ 9개 초과 장착 불가</div>
      )}
    </div>
  );
}
