// 비술 (秘術) 선택 — 6 마주 중 정확히 3개 선택, 각 마주 무/허/진 1개 갈래 선택
// value: { self: [{master, branch}, ...max 3], enemy: [...max 3] }
import HoverTooltip from '../common/HoverTooltip';

const MASTERS = [
  { key: '탁천', name: '탁천마주', trigger: '치명일격 (HP 0 도달) 시 발동, CD 170초', cd: 170 },
  { key: '분혼', name: '분혼마주', trigger: '신통/법보 첫 cast 시 발동, CD 170초', cd: 170 },
  { key: '식혼', name: '식혼마주', trigger: '공격 후 사망 시 발동, CD 160초', cd: 160 },
  { key: '악신', name: '악신마주', trigger: '방어법보 파괴 시 (또는 4회 공격), CD 170초', cd: 170 },
  { key: '혼원', name: '혼원마주', trigger: '방어법보 파괴 시 (호신강기 1/3 마다), CD 160초', cd: 160 },
  { key: '업화', name: '업화마주', trigger: '신통/법보 5회 공격마다, CD 160초', cd: 160 },
];

const BRANCHES = ['무', '허', '진'];

// 비술 원문 (도감 기준 — 신통_정리.md 의 비술 정리 섹션에서 발췌)
const MASTER_BRANCH_DESC = {
  탁천: {
    무: '치명 일격을 받으면, 순수한 마념이 응집된 기운을 방출하여 자신을 보호하고, 최대 생명력의 29.00%만큼 회복하며, 1초 동안 모든 피해를 면역한다.',
    허: '치명 일격을 받으면 다음 효과가 발동된다.\n① 최대 생명력의 18.00%만큼 회복하며 1초 동안 모든 피해를 면역한다(발동 후 재사용 시간 적용).\n② 대상 주변 최대 3명의 대상에게 대상 최대 생명력의 9.00%에 해당하는 확정 피해(최대 자신 공격력의 1620.00%, 상한은 경지에 따라 증가)를 입힌다(최대 2회 발동).\n(두 효과의 재사용 시간은 동일하지만 별도로 진행)',
    진: '치명 일격을 받으면 마념이 자신을 보호하고, 최대 생명력의 21.00%만큼 회복하며 1초 동안 모든 피해를 면역한다. 6초간 피해 감면을 24.00%만큼 증가시킨다.',
  },
  분혼: {
    무: '신통 또는 법보로 공격 시 혼백을 소환하여 15초간 대상의 방어법보를 봉인하며, 대상을 4회 공격하여 총 공격력 1000.00%의 피해를 입힌다.',
    허: '신통 또는 법보로 공격 시 혼백을 소환하여 10초간 대상의 방어법보를 봉인하며, 봉인 종료 후 10초간 18.00%의 호신강기에 대한 피해 심화를 획득한다. 추가로 4회 공격하여 총 공격력 1000.00%의 피해를 입힌다.',
    진: '신통 또는 법보로 공격 시 혼백을 소환하여 15초간 자신을 강화시키며, 호신강기에 입히는 피해의 25.00%만큼 추가로 대상의 생명력을 감소시킨다. 대상을 4회 공격하여 총 공격력 800.00%의 피해를 입힌다.',
  },
  식혼: {
    무: '신통 또는 법보로 공격 후 사망할 때까지 자신의 방어법보를 1개 흡수한다(최대 1개). 140초간 모든 방어법보의 호신강기 총합의 76.00%에 해당하는 생명력 및 최대 생명력을 획득한다(전환 비율은 비술 장착 칸이 해제됨에 따라 증가).',
    허: '신통 또는 법보로 공격 후 사망할 때까지 자신의 방어법보를 1개 흡수한다(최대 1개). 그리고 140초간 모든 방어법보의 호신강기 총합의 46.00%에 해당하는 생명력 및 최대 생명력을 획득한다(전환 비율은 비술 장착 칸이 해제됨에 따라 증가). 지속 기간 동안 피해 감면이 7.00%~12.00% 증가하며, 자신의 현재 생명력 백분율이 낮을수록 피해 감면이 증가한다(생명력 백분율이 25.00%일 시 최대값을 적용).',
    진: '신통 또는 법보로 공격 후 사망할 때까지 자신의 방어법보를 1개 흡수한다(최대 1개). 140초간 모든 방어법보의 호신강기 총합의 47.00%에 해당하는 생명력 및 최대 생명력을 획득한다(전환 비율은 비술 장착 칸이 해제됨에 따라 증가). 지속 기간 동안 치명타율이 9.00%~19.00% 증가하며, 자신의 현재 생명력 백분율이 낮을수록 치명타율이 증가한다(생명력 백분율이 25.00%일 시 최대값을 적용).',
  },
  악신: {
    무: '적의 모든 방어법보가 파괴되면, 악념 분신을 소환한 후 15초간 전장에 투입한다. 분신의 속성은 본체의 39.00%이며, 어떠한 피해도 받지 않는다.',
    허: '자신의 모든 방어법보가 파괴되면, 악념 분신을 소환한 후 15초간 전장에 투입한다. 분신의 속성은 본체의 20.00%이며, 그중 생명력 속성은 150.00%까지 증가하지만 입는 피해를 받는다. 분신 지속 시간 동안 수련자가 받는 피해의 26.00%가 분신에게 전이된다.',
    진: '신통 또는 법보로 4회 공격 후 악념 분신을 소환해 15초간 전장에 투입한다. 분신의 속성은 본체의 30.00%이며, 호신강기에 대한 피해 심화를 33.00% 획득하고 분신은 어떠한 피해도 받지 않는다.',
  },
  혼원: {
    무: '방어법보가 파괴되면 인과 역행이 발동되어, 해당 법보를 복구하고 모든 방어법보의 호신강기 평균값에 해당하는 호신강기와 10.00%만큼의 호신강기를 추가로 획득합니다(발동 후 재사용 시간 적용).',
    허: '방어법보가 파괴되면 인과 역행이 발동되어, 해당 법보를 복구하고 모든 방어법보의 호신강기 평균값의 60.00%에 해당하는 호신강기를 획득하며, 12초간 신통 및 치명타 차단을 48.00% 추가 획득한다.',
    진: '방어법보가 파괴되면 인과 역행이 발동되어, 해당 법보를 복구하고 모든 방어법보의 호신강기 평균값의 93.00%에 해당하는 호신강기를 획득하며, 모든 방어법보가 파괴될 때까지 모든 미파괴 효과가 지속된다.',
  },
  업화: {
    무: '신통 또는 법보로 5회 공격할 때마다 업화가 대상을 10초 동안 휘감으며, 초당 최대 생명력의 1.50%에 해당하는 피해(최대 자신 공격력의 324.00%, 상한은 경지에 따라 증가)를 입힌다.',
    허: '신통 또는 법보로 5회 공격할 때마다 업화가 대상을 10초 동안 휘감으며, 초당 최대 생명력의 0.75%에 해당하는 피해(최대 자신 공격력의 162.00%, 상한은 경지에 따라 증가)를 입힌다. 또한 10초간 대상의 피해 심화/감면을 11.00%만큼 추가 감소시킨다.',
    진: '신통/법보로 공격 후 자신이 10초간 업화 멸신 상태에 진입한다. 업화 멸신: 피해를 15회 입힐 때마다 대상 주변 최대 3명의 대상에게 대상 최대 생명력의 1.50%에 해당하는 피해(최대 자신 공격력의 324.00%, 상한은 경지에 따라 증가)를 입힌다(최대 10회 발동).',
  },
};

