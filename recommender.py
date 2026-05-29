"""
Team Member D: Priority Queue BFS Room Recommender (Interval Corrected)
역할: [유형 > 수용인원 > 평균수용량 > 거리] 기반 우선순위 탐색.
      팀원 A의 예약 검증 로직에 맞추어 종료 교시 이하(<=) 조건으로 정규 수업 충돌을 완벽 방어합니다.
"""

import heapq
import sqlite3
from datetime import datetime
from database_v2 import connect_db

def get_day_from_date(date_text: str) -> str:
    """YYYY-MM-DD 형식을 요일로 변환. 실패 시 None 반환"""
    try:
        weekdays = ["월", "화", "수", "목", "금", "토", "일"]
        dt = datetime.strptime(date_text, "%Y-%m-%d")
        return weekdays[dt.weekday()]
    except (ValueError, TypeError):
        return None

def safe_int(value, default=0):
    """비어있거나 문자가 섞인 데이터를 안전하게 정수화"""
    try:
        return int(float(value)) if value else default
    except (ValueError, TypeError):
        return default

def recommend_adjacent_classroom_bfs(failed_room_id: str, date: str, start_period: int, end_period: int):
    # -----------------------------------------------------------------
    # 🛡️ 1. 입력값 논리 검증 (예외 처리)
    # -----------------------------------------------------------------
    if start_period >= end_period:
        return {"success": False, "message": "❌ 추천 실패: 종료 교시는 시작 교시보다 커야 합니다."}

    day = get_day_from_date(date)
    if not day:
        return {"success": False, "message": "❌ 추천 실패: 올바른 날짜 형식(YYYY-MM-DD)이 아닙니다."}
    
    with connect_db() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 전체 강의실 가용 자원 로드
        cursor.execute("SELECT room_id, building, floor, priority, room_type, capacity, capacity_avg FROM rooms")
        all_rooms = cursor.fetchall()
        
        # 예약 테이블 내 실시간 중복 예약 방 ID 추출
        cursor.execute('''
            SELECT DISTINCT room_id FROM reservations 
            WHERE date = ? AND start_period < ? AND end_period > ?
        ''', (date, end_period, start_period))
        reserved_rooms = {row['room_id'] for row in cursor.fetchall()}

        # 💡 보정 포인트: 팀원 A의 검증 범위에 맞추어 period <= end_period 로 변경
        # 종료 교시(ex: 5교시)에 배치된 정규 수업까지 꼼꼼하게 블랙리스트로 걸러냅니다.
        cursor.execute('''
            SELECT DISTINCT room_id FROM blocked_schedules 
            WHERE day = ? AND period >= ? AND period <= ?
        ''', (day, start_period, end_period))
        blocked_rooms = {row['room_id'] for row in cursor.fetchall()}

        unavailable_rooms = reserved_rooms.union(blocked_rooms)

    # 안전하게 딕셔너리 매핑
    room_dict = {}
    for r in all_rooms:
        r_id = r['room_id']
        room_dict[r_id] = {
            'building': r['building'] or "알수없음",
            'floor': safe_int(r['floor'], 1),
            'priority': safe_int(r['priority'], 3),
            'type': r['room_type'] or "일반강의실",
            'cap': safe_int(r['capacity'], 40),
            'cap_avg': safe_int(r['capacity_avg'], safe_int(r['capacity'], 40))
        }
    
    available_rooms = [r_id for r_id in room_dict if r_id not in unavailable_rooms]
    if not available_rooms:
        return {"success": False, "message": "해당 시간에 캠퍼스 내 사용 가능한 다른 강의실이 없습니다."}

    # -----------------------------------------------------------------
    # 🛡️ 2. DB에 존재하지 않는 방 ID 필터링
    # -----------------------------------------------------------------
    if failed_room_id not in room_dict:
        return {"success": False, "message": f"❌ 추천 실패: '{failed_room_id}'는 존재하지 않는 강의실 ID입니다."}

    # -----------------------------------------------------------------
    # 🎯 3. 우선순위 큐(PQ) 기반 BFS 탐색 로직
    # -----------------------------------------------------------------
    target_info = room_dict[failed_room_id]
    pq = []
    heapq.heappush(pq, ((0, 0, 0, 0, 0), 0, failed_room_id))
    visited = {failed_room_id}

    while pq:
        current_priority, current_hop, current_id = heapq.heappop(pq)
        
        if current_id != failed_room_id and current_id not in unavailable_rooms:
            return {
                "success": True,
                "room_id": current_id,
                "room_name": current_id,
                "message": f"💡 [{failed_room_id}] 예약이 마감되어, 조건이 가장 유사한 [{current_id}]를 추천합니다!"
            }

        curr_info = room_dict[current_id]

        # 물리적 간선 연결 (같은 건물, 위아래 1층 차이)
        for r_id, r_info in room_dict.items():
            if r_id not in visited:
                if r_info['building'] == curr_info['building'] and abs(r_info['floor'] - curr_info['floor']) <= 1:
                    visited.add(r_id)
                    
                    type_pen = 0 if r_info['type'] == target_info['type'] else 1
                    cap_pen = abs(r_info['cap'] - target_info['cap'])
                    cap_avg_pen = abs(r_info['cap_avg'] - target_info['cap_avg'])
                    next_hop = current_hop + 1
                    
                    priority = (0, type_pen, cap_pen, cap_avg_pen, next_hop)
                    heapq.heappush(pq, (priority, next_hop, r_id))

    # [Fallback] 탐색망 내에 조건이 일치하는 방이 없을 경우 (가장 등급 높고 큰 방 추천)
    available_rooms.sort(key=lambda x: (room_dict[x]['priority'], room_dict[x]['cap']), reverse=True)
    fallback_id = available_rooms[0]
    return {
        "success": True,
        "room_id": fallback_id,
        "room_name": fallback_id,
        "message": f"⚠️ 주변에 빈 방이 없어, 대안으로 [{fallback_id}]를 추천합니다."
    }