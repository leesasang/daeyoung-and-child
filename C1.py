"""
Team Member C: Admin & Scheduling Manager
역할: 강의실 CRUD, 목록/현황 조회, 예약 통계 집계
자료구조: ① list (DB 결과 저장)  ② set (미예약 강의실 추출)
알고리즘: ① Sliding Window (연속 빈 교시 탐색)  ② Insertion Sort (결과 정렬)
"""

import sqlite3
from contextlib import contextmanager
from typing import Optional
from database_v2 import connect_db, get_day_from_date  # 팀원 A 공통 함수 재사용

# =====================================================================
# 상수
# =====================================================================
ROOM_TYPES        = {'대형강의실', '일반강의실', '소형강의실', '초대형강의실'}
DEFAULT_EQUIPMENT = 'projector,computer,whiteboard'


# =====================================================================
# DB 컨텍스트 매니저
# =====================================================================
@contextmanager
def _db():
    """팀원 A의 connect_db()를 with 문으로 감싸 안전하게 열고 닫습니다."""
    conn = connect_db()
    try:
        yield conn
    except sqlite3.Error:
        conn.rollback()
        raise
    finally:
        conn.close()


# =====================================================================
# 1. 강의실 CRUD (등록 / 수정 / 삭제)
# =====================================================================
def add_room(
    room_id: str,
    building: str,
    floor: int,
    room_number: str,
    room_name: str,
    capacity: int,
    capacity_avg: Optional[float] = None,
    room_type: str = '일반강의실',
    equipment: str = DEFAULT_EQUIPMENT,
    location_score: int = 3,
    accessibility_score: int = 3,
    source_course_count: int = 0,
) -> tuple[bool, str]:
    """강의실을 rooms 테이블에 등록합니다. 중복 ID 및 유효성 검사 포함."""
    if not room_id or not room_name:
        return False, "강의실 ID와 이름은 필수입니다."
    if capacity < 1:
        return False, "수용 인원은 1 이상이어야 합니다."
    if room_type not in ROOM_TYPES:
        return False, f"유효하지 않은 강의실 유형입니다. 가능한 값: {sorted(ROOM_TYPES)}"

    try:
        with _db() as conn:
            cur = conn.cursor()
            cur.execute("BEGIN IMMEDIATE;")

            cur.execute("SELECT 1 FROM rooms WHERE room_id = ?;", (room_id,))
            if cur.fetchone():
                conn.rollback()
                return False, f"이미 존재하는 강의실 ID입니다: {room_id}"

            cur.execute(
                """
                INSERT INTO rooms
                    (room_id, building, floor, room_number, room_name,
                     capacity, capacity_avg, room_type, equipment,
                     location_score, accessibility_score,
                     source_course_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (room_id, building, floor, room_number, room_name,
                 capacity, capacity_avg, room_type, equipment,
                 location_score, accessibility_score,
                 source_course_count),
            )
            conn.commit()
            return True, f"강의실 '{room_name}' 등록 완료."
    except sqlite3.Error as e:
        return False, f"DB 오류: {e}"


def update_room(room_id: str, **kwargs) -> tuple[bool, str]:
    """
    강의실 정보를 수정합니다. 변경할 컬럼만 키워드 인자로 전달합니다.
    예) update_room('AI관-208', capacity=50)
    """
    ALLOWED = {
        'building', 'floor', 'room_number', 'room_name',
        'capacity', 'capacity_avg', 'room_type', 'equipment',
        'location_score', 'accessibility_score',
        'source_course_count',
    }
    fields = {k: v for k, v in kwargs.items() if k in ALLOWED}

    if not fields:
        return False, "변경할 항목이 없습니다."
    if 'room_type' in fields and fields['room_type'] not in ROOM_TYPES:
        return False, f"유효하지 않은 강의실 유형입니다. 가능한 값: {sorted(ROOM_TYPES)}"

    try:
        with _db() as conn:
            cur = conn.cursor()
            cur.execute("BEGIN IMMEDIATE;")

            cur.execute("SELECT 1 FROM rooms WHERE room_id = ?;", (room_id,))
            if not cur.fetchone():
                conn.rollback()
                return False, f"존재하지 않는 강의실입니다: {room_id}"

            set_clause = ", ".join(f"{k} = ?" for k in fields)
            cur.execute(
                f"UPDATE rooms SET {set_clause} WHERE room_id = ?;",
                [*fields.values(), room_id],
            )
            conn.commit()
            changed = ", ".join(f"{k}={v}" for k, v in fields.items())
            return True, f"강의실 {room_id} 수정 완료 ({changed})."
    except sqlite3.Error as e:
        return False, f"DB 오류: {e}"


def delete_room(room_id: str) -> tuple[bool, str]:
    """
    강의실을 삭제합니다.
    실시간 예약이 남아 있으면 삭제 불가, 정규 수업 시간표는 함께 삭제됩니다.
    """
    try:
        with _db() as conn:
            cur = conn.cursor()
            cur.execute("BEGIN IMMEDIATE;")

            cur.execute("SELECT room_name FROM rooms WHERE room_id = ?;", (room_id,))
            row = cur.fetchone()
            if not row:
                conn.rollback()
                return False, f"존재하지 않는 강의실입니다: {room_id}"

            cur.execute("SELECT COUNT(*) FROM reservations WHERE room_id = ?;", (room_id,))
            res_count = cur.fetchone()[0]
            if res_count > 0:
                conn.rollback()
                return False, (
                    f"예약 {res_count}건이 남아 있어 삭제할 수 없습니다. "
                    "예약을 먼저 취소해주세요."
                )

            cur.execute("DELETE FROM blocked_schedules WHERE room_id = ?;", (room_id,))
            cur.execute("DELETE FROM rooms WHERE room_id = ?;", (room_id,))
            conn.commit()
            return True, f"강의실 '{row[0]}' ({room_id}) 삭제 완료."
    except sqlite3.Error as e:
        return False, f"DB 오류: {e}"


# =====================================================================
# 2. 강의실 목록 조회
# =====================================================================
def room_list(
    building: Optional[str] = None,
    floor: Optional[int] = None,
    room_type: Optional[str] = None,
    min_capacity: int = 0,
) -> list[tuple]:
    """
    강의실 목록을 조회합니다. 파라미터를 조합해 필터링할 수 있습니다.
    :return: (room_id, building, floor, room_name, capacity, capacity_avg, room_type, equipment)
    """
    query  = """
        SELECT room_id, building, floor, room_name,
               capacity, capacity_avg, room_type, equipment
        FROM   rooms
        WHERE  capacity >= ?
    """
    params: list = [min_capacity]

    if building  is not None: query += " AND building = ?";  params.append(building)
    if floor     is not None: query += " AND floor = ?";     params.append(floor)
    if room_type is not None: query += " AND room_type = ?"; params.append(room_type)

    query += " ORDER BY building ASC, floor ASC, room_id ASC;"

    with _db() as conn:
        cur = conn.cursor()
        cur.execute(query, params)
        return cur.fetchall()


# =====================================================================
# 알고리즘 ② 헬퍼: 삽입 정렬 (Insertion Sort)
# =====================================================================
def _insertion_sort(data: list, key_idx: int, reverse: bool = False) -> list:
    """
    튜플 리스트를 key_idx 기준으로 삽입 정렬합니다. O(n²), 원본 불변.
    :param reverse: True=내림차순, False=오름차순(기본)
    """
    result = list(data)
    for i in range(1, len(result)):
        current = result[i]
        j = i - 1
        if reverse:
            while j >= 0 and result[j][key_idx] < current[key_idx]:
                result[j + 1] = result[j]; j -= 1
        else:
            while j >= 0 and result[j][key_idx] > current[key_idx]:
                result[j + 1] = result[j]; j -= 1
        result[j + 1] = current
    return result


# =====================================================================
# 3. 빈 강의실 현황 조회
# =====================================================================
def get_unbooked_rooms(
    date: Optional[str] = None,
    building: Optional[str] = None,
) -> list[tuple]:
    """
    예약이 없는 강의실 목록을 반환합니다. (관리자 전용)
    자료구조 ②: set — 전체 집합 - 예약된 집합 = 미예약 집합 (set 차연산)
    알고리즘 ②: Insertion Sort — 결과를 room_id 오름차순 정렬
    :param date: 날짜 지정 시 해당 날짜 기준, None이면 전체 기간 기준
    :return: (room_id, building, floor, room_name, capacity, room_type)
    """
    with _db() as conn:
        cur = conn.cursor()

        # 자료구조 ②: set — 전체 강의실 ID 집합
        cur.execute("SELECT room_id FROM rooms;")
        all_ids: set[str] = set(r[0] for r in cur.fetchall())

        # 자료구조 ②: set — 예약된 강의실 ID 집합
        if date is not None:
            cur.execute(
                "SELECT DISTINCT room_id FROM reservations WHERE date = ?;",
                (date,),
            )
        else:
            cur.execute("SELECT DISTINCT room_id FROM reservations;")
        reserved_ids: set[str] = set(r[0] for r in cur.fetchall())

        # set 차연산: 전체 - 예약된 = 미예약
        unbooked_ids: set[str] = all_ids - reserved_ids

        if not unbooked_ids:
            return []

        placeholders = ", ".join("?" * len(unbooked_ids))
        query = (
            f"SELECT room_id, building, floor, room_name, capacity, room_type "
            f"FROM   rooms "
            f"WHERE  room_id IN ({placeholders})"
        )
        params: list = list(unbooked_ids)

        if building is not None:
            query += " AND building = ?"
            params.append(building)

        cur.execute(query, params)
        # 알고리즘 ②: 삽입 정렬 — room_id(index 0) 기준 오름차순
        return _insertion_sort(cur.fetchall(), key_idx=0, reverse=False)


# =====================================================================
# 4. 전체 예약 현황 조회 (관리자 전용)
# =====================================================================
def full_reservation_search(
    date: Optional[str] = None,
    building: Optional[str] = None,
    user_name: Optional[str] = None,
) -> list[tuple]:
    """
    전체 예약 목록을 조회합니다. 파라미터를 조합해 필터링할 수 있습니다.
    :return: (reservation_id, room_id, room_name, building, date, day,
              start_period, end_period, user_name, purpose, created_at)
    """
    query = """
        SELECT rv.reservation_id, rv.room_id, r.room_name, r.building,
               rv.date, rv.day, rv.start_period, rv.end_period,
               rv.user_name, rv.purpose, rv.created_at
        FROM   reservations rv
        JOIN   rooms r ON rv.room_id = r.room_id
        WHERE  1=1
    """
    params: list = []

    if date      is not None: query += " AND rv.date = ?";      params.append(date)
    if building  is not None: query += " AND r.building = ?";   params.append(building)
    if user_name is not None: query += " AND rv.user_name = ?"; params.append(user_name)

    query += " ORDER BY rv.date ASC, rv.start_period ASC, rv.room_id ASC;"

    with _db() as conn:
        cur = conn.cursor()
        cur.execute(query, params)
        return cur.fetchall()


# =====================================================================
# 5. 이용 통계 집계 (SQL GROUP BY)
# =====================================================================
def get_usage_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict[str, list]:
    """
    강의실 이용 통계를 집계합니다. (강의실별 / 요일별 / 교시별)
    :return: {'by_room': [...], 'by_day': [...], 'by_period': [...]}
    """
    date_cond = ""
    params: list = []
    if start_date is not None: date_cond += " AND date >= ?"; params.append(start_date)
    if end_date   is not None: date_cond += " AND date <= ?"; params.append(end_date)

    with _db() as conn:
        cur = conn.cursor()

        # 강의실별 — 예약 건수 내림차순
        cur.execute(f"""
            SELECT rv.room_id,
                   r.room_name,
                   r.building,
                   COUNT(*)                              AS reservation_count,
                   SUM(rv.end_period - rv.start_period) AS total_periods
            FROM   reservations rv
            JOIN   rooms r ON rv.room_id = r.room_id
            WHERE  1=1 {date_cond}
            GROUP  BY rv.room_id
            ORDER  BY reservation_count DESC;
        """, params)
        by_room = cur.fetchall()

        # 요일별 — 예약 건수 내림차순
        cur.execute(f"""
            SELECT day, COUNT(*) AS count
            FROM   reservations
            WHERE  1=1 {date_cond}
            GROUP  BY day
            ORDER  BY count DESC;
        """, params)
        by_day = cur.fetchall()

        # 교시별 — 교시 번호 오름차순
        cur.execute(f"""
            SELECT start_period, COUNT(*) AS count
            FROM   reservations
            WHERE  1=1 {date_cond}
            GROUP  BY start_period
            ORDER  BY start_period ASC;
        """, params)
        by_period = cur.fetchall()

    return {'by_room': by_room, 'by_day': by_day, 'by_period': by_period}
