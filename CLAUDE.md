# 검선귀환 신통 시뮬레이터

## 프로젝트 구조
- `sim2.js` — 메인 시뮬레이션 엔진. 모든 신통/법보/유파/옵션 로직 포함. 다른 스크립트가 전부 이걸 로드함.
- `rank.js` — 전체 빌드 랭킹 (533개 빌드 × 법보 조합, 순서 휴리스틱 최적화 포함)
- `rank_thunder.js` — 뇌전(청명4) 빌드만 9! 전수탐색 순서 최적화. 빌드당 362,880순열 탐색. 약 26분 소요.
- `optimize.js` — Top 10 빌드 9! 전수탐색
- `trace.js` — 화염 1위 빌드(열산4+청명2) 1회 상세 전투 로그 출력
- `trace_thunder.js` — 뇌전 1위 빌드(청명4+주술2) 1회 상세 전투 로그 출력

## ⚠️ Git Push 워크플로우 (중요)

이 폴더는 **git 저장소가 아니다**. 별도 git repo와 수동 동기화 후 push.

### 경로
- **로컬 작업 폴더 (현재)**: `C:/Users/ljc47/Pictures/BlueStacks/검선귀환 신통/` ← 여기서 코드 수정
- **Git 저장소**: `C:/Users/ljc47/sword-immortal-sim/` ← 동기화 + commit + push
- **Remote**: `https://github.com/duracen/sword-immortal-sim.git` (origin/main)

### Push 절차
1. 로컬 폴더와 git 저장소의 차이 확인:
   ```bash
   diff -rq "C:/Users/ljc47/Pictures/BlueStacks/검선귀환 신통" "C:/Users/ljc47/sword-immortal-sim"
   ```
2. 변경된 파일을 git 저장소로 복사 (cp). **gitignore된 파일 제외:**
   - `*.docx` (검선귀환_신통_정리.docx 등 — 로컬에서만 재생성)
   - 스크린샷 (`*.png`)
   - 로그 (`*위빌드_상세로그.txt`, `trace_output.txt`, `빌드_랭킹_결과.txt`)
   - 자료 폴더 (`/검/`, `/뇌/`, `/백족/`, `/불씨/`, `/비술/`, `/화/`)
3. `cd /c/Users/ljc47/sword-immortal-sim && git add -A && git commit -m "..." && git push origin main`

### 주의사항
- main 직접 push 가 sandbox 에서 차단될 수 있음 → 권한 다이얼로그에서 Allow
- 개인 프로젝트라 main 직접 push 가 정상 워크플로우 (PR 안 씀)
- commit 메시지 스타일: `sim/UI: [요약]` 또는 `sim: [요약]` (한글 OK)

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
- per-cast 작열부여 트리거(치황 지속, 흑성 지속, 점화 지속, 광염 지속)는 cast() 전에 실행됨

---

# 📚 buff/debuff/큐/stack 매커니즘 정리 (사양 검증 완료)

## 핵심 용어 정의

| 용어 | 정의 | 예 |
|------|------|------|
| **buff** | 자기에게 적용되는 효과 (atk/cr/cd/dealt/inc/amp 등) | 명소 atk +20%, 검심통명 inc +20% |
| **debuff** | 적에게 적용되는 효과 (defDebuff/crRes/finalDmg+ 등) | 둔검 def -25%, 영역_심연 finalDmg +20% |
| **큐 (Queue)** | buff/debuff 의 실제 누적 (FIFO 동작) | 뇌인 4큐, 검세 10큐, 화상 N큐 |
| **stack** | 트리거 발동용 누적 카운터 (우리 추상, 큐와 별개) | 뇌인 stack 4 → 천벌, 검세 stack 3 → 천검 |

### 통합 모델: 모든 buff/debuff = 큐
- maxQueue=1 = 단일 효과 (갱신 = 1↔1 FIFO 교체)
- maxQueue>1 = 누적 효과 (cap 도달 시 oldest dequeue + 새 enqueue)
- 각 element 자체 TTL (사양 명시 시) 또는 영구 보존 (TTL 명시 X)

