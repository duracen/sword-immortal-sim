import { FAMILIES, FAMILIES_BY_CAT, CATEGORIES } from '../../engine';

const CAT_COLORS = {
  영검: 'border-cat-영검 bg-cat-영검/10',
  화염: 'border-cat-화염 bg-cat-화염/10',
  뇌전: 'border-cat-뇌전 bg-cat-뇌전/10',
  백족: 'border-cat-백족 bg-cat-백족/10',
};

export default function FamilyPicker({ slotMap, onChange }) {
  function setSlots(fam, slots) {
    const next = { ...slotMap };
    if (slots === 0) delete next[fam];
    else next[fam] = slots;
    onChange(next);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {CATEGORIES.map((cat) => (
        <div key={cat} className={`border rounded-lg p-3 ${CAT_COLORS[cat]}`}>
          <div className="font-bold mb-2 text-slate-100">{cat}</div>
          <div className="space-y-1">
            {FAMILIES_BY_CAT[cat].map((fam) => {
              const slots = slotMap[fam] || 0;
              return (
                <div
                  key={fam}
                  className="flex items-center justify-between bg-slate-900/60 rounded px-2 py-1"
                >
                  <div className="text-sm">
                    <span className="font-medium">{fam}</span>
                    <span className="text-slate-500 text-xs ml-2">
                      {FAMILIES[fam].skills.length}개 스킬
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setSlots(fam, n)}
                        className={`w-7 h-7 text-xs rounded font-semibold ${
                          slots === n
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-700 hover:bg-slate-600'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
