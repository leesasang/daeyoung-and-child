"""
ClassFit database module - Team A v2

변경 핵심
- users 테이블 추가 및 사용자 조회/생성/로그인 검증 함수 추가
- reservations 테이블에서 user_name 제거, user_id 외래키 사용
- reservation_history 테이블 추가: 예약 생성/취소 내역을 스냅샷으로 저장
- 기존 수업 시간표(blocked_schedules)와 실시간 예약(reservations) 충돌 검사 유지
- SQLite WAL 모드와 BEGIN IMMEDIATE 트랜잭션으로 동시 예약 충돌 완화
"""

from __future__ import annotations

import csv
import hashlib
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "classfit.db"
DATA_DIR = BASE_DIR / "data"
ROOMS_CSV_PATH = DATA_DIR / "rooms.csv"
BLOCKED_CSV_PATH = DATA_DIR / "blocked_schedules.csv"

KOREAN_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]

DEFAULT_USERS = [
    # user_name, password, role, student_id, department, email
    ("admin", "admin123", "admin", "", "", ""),
    ("user1", "1234", "user", "", "", ""),
    ("user2", "1234", "user", "", "", ""),
]


class ClassFitError(Exception):
    """ClassFit DB 처리 중 발생하는 명시적 예외."""


def get_day_from_date(date_text: str) -> str:
    """YYYY-MM-DD 날짜를 한국어 요일 문자로 변환한다."""
    dt = datetime.strptime(date_text, "%Y-%m-%d")
    return KOREAN_WEEKDAYS[dt.weekday()]


