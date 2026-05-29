"""
Team Member D: Database Connection & Initialization Manager
역할: 안전한 SQLite 다중 연결 제어 및 최신 스키마(users 포함) 초기화
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

# DB 파일 경로 설정 (현재 파일과 같은 위치)
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "classfit.db"

# =====================================================================
# 1. SQLite 안전 연결 관리 (Context Manager)
# =====================================================================
@contextmanager
def get_db_connection(use_transaction=False):
    """
    팀원들이 DB에 접근할 때 락(Lock)이 걸리지 않도록 안전하게 열고 닫아줍니다.
    :param use_transaction: True일 경우 동시성 방지를 위해 BEGIN IMMEDIATE 실행
    """
    conn = sqlite3.connect(DB_PATH, timeout=20)
    
    # SQLite 필수 환경 설정 (팀원 코드의 장점 흡수)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 10000;")
    
    if use_transaction:
        conn.execute("BEGIN IMMEDIATE;")
        
    cursor = conn.cursor()
    try:
        yield cursor
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


# =====================================================================
# 2. 통합 테이블 초기화 (DDL)
# =====================================================================
def init_tables():
    """
    시스템의 모든 뼈대(테이블 및 인덱스)를 생성합니다.
    (팀원 B의 필터링을 위해 room_name과 equipment 컬럼 복구)
    """
    with get_db_connection() as cursor:
        # 1. 강의실 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
            room_id TEXT PRIMARY KEY,
            building TEXT NOT NULL,
            floor INTEGER,
            room_number TEXT,
            room_name TEXT,                          -- ◀ NOT NULL이 없어야 합니다!
            capacity INTEGER NOT NULL,
            capacity_avg REAL,
            room_type TEXT,
            location_score INTEGER DEFAULT 3,
            accessibility_score INTEGER DEFAULT 3,
            priority INTEGER DEFAULT 3,
            equipment TEXT DEFAULT 'projector,whiteboard' -- 복구됨 (장비 필터용)
        );
        """)

        # 2. 블락(고정) 시간표 테이블
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS blocked_schedules (
            blocked_id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            room_id TEXT NOT NULL,
            day TEXT NOT NULL,
            period INTEGER NOT NULL,
            capacity INTEGER,
            FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
        );
        """)

        # 3. 실시간 예약 테이블 (교시 기준)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            date TEXT NOT NULL,
            day TEXT NOT NULL,
            start_period INTEGER NOT NULL,
            end_period INTEGER NOT NULL,
            user_name TEXT NOT NULL,
            purpose TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
        );
        """)

        # 4. 사용자(회원) 테이블 (신규 추가)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        );
        """)

        # 5. 성능 최적화를 위한 인덱스 생성
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocked_room_day_period ON blocked_schedules(room_id, day, period);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_reservations_room_date_period ON reservations(room_id, date, start_period, end_period);")
        
    print("✓ [DB Manager] 스키마(Rooms, Schedules, Reservations, Users) 초기화 완료.")


# =====================================================================
# 모듈 직접 실행 시 뼈대 셋업
# =====================================================================
if __name__ == "__main__":
    # 처음 실행 시 빈 DB와 테이블 구조를 잡아줍니다.
    init_tables()