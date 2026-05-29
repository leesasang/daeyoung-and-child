# daeyoung-and-child


# 팀원 D ( DB연동 + 추천 + 문서화 )


## db_manager.py (DB 연동)
### 1. __init__
기능: 과거 기록용 undo_stack과 다시 실행용 redo_stack을 메모리에 빈 리스트([])로 생성하여 초기화합니다.

언제 사용하나요?: Streamlit 앱이 실행되거나 사용자 세션(st.session_state)이 처음 시작될 때 딱 한 번 이력 관리자 객체를 생성하기 위해 호출합니다.

사용방법:

from src.history.history_manager import ReservationHistoryManager

세션이나 앱 상단에서 인스턴스 생성
history_mgr = ReservationHistoryManager()

### 2. push_history
기능: 성공한 예약 정보를 딕셔너리(페이로드) 형태로 전달받아 undo_stack에 쌓고, 새로운 타임라인이 시작되었으므로 기존 redo_stack을 완전히 비웁니다.

언제 사용하나요?: 사용자가 일반 예약을 성공했거나, 혹은 추천받은 대안 강의실로 확정 버튼을 눌러 DB 등록(add_reservation)이 최종 성공한 직후에 호출합니다.

사용방법:

예약 함수가 True를 반환하며 최종 성공했을 때 호출
if success:
    payload = {
        'reservation_id': 12,       # SQLite에서 발급된 고유 ID
        'room_id': 'AI관-206',       # 강의실 번호
        'date': '2026-06-01',       # 예약 날짜
        'day': '월',                # 요일
        'start_period': 4,          # 시작 교시
        'end_period': 5,            # 종료 교시
        'user_name': '청청',         # 예약자명
        'purpose': '알고리즘 팀플'    # 예약 목적
    }
    history_mgr.push_history('INSERT', payload)

## history_manager.py (문서화)
### 1.undo
기능: undo_stack에서 직전 행동을 꺼내와, 그 행동이 예약 등록(INSERT)이었다면 실제 DB에서 해당 행을 지워버리고(DELETE), 예약 취소(DELETE)였다면 다시 복구해 주는 자율 트랜잭션 함수입니다.

언제 사용하나요?: 사용자가 화면에서 '되돌리기(Undo)' 버튼이나 '실행 취소(Ctrl+Z)'를 눌렀을 때 호출합니다.

사용방법:


UI에서 '되돌리기' 버튼 클릭 시 트리거
is_ok, feedback_msg = history_mgr.undo()

if is_ok:
    st.toast(feedback_msg) # "Undo 완료: 예약 ID 12번 취소(DB 행 삭제)" 알림
    st.rerun()             # DB가 갱신되었으므로 화면 새로고침
else:
    st.error(feedback_msg) # 되돌릴 기록이 없을 때 에러 출력

### 2. redo
기능: 사용자가 Undo로 취소했던 예약을 다시 취소하고 원래대로 원상복구(다시 실행)하는 함수입니다. 호출 즉시 지워졌던 데이터를 실제 DB 파일에 다시 삽입(INSERT)하여 데이터를 갱신합니다.

언제 사용하나요?: 사용자가 화면에서 '다시 실행(Redo)' 버튼이나 '앞으로 가기(Ctrl+Y)'를 눌렀을 때 호출합니다.

사용방법:

Python
UI에서 '다시실행' 버튼 클릭 시 트리거
is_ok, feedback_msg = history_mgr.redo()

if is_ok:
    st.toast(feedback_msg) # "Redo 완료: 예약 ID 12번 재신청(DB 행 재삽입)" 알림
    st.rerun()             # 행이 복구되었으므로 화면 동기화
else:
    st.warning(feedback_msg) # 다시 실행할 이력이 없을 때 경고 출력

## recommender.py (추천)
### 1. recommend_adjacent_classroom_bfs
기능: 예약을 시도한 강의실이 정규 수업 시간표나 기존 예약과 겹쳐 충돌(마감)이 났을 때, 공간 유형, 수용 인원, 평균 수용량, 인접 거리(동일 건물/위아래 1개 층) 순의 가중치를 계산하여 가장 조건이 유사한 빈 강의실을 찾아 안내 메시지와 함께 반환합니다.

언제 사용하나요?: 사용자가 예약을 신청했으나 데이터베이스 등록 함수(add_reservation)가 실패하여 시간대 충돌이 발생했을 때 차선책을 화면에 띄워주기 위해 호출합니다.

사용방법:

Python
from src.recommender.recommender import recommend_adjacent_classroom_bfs

#### 1. 함수 호출 (충돌난 방 ID, 날짜, 시작교시, 종료교시 입력)
result = recommend_adjacent_classroom_bfs(
    failed_room_id="AI관-100",
    date="2026-06-01",
    start_period=4,
    end_period=5
)

#### 2. 결과 처리 (Streamlit 위젯 연동)
if result["success"]:
    # 추천 성공 시 대안 강의실 ID와 안내 메시지 활용
    st.success(result["message"])
    new_room_id = result["room_id"] # 예: "AI관-411"
else:
    # 빈 방이 아예 없거나 입력 오류인 경우 에러 메시지 출력
    st.error(result["message"])

### 2.get_day_from_date
기능: 2026-06-01과 같은 YYYY-MM-DD 형태의 날짜 문자열을 입력받아 파이썬 내장 datetime 라이브러리를 통해 해당 날짜가 무슨 요일("월", "화", "수"...)인지 계산하여 한 글자 문자열로 반환합니다.

언제 사용하나요?: 추천 엔진 내부에서 정규 수업 시간표(blocked_schedules) 테이블을 조회하기 위해 날짜 데이터를 요일 데이터로 변환해야 할 때 사용합니다. (외부 UI에서 요일 텍스트가 필요할 때 독립적으로 호출해도 무방합니다.)

사용방법:

Python
from src.recommender.recommender import get_day_from_date

날짜 문자열을 던져서 요일 추출
day_result = get_day_from_date("2026-06-01")
print(day_result) # 출력: "월"


### 3. safe_int
기능: 데이터베이스나 CSV 파일을 파싱하는 과정에서 간혹 발생하는 비어있는 값(None, "") 또는 층수 데이터에 실수 형태(4.0)나 문자가 섞여 들어왔을 때, 프로그램이 뻗지 않도록 예외 처리하여 안전하게 정수(int)형으로 변환해 줍니다. 실패 시 설정한 기본값을 반환합니다.

언제 사용하나요?: 추천 엔진 내부에서 강의실의 층수(floor), 수용 인원(capacity) 등을 가져와 물리적 거리 및 인원 편차 가중치를 계산하기 전, 데이터 타입을 안전하게 정수로 통일할 때 사용합니다.

사용방법:

Python
from src.recommender.recommender import safe_int

비어있거나 소수점이 섞인 데이터를 안전하게 정수로 변환
clean_floor = safe_int("4.0", default=1)   # 결과: 4
clean_capacity = safe_int(None, default=40) # 결과: 40