### stack 동작 패턴 (염양 스타일 carry-over)
```
매 트리거 이벤트:
  stack += 1
  while stack >= N:
    stack -= N
    fire 효과
```
"쌓이면 비우고 쌓이면 비우고" — 큐와 별개로 누적, 임계 N 도달 시 발동.

---

## 큐 (buff/debuff) 매트릭스

### A. 유파/계열 키워드 (시스템 정의 큐)
| 큐 | TTL | cap | 효과 | 소속 |
|----|-----|-----|------|------|
| **뇌인** | 20s 개별 (사용자 검증) | 4 FIFO | cr +5%/큐 | 청명 유파 |
| **검세** | 20s 개별 (사용자 검증) | 10 FIFO | amp +1.5%/큐 | 균천 유파 |
| **옥추** | 20s 개별 (사용자 검증) | 10 FIFO | inc +1%/큐 | 옥추 유파 |
| **신소** | 20s 개별 (사용자 검증) | ∞ | dealt +N%/큐 | 신소 유파 |
| **검심** | **TTL 없음** (사양 명시 X) | ∞ | dealt +N%/큐 | 참허 유파 |
| **작열** | 20s 개별 (사양: "1중첩당 별도") | ∞ | DoT (각 큐 별도 데미지) | 화염 계열 공통 |

### B. 법체 부수 효과
| 큐 | TTL | cap | 효과 | 소속 |
|----|-----|-----|------|------|
| **화상** | 20s | ∞ (사양 cap 명시 X) | def -2%/큐 | 현염법체 2+ |
| **계약** (4 type) | 20s shared (사양: "20초간") | 5/type | def/cr/inc/amp +6%/큐 | 백족법체 만고귀종 |
| **독고** (4 type) | 20s shared (사양: "20초간") | 5/type | def/cr/inc/amp -2.5%/큐 | 백족법체 (격발 대상) |

### C. 불씨 세트
| 큐 | TTL | cap | 효과 |
|----|-----|-----|------|
| **진마성화** | **TTL 없음** (사양 명시 X) | 10 reject | amp +N%/큐 (3개 +1%, 6개 +3%) |

### D. 법상 시스템 (빙의 active 동안)
| 큐 | TTL | cap | 효과 | 소속 |
|----|-----|-----|------|------|
| **교혼** | 20s 개별 | 10 FIFO | atk +6%/큐 | 청교룡 |
| **염혼** | 빙의 lifetime | 누적 | 종료 시 cleanup damage | 적난새 의념 |
| **염백** | 20s 개별 | 20 FIFO | atk +1%/큐, 받는 -1%/큐 | 금오 의념 |
| **용의 예가** | 20s 개별 | 5 FIFO | 적 받는 +5%/큐, 입히는 -5%/큐 | 청룡 실체 |
| **용의 위엄** | 20s 개별 | 5 FIFO | cr +3%/큐 | 청룡 진령 |
| **적혼** | 20s 개별 | 5 FIFO | dealt +5%/큐, 받는 -5%/큐 | 주작 실체 |
| **진룡 각인** | 20s 개별 | 5 FIFO | dealt +5%/큐, 받는 -5%/큐 | 진룡 실체 |
| **봉황 각인** | 20s 개별 | 5 FIFO | 적 받는 +5%/큐, 입히는 -5%/큐 | 봉황 실체 |

### E. 신통 옵션 buff/debuff (applyBuff)
모두 사양 명시된 TTL/cap 으로 동일 매커니즘.

#### 자기 buff (예시)
| 큐 | TTL | cap | 효과 |
|----|-----|-----|------|
| 명소 | 5s | 1 | atk +20% |
| 순요 | 5s | 1 | atk +25% |
| 환우 | 10s | 1 | cr +20% |
| 뇌벌 | 10s | 1 | atk +30% |
| 종식 | 10s | 1 | atk +30% |
| 통찰 | 15s | 1 | cr +30% |
| 양운 | 5s | 5 | atk +15%/큐 |
| 겁염 | 5s | 5 | atk +8%/큐 |
| 여진 | 10s | 5 | atk +12%/큐 |
| 마찰 | 15s | 3 | cr +15%/큐 |
| 검심통명 | 10s | 1 | inc +20% |
| 검망 | (이번 천검) | 6 | 천검 dealt +40% |

