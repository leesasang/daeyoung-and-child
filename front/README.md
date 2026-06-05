# 🎓 ClassFit: 대학교 강의실 통합 예약 및 공강 최적화 시스템
> **학업 자원 배정 효율성 극대화를 위한 다국어(KO/EN) 통합 학사 행정 지원 포털**

---

## 📌 1. 프로젝트 개요 (Introduction)
**ClassFit**은 대학 캠퍼스 내 한정된 자원인 강의실의 사용률을 극대화하고, 보강 수업 계획 수립, 공강 시간 유효 활용, 학사 장비 배치 제어를 위해 고안된 **통합 학사 예약 포털**입니다. 

기존의 단순 수동식 예약 시스템에서 벗어나, 시스템 내부적으로 **고급 컴퓨터 과학 핵심 자료구조 및 알고리즘 네트워크**를 탑재하여 실시간 예약 정합성 보장, 다차원 강의실 정렬 및 탐색, 빈 시간대(연속 공강) 추적, 자동대체 강의실 추천, 전역 행동 이력 제어(Undo/Redo)를 동기식 라이프사이클로 제어합니다. 본 시스템은 가천대학교 고유 아이덴티티인 가천블루(`#005BAC`) 컬러를 중심 톤으로 한 직관적 인터페이스와 완벽한 다국어(KO/EN) 대응을 준수합니다.

---

## 🏗️ 2. 시스템 아키텍처 및 전체 흐름 (System Flow)

사용자가 자격에 맞춰 로그인한 첫 진입 순간부터 예약을 확보하고 예외 상황을 처리하기까지의 전체 데이터 파이프라인 흐름은 다음과 같습니다.

```
+-------------------------------------------------------------------------------+
|                             [ 1. User Ingress ]                               |
|        - Student / Professor / Administrator Multi-role Login                 |
|        - Verify credentials utilizing mock SQL & Linked List verification     |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                      [ 2. Main Dashboard & Searching ]                        |
|        - Set search criteria (Building, Capacity, Equipment features)        |
|        - Multi-criteria Ordering: Optimized through O(N log N) Quick Sort     |
+-------------------------------------------------------------------------------+
                                        |
               +------------------------+------------------------+
               | (Path A)                                        | (Path B)
               v                                                 v
+----------------------------------------------+ +----------------------------------------------+
|     [ 3A. Interactive Booking ]              | |       [ 3B. Consecutive Vacancy Finder ]     |
| - Standard Form Booking: Select specific Date | | - Target search with Slider parameters       |
|   and Period range blocks.                   | | - Calculate with Sliding Window & Priority Q |
| - Security Guard: Double-check overlapping   | | - Dynamic Accordion shows beautiful, interactive|
|   time via Binary Search & Hash Map caching. | |   "Everytime-style" vertical timeline slots.  |
+----------------------------------------------+ +----------------------------------------------+
               |                                                 |
               |                                                 | (On Free Block click)
               | (If Overlap Detected / Conflict Alert)          v
               v                                 +----------------------------------------------+
+----------------------------------------------+ |           [ 4. Instant Action ]              |
|       [ 5. Alternate BFS Matcher ]           | | - Instant Reservation entry is written      |
| - Scan adjacent locations & optimal capacity | |   directly into local session.               |
| - Breadth-First Search (BFS) distance map.   | | - Sync counts with history tracker.          |
| - Instantly recommendation switch available. | +----------------------------------------------+
+----------------------------------------------+                         |
               | (On Switch click)                                       |
               +------------------------+--------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                        [ 6. Universal History Loop ]                          |
|        - Active state mutation added to double LIFO stack managers (Undo/Redo)  |
|        - One-click rollback through unified `<HistoryController />` widget    |
+-------------------------------------------------------------------------------+
```

---

## 🛠️ 3. 팀원별 담당 자료구조 및 알고리즘 명세 (Core Modules)

