"""
Team Member D: Autonomous Transaction History Manager
역할: UI 레이어의 개입 없이, 오직 undo()/redo() 호출만으로 
      실제 DB(classfit.db)의 예약 행을 실시간으로 생성(INSERT) 및 삭제(DELETE)하는 자율형 이력 매니저.
"""

import sqlite3
from datetime import datetime
from database_v2 import connect_db

class ReservationHistoryManager:
    def __init__(self):
        # LIFO(후입선출) 구조의 순수 스택 2개 초기화
        self.undo_stack = []
        self.redo_stack = []

    def push_history(self, action: str, data: dict):
        """새로운 예약/취소 행동이 발생하면 Undo 스택에 적재하고 Redo 스택을 비웁니다."""
        self.undo_stack.append({'action': action, 'data': data})
        self.redo_stack.clear()

    def undo(self):
        """직전 예약 작업을 실시간으로 취소하거나 복구하며 DB 데이터를 자율 갱신합니다."""
        if not self.undo_stack:
            return False, "되돌릴 작업이 없습니다."

        command = self.undo_stack.pop()
        action = command['action']
        data = command['data']

        conn = connect_db() # 팀원 A의 WAL 모드 연결 상속
        try:
            cursor = conn.cursor()
            
            if action == 'INSERT':
                # [상황] 방금 예약을 등록(INSERT)했던 행동을 Undo 하므로 -> DB에서 해당 행을 실시간 DELETE
                cursor.execute("DELETE FROM reservations WHERE reservation_id = ?;", (data['reservation_id'],))
                self.redo_stack.append({'action': 'INSERT', 'data': data})
                msg = f"Undo 완료: 예약 ID {data['reservation_id']}번 취소(DB 행 삭제)"

            elif action == 'DELETE':
                # [상황] 기존 예약을 삭제(DELETE)했던 행동을 Undo 하므로 -> DB에 해당 행을 실시간 다시 INSERT
                # 💡 보정 포인트: CSV 스키마와 완벽 동기화하여 created_at까지 매핑 완료!
                current_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute(
                    """
                    INSERT INTO reservations 
                    (reservation_id, room_id, date, day, start_period, end_period, user_name, purpose, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (data['reservation_id'], data['room_id'], data['date'], data['day'],
                     data['start_period'], data['end_period'], data['user_name'], 
                     data.get('purpose', ''), data.get('created_at', current_now))
                )
                self.redo_stack.append({'action': 'DELETE', 'data': data})
                msg = f"Undo 완료: 예약 ID {data['reservation_id']}번 복구(DB 행 재삽입)"

            conn.commit() # 예외가 없으면 트랜잭션 실시간 확정 및 디스크 저장
            return True, msg

        except sqlite3.Error as e:
            conn.rollback() # DB 반영 실패 시 완전 롤백
            self.undo_stack.append(command) # 자료구조 롤백: 꺼냈던 명령을 다시 스택 Top에 push
            return False, f"Undo 실패 (DB 오류): {e}"
            
        finally:
            conn.close() # 자원 누수 차단: 무조건 커넥션 반환

    def redo(self):
        """Undo로 취소했던 예약 행동을 다시 실행하여 DB 데이터를 실시간 재갱신합니다."""
        if not self.redo_stack:
            return False, "다시 실행할 작업이 없습니다."

        command = self.redo_stack.pop()
        action = command['action']
        data = command['data']

        conn = connect_db()
        try:
            cursor = conn.cursor()
            
            if action == 'INSERT':
                # 취소되었던 예약을 다시 실시간 INSERT로 복구
                current_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute(
                    """
                    INSERT INTO reservations 
                    (reservation_id, room_id, date, day, start_period, end_period, user_name, purpose, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (data['reservation_id'], data['room_id'], data['date'], data['day'],
                     data['start_period'], data['end_period'], data['user_name'], 
                     data.get('purpose', ''), data.get('created_at', current_now))
                )
                self.undo_stack.append({'action': 'INSERT', 'data': data})
                msg = f"Redo 완료: 예약 ID {data['reservation_id']}번 재신청(DB 행 재삽입)"

            elif action == 'DELETE':
                # 복구되었던 예약을 다시 실시간 DELETE로 취소
                cursor.execute("DELETE FROM reservations WHERE reservation_id = ?;", (data['reservation_id'],))
                self.undo_stack.append({'action': 'DELETE', 'data': data})
                msg = f"Redo 완료: 예약 ID {data['reservation_id']}번 다시 취소(DB 행 삭제)"

            conn.commit()
            return True, msg

        except sqlite3.Error as e:
            conn.rollback()
            self.redo_stack.append(command) # 자료구조 롤백
            return False, f"Redo 실패 (DB 오류): {e}"
            
        finally:
            conn.close() # 자원 해제 보장