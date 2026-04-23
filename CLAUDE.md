# 검선귀환 신통 시뮬레이터

## 프로젝트 구조
- `sim2.js` — 메인 시뮬레이션 엔진. 모든 신통/법보/유파/옵션 로직 포함. 다른 스크립트가 전부 이걸 로드함.
- `rank.js` — 전체 빌드 랭킹 (533개 빌드 × 법보 조합, 순서 휴리스틱 최적화 포함)
- `rank_thunder.js` — 뇌전(청명4) 빌드만 9! 전수탐색 순서 최적화. 빌드당 362,880순열 탐색. 약 26분 소요.
- `optimize.js` — Top 10 빌드 9! 전수탐색
- `trace.js` — 화염 1위 빌드(열산4+청명2) 1회 상세 전투 로그 출력
- `trace_thunder.js` — 뇌전 1위 빌드(청명4+주술2) 1회 상세 전투 로그 출력

## 실행 방법
모두 Node.js만 있으면 됨. 의존성 없음.

```bash
node rank_thunder.js          # 뇌전 빌드 9! 전수탐색 (~26분)
node rank.js                  # 전체 빌드 랭킹 (~3분)
node trace.js                 # 화염 1위 상세 로그
node trace_thunder.js         # 뇌전 1위 상세 로그
node optimize.js              # Top 10 전수탐색
```

## sim2.js 수정 시 주의사항
- 원문 docx와 반드시 교차 검증할 것
- 피해 공식: `base × (1+atk%) × (1+inc%) × (1+amp%) × critMult × finalDmg × lawBonus × defMult`
- 작열 DoT는 크리티컬 안 터짐 (dealDotDamage 사용)
- 평타는 95% 감소 적용 (`* 0.05`)
- 작열 부여카운터는 6마다 열산유파 발동 후 리셋 (스택 소모 아님)
- per-cast 작열부여 트리거(치황 지속, 흑성 지속, 점화 지속, 광염 지속)는 cast() 전에 실행됨
