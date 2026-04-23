const TAGS = ['CST', 'BUF', 'STK', 'DMG', 'OPT'];
const LABELS = {
  CST: '시전',
  BUF: '버프',
  STK: '스택',
  DMG: '데미지',
  OPT: '옵션',
};

export default function EventFilter({ filter, onChange, counts }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {TAGS.map((t) => (
        <button
          key={t}
          onClick={() => onChange({ ...filter, [t]: !filter[t] })}
          className={`px-3 py-1.5 rounded text-xs font-semibold ${
            filter[t]
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
        >
          {LABELS[t]} ({counts?.[t] || 0})
        </button>
      ))}
    </div>
  );
}