ClassFit은 4인의 핵심 개발진이 긴밀히 연계되어 하드코딩 없는 소프트웨어 설계 표준을 이행했습니다.

| 담당자 | 담당 기능 및 모듈 | 적용 핵심 자료구조 (Data Structure) | 구현 알고리즘 (Algorithm) | 기술적 특이사항 및 상세 역할 |
| :---: | :--- | :---: | :---: | :--- |
| **팀원 A<br>(PM)** | **실시간 예약 및 충돌 검증**<br>`src/algorithms/conflict_check.ts` | **Hash Map**<br>(예약 데이터 일차 색인 캐싱)<br>**Binary Search Tree (BST) 객체** | **이진 탐색 (Binary Search)** | - 특정 일자 및 강의실의 예약 목록을 고속 스캔하기 위해 이중 Hash Map 캐시 저장소를 설계.<br>- 예약 시간(교시)의 오버랩 검증 속도를 $O(\log N)$ 단위로 단축하기 위한 정렬 및 이진 탐색 기법 응용. |
| **팀원 B** | **다기준 다목적 검색 및 정렬**<br>`src/algorithms/quick_sort.ts`<br>`src/algorithms/db_and_auth.ts` | **연결 리스트 (Linked List)** | **퀵 정렬 (Quick Sort)** | - SQL 데이터 구조 인프라를 연결 리스트로 추상화하여 회원가입 및 로그인 절차 구동.<br>- 수용 능력(Capacity), 우선순위 점수, 강의실 번호 등을 기반으로 정밀 다차원 분리 정렬을 피벗팅 기반의 퀵 정렬 구조로 구현. |
| **팀원 C** | **연속 공강 분석 대시보드**<br>`src/algorithms/sliding_window.ts` | **우선순위 큐 (Priority Queue)**<br>(Heap 역직렬 가중합 정렬) | **슬라이딩 윈도우 (Sliding Window)**<br>+ **SQL GROUP BY** 시뮬레이션 | - 사용자가 지정한 크기 $K$(연속 교시 간격)에 유효한 빈 슬롯 세그먼트 배열을 슬라이딩 윈도우 기법으로 윈도우 시프트 연산.<br>- 누적 점유도, 수용 능력 가중합 계산 후 우선순위 큐에 담아 아카데믹 우선순위가 높은 강의실부터 정밀 오름/내림차순 인덱싱. |
| **팀원 D** | **전역 행동 이력 제어 & 보강 최단 대체**<br>`src/algorithms/history_manager.ts`<br>`src/algorithms/bfs_recommender.ts` | **이중 LIFO 스택 (Double LIFO Stack)**<br>(Undo / Redo Stack 리드) | **너비 우선 탐색 (BFS)** | - 전역 행동(추가/삭제) 데이터를 트랙킹하여 롤백 제어가 가능한 메모리 기반의 스택 프레임 설계.<br>- 예약 충돌 발생 시 인접 빌딩 노드들을 그래프 구조로 순차 스캔하여 적격한 최단 접근 강의실을 선형 스캔 대비 고도의 정확도로 매칭. |

---

## 🗂️ 4. 디렉토리 파일 구조 (Directory Structure)

본 프로젝트는 독립적인 React(TypeScript) + Tailwind CSS SPA 설계 형태로 컴포넌트 단위의 극대화된 모듈성과 유지 보수성을 목표로 조직되어 있습니다.

