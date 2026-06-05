import { Classroom, Reservation } from '../types';
import { getStoredReservations } from './db_and_auth';

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 11. 슬라이딩 윈도우 & 우선순위 큐 연속 공강 매칭]
 * -------------------------------------------------------------------------------------
 * 이 파일은 크기 K의 슬라이딩 윈도우를 한 칸씩 이동해가며, 특정 일자에 연속 공강(예: 1~3교시 빈 방)이 긴 강의실들을 찾아내고 가중치를 계산해 우선순위 큐(Priority Queue) 순으로 실시간 가열 상태를 정렬합니다.
 * 실제 백엔드 연동 시:
 * - 이 로직은 백엔드에서 수행하거나, 똑똑한 데이터베이스 쿼리로 부분 대체할 수 있습니다:
 *   1) [백엔드 이식] Spring Boot 등에서 고성능 PriorityQueue 모듈이나 Heap 구조를 활용하여 연산한 후 `/api/rooms/vacant` 엔드포인트로 조회한 결과를 클라이언트에 내려줍니다.
 *   2) [데이터베이스 이식] 시간대/교시를 별도의 테이블(예: `room_schedule`)로 정규화한 뒤, 연속 비어 있는 예약이 조회되는 SQL 쿼리를 활용할 수도 있습니다.
 * =====================================================================================
 */

export interface SlidingWindowResult {

  room: Classroom;
  longestStreak: number; // Longest overall contiguous free periods
  compliantWindows: string[]; // List of compliant intervals (e.g., ["1-3", "5-7"])
  priorityScore: number; // Score computed for priority queue alignment
}

// Priority Queue implementation using a simple Sorted Array wrapper for reliability & clarity
export class ClassroomPriorityQueue {
  private items: { element: SlidingWindowResult; priority: number }[] = [];

  // Higher priority number = higher urgency / rank
  public enqueue(element: SlidingWindowResult, priority: number): void {
    const queueElement = { element, priority };
    let contain = false;

    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].priority < queueElement.priority) {
        this.items.splice(i, 0, queueElement);
        contain = true;
        break;
      }
    }

    if (!contain) {
      this.items.push(queueElement);
    }
  }

  public dequeue(): SlidingWindowResult | undefined {
    const item = this.items.shift();
    return item ? item.element : undefined;
  }

  public toArray(): SlidingWindowResult[] {
    return this.items.map((item) => item.element);
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }
}

/**
 * Analyses classroom period schedules using a Sliding Window of size `windowSize`.
 * Returns classrooms prioritized by Priority Queue criteria.
 * 
 * @param date The targeted YYYY-MM-DD
 * @param windowSize The consecutive empty periods required (size of sliding window)
 */
export function analyzeClassroomsSlidingWindow(
  rooms: Classroom[],
  date: string,
  windowSize: number
): SlidingWindowResult[] {
  const reservations = getStoredReservations();
  const pq = new ClassroomPriorityQueue();

  for (const room of rooms) {
    // 1-indexed periods from 1 to 9. Represented as boolean array where indices 1..9 are true if occupied, false if free.
    const isOccupied = new Array(10).fill(false);

    // Filter reservations on target date for this room
    const roomDayReservations = reservations.filter(
      (r) => r.roomId === room.id && r.date === date
    );

    for (const r of roomDayReservations) {
      for (const p of r.periods) {
        if (p >= 1 && p <= 9) {
          isOccupied[p] = true;
        }
      }
    }

    // 1. Sliding Window check of size K (Consecutive Free Slots)
    const compliantWindows: string[] = [];
    
    // Slide a window of size 'windowSize' from start period = 1 to end period = (10 - windowSize)
    for (let start = 1; start <= 10 - windowSize; start++) {
      let isWindowFree = true;
      for (let offset = 0; offset < windowSize; offset++) {
        if (isOccupied[start + offset]) {
          isWindowFree = false;
          break;
        }
      }
      if (isWindowFree) {
        const end = start + windowSize - 1;
        compliantWindows.push(`${start}~${end} 교시`);
      }
    }

    // 2. Compute Longest Idle Streak
    let longestStreak = 0;
    let currentStreak = 0;
    for (let p = 1; p <= 9; p++) {
      if (!isOccupied[p]) {
        currentStreak++;
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }
      } else {
        currentStreak = 0;
      }
    }

    // Include this classroom if it has at least one compliant window of requested size
    // OR if we want to display all rooms with their streaks
    const result: SlidingWindowResult = {
      room,
      longestStreak,
      compliantWindows,
      // Priority Score = Base Room Priority * 10 + Longest Streak * 5
      priorityScore: room.priority * 10 + longestStreak * 5,
    };

    // If sliding window size is met, enqueue in the PQ with priorityScore as weights
    if (windowSize === 0 || compliantWindows.length > 0) {
      pq.enqueue(result, result.priorityScore);
    }
  }

  return pq.toArray();
}
