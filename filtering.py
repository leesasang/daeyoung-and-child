from __future__ import annotations

import csv
import sqlite3
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "classfit.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"
DATA_DIR = BASE_DIR / "data"
ROOMS_CSV_PATH = DATA_DIR / "rooms.csv"
BLOCKED_CSV_PATH = DATA_DIR / "blocked_schedules.csv"

KOREAN_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


class RoomFilter:
    @staticmethod
    def connect_db() -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH, timeout=20)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 10000;")
        return conn

    @staticmethod
    def get_day_from_date(date_text: str) -> str:
        return KOREAN_WEEKDAYS[datetime.strptime(date_text, "%Y-%m-%d").weekday()]

    @staticmethod
    def init_db() -> None:
        if not SCHEMA_PATH.exists():
            raise FileNotFoundError(f"schema.sql not found: {SCHEMA_PATH}")

        with RoomFilter.connect_db() as conn:
            conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    @staticmethod
    def ensure_seed_data() -> None:
        RoomFilter.init_db()

        with RoomFilter.connect_db() as conn:
            cur = conn.execute("SELECT COUNT(*) FROM rooms;")
            if cur.fetchone()[0] > 0:
                return

        RoomFilter.reset_db_from_csv()

    @staticmethod
    def reset_db_from_csv() -> None:
        if not ROOMS_CSV_PATH.exists():
            raise FileNotFoundError(f"rooms.csv not found: {ROOMS_CSV_PATH}")
        if not BLOCKED_CSV_PATH.exists():
            raise FileNotFoundError(f"blocked_schedules.csv not found: {BLOCKED_CSV_PATH}")

        RoomFilter.init_db()

        with RoomFilter.connect_db() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE;")
                conn.execute("DELETE FROM reservations;")
                conn.execute("DELETE FROM blocked_schedules;")
                conn.execute("DELETE FROM rooms;")
                conn.execute(
                    "DELETE FROM sqlite_sequence WHERE name IN ('reservations', 'blocked_schedules');"
                )

                with ROOMS_CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
                    rooms = []
                    for row in csv.DictReader(f):
                        rooms.append(
                            (
                                row["room_id"],
                                row["building"],
                                int(row["floor"]) if row.get("floor") else None,
                                row.get("room_number"),
                                int(row["capacity"]),
                                float(row["capacity_avg"]) if row.get("capacity_avg") else None,
                                row.get("room_type"),
                                int(row.get("location_score") or 3),
                                int(row.get("accessibility_score") or 3),
                                int(row.get("priority") or 3),
                            )
                        )

                conn.executemany(
                    """
                    INSERT INTO rooms
                    (room_id, building, floor, room_number, capacity, capacity_avg,
                     room_type, location_score, accessibility_score, priority)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    rooms,
                )

                with BLOCKED_CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
                    blocked = []
                    for row in csv.DictReader(f):
                        blocked.append(
                            (
                                row["course_id"],
                                row["room_id"],
                                row["day"],
                                int(row["period"]),
                                int(row["capacity"]) if row.get("capacity") else None,
                            )
                        )

                conn.executemany(
                    """
                    INSERT INTO blocked_schedules
                    (course_id, room_id, day, period, capacity)
                    VALUES (?, ?, ?, ?, ?);
                    """,
                    blocked,
                )

                conn.commit()
            except Exception:
                conn.rollback()
                raise

    @staticmethod
    def _normalize_periods(periods: list[int] | tuple[int, ...] | None) -> list[int]:
        if not periods:
            return []

        normalized = sorted({int(period) for period in periods})
        invalid = [period for period in normalized if period < 1 or period > 12]
        if invalid:
            raise ValueError(f"period must be between 1 and 12: {invalid}")
        return normalized

    @staticmethod
    def filter_rooms(
        room_number: str | None = None,
        people: int | None = None,
        floor: int | None = None,
        date: str | None = None,
        day: str | None = None,
        periods: list[int] | tuple[int, ...] | None = None,
    ) -> list[tuple]:
        """
        Return rooms that match room/capacity/floor filters and are available.

        room_number accepts either the schema's room_number value ("100") or the
        data file's room_id value ("AI관-100").
        periods is a list of class periods to check, e.g. [5, 6].
        """
        RoomFilter.ensure_seed_data()

        if date and not day:
            day = RoomFilter.get_day_from_date(date)

        normalized_periods = RoomFilter._normalize_periods(periods)

        query = """
        SELECT
            r.room_id,
            r.room_number,
            r.floor,
            r.capacity
        FROM rooms r
        WHERE (:target_room IS NULL OR r.room_id = :target_room OR r.room_number = :target_room)
          AND (:target_people IS NULL OR r.capacity >= :target_people)
          AND (:target_floor IS NULL OR r.floor = :target_floor)
        """

        params: dict[str, object] = {
            "target_room": room_number,
            "target_people": int(people) if people is not None else None,
            "target_floor": int(floor) if floor is not None else None,
            "target_date": date,
            "target_day": day,
        }

        if day and normalized_periods:
            placeholders = []
            reservation_period_checks = []
            for index, period in enumerate(normalized_periods):
                key = f"period_{index}"
                placeholders.append(f":{key}")
                reservation_period_checks.append(
                    f"(res.start_period <= :{key} AND :{key} < res.end_period)"
                )
                params[key] = period

            query += f"""
              AND NOT EXISTS (
                  SELECT 1
                  FROM blocked_schedules bs
                  WHERE bs.room_id = r.room_id
                    AND bs.day = :target_day
                    AND bs.period IN ({", ".join(placeholders)})
              )
            """

            if date:
                query += f"""
                  AND NOT EXISTS (
                      SELECT 1
                      FROM reservations res
                      WHERE res.room_id = r.room_id
                        AND res.date = :target_date
                        AND ({" OR ".join(reservation_period_checks)})
                  )
                """

        query += " ORDER BY r.priority DESC, r.capacity ASC, r.room_id ASC;"

        try:
            with RoomFilter.connect_db() as conn:
                cur = conn.execute(query, params)
                return cur.fetchall()
        except sqlite3.Error as exc:
            print(f"Database error: {exc}")
            return []


if __name__ == "__main__":
    print("1. 특정 날짜/시간 검색:", RoomFilter.filter_rooms(date="2026-06-02", periods=[5, 6])[:5])
    print("2. 특정 강의실 검색:", RoomFilter.filter_rooms(room_number="AI관-100"))
    print("3. 인원/층 검색:", RoomFilter.filter_rooms(people=40, floor=3)[:5])
