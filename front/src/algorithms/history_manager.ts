import { Reservation, HistoryAction } from '../types';
import { getStoredReservations, saveStoredReservations } from './db_and_auth';
import { ReservationHashMapCache } from './conflict_check';

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 12. Undo / Redo LIFO 트랜잭션 기록 스택 매니저]
 * -------------------------------------------------------------------------------------
 * 이 매니저는 LIFO(Last-In-First-Out) 구조의 Stack을 이용해 사용자의 최근 작업(신청, 취소 등)을 로컬스토리지에 저장하고, 
 * '실행 취소(Undo)' 및 '다시 실행(Redo)' 할 수 있는 변경 이력 관리 메커니즘을 제공합니다.
 * 실제 백엔드 연동 시:
 * - 이 작업 이력 스택은 사용자의 편리를 위해 프론트엔드 단의 상태(State)나 브라우저 SessionStorage에 유지할 수도 있지만,
 * - 여러 기기나 브라우저 세션 전환 시 이력을 완벽하게 영속적으로 관리하려 할 경우 세그먼트별로 `user_action_history` 라는 DB 테이블로 이전하여 관리할 수 있습니다.
 * - 또한, 예약을 실제로 서버에서 완전 삭제(Hard Delete)하기보다 `is_deleted` 또는 `status = 'canceled'` 컬럼과 같은 방식으로 소프트 삭제(Soft Delete)하고, 
 *   취소 이벤트를 마스터 백로그에 마일스톤으로 영속하여 롤백(Revert) 트랜잭션 API를 호출하는 형태로 가다듬는 것을 적극 권장합니다.
 * =====================================================================================
 */

const DEPLOY_KEY_UNDO = 'classfit_undo_stack';
const DEPLOY_KEY_REDO = 'classfit_redo_stack';


export class ReservationHistoryManager {
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    const undoData = localStorage.getItem(DEPLOY_KEY_UNDO);
    const redoData = localStorage.getItem(DEPLOY_KEY_REDO);
    if (undoData) {
      this.undoStack = JSON.parse(undoData);
    }
    if (redoData) {
      this.redoStack = JSON.parse(redoData);
    }
  }

  private saveToStorage(): void {
    localStorage.setItem(DEPLOY_KEY_UNDO, JSON.stringify(this.undoStack));
    localStorage.setItem(DEPLOY_KEY_REDO, JSON.stringify(this.redoStack));
  }

  // Get stacks sizing for indicator count
  public getUndoCount(): number {
    return this.undoStack.length;
  }

  public getRedoCount(): number {
    return this.redoStack.length;
  }

  // Adds a positive action (booking a new room) or negative action (canceling a room) to LIFO history
  public recordAction(type: 'ADD' | 'DELETE', reservation: Reservation): void {
    const action: HistoryAction = {
      id: `ACT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      reservation,
      timestamp: Date.now(),
    };
    this.undoStack.push(action);
    this.redoStack = []; // Standard behavior: clear Redo stack upon a new forward user action
    this.saveToStorage();
  }

  // Performs UNDO operation
  public undo(): { success: boolean; messageKey: string } {
    if (this.undoStack.length === 0) {
      return { success: false, messageKey: 'noUndo' };
    }

    const action = this.undoStack.pop()!;
    const reservations = getStoredReservations();

    if (action.type === 'ADD') {
      // Revert booking: delete the added reservation
      const filtered = reservations.filter((r) => r.id !== action.reservation.id);
      saveStoredReservations(filtered);
    } else {
      // Revert canceling: restore the deleted reservation (avoid duplicate ID)
      if (!reservations.some((r) => r.id === action.reservation.id)) {
        reservations.push(action.reservation);
        saveStoredReservations(reservations);
      }
    }

    // Push to redo stack for possible recovery
    this.redoStack.push(action);
    this.saveToStorage();

    return { success: true, messageKey: 'undoSuccess' };
  }

  // Performs REDO operation
  public redo(): { success: boolean; messageKey: string } {
    if (this.redoStack.length === 0) {
      return { success: false, messageKey: 'noRedo' };
    }

    const action = this.redoStack.pop()!;
    const reservations = getStoredReservations();

    if (action.type === 'ADD') {
      // Redo booking: re-add if not exists
      if (!reservations.some((r) => r.id === action.reservation.id)) {
        reservations.push(action.reservation);
        saveStoredReservations(reservations);
      }
    } else {
      // Redo canceling: re-delete
      const filtered = reservations.filter((r) => r.id !== action.reservation.id);
      saveStoredReservations(filtered);
    }

    // Push back to undo stack
    this.undoStack.push(action);
    this.saveToStorage();

    return { success: true, messageKey: 'redoSuccess' };
  }

  // Master purge
  public clearAllHistories(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.saveToStorage();
  }
}
