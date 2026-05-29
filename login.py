from __future__ import annotations

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "classfit.db"



class Login:
    #db 연결하는 함수
    @staticmethod
    def connect_db() -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH,timeout=20)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 10000;")
        return conn

#패스워드와 아이디가 일치하는지 확인하는 함수
    @staticmethod
    def check_password(user_id, user_pw) -> bool:
        conn = Login.connect_db()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT password
                FROM users
                WHERE user_id = ?;
                """, (user_id,))
            current_pw = cur.fetchone()
        finally:
            conn.close()

        if current_pw is not None and current_pw[0] == user_pw:
            print('로그인 성공')
            return True
        else:
            print('로그인 실패')
            return False

    #아이디 비밀번호 입력받는 함수
    @staticmethod
    def getLoginInput():
        user_id = input("아이디: ")
        user_pw = input("비밀번호: ")
        return user_id, user_pw
    
    #로그인 함수
    @staticmethod
    def login() -> bool:
        user_id, user_pw = Login.getLoginInput()
        return Login.check_password(user_id, user_pw)


if __name__ == "__main__":
    login_service = Login()
    value = login_service.login()