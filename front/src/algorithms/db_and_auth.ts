import { Classroom, Reservation, UserSession } from '../types';

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 01. 데이터베이스 세션 키값 및 로컬스토리지 모의 영역]
 * -------------------------------------------------------------------------------------
 * 현재 브라우저 환경에서 동작하는 데이터 상태 보존을 위해 LocalStorage 키를 정의하여 사용하고 있습니다.
 * 실제 백엔드 연동 시:
 * - 이 로컬 스토리지 키 관리 및 입출력은 제거되며, 실 데이터베이스(PostgreSQL, MariaDB, Oracle 등)나 DB의 ID/UUID 기준으로 트랜잭션이 작동해야 합니다.
 * =====================================================================================
 */
const STORAGE_KEY_ROOMS = 'classfit_rooms';
const STORAGE_KEY_RESERVATIONS = 'classfit_reservations';

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 02. 하드코딩된 가천대학교 기본 강의실 데이터 프리셋]
 * -------------------------------------------------------------------------------------
 * 현재 데이터베이스가 없을 때 최초 로드되는 하드코딩된 강의실 자산 데이터베이스(SEED)입니다.
 * 실제 백엔드 연동 시:
 * - 이 데이터는 MariaDB, Oracle, PostgreSQL 등 관계형 DBMS의 'classroom' 테이블에 초기 마스터 데이터(DML/SQL 파일) 혹은 CSV Import 형태로 이전되어야 합니다.
 * - 타 언어로 작성된 서버에서 이 데이터를 SQL INSERT 문이나 REST API 초기화 마이그레이션으로 주입해야 합니다.
 * =====================================================================================
 */
const DEFAULT_CLASSROOMS: Classroom[] = [
  {
    id: 'IT-401',
    roomNumber: '401',
    building: 'AI Building (IT융합대학)',
    capacity: 40,
    equipment: ['Projector', 'Whiteboard', 'PC Lab'],
    nearby: ['IT-402', 'IT-403'],
    priority: 8,
  },
  {
    id: 'IT-402',
    roomNumber: '402',
    building: 'AI Building (IT융합대학)',
    capacity: 50,
    equipment: ['Projector', 'Whiteboard', 'PC Lab', 'Sound System'],
    nearby: ['IT-401', 'IT-403', 'IT-404'],
    priority: 9,
  },
  {
    id: 'IT-403',
    roomNumber: '403',
    building: 'AI Building (IT융합대학)',
    capacity: 30,
    equipment: ['Projector', 'Whiteboard'],
    nearby: ['IT-401', 'IT-402'],
    priority: 5,
  },
  {
    id: 'IT-404',
    roomNumber: '404',
    building: 'AI Building (IT융합대학)',
    capacity: 25,
    equipment: ['Whiteboard'],
    nearby: ['IT-402'],
    priority: 3,
  },
  {
    id: 'GB-501',
    roomNumber: '501',
    building: 'Global Center (글로벌센터)',
    capacity: 100,
    equipment: ['Projector', 'Sound System', 'Intel Core-i9 PC Lab', 'Wireless Mic'],
    nearby: ['GB-502'],
    priority: 10,
  },
  {
    id: 'GB-502',
    roomNumber: '502',
    building: 'Global Center (글로벌센터)',
    capacity: 80,
    equipment: ['Projector', 'Whiteboard', 'Sound System'],
    nearby: ['GB-501', 'GB-503'],
    priority: 7,
  },
  {
    id: 'GB-503',
    roomNumber: '503',
    building: 'Global Center (글로벌센터)',
    capacity: 65,
    equipment: ['Projector', 'Whiteboard'],
    nearby: ['GB-502'],
    priority: 6,
  },
  {
    id: 'EG-101',
    roomNumber: '101',
    building: 'College of Engineering (공과대학)',
    capacity: 60,
    equipment: ['Whiteboard', 'Sound System', 'Drafting Boards'],
    nearby: ['EG-102'],
    priority: 4,
  },
  {
    id: 'EG-102',
    roomNumber: '102',
    building: 'College of Engineering (공과대학)',
    capacity: 45,
    equipment: ['Projector', 'Whiteboard'],
    nearby: ['EG-101'],
    priority: 6,
  },
];

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 03. 하드코딩된 예약 이력 모의 데이터 프리셋]
 * -------------------------------------------------------------------------------------
 * 가용 현황판의 테스트 편리를 위해, 미점유 슬롯들을 채워 두고 시각적 효과를 내는 더미 예약 리스트입니다.
 * 실제 백엔드 연동 시:
 * - 이 데이터들은 실제 데이터베이스 내의 'reservation' 테이블에 매핑되어 관리되어야 합니다.
 * - 타 언어(Spring, Node.js express, django 등)의 서비스 레이어에서 DB 조회를 통해 비정형 혹은 정형 SQL 쿼리로 적제한 후 넘겨주도록 변경해야 합니다.
 * =====================================================================================
 */
