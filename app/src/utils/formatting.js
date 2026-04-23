// 한국어 큰 숫자 포맷 (억/만 단위)
export function formatKR(n) {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const sign = n < 0 ? '-' : '';
  const x = Math.abs(n);
  if (x >= 1e8) {
    const eok = x / 1e8;
    return sign + eok.toLocaleString('ko', { maximumFractionDigits: 2 }) + '억';
  }
  if (x >= 1e4) {
    const man = x / 1e4;
    return sign + man.toLocaleString('ko', { maximumFractionDigits: 1 }) + '만';
  }
  return sign + Math.round(x).toLocaleString('ko');
}

export function formatFull(n) {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return Math.round(n).toLocaleString('en');
}

export function formatPct(n, digits = 1) {
  return (n ?? 0).toFixed(digits) + '%';
}

// 초 → "45초" / "2분 15초" / "1시간 5분" 자동 변환
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}초`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m}분` : `${m}분 ${r}초`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