```bash
/
├── .env.example               # 추가 요구 환경인프라 명세서
├── metadata.json              # 앱 고유 권한 및 기능 메타데이터 설정
├── package.json               # 의존성 라이브러리 및 배포 빌드 스크립트 지정
├── index.html                 # 싱글 페이지 어플리케이션(SPA) 루트 포탈 파일
├── vite.config.ts             # 고속 번들러 빌드 제어 설정 파일
└── src/
    ├── main.tsx               # 클라이언트 런타임 진입 인덱스 스크립트
    ├── App.tsx                # 가상 라우터 제어 및 유저 세션 가이트 총괄
    ├── index.css              # Gachon Blue 스타일 변수 선언 및 Tailwind CSS 통합 파일
    ├── types.ts               # Classroom, Reservation, User 데이터 형식 타입 계약부
    ├── localization.ts        # LANG_DICT 다국어(한국어/영어) 매핑 딕셔너리 리소스
    ├── components/            # 시각 구조 레이어 추출 독립 컴포넌트 컬렉션
    │   ├── HistoryController.tsx  # [공통] 시각 수평 통일된 Undo/Redo 제어 유틸 위젯
    │   ├── LoginGate.tsx         # 연결 리스트 인증 기반 통합 계정 관문
    │   ├── StudentView.tsx       # 학생용 다중 정렬 예약 및 이력 확인 패널
    │   ├── ProfessorView.tsx     # 교수 보강용 공강 대시보드 및 예약 제어 패널
    │   └── AdminView.tsx         # 관리자 전용 등록/수정/통계 제어 패널
    └── algorithms/            # 백엔드 엔진 연동용 자료학적 알고리즘 파일 세트
        ├── db_and_auth.ts        # Local Storage 연동 Mock 데이터베이스 (인증 유틸)
        ├── conflict_check.ts     # BST & 이진 탐색 활용 최속 예약 중독 필터
        ├── quick_sort.ts         # 분산 퀵 정렬 다차원 필터링 알고리즘
        ├── sliding_window.ts     # 슬라이딩 윈도우 기반 시간대 빈 강의실 정렬 스캐너
        ├── bfs_recommender.ts    # 인근 최적대안 탐색 BFS 그래프 매칭 스위치
        └── history_manager.ts    # LIFO 더블 스택 전역 액션 이력 매니저
```

---

## 💡 5. 사용자 경험(UX) 및 디자인 하이라이트 (Design Highlights)

ClassFit은 "디테일한 디바이스 마감과 일관적인 전역 사용자 여정"을 선사하는 고급 UI 설계 기법들이 대거 적용되어 있습니다.

*   **에브리타임 스타일 시간표 아코디언 매칭:**
    *   교수의 '연속 공강 강의실 보고서' 테이블 내부에서 난해한 텍스트 리스트 대신, 각 강의실 클릭 시 하단으로 미려하게 밀려 내려오는 **세로 타임라인 그리드**가 전개됩니다.
    *   이미 정규화되었거나 타인이 선점한 교시는 **배경을 톤다운(Disabled 회색) 하고 "예약 완료" 마커**를 부착해 불필요한 액션을 원천 차단합니다.
    *   사용 가능한 오프라인 교시는 **두터운 가천블루 아웃라인 피팅 처리와 함께 "즉시 예약하기" 버튼**이 인터랙티브하게 마우스 반응을 보이며 직관성과 클릭 가용성을 확장해 줍니다.
*   **완벽한 순수 한국어 매핑 (Zero Hybrid Language):**
    *   언어 설정을 `KO(한국어)`로 활성화 시켜 가동하는 공간 속에 'Disabled', 'Streak', 'Refund'와 같은 지저분한 이종 언어가 끼어들지 않고, 다국어 사전을 완벽 구조화하여 순수한 표현인 **'예약 완료', '이용 가능', '슬라이딩 크기 분석'** 등으로만 수려하게 라벨링됩니다.
*   **100% 동일 사양의 역사 컨트롤 위젯 (`<HistoryController />`):**
    *   학생용 공간 대쉬보드 및 예약 기록 검색 패널에서 사용되는 모든 '실행 취소(Undo)' 및 '다시 실행(Redo)' 단말의 디자인과 클래스를 컴포넌트로 완전 캡슐화했습니다.
    *   플랫(Flat)하며, 둥근 모서리를 갖춘 통일된 구조, 세려된 액션 아이콘 배치, 그리고 카운팅 배치까지 완벽히 일치시켜 전역 시각 편차를 제거하고 인터랙티브 터치 가독성을 완성시켰습니다.
