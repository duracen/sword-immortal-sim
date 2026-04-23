import SimulatorPage from './pages/SimulatorPage.jsx';

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-6">
          <h1 className="text-base sm:text-xl font-bold text-amber-400">검선귀환 신통 시뮬레이터</h1>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <SimulatorPage />
      </main>
      <footer className="border-t border-slate-800 bg-slate-900/60 mt-8">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 text-xs text-slate-400 leading-relaxed">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold">검선귀환 신통 시뮬레이터</span>
              <span className="text-slate-600">·</span>
              <span>비공식 팬 제작 도구</span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
              <span>문의 · 제보 · 저작권 관련 연락</span>
              <a
                href="mailto:duracen18@gmail.com"
                className="text-slate-300 hover:text-amber-400 underline decoration-dotted"
              >
                📧 duracen18@gmail.com
              </a>
            </div>
          </div>
          <div className="space-y-1 text-[11px] text-slate-500">
            <div>
              ※ 본 사이트는 게임 <span className="text-slate-400">"검선귀환(劍仙歸還)"</span> 의 신통/법보/불씨 조합을
              이론적으로 시뮬레이션하는 <span className="text-slate-300">비공식 팬 제작 도구</span> 입니다.
              공식 제작사 또는 퍼블리셔와 제휴되지 않았으며, 어떠한 공식 승인도 받지 않았습니다.
            </div>
            <div>
              ※ 실제 인게임 수치는 강화 단계 · 장비 · 상성 · 랜덤성 등 다양한 변수에 따라 달라질 수 있으며,
              본 시뮬레이터의 결과와는 차이가 있을 수 있습니다.
            </div>
            <div>
              ※ 모든 수치는 <span className="text-slate-400">신통 최대 강화 · 공격력 1.6억 · 치명타율 30% · 치명타 배율 200%</span>
              {' '}기준의 이론값이며, 기본은 <span className="text-slate-400">기댓값 모드</span>
              {' '}(모든 확률 기반 효과 — 치명타·태현잔화·유뢰법체 조건·crit 트리거류 등 — 을 확률 × 값으로 스케일 계산) 입니다.
            </div>
            <div className="pt-2 text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 mt-2">
              게임명 <span className="text-slate-300">"검선귀환"</span>, 신통·유파·법보 명칭, 아이콘, 스킬 설명 및
              모든 게임 내 자료의 저작권은 원저작자 및 해당 게임의 퍼블리셔에게 있습니다.
              본 사이트의 자체 시뮬레이션 엔진 코드 및 UI 만 사용자 제작분에 해당합니다.
              게임 데이터는 공개된 자료를 기반으로 유저 커뮤니티의 해석/재구성을 거친 것으로,
              저작권자의 요청이 있을 경우 지체 없이 수정·삭제하겠습니다.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