#### 적 debuff (예시)
| 큐 | TTL | cap | 효과 |
|----|-----|-----|------|
| 둔검 | 10s | 1 | defDebuff -25~35% |
| 파세 | 15s | 1 | crRes -30% |
| 검흔 | 10s | 1 | defDebuff -30% |
| 절진 | 10s | 1 | crRes -20% |
| 귀진 | 10s | 1 | defDebuff -20% |
| 붕연 | 5s | 5 | defDebuff -8%/큐 |
| 동허 | 10s | 5 | defDebuff -7%/큐 |
| 굉명 | 10s | 3 | defDebuff -20% |

### F. 영역 (법칙)
| 큐 | TTL | cap | 종류 |
|----|-----|-----|------|
| 영역_열반_조건부 (HP<70 시 inc +10%) | 10s | 1 | 자기 buff |
| 영역_심연_받는피해 (적 받는 +20%) | 10s | 1 | 적 debuff |

### G. 비술 (마주)
| 큐 | TTL | cap | 효과 |
|----|-----|-----|------|
| 분혼 봉인 | 10~15s | n/a | 적 봉인 |
| 분혼 호신강기 심화 | 10s | 1 | 자기 buff |
| 식혼·진 cr buff | 140s | 1 | cr +9~19% |
| 악신 분신 | 15s | 1 | (분신 시뮬) |
| 혼원 신통차단 | 12s | 1 | 적 debuff |
| 업화 멸신 | 10s | 1 | 자기 buff |

---

## stack (트리거 카운터) 매트릭스

| stack | 임계 N | 트리거 이벤트 | 발동 효과 |
|------|------|------------|---------|
| **뇌인 stack** (`뇌인_누적`) | 4 | 신통 명중 + 영역대결 시작 | **천벌 발동** (10s 천뢰 효과) |
| **검세 stack** (`검세_누적`) | 3 | 신통 명중 + 영역대결 시작 | **천검 발동** |
| **진룡 각인 stack** (`법상_진룡각인_누적`) | 3 | 빙의 중 신통/법보 명중 | **용의 숨결 700%** 광역 |
| **작열부여 stack** (`작열부여_누적`) | 6 | 작열 부여 (열산 유파 active) | **열산상태 buff (10s amp +10%) + 염양 발동 (80%×슬롯)** |
| **영역 cast stack** (`영역_누적`) | 10 (CD 180s) | cast (신통/법보) | **영역 발동** |
| **악신·진 cast stack** | 4 | 신통/법보 cast | 분신 발동 |
| **악신·허 cast stack** | 5 | 신통/법보 cast | 분신 발동 |
| **업화 누적공격** | 5 | 신통/법보 명중 | 업화 DoT |
| **검영 히트** | 5 | 피해 5회 입힘 | 8% 호무 (max 20회) |
| **동허 히트** | 5 | 피해 5회 입힘 | def -7% buff |
| **열천 히트** | 10 | 피해 10회 입힘 | 효과 발동 |
| **진룡 공격카운터** | 2 | 빙의 중 cast | 청령 250% (의념) |
| **응현 발동** | 1 | 검심 획득 | atk +8% buff (max 5회 발동) |

### stack 의 특징
- **buff/debuff 의 큐 와 무관** — 큐가 dequeue 되어도 stack 은 누적 유지
- **TTL 없음** (큐 는 만료 가능, stack 은 cast 단위)
- **carry-over** — 임계 N 도달 시 -=N (소멸 X, 잔여 누적)

### TTL 없는 큐 vs stack 비교
- **TTL 없는 큐 (검심/진마성화)**: 큐 자체가 누적값 — stack 불필요
  - 검심: 큐 10 도달 → 큐 -10 dequeue → 검심통명 buff
  - 진마성화: 큐 10 도달 → 더 안 쌓임 (cap reject), 트리거 X
- **TTL 있는 큐 (뇌인/검세/진룡각인)**: 큐 가 시간 따라 줄어듦 — 별도 stack 필요

---

## 격발 시스템 (만고귀종, 백족법체)

