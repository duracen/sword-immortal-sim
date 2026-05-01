// 비술 (秘術) 선택 — 6 마주 중 정확히 3개 선택, 각 마주 무/허/진 1개 갈래 선택
// value: { self: [{master, branch}, ...max 3], enemy: [...max 3] }

const MASTERS = [
  { key: '탁천', name: '탁천마주', desc: '치명일격 (HP 0 도달) 시 발동' },
  { key: '분혼', name: '분혼마주', desc: '신통/법보 첫 cast 시 발동' },
  { key: '식혼', name: '식혼마주', desc: '공격 후 사망 시 발동' },
  { key: '악신', name: '악신마주', desc: '방어법보 파괴 시 (또는 4회 공격)' },
  { key: '혼원', name: '혼원마주', desc: '방어법보 파괴 시 (호신강기 1/3)' },
  { key: '업화', name: '업화마주', desc: '신통/법보 5회 공격마다' },
];

const BRANCHES = ['무', '허', '진'];

const MASTER_BRANCH_DESC = {
  탁천: {
    무: '최대 HP 29% 회복 + 1초 면역',
    허: 'HP 18% 회복 + 1초 면역, 적 9% max HP 확정 피해 (1620% 상한, 최대 2회)',
    진: 'HP 21% 회복 + 1초 면역, 6초간 피해 감면 +24%',
  },
  분혼: {
    무: '15초 호신강기 봉인 + 4회 1000% 피해',
    허: '10초 봉인 + 봉인 후 10초 호신강기 심화 +18% + 4회 1000%',
    진: '15초 자기 강화, 호신강기 입힌 25% HP 추가 + 4회 800%',
  },
  식혼: {
    무: '호신강기 1/3 흡수, 76% HP 회복',
    허: '46% HP 회복, 피해 감면 7~12% (저체력)',
    진: '47% HP 회복, 치명타율 9~19% (저체력)',
  },
  악신: {
    무: '적 호신강기 0 시 분신 (15초, 본체 39%, 무피해)',
    허: '자기 호신강기 0 시 분신 (15초, 본체 20%, 받는 피해 26% 전이)',
    진: '4회 공격 후 분신 (15초, 본체 30%, 호신강기 심화 +33%, 무피해)',
  },
  혼원: {
    무: '법보 복구 + 호신강기 평균값 + 10%',
    허: '법보 복구 + 호신강기 60%, 12초 신통/치명타 차단 +48%',
    진: '법보 복구 + 호신강기 93%, 미파괴 효과 지속',
  },
  업화: {
    무: '5회 공격마다 10초 DoT (1.5%/s, 324% 상한)',
    허: '5회 공격마다 10초 DoT (0.75%/s, 162% 상한) + 적 피해 심화/감면 -11%',
    진: '10초 업화 멸신 (15회 피해당 1.5% × 최대 10회)',
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
              <span className="text-xs w-20 shrink-0 text-slate-200" title={m.desc}>{m.name}</span>
              <div className="flex gap-1 flex-1">
                {BRANCHES.map((b) => {
                  const active = sel && sel.branch === b;
                  return (
                    <button
                      key={b}
                      onClick={() => toggle(m.key, b)}
                      disabled={tooBig}
                      title={MASTER_BRANCH_DESC[m.key][b]}
                      className={`px-2 py-1 text-[11px] rounded transition ${
                        active
                          ? (side === 'self' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-purple-500 text-white font-bold')
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:hover:bg-slate-700'
                      }`}
                    >
                      {b}
                    </button>
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
