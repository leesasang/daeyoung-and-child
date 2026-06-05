import { Classroom } from '../types';

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 10. 연결 리스트 및 퀵 정렬 데이터 파이프라인]
 * -------------------------------------------------------------------------------------
 * 이 알고리즘은 다중 정렬 기준(용량순, 우선순위 지수 순, ID 순)에 따라 강의실 목록을 연결 리스트로 변환한 다음, O(N log N)의 효율을 가진 퀵 정렬로 대상을 분해 및 복원합니다.
 * 실제 백엔드 연동 시:
 * - 관계형 데이터베이스(RDBMS) 또는 NoSQL DB를 사용할 경우, 이 정렬 작업은 DB 쿼리 문인 `ORDER BY` 설정을 통해 검색 엔진 레벨에서 일괄 처리될 수 있습니다.
 * - 예: 
 *   - ID 정렬: `SELECT * FROM classroom ORDER BY id ASC;`
 *   - 용량 역정렬: `SELECT * FROM classroom ORDER BY capacity DESC;`
 *   - 정렬 성능 가속화를 위해 정렬 기준 컬럼에 인덱스 설정(`CREATE INDEX idx_classroom_capacity ON classroom(capacity);`)을 고려해 볼 만합니다.
 * - 백엔드 개발자 단에서 타 언어로 연동하겠다면, DB 쿼리를 정렬 기준 인자에 알맞게 동적으로 대입하여 응답하도록 마이그레이션하는 것을 추천합니다.
 * =====================================================================================
 */

// Linked List Node structure representing Member B's backend node configuration
export interface ListNode<T> {
  val: T;
  next: ListNode<T> | null;
}


// Convert array to linked list
export function arrayToLinkedList<T>(arr: T[]): ListNode<T> | null {
  if (arr.length === 0) return null;
  const head: ListNode<T> = { val: arr[0], next: null };
  let current = head;
  for (let i = 1; i < arr.length; i++) {
    current.next = { val: arr[i], next: null };
    current = current.next;
  }
  return head;
}

// Convert linked list back to array
export function linkedListToArray<T>(head: ListNode<T> | null): T[] {
  const result: T[] = [];
  let current = head;
  while (current !== null) {
    result.push(current.val);
    current = current.next;
  }
  return result;
}

// Quick Sort on Linked List
// Returns the sorted linked list head.
export function quickSortLinkedList(
  head: ListNode<Classroom> | null,
  compareFn: (a: Classroom, b: Classroom) => number
): ListNode<Classroom> | null {
  if (!head || !head.next) return head;

  // Pivot will be the head node
  const pivot = head;
  let lessHead: ListNode<Classroom> | null = null;
  let lessTail: ListNode<Classroom> | null = null;
  let greaterHead: ListNode<Classroom> | null = null;
  let greaterTail: ListNode<Classroom> | null = null;

  let current = head.next;
  while (current !== null) {
    const nextNode = current.next;
    current.next = null; // Detach node

    const comp = compareFn(current.val, pivot.val);
    if (comp < 0) {
      if (!lessHead) {
        lessHead = current;
        lessTail = current;
      } else {
        lessTail!.next = current;
        lessTail = current;
      }
    } else {
      if (!greaterHead) {
        greaterHead = current;
        greaterTail = current;
      } else {
        greaterTail!.next = current;
        greaterTail = current;
      }
    }
    current = nextNode;
  }

  // Recursively sort sub-linked lists
  const sortedLess = quickSortLinkedList(lessHead, compareFn);
  const sortedGreater = quickSortLinkedList(greaterHead, compareFn);

  // Re-link: [sortedLess] -> [pivot] -> [sortedGreater]
  pivot.next = sortedGreater;

  if (!sortedLess) {
    return pivot;
  }

  // Find tail of sortedLess to link with pivot
  let lessSearchTail = sortedLess;
  while (lessSearchTail.next !== null) {
    lessSearchTail = lessSearchTail.next;
  }
  lessSearchTail.next = pivot;

  return sortedLess;
}

// Helper to sort classroom arrays using the Linked List Quick Sort pipeline
export function sortClassroomsQuickSort(
  rooms: Classroom[],
  key: 'id' | 'capacity' | 'priority',
  ascending: boolean = true
): Classroom[] {
  const listHead = arrayToLinkedList(rooms);

  // Comparison callback based on key choice and direction multiplier
  const mult = ascending ? 1 : -1;
  const compareFn = (a: Classroom, b: Classroom): number => {
    if (key === 'capacity') {
      return (a.capacity - b.capacity) * mult;
    }
    if (key === 'priority') {
      return (a.priority - b.priority) * mult;
    }
    // String compare for ID
    return a.id.localeCompare(b.id) * mult;
  };

  const sortedHead = quickSortLinkedList(listHead, compareFn);
  return linkedListToArray(sortedHead);
}