### 동작
1. **독고 debuff** (4 type 큐) 누적 — 만고귀종 발동 시 4 type 균등 분수 분배 (eff/4 each)
2. **격발** = 독고 -2 큐 dequeue → 광역 75% + 계약 +1 큐 enqueue
3. **계약 buff** (4 type 큐) — 격발 결과로 획득

### 격발 vs 획득 명확 구분
- **독고**: 격발 **대상** (소비됨)
- **계약**: 격발의 **결과** (받음)
- 사양: "독고를 격발 및 소모하여 ... 계약을 1중첩 획득한다"

---

## ⚠️ 매커니즘 변경 전 필수 절차 (강제)

### 절차 (매 변경마다 반복)
1. **사양 원문 인용** — `신통_정리.md` 또는 `검선귀환_신통_정리.docx` 에서 해당 키워드/효과의 원문 찾기
2. **명시된 정보만 적용**:
   - TTL (지속시간) — 사양에 명시된 경우만 적용. 명시 없으면 TTL 없음.
   - Cap (최대 중첩) — 사양에 명시된 값만 사용
   - 트리거 조건 — 사양 wording 그대로 (예: "획득할 때마다" vs "도달 시" 구분)
   - 소비/획득 구분 — 격발 (소비 측) vs 획득 (받는 측) 명확히 분리
3. **추측 금지** — "다른 buff 도 그러니까 이것도 그럴 거야" 같은 일반화 추측 금지
4. **이전 변경의 맥락에 의존하지 말 것** — 매번 사양 직접 재확인

### 키워드 이름 변경/치환 작업 시 (강제)
사용자가 "X → Y" 로 이름 바꾸라고 할 때:
1. **먼저 Grep `X` 으로 모든 발생 위치 나열**
2. **각 위치마다 맥락 검토**:
   - 변경 대상 키워드 (예: 적난새 영혼) — 수정
   - 같은 글자 쓰는 다른 키워드/단어 (예: 환영혼, 영혼력 등) — 보존
3. **`replace_all: true` 금지** — 위치별로 명시적 `Edit` 사용
4. 실수로 다른 맥락이 바뀌면 데이터 무결성 손상

### 예시 (영혼 → 염혼 작업 시)
- ❌ `Edit replace_all: true` 로 "영혼" 모두 "염혼" 변경
- ✓ Grep "영혼" 으로 listing → 적난새 맥락만 식별 → 개별 Edit

### 명칭 사용 일관성 (강제)
- **버프/디버프** = 게임 내 효과 (자기 적용 / 적 적용)
- **큐 (Queue)** = 실제 중첩 슬롯 (FIFO 동작, 게임 데이터 존재)
- **스택 (stack)** = 시뮬레이터에서 추가한 트리거 카운터 (`state.X누적`)
- **격발** = 자원 소비 발동 (예: 독고 격발) / **획득** = 효과 받음 (예: 계약 획득)
- 큐와 스택을 혼동해서 부르지 말 것 (예: "중첩 = 스택" 같은 약식 표현 금지)

---

## 통합 큐 모델 구현 (applyBuff)

```js
function applyBuff(state, key, spec, dur, maxStack = 1) {
  // 모든 buff/debuff = 큐 (endTs 배열, FIFO)
  const ex = state.buffs.find(b => b.key === key && b.endT > state.t);
  const newEndT = state.t + dur + 0.001;
  if (ex) {
    if (!ex.endTs) ex.endTs = [ex.endT];
    ex.endTs.push(newEndT);  // enqueue
    while (ex.endTs.length > maxStack) ex.endTs.shift();  // FIFO dequeue at cap
    ex.stackCount = ex.endTs.length;
    ex.endT = Math.max(...ex.endTs);
    return;
  }
  state.buffs.push({ key, endTs: [newEndT], endT: newEndT, stackCount: 1, ...spec });
}

// prune (매 event 시작 시)
for (const b of state.buffs) {
  if (!b.endTs) b.endTs = [b.endT];
  b.endTs = b.endTs.filter(et => et > state.t - 0.1);
  b.stackCount = b.endTs.length;
  b.endT = b.endTs.length > 0 ? Math.max(...b.endTs) : 0;
}
state.buffs = state.buffs.filter(b => b.endT > state.t - 0.1);
```

