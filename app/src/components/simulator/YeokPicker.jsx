// 영역 (법칙) 선택 — 6개 중 1개 선택, 신통/법보 누적 10회 시전마다 발동 (CD 180초)
import HoverTooltip from '../common/HoverTooltip';

// 영역 LIST — order: 진양화련, 제왕의 정, 사해 마관 (선택 가능) / 파천절검, 상천한빙, 청제신목 (선택 불가)
export const 영역_LIST = [
  { name: '진양화련', state: '열반', icon: '🔥', color: 'orange',  enabled: true  },
  { name: '제왕의 정', state: '천위', icon: '⚡', color: 'amber',   enabled: true  },
  { name: '사해 마관', state: '심연', icon: '🌫', color: 'violet',  enabled: true  },
  { name: '파천절검', state: '절검', icon: '⚔', color: 'sky',     enabled: false },
  { name: '상천한빙', state: '응상', icon: '❄', color: 'cyan',    enabled: false },
  { name: '청제신목', state: '번음', icon: '🌳', color: 'emerald', enabled: false },
];

// 각 영역의 원문 설명
export const 영역_DESC = {
  진양화련: {
    공통: '대상을 4회 공격하여 총 공격력 2100.00%의 피해를 입힌 후, 범위 내 최대 6명의 적에게 공격력 900.00%의 피해를 입히고, 열반 상태에 돌입한다.',
    영역효과: '10초 동안 대상이 신통 및 법보 공격으로 입히는 피해가 10.00% 감소한다.',
    자기버프: '[열반] 10초 동안 자신의 생명력 백분율이 70.00% 미만인 경우, 신통 및 법보 공격으로 입히는 피해가 10.00% 증가한다.',
  },
  '제왕의 정': {
    공통: '대상을 4회 공격하여 총 공격력 2100.00%의 피해를 입힌 후, 범위 내 최대 6명의 적에게 공격력 900.00%의 피해를 입히고, 천위 상태에 돌입한다.',
    영역효과: '5초간 대상을 질겁(신통/공격법보 사용 불가, 부여 후 30초 재부여 면역) 상태에 빠뜨린다 (최대 4명의 대상에게 적용).',
    자기버프: '[천위] 10초 동안 신통 및 법보로 공격 시 공격력 70.00%의 피해를 무작위로 2-4회 입힌다.',
  },
  '사해 마관': {
    공통: '대상을 4회 공격하여 총 공격력 2100.00%의 피해를 입힌 후, 범위 내 최대 6명의 적에게 공격력 900.00%의 피해를 입히고, 심연 상태에 돌입한다.',
    영역효과: '최대 진원의 15.00%를 차감하고, 10초간 영역 시전자로부터 받는 피해 20.00% 증가한다.',
    자기버프: '[심연] 10초 동안 신통 및 법보로 공격 시 대상 최대 생명력의 1.50%에 해당하는 피해(최대 공격력의 300.00%)를 입힌다.',
  },
  파천절검: {
    공통: '대상을 4회 공격하여 총 공격력 2100.00%의 피해를 입힌 후, 범위 내 최대 6명의 적에게 공격력 900.00%의 피해를 입히고, 절검 상태에 돌입한다.',
    영역효과: '10초 동안 대상이 받는 피해가 15.00% 증가하고, 대상에게 초당 자신 공격력의 60.00%에 해당하는 피해를 입힌다.',
    자기버프: '[절검] 10초 동안 신통/법보 공격 시전 시, 비검을 발사해 대상에게 공격력 250.00%의 피해를 입히고, 검백을 1중첩 획득한다. 종료 시 검백 1중첩당 비검 한 자루 발사하여 공격력 200.00% 피해. [검백]: 1중첩당 10초간 입히는 피해 5%↑, 받는 피해 5%↓ (최대 3중첩).',
  },
  상천한빙: {
    공통: '대상을 4회 공격하여 총 공격력 2100.00%의 피해를 입힌 후, 범위 내 최대 6명의 적에게 공격력 900.00%의 피해를 입히고, 응상 상태에 돌입한다.',
    영역효과: '대상에게 엄동을 1중첩 부여하고, 5초간 동결(신통/공격법보 사용 불가, 30초 재부여 면역) 상태에 빠뜨린다 (최대 4명의 대상에게 적용).',
    자기버프: '[응상] 10초 동안 신통/법보 공격 시전 시, 대상에게 엄동 효과를 1중첩 부여하고, 엄동 1중첩당 공격력 100.00%의 피해를 1회 추가 부여한다. [엄동]: 10초간 적 피해 심화/감면 8%↓ (최대 3중첩).',
  },
  청제신목: {
    공통: '대상을 4회 공격하여 총 공격력 2100.00%의 피해를 입힌 후, 범위 내 최대 6명의 적에게 공격력 900.00%의 피해를 입히고, 번음 상태에 돌입한다.',
    영역효과: '대상을 10초간 기생 상태에 빠뜨린다 (최대 4명의 대상에게 적용). [기생]: 피해 심화 및 피해 감면 10%↓ + 신통/법보 공격 시전 시 영역 소유자가 최대 생명력의 1.80%만큼 회복.',
    자기버프: '[번음] 10초 동안 자신이 생명력 회복 시 흥영 효과를 1중첩 획득. 신통/법보 공격 시전 시 입힌 피해의 10.00%를 회복(자기 최대 HP 1.20% 캡). [흥영]: 1중첩당 10초간 자기 피해 감면/심화 8%↑ (최대 3중첩).',
  },
};