const DEFAULT_RESERVATIONS: Reservation[] = [
  {
    id: 'RES-001',
    roomId: 'IT-401',
    userId: '202234567',
    date: new Date().toISOString().split('T')[0],
    periods: [1, 2],
    purpose: 'Mobile Software Engineering Co-Working Study',
    createdAt: Date.now() - 3600000 * 5,
  },
  {
    id: 'RES-002',
    roomId: 'IT-402',
    userId: '202112345',
    date: new Date().toISOString().split('T')[0],
    periods: [3, 4, 5],
    purpose: 'Embedded Systems Hackathon Team Practice',
    createdAt: Date.now() - 3600000 * 3,
  },
  {
    id: 'RES-003',
    roomId: 'GB-501',
    userId: 'admin_gachon',
    date: new Date().toISOString().split('T')[0],
    periods: [1, 2, 3, 4],
    purpose: 'Global Freshman Academic Orientation Day',
    createdAt: Date.now() - 3600000 * 24,
  },
];

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 04. 가상 DB 및 로컬 파일 리셋 시스템 모의 함수]
 * -------------------------------------------------------------------------------------
 * 현재 브라우저의 localStorage를 초기화하고 기본 Mock Data로 세팅하는 함수입니다.
 * 실제 백엔드 연동 시:
 * - 마스터 데이터 CSV 로드 및 실 데이터베이스 테이블 DROP/CREATE(혹은 TRUNCATE) 및 마스터 데이터 시딩 쿼리로 대체되어야 합니다.
 * - 타 언어 서버에서 이 기능을 담당할 경우 REST API (`POST /api/infra/reset`) 등을 수행하여 백엔드 DB 상태를 강제로 동기화하도록 구현하십시오.
 * =====================================================================================
 */
export function initializeDB(forceReset: boolean = false): void {
  const roomsStored = localStorage.getItem(STORAGE_KEY_ROOMS);
  const reservationsStored = localStorage.getItem(STORAGE_KEY_RESERVATIONS);

  if (forceReset || !roomsStored) {
    localStorage.setItem(STORAGE_KEY_ROOMS, JSON.stringify(DEFAULT_CLASSROOMS));
  }
  if (forceReset || !reservationsStored) {
    localStorage.setItem(STORAGE_KEY_RESERVATIONS, JSON.stringify(DEFAULT_RESERVATIONS));
  }
}

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 05. 강의 시설 데이터베이스(CRUD) 읽기/쓰기 모의 함수]
 * -------------------------------------------------------------------------------------
 * 현재 로컬 내에서 강의실 목록을 저장하고 조회하여 화면에 뿌려주는 모의 CRUD 함수들입니다.
 * 실제 백엔드 연동 시:
 * - 프론트엔드에서는 전산 API 통신 코드(예: Axios, Fetch API)로 전면 이주 필요:
 *   - getStoredRooms: `GET /api/rooms` 호출
 *   - saveStoredRooms: `POST /api/rooms` 또는 `PUT /api/rooms/:id` 등 상태 전달 호출
 * - 타 백엔드 언어 단에서는 DB 쿼리 문인 `SELECT * FROM classroom`, `UPDATE classroom SET ...` 등으로 변환되어 트랜잭션 내부에서 영속성 레이어에 반영되어야 합니다.
 * =====================================================================================
 */
export function getStoredRooms(): Classroom[] {
  initializeDB();
  const data = localStorage.getItem(STORAGE_KEY_ROOMS);
  return data ? JSON.parse(data) : [];
}

export function saveStoredRooms(rooms: Classroom[]): void {
  localStorage.setItem(STORAGE_KEY_ROOMS, JSON.stringify(rooms));
}

export function getStoredReservations(): Reservation[] {
  initializeDB();
  const data = localStorage.getItem(STORAGE_KEY_RESERVATIONS);
  return data ? JSON.parse(data) : [];
}

export function saveStoredReservations(reservations: Reservation[]): void {
  localStorage.setItem(STORAGE_KEY_RESERVATIONS, JSON.stringify(reservations));
}

/*
 * =====================================================================================
 * [백엔드 연동 및 다른 언어 마이그레이션 대상 - 06. 학사 행정 시스템 통합 로그인(SSO) / 인증 처리기 모의 함수]
 * -------------------------------------------------------------------------------------
 * 정규표현식 매칭을 통해 학번(9자리), 사번(7자리), admin 계정을 구분하는 로컬 인증 처리 함수입니다.
 * 실제 백엔드 연동 시:
 * - 프론트엔드는 이 메서드 대신 REST API (`POST /api/auth/login`) 등을 바인딩해서 요청해야 합니다.
 * - 타 백엔드 언어 및 실제 학내 학사 데이터베이스(예: MSSQL, Oracle SSO) 내부에서 다음과 같이 동작해야 합니다:
 *   - `SELECT user_id, user_role, user_name FROM users WHERE user_id = : cleaned` 호출
 *   - Spring Security, JWT, OAuth 2.0 또는 학내 SSO 통합 인증 메커니즘을 활용하여 토큰을 발행하고, 세션을 발급하는 백엔드 코드로 완전하게 교체되어야 합니다.
 * =====================================================================================
 */
export function authenticateUser(userIdInput: string): UserSession | null {
  const cleaned = userIdInput.trim();
  if (!cleaned) return null;

  // 1. Length of ID == 9 numeric digits -> student
  if (/^\d{9}$/.test(cleaned)) {
    return {
      userId: cleaned,
      role: 'student',
      name: `Student ID ${cleaned} (학부생)`,
    };
  }

  // 2. Length of ID == 7 numeric digits -> professor
  if (/^\d{7}$/.test(cleaned)) {
    return {
      userId: cleaned,
      role: 'professor',
      name: `Professor ID ${cleaned} (교수)`,
    };
  }

  // 3. ID exact match == 'admin' -> admin
  if (cleaned === 'admin') {
    return {
      userId: 'admin',
      role: 'admin',
      name: 'Gachon Staff (가천 행정관)',
    };
  }

  return null;
}
