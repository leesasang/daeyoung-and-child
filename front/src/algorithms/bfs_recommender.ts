import { Classroom } from '../types';
import { getStoredRooms } from './db_and_auth';
import { verifyPeriodsConflict, ReservationHashMapCache } from './conflict_check';

/**
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 07. BFS 최단 경로 대체 강의실 추천 알고리즘]
 * -------------------------------------------------------------------------------------
 * 이 알고리즘은 사용자가 예약하려는 강의실이 다른 예약과 겹칠(충돌) 때, 인접 노드(nearby) 정보를 기반으로
 * 너비 우선 탐색(BFS)을 실행하여 해당 시간대에 비어 있는 가장 가까운 대체 강의실을 찾아내는 역할을 합니다.
 * 
 * 실제 백엔드 연동 시:
 * - 이 BFS 탐색은 다음과 같은 방법으로 마이그레이션할 수 있습니다:
 *   1) [백엔드 이식] Java, Python, Go 등의 타 언어 백엔드 API 서비스 레이어로 이 로직을 그대로 포팅하여 
 *      백엔드에서 계산 후 프론트엔드로 JSON 응답 (`/api/recommend?roomId=...`)을 반환합니다.
 *   2) [데이터베이스 이식] SQL 또는 그래프 DB 및 근접 행렬(Adjacency Matrix)을 구축하여 DB 레벨에서 최단거리 쿼리를 수립합니다.
 *      예: 관계형 데이터베이스의 `classroom_nearby` 교차 테이블(Self-Join)을 구성하여 이웃 노드를 탐색합니다.
 * =====================================================================================
 */

/**
 * BFS algorithm to find the nearest unoccupied classroom during schedule conflict.
 * Ensures the shortest edge-distance classroom is recommended.
 * 
 * @param startRoomId The ID of the conflicting classroom
 * @param date Targeted YYYY-MM-DD
 * @param periods Targeted periods array
 * @returns The closest available Classroom object, or null if none
 */
export function recommendAdjacentClassroomBFS(
  startRoomId: string,
  date: string,
  periods: number[]
): Classroom | null {
  const allRooms = getStoredRooms();
  const roomMap = new Map<string, Classroom>();
  for (const r of allRooms) {
    roomMap.set(r.id, r);
  }

  const startRoom = roomMap.get(startRoomId);
  if (!startRoom) return null;

  // Initialize Hash Map cache for conflict verification
  const cache = new ReservationHashMapCache();

  // BFS Queue and Visited trackers
  const queue: string[] = [startRoomId];
  const visited = new Set<string>([startRoomId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentRoom = roomMap.get(currentId);

    if (!currentRoom) continue;

    // Condition to recommend: it is an available classroom (no schedule conflict for target date/periods),
    // and it is distinct from our start room.
    if (currentId !== startRoomId) {
      const hasConflict = verifyPeriodsConflict(cache, currentId, date, periods);
      if (!hasConflict) {
        return currentRoom; // Found closest available adjacent classroom!
      }
    }

    // Expand to neighbors in FIFO queue order (breadth-first)
    if (currentRoom.nearby) {
      for (const neighborId of currentRoom.nearby) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
  }

  // Fallback: If no directly linked nodes are free, search other classrooms in the same building via BFS
  const buildingRooms = allRooms.filter(
    (r) => r.building === startRoom.building && !visited.has(r.id)
  );

  for (const fallbackRoom of buildingRooms) {
    const hasConflict = verifyPeriodsConflict(cache, fallbackRoom.id, date, periods);
    if (!hasConflict) {
      return fallbackRoom;
    }
  }

  return null; // Empty available slots
}

