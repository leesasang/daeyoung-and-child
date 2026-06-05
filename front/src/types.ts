export interface Classroom {
  id: string; // e.g., "IT-401", "Global-502"
  roomNumber: string; // "401", "502"
  building: string; // "AI Building" (IT융합대학), "Global Center" (글로벌센터), "College of Engineering" (공과대학)
  capacity: number;
  equipment: string[]; // e.g., ["Projector", "Whiteboard", "PC Lab", "Sound System"]
  nearby: string[]; // Adjacent classroom IDs for BFS recommendations
  priority: number; // Usage priority for priority queue / sliding window sorting
}

export interface Reservation {
  id: string;
  roomId: string; // Classroom ID
  userId: string; // Student or Staff ID
  date: string; // "YYYY-MM-DD"
  periods: number[]; // Ordered array of periods, e.g., [1, 2, 3]
  purpose: string;
  createdAt: number; // Timestamp
}

export interface HistoryAction {
  id: string;
  type: 'ADD' | 'DELETE';
  reservation: Reservation;
  timestamp: number;
}

export interface SearchCriteria {
  building: string; // "All" or building name
  capacity: number; // minimum capacity
  equipment: string[]; // selected equipment items
  searchQuery: string; // room name/number search
  sortBy: 'id' | 'capacity' | 'priority'; // sorted by list / Quick Sort keys
  sortOrder: 'asc' | 'desc';
}

export type UserRole = 'student' | 'professor' | 'admin';

export interface UserSession {
  userId: string;
  role: UserRole;
  name: string;
}