### 핵심 원칙
1. **모든 buff/debuff = 큐 모델 통일** — maxStack 1 도 큐 (1↔1 FIFO = 갱신)
2. **각 element 자체 TTL** — 사양 명시 시 개별, 명시 X 시 영구
3. **stack 은 큐와 분리** — 트리거 카운터는 별도 변수 (state.X누적 등)

---

## 사용자 검증된 인게임 동작

### 천벌 발동 시퀀스 (영역=제왕의 정 빌드)
- **22s** (cast 4): 뇌인 stack 0→4 → **1st 천벌**
- **45s** (cast 10 + 영역대결 시작): 뇌인 stack 4 → **2nd 천벌**
- **59s** (cast 14): 뇌인 stack 4 → **3rd 천벌**

### 뇌인 큐 변화 (TTL 20s, cap 4 FIFO)
- 13~22s: 뇌인 0~4 누적 (cast 1~4)
- 25/28s: cap 4 FIFO 교체 (oldest 13/16 dequeue, 25/28 enqueue)
- 35/38/41/44s: TTL 만료로 staggered dequeue (4→3→2→1→0)

### 인게임 검증된 사실
- 뇌인 큐 TTL = 20s (사용자 인게임 관찰)
- 영역대결 시작도 "임의 신통" 으로 취급 → stack +1 트리거
- 영역대결 종료는 stack 트리거 X
- 천벌 active 10s 동안 재발동 X (CD 효과)

---

## 주요 데이터 구조

### state 변수 (sim2.js newState)
```js
// 큐 (buff/debuff)
state.buffs              // applyBuff 통합 큐 (all buffs/debuffs)
state.뇌인_stacks        // 뇌인 큐 (자체 관리, applyBuff 외)
state.검세_stacks        // 검세 큐
state.옥추_stacks        // 옥추 큐
state.신소_stacks        // 신소 큐
state.작열Arr            // 작열 큐 (DoT 별도 처리)
state.화상_stacks        // 화상 큐
state.법상_진룡각인_stacks  // 진룡 각인 큐
state.stacks.검심        // 검심 큐 (TTL 없음, 단순 카운터)
state.진마성화스택       // 진마성화 큐 (TTL 없음, cap 10 reject)
state.독고[type]         // 독고 큐 (4 type, fractional)
state.독고EndT[type]     // 독고 type별 shared TTL

// stack (트리거 카운터)
state.뇌인_누적           // 천벌 트리거
state.검세_누적           // 천검 트리거
state.법상_진룡각인_누적 // 700% 트리거
state.작열부여_누적     // 열산상태 + 염양 트리거
state.영역_누적   // 영역 트리거
state.업화_누적      // 업화 DoT 트리거

// 시간 기반 state (TTL only)
state.천벌End, state.천검End          // 효과 active 종료
state.영역_천위End, state.영역_심연End // 영역 자기 buff active
state.응현End, state.천연End, state.관일End // 옵션 발동 창
state.봉인EndT (분혼), state.악신EndT (악신)  // 비술 effect active
state.업화멸신End, state.혼원_신통차단EndT
state.식혼_atk (식혼)                   // 식혼 buff
state.법상_빙의시작T, state.법상_빙의종료T   // 법상 빙의 active
state.영역_pendingFireT                  // 영역 발동 예약
```


---

# ⚠️ UI/시뮬 디버깅 절차 (강제)

사용자가 `화면이 이상하다` `여전해` `동일하다` 라고 할 때 — **추측 금지, 직접 검증.**

## 1. 절대 하지 말 것

- ❌ `캐시 문제` `HMR 미반영` `React Refresh 안 됨` 같은 추측을 먼저 들이대지 말 것
- ❌ `Vite 재시작 / 페이지 reload 한 번만 해줘` 라고 사용자에게 떠넘기지 말 것 — Claude Preview 인스턴스 1개라 사용자 화면 = 내 화면이고, reload 하면 사용자 시뮬 결과까지 같이 사라짐
- ❌ 사용자가 같은 문제를 2번 이상 지적 → 추가 변경 시도 X. **검증 먼저.**
- ❌ `location.reload()` `preview_stop / preview_start` `vite restart` 를 명시적 요청 없이 시도하지 말 것