def hash_password(password: str) -> str:
    """프로토타입용 단순 SHA-256 비밀번호 해시."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def connect_db() -> sqlite3.Connection:
    """SQLite 연결. 다중 사용자 시연을 위해 WAL/timeout 설정을 적용한다."""
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 10000;")
    return conn


def init_db() -> None:
    """SQLite DB 스키마와 인덱스를 생성한다."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS rooms (
            room_id TEXT PRIMARY KEY,
            building TEXT NOT NULL,
            floor INTEGER,
            room_number TEXT,
            room_name TEXT NOT NULL,
            capacity INTEGER NOT NULL,
            capacity_avg REAL,
            room_type TEXT,
            location_score INTEGER DEFAULT 3,
            accessibility_score INTEGER DEFAULT 3,
            priority INTEGER DEFAULT 3,
            equipment TEXT DEFAULT 'projector,computer,whiteboard',
            source_course_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS blocked_schedules (
            blocked_id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            room_id TEXT NOT NULL,
            day TEXT NOT NULL,
            period INTEGER NOT NULL,
            capacity INTEGER,
            source_row INTEGER,
            FOREIGN KEY (room_id) REFERENCES rooms(room_id)
        );

        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            student_id TEXT UNIQUE,
            department TEXT,
            email TEXT UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reservations (
            reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            date TEXT NOT NULL,
            day TEXT NOT NULL,
            start_period INTEGER NOT NULL,
            end_period INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            purpose TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES rooms(room_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );

        CREATE TABLE IF NOT EXISTS reservation_history (
            history_id INTEGER PRIMARY KEY AUTOINCREMENT,
            reservation_id INTEGER,
            action TEXT NOT NULL CHECK(action IN ('CREATE', 'CANCEL')),
            room_id TEXT NOT NULL,
            date TEXT NOT NULL,
            day TEXT NOT NULL,
            start_period INTEGER NOT NULL,
            end_period INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            purpose TEXT,
            action_at TEXT DEFAULT CURRENT_TIMESTAMP,
            memo TEXT,
            FOREIGN KEY (room_id) REFERENCES rooms(room_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_blocked_room_day_period
        ON blocked_schedules(room_id, day, period);

        CREATE INDEX IF NOT EXISTS idx_blocked_day_period
        ON blocked_schedules(day, period);

        CREATE INDEX IF NOT EXISTS idx_users_user_name
        ON users(user_name);

        CREATE INDEX IF NOT EXISTS idx_reservations_user_id
        ON reservations(user_id);

        CREATE INDEX IF NOT EXISTS idx_reservations_room_date_period
        ON reservations(room_id, date, start_period, end_period);

        CREATE INDEX IF NOT EXISTS idx_reservations_date
        ON reservations(date);

        CREATE INDEX IF NOT EXISTS idx_history_user_id
        ON reservation_history(user_id);

        CREATE INDEX IF NOT EXISTS idx_history_reservation_id
        ON reservation_history(reservation_id);

        CREATE INDEX IF NOT EXISTS idx_history_room_date
        ON reservation_history(room_id, date);

        CREATE INDEX IF NOT EXISTS idx_rooms_capacity
        ON rooms(capacity);
        """
    )
    conn.commit()
    conn.close()


def _insert_default_users(cur: sqlite3.Cursor) -> None:
    """시연용 기본 사용자를 삽입한다. 이미 존재하면 무시한다."""
    cur.executemany(
        """
        INSERT OR IGNORE INTO users
        (user_name, password_hash, role, student_id, department, email)
        VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''));
        """,
        [(name, hash_password(password), role, sid, dept, email) for name, password, role, sid, dept, email in DEFAULT_USERS],
    )


def reset_db_from_csv() -> None:
    """CSV 기반으로 rooms, blocked_schedules를 재생성한다. reservations/history는 빈 상태로 초기화된다."""
    init_db()
    conn = connect_db()
    cur = conn.cursor()
    try:
        cur.execute("BEGIN IMMEDIATE;")
        cur.execute("DELETE FROM reservation_history;")
        cur.execute("DELETE FROM reservations;")
        cur.execute("DELETE FROM blocked_schedules;")
        cur.execute("DELETE FROM rooms;")
        cur.execute("DELETE FROM users;")
        cur.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('reservation_history', 'reservations', 'blocked_schedules', 'users');"
        )

        with open(ROOMS_CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            rooms = []
            for row in reader:
                rooms.append(
                    (
                        row["room_id"],
                        row["building"],
                        int(row["floor"]) if row.get("floor") else None,
                        row.get("room_number", ""),
                        row.get("room_name") or row["room_id"],
                        int(row["capacity"]),
                        float(row["capacity_avg"]) if row.get("capacity_avg") else None,
                        row.get("room_type", "일반강의실"),
                        int(row.get("location_score") or 3),
                        int(row.get("accessibility_score") or 3),
                        int(row.get("priority") or 3),
                        row.get("equipment") or "projector,computer,whiteboard",
                        int(row.get("source_course_count") or 0),
                    )
                )

        cur.executemany(
            """
            INSERT INTO rooms
            (room_id, building, floor, room_number, room_name, capacity, capacity_avg,
             room_type, location_score, accessibility_score, priority, equipment, source_course_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            rooms,
        )

        with open(BLOCKED_CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            blocked = []
            for row in reader:
                blocked.append(
                    (
                        row["course_id"],
                        row["room_id"],
                        row["day"],
                        int(row["period"]),
                        int(row["capacity"]) if row.get("capacity") not in (None, "") else None,
                        int(row["source_row"]) if row.get("source_row") not in (None, "") else None,
                    )
                )

        cur.executemany(
            """
            INSERT INTO blocked_schedules
            (course_id, room_id, day, period, capacity, source_row)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            blocked,
        )

        _insert_default_users(cur)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_seed_data() -> None:
    """DB 파일이 없거나 rooms/users가 비어 있으면 CSV와 기본 사용자로 초기화한다."""
    init_db()
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM rooms;")
    room_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM users;")
    user_count = cur.fetchone()[0]
    if room_count == 0:
        conn.close()
        reset_db_from_csv()
        return
    if user_count == 0:
        cur.execute("BEGIN IMMEDIATE;")
        _insert_default_users(cur)
        conn.commit()
    conn.close()


def create_user(
    user_name: str,
    password: str,
    role: str = "user",
    student_id: str | None = None,
    department: str | None = None,
    email: str | None = None,
):
    """사용자 추가. 성공 시 생성된 user_id를 반환한다."""
    if not user_name or not user_name.strip():
        return False, "사용자명은 비울 수 없습니다.", None
    if not password:
        return False, "비밀번호는 비울 수 없습니다.", None
    if role not in {"user", "admin"}:
        return False, "role은 user 또는 admin만 가능합니다.", None

    conn = connect_db()
    cur = conn.cursor()
    try:
        cur.execute("BEGIN IMMEDIATE;")
        cur.execute(
            """
            INSERT INTO users
            (user_name, password_hash, role, student_id, department, email)
            VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''));
            """,
            (
                user_name.strip(),
                hash_password(password),
                role,
                student_id or "",
                department or "",
                email or "",
            ),
        )
        user_id = cur.lastrowid
        conn.commit()
        return True, f"사용자 생성 완료: user_id {user_id}", user_id
    except sqlite3.IntegrityError as exc:
        conn.rollback()
        return False, f"사용자 생성 실패: 중복된 user_name/student_id/email이 있습니다. ({exc})", None
    except sqlite3.Error as exc:
        conn.rollback()
        return False, f"DB 오류: {exc}", None
    finally:
        conn.close()


def get_user_by_id(user_id: int):
    """user_id로 사용자 1명을 조회한다."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT user_id, user_name, role, student_id, department, email, created_at
        FROM users
        WHERE user_id = ?;
        """,
        (int(user_id),),
    )
    row = cur.fetchone()
    conn.close()
    return row


def get_user_by_name(user_name: str):
    """user_name으로 사용자 1명을 조회한다."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT user_id, user_name, role, student_id, department, email, created_at
        FROM users
        WHERE user_name = ?;
        """,
        (user_name.strip(),),
    )
    row = cur.fetchone()
    conn.close()
    return row


def get_all_users():
    """전체 사용자 목록을 반환한다."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT user_id, user_name, role, student_id, department, email, created_at
        FROM users
        ORDER BY user_id ASC;
        """
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def authenticate_user(user_name: str, password: str):
    """로그인 검증. 성공하면 사용자 정보를 반환하고 실패하면 None을 반환한다."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT user_id, user_name, role, student_id, department, email, created_at
        FROM users
        WHERE user_name = ? AND password_hash = ?;
        """,
        (user_name.strip(), hash_password(password)),
    )
    row = cur.fetchone()
    conn.close()
    return row


def get_conflict_details(room_id: str, date: str, start_period: int, end_period: int) -> dict:
    """예약 가능 여부와 실패 원인을 상세히 반환한다."""
    if start_period >= end_period:
        return {"ok": False, "type": "period_error", "message": "종료 교시는 시작 교시보다 커야 합니다."}
    if start_period < 1 or end_period > 13:
        return {"ok": False, "type": "period_error", "message": "예약 가능 교시는 1~12교시입니다."}

    try:
        day = get_day_from_date(date)
    except ValueError:
        return {"ok": False, "type": "date_error", "message": "날짜 형식은 YYYY-MM-DD이어야 합니다."}

    conn = connect_db()
    cur = conn.cursor()

    cur.execute("SELECT room_id FROM rooms WHERE room_id = ?;", (room_id,))
    if cur.fetchone() is None:
        conn.close()
        return {"ok": False, "type": "room_error", "message": "존재하지 않는 강의실입니다."}

    cur.execute(
        """
        SELECT course_id, period
        FROM blocked_schedules
        WHERE room_id = ? AND day = ? AND period >= ? AND period < ?
        ORDER BY period ASC;
        """,
        (room_id, day, start_period, end_period),
    )
    blocked_rows = cur.fetchall()

    cur.execute(
        """
        SELECT rv.reservation_id, rv.start_period, rv.end_period, u.user_name, rv.purpose
        FROM reservations rv
        JOIN users u ON rv.user_id = u.user_id
        WHERE rv.room_id = ? AND rv.date = ? AND rv.start_period < ? AND ? < rv.end_period
        ORDER BY rv.start_period ASC;
        """,
        (room_id, date, end_period, start_period),
    )
    reservation_rows = cur.fetchall()
    conn.close()

    if blocked_rows:
        periods = ", ".join(f"{p}교시" for _, p in blocked_rows)
        courses = ", ".join(sorted(set(str(c) for c, _ in blocked_rows)))
        return {
            "ok": False,
            "type": "blocked",
            "day": day,
            "periods": periods,
            "courses": courses,
            "message": f"기존 수업과 충돌합니다: {day} {periods} / 학수번호 {courses}",
        }

    if reservation_rows:
        items = [f"예약 #{rid}({s}~{e}교시, {user})" for rid, s, e, user, _ in reservation_rows]
        return {
            "ok": False,
            "type": "reservation",
            "day": day,
            "items": items,
            "message": "실시간 예약과 충돌합니다: " + "; ".join(items),
        }

    return {"ok": True, "type": "none", "day": day, "message": "예약 가능한 시간입니다."}


def add_reservation(room_id: str, date: str, start_period: int, end_period: int, user_id: int, purpose: str = ""):
    """예약 신청. user_name이 아니라 user_id를 저장한다."""
    if start_period >= end_period:
        return False, "예약 실패: 종료 교시는 시작 교시보다 커야 합니다."
    if start_period < 1 or end_period > 13:
        return False, "예약 실패: 예약 가능 교시는 1~12교시입니다."

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return False, "예약 실패: 올바른 user_id가 아닙니다."

    try:
        day = get_day_from_date(date)
    except ValueError:
        return False, "예약 실패: 날짜 형식은 YYYY-MM-DD이어야 합니다."

    conn = connect_db()
    cur = conn.cursor()
    try:
        # 동시에 여러 사용자가 같은 강의실을 예약해도 여기서 직렬화된다.
        cur.execute("BEGIN IMMEDIATE;")

        cur.execute("SELECT room_id FROM rooms WHERE room_id = ?;", (room_id,))
        if cur.fetchone() is None:
            conn.rollback()
            return False, "예약 실패: 존재하지 않는 강의실입니다."

        cur.execute("SELECT user_id FROM users WHERE user_id = ?;", (user_id,))
        if cur.fetchone() is None:
            conn.rollback()
            return False, "예약 실패: 존재하지 않는 user_id입니다."

        cur.execute(
            """
            SELECT course_id, period
            FROM blocked_schedules
            WHERE room_id = ? AND day = ? AND period >= ? AND period < ?
            ORDER BY period ASC;
            """,
            (room_id, day, start_period, end_period),
        )
        blocked = cur.fetchone()
        if blocked:
            conn.rollback()
            return False, f"예약 실패: {day}{blocked[1]}교시에 기존 수업({blocked[0]})이 있습니다."

        cur.execute(
            """
            SELECT reservation_id, start_period, end_period
            FROM reservations
            WHERE room_id = ? AND date = ? AND start_period < ? AND ? < end_period;
            """,
            (room_id, date, end_period, start_period),
        )
        conflict = cur.fetchone()
        if conflict:
            conn.rollback()
            return False, f"예약 실패: 기존 예약 ID {conflict[0]}번({conflict[1]}~{conflict[2]}교시)과 시간이 겹칩니다."

        cur.execute(
            """
            INSERT INTO reservations
            (room_id, date, day, start_period, end_period, user_id, purpose)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (room_id, date, day, start_period, end_period, user_id, purpose.strip()),
        )
        reservation_id = cur.lastrowid

        cur.execute(
            """
            INSERT INTO reservation_history
            (reservation_id, action, room_id, date, day, start_period, end_period, user_id, purpose, memo)
            VALUES (?, 'CREATE', ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (reservation_id, room_id, date, day, start_period, end_period, user_id, purpose.strip(), "예약 생성"),
        )

        conn.commit()
        return True, f"예약 완료: 예약 ID {reservation_id}"
    except sqlite3.Error as exc:
        conn.rollback()
        return False, f"DB 오류: {exc}"
    finally:
        conn.close()


def add_reservation_by_user_name(room_id: str, date: str, start_period: int, end_period: int, user_name: str, purpose: str = ""):
    """기존 UI 호환용. user_name을 받아 user_id로 변환한 뒤 예약한다."""
    user = get_user_by_name(user_name)
    if user is None:
        ok, msg, user_id = create_user(user_name=user_name, password="1234", role="user")
        if not ok:
            return False, msg
    else:
        user_id = user[0]
    return add_reservation(room_id, date, start_period, end_period, user_id, purpose)


def cancel_reservation(reservation_id: int, actor_user_id: int | None = None, memo: str = ""):
    """예약 취소. 취소 내역은 reservation_history에 남긴 뒤 reservations에서 삭제한다."""
    conn = connect_db()
    cur = conn.cursor()
    try:
        cur.execute("BEGIN IMMEDIATE;")

        cur.execute(
            """
            SELECT reservation_id, room_id, date, day, start_period, end_period, user_id, purpose
            FROM reservations
            WHERE reservation_id = ?;
            """,
            (int(reservation_id),),
        )
        target = cur.fetchone()
        if not target:
            conn.rollback()
            return False, "예약 취소 실패: 해당 예약 ID를 찾을 수 없습니다."

        rid, room_id, date, day, start_period, end_period, owner_user_id, purpose = target
        history_user_id = int(actor_user_id) if actor_user_id is not None else owner_user_id

        cur.execute("SELECT user_id FROM users WHERE user_id = ?;", (history_user_id,))
        if cur.fetchone() is None:
            conn.rollback()
            return False, "예약 취소 실패: 존재하지 않는 actor_user_id입니다."

        cur.execute(
            """
            INSERT INTO reservation_history
            (reservation_id, action, room_id, date, day, start_period, end_period, user_id, purpose, memo)
            VALUES (?, 'CANCEL', ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                rid,
                room_id,
                date,
                day,
                start_period,
                end_period,
                history_user_id,
                purpose,
                memo.strip() or "예약 취소",
            ),
        )

        cur.execute("DELETE FROM reservations WHERE reservation_id = ?;", (int(reservation_id),))
        conn.commit()
        return True, f"예약 ID {reservation_id}번이 취소되었습니다."
    except sqlite3.Error as exc:
        conn.rollback()
        return False, f"DB 오류: {exc}"
    finally:
        conn.close()


