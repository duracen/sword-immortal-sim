// sim2.js 브라우저 ESM 래퍼
// Vite의 ?raw 로 sim2.js 원문을 가져와 new Function 으로 실행한다.
// trace.js / rank_thunder.js 가 Node 에서 쓰는 것과 동일한 패턴.
import simSource from '../../../sim2.js?raw';

const m = { exports: {} };
const fakeRequire = () => { throw new Error('require not available in browser'); };
const fakeProcess = { env: {}, stderr: { write: () => {} }, argv: [] };

const fn = new Function(
  'module', 'require', 'process', '__dirname', '__filename', 'exports',
  simSource
);

try {
  fn(m, fakeRequire, fakeProcess, '/', 'sim2.js', m.exports);
} catch (e) {
  console.error('sim2.js load error:', e);
}

export const {
  CFG,
  SK,
  FAMILIES,
  TREASURES,
  simulateBuild,
  selectSkillsForBuild,
} = m.exports;

// Vite HMR: sim2.js (?raw) 변경 시 전체 페이지 리로드 (수작업 new Function 캐시 무효화)
if (import.meta.hot) {
  import.meta.hot.accept(['../../../sim2.js?raw'], () => {
    import.meta.hot.invalidate();
  });
}

// 카테고리 묶음
export const CATEGORIES = ['영검', '화염', '뇌전', '백족'];
export const FAMILIES_BY_CAT = CATEGORIES.reduce((acc, c) => {
  acc[c] = Object.keys(FAMILIES).filter((f) => FAMILIES[f].cat === c);
  return acc;
}, {});
export const TREASURE_NAMES = Object.keys(TREASURES);