function BisulSlot({ side, value, onChange, label }) {
  const list = value || [];
  function toggle(masterKey, branch) {
    const exists = list.find((b) => b.master === masterKey);
    const next = list.filter((b) => b.master !== masterKey);
    if (!exists || exists.branch !== branch) {
      // Re-add or change branch
      if (next.length >= 3 && !exists) {
        // 이미 3개 선택 — 첫 번째 제거 후 추가
        next.shift();
      }
      next.push({ master: masterKey, branch });
    }
    // exists && exists.branch === branch → 같은 갈래 클릭 = 해제 (next 에서 이미 제거됨)
    onChange(next);
  }
  return (
    <div className={`border rounded-lg p-3 ${side === 'self' ? 'border-amber-700/50 bg-amber-950/10' : 'border-purple-700/50 bg-purple-950/10'}`}>
      <div className={`text-sm font-bold mb-2 ${side === 'self' ? 'text-amber-300' : 'text-purple-300'}`}>
        {label} <span className="text-xs text-slate-400 font-normal">({list.length}/3)</span>
      </div>
      <div className="space-y-2">
        {MASTERS.map((m) => {
          const sel = list.find((b) => b.master === m.key);
          const isSelected = !!sel;
          const tooBig = !isSelected && list.length >= 3;
          return (
            <div key={m.key} className={`flex items-center gap-2 p-1.5 rounded ${isSelected ? 'bg-slate-800/60' : tooBig ? 'opacity-40' : ''}`}>
              <HoverTooltip
                className={side === 'self' ? 'border-amber-600' : 'border-purple-600'}
                maxWidth={360}
                content={
                  <>
                    <div className={`text-xs font-bold mb-1 ${side === 'self' ? 'text-amber-300' : 'text-purple-300'}`}>
                      🔮 {m.name}
                    </div>
                    <div className="text-[11px] text-slate-400 mb-2">{m.trigger}</div>
                    <div className="text-[12px] text-slate-200 leading-relaxed space-y-2">
                      <div><span className="font-bold text-yellow-300">[무]</span> <span className="whitespace-pre-wrap">{MASTER_BRANCH_DESC[m.key].무}</span></div>
                      <div><span className="font-bold text-yellow-300">[허]</span> <span className="whitespace-pre-wrap">{MASTER_BRANCH_DESC[m.key].허}</span></div>
                      <div><span className="font-bold text-yellow-300">[진]</span> <span className="whitespace-pre-wrap">{MASTER_BRANCH_DESC[m.key].진}</span></div>
                    </div>
                  </>
                }
              >
                <span className="text-xs w-20 shrink-0 text-slate-200 cursor-help border-b border-dotted border-slate-500">{m.name}</span>
              </HoverTooltip>
              <div className="flex gap-1 flex-1">
                {BRANCHES.map((b) => {
                  const active = sel && sel.branch === b;
                  return (
                    <HoverTooltip
                      key={b}
                      className={side === 'self' ? 'border-amber-600' : 'border-purple-600'}
                      maxWidth={360}
                      content={
                        <>
                          <div className={`text-xs font-bold mb-1 ${side === 'self' ? 'text-amber-300' : 'text-purple-300'}`}>
                            🔮 {m.name} <span className="text-yellow-300">[{b}]</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mb-2">{m.trigger}</div>
                          <div className="text-[12px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {MASTER_BRANCH_DESC[m.key][b]}
                          </div>
                        </>
                      }
                    >
                      <button
                        onClick={() => toggle(m.key, b)}
                        disabled={tooBig}
                        className={`px-2 py-1 text-[11px] rounded transition cursor-help ${
                          active
                            ? (side === 'self' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-purple-500 text-white font-bold')
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:hover:bg-slate-700'
                        }`}
                      >
                        {b}
                      </button>
                    </HoverTooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {list.length > 0 && (
        <div className="mt-2 text-[11px] text-slate-400">
          선택: {list.map((b) => `${b.master}·${b.branch}`).join(', ')}
        </div>
      )}
    </div>
  );
}

export default function BisulPicker({ value, onChange }) {
  const v = value || { self: [], enemy: [] };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <BisulSlot
        side="self"
        label="🔮 자기 비술"
        value={v.self || []}
        onChange={(self) => onChange({ ...v, self })}
      />
      <BisulSlot
        side="enemy"
        label="⚔️ 상대 비술"
        value={v.enemy || []}
        onChange={(enemy) => onChange({ ...v, enemy })}
      />
    </div>
  );
}