const COLOR_MAP = {
  orange:  { active: 'bg-orange-600 border-orange-400 text-white font-bold',   border: 'border-orange-600' },
  amber:   { active: 'bg-amber-600 border-amber-400 text-white font-bold',     border: 'border-amber-600' },
  violet:  { active: 'bg-violet-600 border-violet-400 text-white font-bold',   border: 'border-violet-600' },
  sky:     { active: 'bg-sky-600 border-sky-400 text-white font-bold',         border: 'border-sky-600' },
  cyan:    { active: 'bg-cyan-600 border-cyan-400 text-white font-bold',       border: 'border-cyan-600' },
  emerald: { active: 'bg-emerald-600 border-emerald-400 text-white font-bold', border: 'border-emerald-600' },
};

export default function YeokPicker({ value, onChange }) {
  const cur = value || null;

  function selectName(name, enabled) {
    if (!enabled) return; // 선택 불가 영역 무시
    if (cur === name) onChange(null); // 같은 거 클릭 → 해제
    else onChange(name);
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-200">
        🌐 영역 선택 {cur ? <span className="text-amber-400">— {cur}</span> : <span className="text-slate-400 text-xs">(선택 안 함)</span>}
        <span className="text-[11px] text-slate-400 ml-2">신통/법보 누적 10회 시전마다 발동, CD 180초</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {영역_LIST.map((item) => {
          const active = cur === item.name;
          const cm = COLOR_MAP[item.color] || COLOR_MAP.amber;
          const desc = 영역_DESC[item.name] || {};
          return (
            <HoverTooltip
              key={item.name}
              maxWidth={520}
              className={cm.border}
              content={
                <>
                  <div className="text-xs font-bold mb-1 text-amber-300">
                    {item.icon} {item.name} <span className="text-slate-400 font-normal">→ [{item.state}]</span>
                    {!item.enabled && <span className="text-rose-400 ml-2">(선택 불가)</span>}
                  </div>
                  <div className="text-[12px] text-slate-200 leading-relaxed space-y-1">
                    <div><span className="font-bold text-yellow-300">[발동]</span> {desc.공통}</div>
                    <div><span className="font-bold text-rose-300">[적 디버프]</span> {desc.영역효과}</div>
                    <div><span className="font-bold text-emerald-300">[자기 버프]</span> {desc.자기버프}</div>
                  </div>
                </>
              }
            >
              <button
                onClick={() => selectName(item.name, item.enabled)}
                disabled={!item.enabled}
                className={`px-3 py-1.5 text-[12px] rounded border transition cursor-help ${
                  !item.enabled
                    ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-60'
                    : active
                      ? cm.active
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {item.icon} {item.name}
                {!item.enabled && <span className="text-[10px] text-rose-500 ml-1">🔒</span>}
              </button>
            </HoverTooltip>
          );
        })}
      </div>
    </div>
  );
}
