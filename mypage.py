from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "classfit.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"


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


@dataclass
class ReservationNode:
    data: dict
    next: "ReservationNode | None" = None


class ReservationLinkedList:
    def __init__(self) -> None:
        self.head: ReservationNode | None = None
        self.tail: ReservationNode | None = None
        self.length = 0

    def append(self, reservation: dict) -> None:
        node = ReservationNode(reservation)
        if self.head is None:
            self.head = node
            self.tail = node
        else:
            assert self.tail is not None
            self.tail.next = node
            self.tail = node
        self.length += 1

    def __len__(self) -> int:
        return self.length

    def __iter__(self) -> Iterator[dict]:
        current = self.head
        while current is not None:
            yield current.data
            current = current.next

    def to_list(self) -> list[dict]:
        return list(self)

    def find_by_reservation_id(self, reservation_id: int) -> dict | None:
        target_id = int(reservation_id)
        for reservation in self:
            if reservation["reservation_id"] == target_id:
                return reservation
        return None

    def remove_by_reservation_id(self, reservation_id: int) -> bool:
        target_id = int(reservation_id)
        previous: ReservationNode | None = None
        current = self.head

        while current is not None:
            if current.data["reservation_id"] == target_id:
                if previous is None:
                    self.head = current.next
                else:
                    previous.next = current.next

                if self.tail is current:
                    self.tail = previous

                self.length -= 1
                return True

            previous = current
            current = current.next

        return False


class MyPage:
    @staticmethod
    def _get_user_name_by_id(user_id: int) -> str | None:
        init_db()
        with connect_db() as conn:
            row = conn.execute(
                "SELECT user_name FROM users WHERE user_id = ?;",
                (int(user_id),),
            ).fetchone()
        return row["user_name"] if row else None

    @staticmethod
    def get_reservations(user_name: str | None = None, user_id: int | None = None) -> ReservationLinkedList:
        if user_name is None and user_id is not None:
            user_name = MyPage._get_user_name_by_id(user_id)

        if not user_name:
            raise ValueError("user_name or user_id is required.")

        init_db()
        linked_list = ReservationLinkedList()

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
                LEFT JOIN rooms r ON r.room_id = rv.room_id
                WHERE rv.user_name = ?
                ORDER BY rv.date ASC, rv.start_period ASC, rv.room_id ASC;
                """,
                (user_name,),
            ).fetchall()

        for row in rows:
            linked_list.append(dict(row))

        return linked_list

    @staticmethod
    def get_reservations_as_list(user_name: str | None = None, user_id: int | None = None) -> list[dict]:
        return MyPage.get_reservations(user_name=user_name, user_id=user_id).to_list()


if __name__ == "__main__":
    reservations = MyPage.get_reservations_as_list(user_name="test")
    print(reservations)