## 2. 검증 절차 (이 순서대로)

### Step 1 — 사용자 의도 정확히 정리
- 사양 원문 (`신통_정리.md` / 사용자 메시지) 인용
- 어떤 셀/위치/길이가 어떻게 되어야 하는지 명확히 (예: `약영의 현미 +45 → 받은 cast(붕산) 셀에만 표시 → width = 다음 cast 까지`)

### Step 2 — 디스크/Vite 코드 적용 여부 확인
```js
// preview_eval 로:
await import('/@fs/<absolute-path>/file.jsx?raw&t=' + Date.now())
  .then(m => m.default.includes('checkString'))
```

### Step 3 — React 가 실제 사용 중인 코드 확인
```js
// fiber 통해 현재 사용 중인 컴포넌트 함수 source 직접 추출
let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber\$'))];
while (fiber) {
  if (fiber.type?.name === 'ComponentName') return fiber.type.toString().includes('checkString');
  fiber = fiber.return;
}
```

### Step 4 — 직접 시뮬 실행 (사용자 부담 없이)
```js
const m = await import('/src/engine/index.js?t=' + Date.now());
const { simulateBuild, CFG, SK } = m;
const events = [];
CFG.trace = (t, tag, msg) => events.push({ t, tag, msg });
// skillsOverride 는 객체 배열 ([{ name, fam }]):
const skills = skillNames.map(n => ({ name: n, fam: SK[n].fam }));
simulateBuild(build, treasures, null, skills, { maxTime: 70, ...opts });
CFG.trace = null;
// SNAP events 추출해서 cast 별 finalDmg/매핑 검증
```

### Step 5 — useMemo 결과 / casts 배열 직접 검사
```js
// fiber.memoizedState 의 hooks linked list 순회 → useMemo 결과 추출
let hook = fiber.memoizedState;
while (hook) {
  if (Array.isArray(hook.memoizedState) && hook.memoizedState[0]?.casts) {
    return hook.memoizedState[0].casts;  // 매핑된 snap 까지 포함
  }
  hook = hook.next;
}
```

## 3. 핵심 원칙

- **로직 자체를 먼저 의심.** 캐시/HMR 은 마지막 의심.
- 변경 후 **반드시 직접 검증** (Step 2~5) 후 사용자에게 결과 제시
- 사용자가 같은 문제 2번 지적 → 추가 변경 X, 검증 raisé
- `simulateBuild` 직접 호출 가능 — 사용자 시뮬 부담 없이 events 받아 분석
- React 컴포넌트의 `useMemo` 결과는 events deps 가 같으면 캐시 — events 가 새 reference 인지 확인
- `Claude Preview` 인스턴스는 사용자 화면과 동일. `preview_eval` 의 reload 명령은 사용자 화면도 같이 reset

## 4. emitSnapTrace 흐름 (sim2.js)

각 cast 종료 시 호출. `snap.finalDmg` 가 어디서 push 되는지 흐름:

| Push | Source | 의미 | 사용자 의도 (현재 사양) |
|------|--------|------|---------|
| `nc.finalDmg` | 부여한 cast 의 다음 nextCast 값 | 부여 직후 셀 표시 | **제거됨** (부여한 cast 셀 X) |
| `ncSnap.consumedSources` | 받은 cast 가 소비한 nextCast | 받은 cast 셀 표시 | **유지** (받은 cast 셀 ✓) |
| `ncSnap.finalDmg` (else) | 받은 cast 의 ncFinalDmg fallback | consumedSources 가 없을 때 | 제거됨 |
| `ncSnap.localFinalDmg` | 본 cast 한정 (예: 통백 +20) | 그 cast 자체 한정 buff | 제거됨 (단순화) |

## 5. CastTimelineSummary 셀 width 룰

- nextCast 류 stat (finalDmg/finalCR/finalCD): width = `다음 cast 시점까지` (= 1회 적용 후 끝)
- 시간 기반 buff (atk/cr/cd 등): width = `다음 cast 시점까지` (cast 간격)
- `다음 신통 cast` 가 아닌 `다음 cast` (법보 포함) — 받은 buff 는 그 cast 자체에 1회 적용 후 끝나므로