def get_available_rooms(date: str, start_period: int, end_period: int, min_capacity: int = 0):
    """특정 날짜/교시에 사용 가능한 강의실 목록을 반환한다."""
    try:
        day = get_day_from_date(date)
    except ValueError:
        return []

    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT r.room_id, r.building, r.floor, r.capacity, r.room_type,
               r.location_score, r.accessibility_score, r.priority
        FROM rooms r
        WHERE r.capacity >= ?
          AND NOT EXISTS (
              SELECT 1 FROM blocked_schedules b
              WHERE b.room_id = r.room_id AND b.day = ? AND b.period >= ? AND b.period < ?
          )
          AND NOT EXISTS (
              SELECT 1 FROM reservations rv
              WHERE rv.room_id = r.room_id AND rv.date = ?
                AND rv.start_period < ? AND ? < rv.end_period
          )
        ORDER BY r.priority DESC, r.capacity ASC, r.room_id ASC;
        """,
        (min_capacity, day, start_period, end_period, date, end_period, start_period),
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def search_available_room_slots(date: str, duration: int, min_capacity: int = 1, start_min: int = 1, end_max: int = 13):
    """특정 날짜에 duration만큼 비어 있는 강의실-시간 후보를 모두 찾는다."""
    if duration < 1 or start_min < 1 or end_max > 13 or start_min >= end_max:
        return []
    candidates = []
    for start in range(start_min, end_max - duration + 1):
        end = start + duration
        for row in get_available_rooms(date, start, end, min_capacity):
            candidates.append((*row, start, end))
    return candidates


def recommend_alternative_slots(room_id: str, date: str, duration: int, min_start: int = 1, max_end: int = 13, limit: int = 8):
    """선택 강의실에서 같은 날짜에 가능한 대체 시간대를 추천한다."""
    alternatives = []
    if duration < 1:
        return alternatives
    for start in range(min_start, max_end - duration + 1):
        end = start + duration
        detail = get_conflict_details(room_id, date, start, end)
        if detail["ok"]:
            alternatives.append((room_id, date, start, end))
        if len(alternatives) >= limit:
            break
    return alternatives


def add_recurring_reservations(
    room_id: str,
    start_date: str,
    end_date: str,
    selected_days: Iterable[str],
    start_period: int,
    end_period: int,
    user_id: int,
    purpose: str = "",
):
    """반복 예약. 일부 실패해도 성공/실패 목록을 모두 반환한다."""
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        return [], [{"date": "-", "ok": False, "message": "날짜 형식 오류"}]

    if end_dt < start_dt:
        return [], [{"date": "-", "ok": False, "message": "종료일은 시작일보다 늦어야 합니다."}]

    days = set(selected_days)
    successes: list[dict] = []
    failures: list[dict] = []
    cur_dt = start_dt
    while cur_dt <= end_dt:
        date_text = cur_dt.strftime("%Y-%m-%d")
        day = get_day_from_date(date_text)
        if day in days:
            ok, message = add_reservation(room_id, date_text, start_period, end_period, user_id, purpose)
            record = {"date": date_text, "day": day, "ok": ok, "message": message}
            if ok:
                successes.append(record)
            else:
                failures.append(record)
        cur_dt += timedelta(days=1)
    return successes, failures


def get_all_reservations():
    """현재 살아 있는 전체 예약 목록을 사용자명과 함께 반환한다."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT rv.reservation_id, rv.room_id, rv.date, rv.day,
               rv.start_period, rv.end_period,
               rv.user_id, u.user_name, rv.purpose, rv.created_at
        FROM reservations rv
        JOIN users u ON rv.user_id = u.user_id
        ORDER BY rv.date ASC, rv.start_period ASC, rv.room_id ASC;
        """
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def get_user_reservations(user_id: int):
    """특정 사용자의 현재 예약 목록을 반환한다."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT rv.reservation_id, rv.room_id, rv.date, rv.day,
               rv.start_period, rv.end_period,
               rv.user_id, u.user_name, rv.purpose, rv.created_at
        FROM reservations rv
        JOIN users u ON rv.user_id = u.user_id
        WHERE rv.user_id = ?
        ORDER BY rv.date ASC, rv.start_period ASC;
        """,
        (int(user_id),),
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def get_reservations_by_room_date(room_id: str, date: str):
    """특정 강의실/날짜의 현재 예약 목록을 반환한다."""
    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT rv.reservation_id, rv.room_id, rv.date, rv.day,
               rv.start_period, rv.end_period,
               rv.user_id, u.user_name, rv.purpose, rv.created_at
        FROM reservations rv
        JOIN users u ON rv.user_id = u.user_id
        WHERE rv.room_id = ? AND rv.date = ?
        ORDER BY rv.start_period ASC;
        """,
        (room_id, date),
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def get_reservation_history(user_id: int | None = None, room_id: str | None = None, date: str | None = None, limit: int = 100):
    """예약 생성/취소 이력 조회. 조건을 생략하면 최신 이력부터 반환한다."""
    conditions = []
    params: list[object] = []

    if user_id is not None:
        conditions.append("h.user_id = ?")
        params.append(int(user_id))
    if room_id:
        conditions.append("h.room_id = ?")
        params.append(room_id)
    if date:
        conditions.append("h.date = ?")
        params.append(date)

    where_sql = "WHERE " + " AND ".join(conditions) if conditions else ""
    params.append(int(limit))

    conn = connect_db()
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT h.history_id, h.reservation_id, h.action,
               h.room_id, h.date, h.day, h.start_period, h.end_period,
               h.user_id, u.user_name, h.purpose, h.action_at, h.memo
        FROM reservation_history h
        JOIN users u ON h.user_id = u.user_id
        {where_sql}
        ORDER BY h.action_at DESC, h.history_id DESC
        LIMIT ?;
        """,
        params,
    )
    rows = cur.fetchall()
    conn.close()
    return rows


if __name__ == "__main__":
    ensure_seed_data()
    print("DB 준비 완료")
    print("사용자 목록:", get_all_users())
    print("예시 사용 가능 강의실:", get_available_rooms("2026-06-01", 5, 7, 30)[:3])
