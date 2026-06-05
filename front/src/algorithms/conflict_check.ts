import { Reservation } from '../types';
import { getStoredReservations } from './db_and_auth';

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 08. 실시간 해시 맵 예약 조회 캐시 모듈]
 * -------------------------------------------------------------------------------------
 * 현재는 프론트엔드 단에서 중복 예약을 빠르게 확인하기 위해 `Map<string, Reservation[]>` 객체(해시맵)를 캐시로 빌드하고 있습니다.
 * 실제 백엔드 연동 시:
 * - 이 캐싱 기법은 Redis 캐시, Memcached 또는 백엔드 애플리케이션 프레임워크(Spring Cache, Node-cache) 내의 인메모리 스토리지로 마이그레이션되는 것이 이상적입니다.
 * - 또한, DB 단의 인덱스 설정(`CREATE INDEX idx_reservation_room_date ON reservation(room_id, date);`)을 통해 O(1) 수준의 조회를 데이터베이스 엔진 자체에서 직접 수행할 수도 있습니다.
 * =====================================================================================
 */

// Member A's Real-time Hash Map Cache simulator
// Key: "roomId:date", Value: Array of reservations booked.
export class ReservationHashMapCache {
  private cache: Map<string, Reservation[]> = new Map();

  constructor() {
    this.rebuildCache();
  }

  // Populate cache from standard database (represented by our local store)
  public rebuildCache(): void {
    this.cache.clear();
    const reservations = getStoredReservations();
    for (const res of reservations) {
      const key = `${res.roomId}:${res.date}`;
      if (!this.cache.has(key)) {
        this.cache.set(key, []);
      }
      this.cache.get(key)!.push(res);
    }
  }

  // Get matching reservations in O(1) time
  public getReservations(roomId: string, date: string): Reservation[] {
    const key = `${roomId}:${date}`;
    return this.cache.get(key) || [];
  }
}

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 09. 이진 탐색 기법을 이용한 시간대 충돌 검증]
 * -------------------------------------------------------------------------------------
 * 예약된 교시(periods)를 정렬한 후, 이진 탐색(`binarySearchPeriod`)을 실행하여 중복 예약 여부를 확인하고 있습니다.
 * 실제 백엔드 연동 시:
 * - 데이터베이스 제약 조건 및 SQL 쿼리를 활용하여 중복 예약을 체크하는 것이 가장 안정적입니다.
 * - 이진 탐색 대신 DB 트랜잭션과 격리 수준(Transaction Isolation Level - SERIALIZABLE 또는 SELECT ... FOR UPDATE)을 구축하여 
 *   동시성 제어(Concurrency Control)를 구현해야 예약 데이터 불일치를 피해 완벽하게 충돌을 방지할 수 있습니다.
 * - 예시 SQL: `SELECT COUNT(*) FROM reservation WHERE room_id = ? AND date = ? AND period IN (?)`
 * =====================================================================================
 */

// Classical Binary Search function returning boolean (whether item is found)
export function binarySearchPeriod(arr: number[], target: number): boolean {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) {
      return true;
    } else if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return false;
}


/**
 * Checks for schedule conflicts using Member A's Binary Search logic.
 * @param cache Hash map lookup cache
 * @param roomId Classroom ID
 * @param date YYYY-MM-DD
 * @param periods Array of periods to book (e.g. [3, 4])
 * @returns true if conflict exists, false otherwise
 */
export function verifyPeriodsConflict(
  cache: ReservationHashMapCache,
  roomId: string,
  date: string,
  periods: number[]
): boolean {
  // O(1) hash map access
  const dayReservations = cache.getReservations(roomId, date);

  // Extract all currently booked periods and sort them to prepare for Binary Search
  const bookedPeriods: number[] = [];
  for (const res of dayReservations) {
    bookedPeriods.push(...res.periods);
  }
  bookedPeriods.sort((a, b) => a - b);

  // For each requested period, binary search inside the sorted list of already booked periods
  for (const p of periods) {
    if (binarySearchPeriod(bookedPeriods, p)) {
      return true; // Conflict found!
    }
  }

  return false; // No conflict
}
