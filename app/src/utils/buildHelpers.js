// 빌드 유효성 검사 + 라벨 생성
// 제약 없음: 합 = 6 이기만 하면 임의 분배 허용 (1슬롯 유파 포함)
export function validateBuild(slotMap) {
  const total = Object.values(slotMap).reduce((a, b) => a + b, 0);
  if (total !== 6) return `총 슬롯이 6이어야 합니다 (현재 ${total})`;
  for (const [f, v] of Object.entries(slotMap)) {
    if (v < 0) return `${f} 슬롯은 0 이상`;
    if (v > 4) return `${f} 슬롯은 최대 4 (유파당 신통 4개)`;
  }
  return null;
}

export function buildArray(slotMap) {
  return Object.entries(slotMap)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([f, v]) => [f, v]);
}

export function buildLabel(slotMap) {
  return buildArray(slotMap)
    .map(([f, v]) => `${f} ${v}`)
    .join(' + ');
}

export function defaultOrder() {
  const o = [];
  for (let i = 0; i < 6; i++) o.push({ kind: 'skill', idx: i });
  for (let i = 0; i < 3; i++) o.push({ kind: 'treasure', idx: i });
  return o;
}
