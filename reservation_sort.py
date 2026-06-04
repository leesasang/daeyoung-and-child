from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Callable

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "classfit.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"

Reservation = dict[str, object]


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 10000;")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"schema.sql not found: {SCHEMA_PATH}")

    with connect_db() as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


class ReservationSorter:
    SORT_KEYS: dict[str, Callable[[Reservation], tuple]] = {
        "date_name": lambda row: (
            row["date"],
            row["user_name"],
            row["start_period"],
            row["room_id"],
            row["reservation_id"],
        ),
        "name_date": lambda row: (
            row["user_name"],
            row["date"],
            row["start_period"],
            row["room_id"],
            row["reservation_id"],
        ),
    }

    @staticmethod
    def fetch_reservations() -> list[Reservation]:
        init_db()
        with connect_db() as conn:
            rows = conn.execute(
                """
                SELECT
                    rv.reservation_id,
                    rv.room_id,
                    r.building,
                    r.floor,
                    r.room_number,
                    rv.date,
                    rv.day,
                    rv.start_period,
                    rv.end_period,
                    rv.user_name,
                    rv.purpose,
                    rv.created_at
                FROM reservations rv
                LEFT JOIN rooms r ON r.room_id = rv.room_id;
                """
            ).fetchall()

        return [dict(row) for row in rows]

    @staticmethod
    def quick_sort(
        reservations: list[Reservation],
        key: Callable[[Reservation], tuple],
        reverse: bool = False,
    ) -> list[Reservation]:
        if len(reservations) <= 1:
            return reservations[:]

        pivot = reservations[len(reservations) // 2]
        pivot_key = key(pivot)

        lower: list[Reservation] = []
        equal: list[Reservation] = []
        higher: list[Reservation] = []

        for reservation in reservations:
            reservation_key = key(reservation)
            if reservation_key < pivot_key:
                lower.append(reservation)
            elif reservation_key > pivot_key:
                higher.append(reservation)
            else:
                equal.append(reservation)

        sorted_rows = (
            ReservationSorter.quick_sort(lower, key)
            + equal
            + ReservationSorter.quick_sort(higher, key)
        )

        if reverse:
            sorted_rows.reverse()

        return sorted_rows

    @staticmethod
    def get_sorted_reservations(sort_by: str = "date_name", reverse: bool = False) -> list[Reservation]:
        if sort_by not in ReservationSorter.SORT_KEYS:
            valid_options = ", ".join(ReservationSorter.SORT_KEYS)
            raise ValueError(f"sort_by must be one of: {valid_options}")

        reservations = ReservationSorter.fetch_reservations()
        return ReservationSorter.quick_sort(
            reservations,
            key=ReservationSorter.SORT_KEYS[sort_by],
            reverse=reverse,
        )


if __name__ == "__main__":
    print(ReservationSorter.get_sorted_reservations(sort_by="date_name")[:10])
