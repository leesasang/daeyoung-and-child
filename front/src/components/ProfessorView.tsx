import React, { useState, useEffect } from 'react';
import { Classroom, Reservation, SearchCriteria, UserSession } from '../types';
import { LangType, LANG_DICT } from '../localization';
import { getStoredRooms, getStoredReservations, saveStoredReservations } from '../algorithms/db_and_auth';
import { sortClassroomsQuickSort } from '../algorithms/quick_sort';
import { ReservationHashMapCache, verifyPeriodsConflict } from '../algorithms/conflict_check';
import { recommendAdjacentClassroomBFS } from '../algorithms/bfs_recommender';
import { ReservationHistoryManager } from '../algorithms/history_manager';
import { analyzeClassroomsSlidingWindow, SlidingWindowResult } from '../algorithms/sliding_window';
import HistoryController from './HistoryController';
import {
  Search,
  Calendar,
  Filter,
  ArrowUpDown,
  CheckCircle,
  AlertTriangle,
  Undo2,
  Redo2,
  X,
  History,
  LogOut,
  Sparkles,
  BookMarked,
  MapPin,
  Users,
  Grid,
  Clock
} from 'lucide-react';

interface ProfessorViewProps {
  session: UserSession;
  lang: LangType;
  setLang: (l: LangType) => void;
  onLogout: () => void;
  historyMgr: ReservationHistoryManager;
}

interface AcademicLecture {
  id: string;
  courseName: string;
  courseNameEn: string;
  instructor: string;
  dept: string;
  deptEn: string;
  roomId: string;
  periods: number[];
  dayOfWeek: string;
  dayOfWeekEn: string;
}

// Fixed department lectures mock DB
const FIXED_LECTURES: AcademicLecture[] = [
  {
    id: 'LEC-001',
    courseName: '인공지능 소프트웨어 융합 특론',
    courseNameEn: 'Advanced AI Software Convergence',
    instructor: '김석태 교수',
    dept: 'IT융합대학',
    deptEn: 'IT Convergence College',
    roomId: 'IT-401',
    periods: [1, 2, 3],
    dayOfWeek: '월요일',
    dayOfWeekEn: 'Monday',
  },
  {
    id: 'LEC-002',
    courseName: '모바일 소프트웨어 임베디드 핵심 세미나',
    courseNameEn: 'Core Mobile Software & Embedded Seminar',
    instructor: '이선우 교수',
    dept: 'IT융합대학',
    deptEn: 'IT Convergence College',
    roomId: 'IT-402',
    periods: [5, 6],
    dayOfWeek: '화요일',
    dayOfWeekEn: 'Tuesday',
  },
  {
    id: 'LEC-003',
    courseName: '글로벌 무역 거시 마케팅 전략론',
    courseNameEn: 'Global Trade & Macro-Marketing Strategy',
    instructor: 'Richard Park',
    dept: '글로벌학부',
    deptEn: 'Global Studies Dept',
    roomId: 'GB-501',
    periods: [2, 3, 4],
    dayOfWeek: '수요일',
    dayOfWeekEn: 'Wednesday',
  },
  {
    id: 'LEC-004',
    courseName: '차세대 공학 재료 하이브리드 세미나',
    courseNameEn: 'Next-Gen Engineering Materials Hybrid Seminar',
    instructor: '최영주 교수',
    dept: '공과대학',
    deptEn: 'Engineering College',
    roomId: 'EG-101',
    periods: [7, 8, 9],
    dayOfWeek: '목요일',
    dayOfWeekEn: 'Thursday',
  }
];

export default function ProfessorView({
  session,
  lang,
  setLang,
  onLogout,
  historyMgr,
}: ProfessorViewProps) {
  const t = LANG_DICT[lang];

  // Active Tab
  const [activeTab, setActiveTab] = useState<'vacant-finder' | 'search' | 'academic-schedule' | 'my-bookings'>('vacant-finder');

  // Database States
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  // Sliding Window (Vacant Slot Finder) States
  const [windowDate, setWindowDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [windowSize, setWindowSize] = useState<number>(3); // Default consecutive hours = 3 hours
  const [slidingResults, setSlidingResults] = useState<SlidingWindowResult[]>([]);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

  // Standard interactive search criteria
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>({
    building: 'All',
    capacity: 0,
    equipment: [],
    searchQuery: '',
    sortBy: 'id',
    sortOrder: 'asc',
  });

  // Standard interactive booking form
  const [selectedRoom, setSelectedRoom] = useState<Classroom | null>(null);
  const [bookingDate, setBookingDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedPeriods, setSelectedPeriods] = useState<number[]>([]);
  const [bookingPurpose, setBookingPurpose] = useState<string>('');

  // Collision conflict and BFS Alternate Recommendation States
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [conflictOccurred, setConflictOccurred] = useState<boolean>(false);
  const [recommendedRoom, setRecommendedRoom] = useState<Classroom | null>(null);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);

  // Undo/Redo stack counters for LIFO stacks
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // Load baseline local database parameters
  const loadWorkspaceData = () => {
    const rooms = getStoredRooms();
    setClassrooms(rooms);
    setReservations(getStoredReservations());
    setUndoCount(historyMgr.getUndoCount());
    setRedoCount(historyMgr.getRedoCount());

    // Calculate initial sliding window analysis
    const analysis = analyzeClassroomsSlidingWindow(rooms, windowDate, windowSize);
    setSlidingResults(analysis);
  };

  // Synchronized Streamlit rerun simulator for React state refresh
  const st = {
    rerun: () => {
      loadWorkspaceData();
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, []);

  // Recalculate vacant slot finder when criteria change
  const triggerVacantFinderAnalysis = () => {
    // ====================================================
    // TODO: 백엔드 API 연동 파트
    // - 담당 기능: 팀원 C 연속 공강 조회
    // - 기능 설명: 슬라이딩 윈도우 및 우선순위 큐 기반의 연속 공강 강의실 조회 API 연동 후 결과 수신하여 렌더링
    // ====================================================
    const analysis = analyzeClassroomsSlidingWindow(classrooms, windowDate, windowSize);
    setSlidingResults(analysis);
    setBookingSuccessMsg(
      lang === 'KO' 
        ? `슬라이딩 윈도우 ${windowSize}교시 연속 공강 검색이 완료되었습니다.` 
        : `Sliding Window search for ${windowSize} continuous periods loaded successfully.`
    );
  };

  // 💡 향후 백엔드 파이썬 API 연동을 위한 가이드 핸들러
  const handleUndo = async () => {
    // TODO: 팀원 D의 백엔드 history_manager undo API 호출 연결부
    // 예: const res = await fetch('/api/history/undo', { method: 'POST' });
    console.log("백엔드 실행 취소(Undo) API 연결 예정 위치");

    // [프론트엔드 자체 작동 시뮬레이션 코드]
    const res = historyMgr.undo();
    setBookingSuccessMsg(t[res.messageKey as keyof typeof t] as string || res.messageKey);
    setBookingError(null);
    setConflictOccurred(false);
    setSelectedRoom(null);
    setRecommendedRoom(null);
    loadWorkspaceData();
  };

  // 💡 향후 백엔드 파이썬 API 연동을 위한 가이드 핸들러
  const handleRedo = async () => {
    // TODO: 팀원 D의 백엔드 history_manager redo API 호출 연결부
    // 예: const res = await fetch('/api/history/redo', { method: 'POST' });
    console.log("백엔드 다시 실행(Redo) API 연결 예정 위치");

    // [프론트엔드 자체 작동 시뮬레이션 코드]
    const res = historyMgr.redo();
    setBookingSuccessMsg(t[res.messageKey as keyof typeof t] as string || res.messageKey);
    setBookingError(null);
    setConflictOccurred(false);
    setSelectedRoom(null);
    setRecommendedRoom(null);
    loadWorkspaceData();
  };

  // Checkbox toggle for multi-equipment criteria
  const handleEqCheckboxChange = (eq: string) => {
    setSearchCriteria((prev) => {
      const exists = prev.equipment.includes(eq);
      const updated = exists
        ? prev.equipment.filter((item) => item !== eq)
        : [...prev.equipment, eq];
      return { ...prev, equipment: updated };
    });
  };

  // Compute filtering query and Member B's LinkedList QuickSort pipeline
  const getProcessedClassrooms = (): Classroom[] => {
    let results = classrooms.filter((room) => {
      // Building category filter
      if (
        searchCriteria.building !== 'All' &&
        !room.building.includes(searchCriteria.building)
      ) {
        return false;
      }
      // Capacity filter
      if (room.capacity < searchCriteria.capacity) {
        return false;
      }
      // Equipment criteria filter
      for (const eq of searchCriteria.equipment) {
        if (!room.equipment.includes(eq)) {
          return false;
        }
      }
      // Text search query
      if (searchCriteria.searchQuery.trim() !== '') {
        const q = searchCriteria.searchQuery.toLowerCase();
        const matchesName = room.id.toLowerCase().includes(q);
        const matchesNumber = room.roomNumber.includes(q);
        const matchesBuilding = room.building.toLowerCase().includes(q);
        if (!matchesName && !matchesNumber && !matchesBuilding) {
          return false;
        }
      }
      return true;
    });

    const asc = searchCriteria.sortOrder === 'asc';
    return sortClassroomsQuickSort(results, searchCriteria.sortBy, asc);
  };

  // Selection toggle for period boxes
  const togglePeriodSelection = (p: number) => {
    setSelectedPeriods((prev) => {
      if (prev.includes(p)) {
        return prev.filter((item) => item !== p).sort((a, b) => a - b);
      } else {
        return [...prev, p].sort((a, b) => a - b);
      }
    });
  };

  // Quick book consecutive vacant slots from Sliding Window suggestions
  const bookSlidingWindowSlots = (room: Classroom, windowStreakStr: string) => {
    // Parse streak string, e.g., "1~3 교시" or "1~3 periods" -> [1, 2, 3]
    const match = windowStreakStr.match(/(\d+)~(\d+)/);
    if (!match) return;
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    const periods: number[] = [];
    for (let p = start; p <= end; p++) {
      periods.push(p);
    }

    const newRes: Reservation = {
      id: `RES-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      roomId: room.id,
      userId: session.userId,
      date: windowDate,
      periods: periods,
      purpose: lang === 'KO' ? '교수 보강 수업 예정 분반' : 'Prof. Make-up lecturing period slot',
      createdAt: Date.now(),
    };

    const revisedList = [...getStoredReservations(), newRes];
    saveStoredReservations(revisedList);

    // Record in history LIFO stacks
    historyMgr.recordAction('ADD', newRes);

    setBookingSuccessMsg(
      lang === 'KO' 
        ? `${room.id} 강의실 ${windowStreakStr} 연속 슬롯 예약이 완료되었습니다.` 
        : `Successfully reserved ${room.id} for continuous slots ${windowStreakStr}.`
    );
    loadWorkspaceData();
  };

  // Quick book a single vacant slot from Everytime schedule timeline click
  const bookSinglePeriod = (room: Classroom, period: number) => {
    const newRes: Reservation = {
      id: `RES-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      roomId: room.id,
      userId: session.userId,
      date: windowDate,
      periods: [period],
      purpose: lang === 'KO' ? '교수 보강 수업 예정 분반' : 'Prof. Make-up lecturing period slot',
      createdAt: Date.now(),
    };

    const revisedList = [...getStoredReservations(), newRes];
    saveStoredReservations(revisedList);

    // Record in history LIFO stacks
    historyMgr.recordAction('ADD', newRes);

    setBookingSuccessMsg(
      lang === 'KO' 
        ? `${room.id} 강의실 ${period}교시 예약이 완료되었습니다.` 
        : `Successfully reserved ${room.id} for period ${period}.`
    );
    loadWorkspaceData();
  };

  // Standard reservation request trigger using Member A's conflict verification hash maps & trees
  const triggerReservationSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBookingError(null);
    setBookingSuccessMsg(null);
    setConflictOccurred(false);
    setRecommendedRoom(null);

    if (!selectedRoom) return;
    if (selectedPeriods.length === 0) {
      setBookingError(lang === 'KO' ? '예약할 교시를 최소 하나 선택해 주세요.' : 'Select at least one period slot.');
      return;
    }

    const cache = new ReservationHashMapCache();
    const hasConflict = verifyPeriodsConflict(
      cache,
      selectedRoom.id,
      bookingDate,
      selectedPeriods
    );

    if (hasConflict) {
      setConflictOccurred(true);
      setBookingError(t.reserveConflictDesc);

      // Trigger Member D's Breadth-First Search (BFS) adjacent classroom recommender
      const alternate = recommendAdjacentClassroomBFS(selectedRoom.id, bookingDate, selectedPeriods);
      if (alternate) {
        setRecommendedRoom(alternate);
      }
    } else {
      // Create new reservation record
      const newRes: Reservation = {
        id: `RES-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        roomId: selectedRoom.id,
        userId: session.userId,
        date: bookingDate,
        periods: [...selectedPeriods],
        purpose: bookingPurpose.trim() || (lang === 'KO' ? '학부 특성화 강의 및 보강' : 'Academic Lecture & Consultation'),
        createdAt: Date.now(),
      };

      const revisedList = [...getStoredReservations(), newRes];
      saveStoredReservations(revisedList);

      // Record in undo history
      historyMgr.recordAction('ADD', newRes);

      setBookingSuccessMsg(t.reserveSuccess);
      setSelectedPeriods([]);
      setBookingPurpose('');
      setSelectedRoom(null);
      loadWorkspaceData();
    }
  };

  // Instant BFS booking trigger
  const bookRecommendedAlternate = () => {
    if (!recommendedRoom) return;

    const newRes: Reservation = {
      id: `RES-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      roomId: recommendedRoom.id,
      userId: session.userId,
      date: bookingDate,
      periods: [...selectedPeriods],
      purpose: bookingPurpose.trim() || (lang === 'KO' ? '추천 대안 강의실 보강 예약' : 'Recommended Alt Match Booking'),
      createdAt: Date.now(),
    };

    const revisedList = [...getStoredReservations(), newRes];
    saveStoredReservations(revisedList);

    // Record in history
    historyMgr.recordAction('ADD', newRes);

    setBookingSuccessMsg(t.reserveSuccess);
    setSelectedPeriods([]);
    setBookingPurpose('');
    setSelectedRoom(null);
    setRecommendedRoom(null);
    setConflictOccurred(false);
    loadWorkspaceData();
  };

  // Revoke / Cancel Booking
  const triggerCancelBooking = (resId: string) => {
    if (!window.confirm(t.resCancelConfirm)) return;

    const all = getStoredReservations();
    const target = all.find((item) => item.id === resId);
    if (!target) return;

    const filtered = all.filter((item) => item.id !== resId);
    saveStoredReservations(filtered);

    // Record deletion for undo compatibility
    historyMgr.recordAction('DELETE', target);

    setBookingSuccessMsg(t.resCancelSuccess);
    loadWorkspaceData();
  };

  const processedRooms = getProcessedClassrooms();
  const myReservations = reservations.filter((r) => r.userId === session.userId);
  const equipmentOptions = ['Projector', 'Whiteboard', 'PC Lab', 'Sound System', 'Wireless Mic'];

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] text-[#1E293B]">
      {/* Header and Brand - Matches High Density Academic theme precisely */}
      <header id="professor-header" className="flex flex-col md:flex-row md:items-center justify-between min-h-16 px-6 py-3 bg-[#005BAC] text-white shadow-md z-10 gap-4 sticky top-0">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center shadow-xs">
            <span className="text-[#005BAC] font-bold text-xl font-sans">C</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight font-sans">
              ClassFit <span className="font-light opacity-85 text-xs ml-2 uppercase tracking-wide">{lang === 'KO' ? '학업 예약 시스템' : 'Academic System'}</span>
            </h1>
            <p className="text-[10px] text-white/70 font-mono tracking-widest uppercase">
              {lang === 'KO' ? '가천대학교 교수 전용 포털 (연구/강의지원)' : 'Gachon Professor Portal'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Language Selector (Pill Form - Global) */}
          <div className="flex bg-white/10 rounded-full px-1 py-1 border border-white/25">
            <button
              type="button"
              onClick={() => setLang('KO')}
              className={`px-3 py-0.5 text-xs font-extrabold rounded-full transition-all cursor-pointer ${
                lang === 'KO' ? 'bg-white text-[#005BAC] shadow-xs' : 'text-white/80 hover:text-white'
              }`}
            >
              KO
            </button>
            <button
              type="button"
              onClick={() => setLang('EN')}
              className={`px-3 py-0.5 text-xs font-extrabold rounded-full transition-all cursor-pointer ${
                lang === 'EN' ? 'bg-white text-[#005BAC] shadow-xs' : 'text-white/80 hover:text-white'
              }`}
            >
              EN
            </button>
          </div>

          {/* Professor credentials & Logout */}
          <div className="flex items-center space-x-3 border-l border-white/20 pl-4">
            <div className="text-right">
              <p className="text-xs font-bold font-sans tracking-tight">{session.name}</p>
              <p className="text-[9px] opacity-85 uppercase tracking-widest leading-none mt-0.5">Professor (사번: {session.userId})</p>
            </div>
            
            <button
              onClick={onLogout}
              className="p-1 px-2.5 bg-white/10 hover:bg-red-600/75 text-white text-[10px] uppercase tracking-wider font-extrabold rounded border border-white/20 transition-all cursor-pointer flex items-center"
            >
              <LogOut className="w-3 h-3 mr-1" />
              {t.logoutButton}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        
        {/* Status Messages */}
        {bookingSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-3 text-emerald-800 animate-slide-up shadow-xs">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold font-sans">{bookingSuccessMsg}</span>
          </div>
        )}

        {/* Navigation Tabs - Structured styling matched to High Density */}
        <div className="flex border border-[#E2E8F0] gap-3 bg-white p-1 rounded-xl shadow-xs">
          <button
            onClick={() => setActiveTab('vacant-finder')}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'vacant-finder'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{t.menuVacantFinder}</span>
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'search'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>{t.menuSearch} ({t.roleProfessor})</span>
          </button>
          <button
            onClick={() => setActiveTab('academic-schedule')}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'academic-schedule'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>{t.menuAcademicSchedule}</span>
          </button>
          <button
            onClick={() => setActiveTab('my-bookings')}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'my-bookings'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span>{t.menuMyReservations} ({myReservations.length})</span>
          </button>
        </div>

        {/* TAB 1: Vacant Slot Finder (Member C - Sliding Window) */}
        {activeTab === 'vacant-finder' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 animate-fade-in">
            {/* Sliding Window Parameters */}
            <div className="md:col-span-4 space-y-4">
              <div className="bg-white p-5 rounded-2xl shadow-xs border border-[#E2E8F0] space-y-4">
                <div className="flex items-center space-x-2 text-[#005BAC] border-b pb-3 border-[#E2E8F0]">
                  <Clock className="w-5 h-5 shrink-0" />
                  <h3 className="font-bold text-sm tracking-tight">{t.menuVacantFinder}</h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {t.vacantFinderDesc}
                </p>

                <div className="space-y-4 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{t.date}</label>
                    <input
                      type="date"
                      value={windowDate}
                      onChange={(e) => setWindowDate(e.target.value)}
                      className="w-full text-xs font-medium border border-[#E2E8F0] bg-gray-50/50 rounded-lg p-2.5 outline-none focus:ring-1 ring-[#005BAC] font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      {t.windowSizeLabel}
                    </label>
                    <select
                      value={windowSize}
                      onChange={(e) => setWindowSize(Number(e.target.value))}
                      className="w-full text-xs font-medium border border-[#E2E8F0] bg-gray-50/50 rounded-lg p-2.5 outline-none focus:ring-1 ring-[#005BAC] font-sans cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                        <option key={num} value={num}>
                          {num} {lang === 'KO' ? `${num}교시 연속 빈 시간` : `${num} consecutive periods`}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-[#005BAC] mt-1 italic font-medium">
                      * {t.windowSizeDesc}
                    </p>
                  </div>

                  <button
                    onClick={triggerVacantFinderAnalysis}
                    className="w-full bg-[#005BAC] hover:bg-[#004a8d] text-white font-extrabold py-3 rounded-lg text-xs tracking-wide transition-colors shadow-sm cursor-pointer"
                  >
                    {t.btnFindVacant}
                  </button>
                </div>
              </div>
            </div>

            {/* Sliding Window analysis results (PQ Matrix) */}
            <div className="md:col-span-8 flex flex-col bg-white border border-[#E2E8F0] rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[#E2E8F0] bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h3 className="font-extrabold text-sm text-[#005BAC]">
                    {t.emptySlotsHeader}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {lang === 'KO' 
                      ? `* 기준일자: ${windowDate} | 아래 우측의 교시별 버튼을 클릭하여 원하는 대여 시간대를 직접 정해 즉시 예약할 수 있습니다.` 
                      : `* Date: ${windowDate} | Choose your preferred rental period by clicking the corresponding book button on the right.`}
                  </p>
                </div>
                <span className="text-[9px] font-bold text-slate-500 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-sm uppercase tracking-wider font-mono">
                  {lang === 'KO' ? `슬라이딩 윈도우 크기 K=${windowSize}` : `Sliding Window K=${windowSize}`}
                </span>
              </div>

              <div className="flex-1 overflow-x-auto">
                {slidingResults.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 font-medium">
                    {t.allRoomsFull}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50/40 border-b border-[#E2E8F0] text-[9px] text-slate-400 uppercase font-mono">
                        <th className="p-3 pl-4">{t.colRoom}</th>
                        <th className="p-3">{t.colBuilding}</th>
                        <th className="p-3">{t.colMaxCapacity}</th>
                        <th className="p-3 text-center">{t.colLongestStreak}</th>
                        <th className="p-3">{t.colWindowStreak}</th>
                        <th className="p-3 text-center">{t.colPriorityScore}</th>
                        <th className="p-3 pr-4 text-right">{lang === 'KO' ? '선택 작업' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] font-sans">
                      {slidingResults.map((res) => (
                        <React.Fragment key={res.room.id}>
                          <tr 
                            onClick={() => setExpandedRoomId(expandedRoomId === res.room.id ? null : res.room.id)}
                            className={`hover:bg-[#005BAC]/5 transition-colors cursor-pointer select-none ${
                              expandedRoomId === res.room.id ? 'bg-[#005BAC]/5 font-bold' : ''
                            }`}
                          >
                            <td className="p-3 pl-4 font-extrabold text-[#005BAC] font-mono">
                              {res.room.id}
                            </td>
                            <td className="p-3 text-slate-500 font-medium whitespace-nowrap">
                              {lang === 'KO' ? res.room.building.split('(')[0] : res.room.building.split('(')[1]?.replace(')', '') || res.room.building}
                            </td>
                            <td className="p-3 text-slate-600 font-semibold font-mono">
                              {res.room.capacity} {t.peopleUnit}
                            </td>
                            <td className="p-3 text-center font-bold text-[#005BAC] font-mono">
                              {res.room.capacity >= 80 ? '🔥' : ''} {res.longestStreak} 교시
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {res.compliantWindows.slice(0, 3).map((w, idx) => (
                                  <span 
                                    key={idx}
                                    className="text-[9px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded cursor-help"
                                    title={lang === 'KO' ? `${w} 연속 빈 시간` : `${w} continuous vacant`}
                                  >
                                    {w}
                                  </span>
                                ))}
                                {res.compliantWindows.length === 0 && (
                                  <span className="text-[10px] text-rose-500 font-semibold italic">{lang === 'KO' ? '공석 없음' : 'No slots'}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center font-bold font-mono text-amber-600 bg-amber-50/20">
                              {res.priorityScore} pt
                            </td>
                            <td className="p-3 pr-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center space-x-1.5 bg-[#005BAC]/5 hover:bg-[#005BAC]/10 text-[#005BAC] font-extrabold px-3 py-1.5 rounded-lg text-[11px] transition-colors">
                                <span>{lang === 'KO' ? '현황판 보기' : 'Show Timetable'}</span>
                                <span className={`text-[9px] transition-transform duration-200 ${expandedRoomId === res.room.id ? 'rotate-180' : ''}`}>
                                  ▼
                                </span>
                              </div>
                            </td>
                          </tr>

                          {expandedRoomId === res.room.id && (
                            <tr className="bg-slate-50/40">
                              <td colSpan={7} className="p-0 border-b border-[#E2E8F0]">
                                <div className="py-5 px-6 bg-slate-50 border-t border-b border-[#E2E8F0] select-none">
                                  <div className="max-w-xl mx-auto space-y-4">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2 border-b border-slate-200 pb-3">
                                      <div>
                                        <h4 className="font-extrabold text-sm text-[#005BAC] flex items-center gap-1.5">
                                          <span className="text-[#005BAC]">📅</span>
                                          <span>
                                            {lang === 'KO' 
                                              ? `${res.room.id} 강의실 가용 현황판 (${windowDate})` 
                                              : `${res.room.id} Classroom Timetable (${windowDate})`}
                                          </span>
                                        </h4>
                                        <p className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">
                                          {lang === 'KO' 
                                            ? '비어있는 교시를 클릭하여 보강 수업용 예약을 즉시 등록하세요.' 
                                            : 'Click on any vacant period block to reserve the room instantly.'}
                                        </p>
                                      </div>
                                      <span className="text-[9px] font-extrabold bg-[#005BAC]/10 text-[#005BAC] px-2.5 py-1 rounded-full uppercase tracking-wider font-mono shrink-0">
                                        {lang === 'KO' ? '에브리타임 스타일 현황판' : 'Everytime Timeline'}
                                      </span>
                                    </div>

                                    {/* Vertical Timeline Grid representing 1 to 9 Periods */}
                                    <div className="relative border-l-2 border-[#005BAC]/20 ml-3 pl-6 space-y-3.5">
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => {
                                        const booked = reservations.some(
                                          (r) => r.roomId === res.room.id && r.date === windowDate && r.periods.includes(p)
                                        );
                                        const hours = `${p + 8 < 10 ? '0' : ''}${p + 8}:00 ~ ${p + 9}:00`;
                                        
                                        return (
                                          <div key={p} className="relative group/time">
                                            {/* Timeline track bulb */}
                                            <div className={`absolute -left-[31px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                              booked 
                                                ? 'bg-slate-300 border-slate-100 ring-4 ring-slate-100/50' 
                                                : 'bg-white border-[#005BAC] ring-4 ring-[#005BAC]/10 group-hover/time:bg-[#005BAC] group-hover/time:scale-110'
                                            }`} />

                                            {booked ? (
                                              // BOOKED / OCCUPIED SLOT CARD (Everytime Light Gray Style)
                                              <div 
                                                className="w-full flex items-center justify-between p-3.5 bg-slate-100 border border-slate-200/80 rounded-xl opacity-60 text-slate-400 font-sans text-xs gap-3 select-none"
                                              >
                                                <div className="flex items-center space-x-3.5">
                                                  <span className="font-mono font-extrabold text-slate-400 text-xs w-14 shrink-0 bg-slate-200/75 px-2 py-0.5 rounded text-center">
                                                    {p}{lang === 'KO' ? '교시' : 'P'}
                                                  </span>
                                                  <div className="flex flex-col">
                                                    <span className="font-extrabold text-[12.5px] text-slate-500">
                                                      {lang === 'KO' ? '예약 완료 (정규 수업 / 분반 배정)' : 'Reserved Slot (Regular Course)'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-bold font-mono mt-0.5">{hours}</span>
                                                  </div>
                                                </div>
                                                <span className="text-[9.5px] bg-slate-200 text-slate-500 font-black px-2.5 py-1 rounded-lg tracking-wider shrink-0 select-none uppercase">
                                                  {lang === 'KO' ? '예약 완료' : 'Booked'}
                                                </span>
                                              </div>
                                            ) : (
                                              // FREE / VACANT SLOT CARD (Clickable to Instantly Book)
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  bookSinglePeriod(res.room, p);
                                                }}
                                                className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-[#005BAC]/5 border border-[#005BAC]/40 hover:border-[#005BAC] rounded-xl text-slate-700 font-sans text-xs gap-3 transition-all cursor-pointer shadow-2xs hover:shadow-1xs text-left"
                                              >
                                                <div className="flex items-center space-x-3.5">
                                                  <span className="font-mono font-black text-white text-xs w-14 shrink-0 bg-[#005BAC] px-2 py-0.5 rounded text-center shadow-1xs group-hover/time:bg-[#004a8d]">
                                                    {p}{lang === 'KO' ? '교시' : 'P'}
                                                  </span>
                                                  <div className="flex flex-col">
                                                    <span className="font-bold text-[12.5px] text-[#005BAC] group-hover/time:text-[#004a8d] flex items-center gap-1.5">
                                                      <span>{lang === 'KO' ? '이용 가능' : 'Available'}</span>
                                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-extrabold font-mono mt-0.5">{hours}</span>
                                                  </div>
                                                </div>
                                                <span className="text-[10.5px] bg-[#005BAC]/15 text-[#005BAC] group-hover/time:bg-[#005BAC] group-hover/time:text-white font-extrabold px-3 py-1.5 rounded-lg transition-all border border-[#005BAC]/20 shrink-0">
                                                  {lang === 'KO' ? '즉시 예약하기' : 'Book Instantly'}
                                                </span>
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Standard Search & Member A's Booking hub */}
        {activeTab === 'search' && (
          <div className="space-y-5">
            {/* Action History Stacks (Undo/Redo) top banner with Gachon Blue point */}
            <div className="flex flex-col sm:flex-row items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-2xs gap-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-[#005BAC] animate-pulse"></div>
                <p className="text-xs font-semibold text-slate-700">
                  {lang === 'KO' 
                    ? '실시간 세션 작업 제어: 이력 복구 및 취소가 가능합니다.' 
                    : 'Real-time Session Action Controls: Undo and redo your entries.'}
                </p>
              </div>
              
              <HistoryController
                undoCount={undoCount}
                redoCount={redoCount}
                onUndo={handleUndo}
                onRedo={handleRedo}
                lang={lang}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-fade-in">
            
            {/* Filter controls & Search */}
            <div className="lg:col-span-8 space-y-4">
              
              {/* Filter card */}
              <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex items-center space-x-2 text-[#005BAC] border-b pb-3 border-[#E2E8F0]">
                  <Filter className="w-5 h-5" />
                  <h3 className="font-bold text-sm tracking-tight">{t.searchTitle}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{t.filterBuilding}</label>
                    <select
                      value={searchCriteria.building}
                      onChange={(e) => setSearchCriteria((prev) => ({ ...prev, building: e.target.value }))}
                      className="w-full text-xs font-semibold border border-[#E2E8F0] bg-gray-50/50 rounded-lg p-2.5 outline-none focus:ring-1 ring-[#005BAC] cursor-pointer"
                    >
                      <option value="All">{t.filterAll}</option>
                      <option value="AI Building">{lang === 'KO' ? 'IT융합대학 (AI Builing)' : 'AI Building'}</option>
                      <option value="Global Center">{lang === 'KO' ? '글로벌센터 (GB)' : 'Global Center'}</option>
                      <option value="College of Engineering">{lang === 'KO' ? '공과대학 (EG)' : 'College of Engineering'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{t.filterCapacity}</label>
                    <select
                      value={searchCriteria.capacity}
                      onChange={(e) => setSearchCriteria((prev) => ({ ...prev, capacity: Number(e.target.value) }))}
                      className="w-full text-xs font-semibold border border-[#E2E8F0] bg-gray-50/50 rounded-lg p-2.5 outline-none focus:ring-1 ring-[#005BAC] cursor-pointer"
                    >
                      <option value={0}>{t.filterAll}</option>
                      <option value={30}>{lang === 'KO' ? '30석 이상' : '30+ Seats'}</option>
                      <option value={50}>{lang === 'KO' ? '50석 이상' : '50+ Seats'}</option>
                      <option value={80}>{lang === 'KO' ? '80석 이상' : '80+ Seats'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{t.sortByLabel}</label>
                    <div className="flex space-x-2">
                      <select
                        value={searchCriteria.sortBy}
                        onChange={(e) => setSearchCriteria((prev) => ({ ...prev, sortBy: e.target.value as 'id' | 'capacity' | 'priority' }))}
                        className="flex-1 text-xs font-semibold border border-[#E2E8F0] bg-gray-50/50 rounded-lg p-2.5 outline-none focus:ring-1 ring-[#005BAC] cursor-pointer"
                      >
                        <option value="id">{lang === 'KO' ? '강의실 고유ID순' : 'Classroom ID'}</option>
                        <option value="capacity">{lang === 'KO' ? '수용 정원순' : 'Capacity'}</option>
                        <option value="priority">{lang === 'KO' ? '우선 배정가중치순' : 'Priority Weight'}</option>
                      </select>
                      <button
                        onClick={() => setSearchCriteria((prev) => ({ ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' }))}
                        className="bg-gray-50 hover:bg-gray-100 border border-[#E2E8F0] p-2 rounded-lg cursor-pointer flex items-center justify-center text-slate-600 transition-colors shrink-0"
                        title={searchCriteria.sortOrder === 'asc' ? t.sortAsc : t.sortDesc}
                      >
                        <ArrowUpDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-dashed border-[#E2E8F0]">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">{t.filterEquipment}</label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {equipmentOptions.map((eq) => {
                      const active = searchCriteria.equipment.includes(eq);
                      return (
                        <button
                          key={eq}
                          onClick={() => handleEqCheckboxChange(eq)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                            active
                              ? 'bg-[#005BAC] text-white border-[#005BAC]'
                              : 'bg-white text-slate-650 border-[#E2E8F0] hover:bg-slate-55'
                          }`}
                        >
                          {eq}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative pt-2">
                  <input
                    type="text"
                    placeholder={t.searchQueryPlaceholder}
                    value={searchCriteria.searchQuery}
                    onChange={(e) => setSearchCriteria((prev) => ({ ...prev, searchQuery: e.target.value }))}
                    className="w-full text-xs pl-10 pr-4 py-3 border border-[#E2E8F0] bg-gray-50/50 rounded-xl outline-none focus:ring-1 ring-[#005BAC]"
                  />
                  <Search className="absolute left-3.5 top-5.5 w-4 h-4 text-slate-400" />
                </div>
              </div>

              {/* Classroom search results table list - Linked List representation */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
                <div className="p-4 border-b border-[#E2E8F0] bg-gray-50/50 flex justify-between items-center">
                  <div>
                    <h3 className="font-extrabold text-sm text-[#005BAC]">
                      {t.roomListTitle} ({processedRooms.length})
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 font-mono px-2 py-0.5 bg-gray-100 rounded">
                    {lang === 'KO' ? '퀵 정렬 파이프라인' : 'QuickSort V2.1 Pipeline'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {processedRooms.length === 0 ? (
                    <div className="p-10 text-center text-xs text-slate-400 font-medium">
                      {t.noRoomsFound}
                    </div>
                  ) : (
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/20 border-b border-[#E2E8F0] text-[9px] text-slate-400 uppercase font-mono">
                          <th className="p-3 pl-4">{lang === 'KO' ? 'ID' : 'ID'}</th>
                          <th className="p-3">{lang === 'KO' ? '건물코드' : 'Building Code'}</th>
                          <th className="p-3 text-center">{lang === 'KO' ? '호실번호' : 'Room No.'}</th>
                          <th className="p-3">{lang === 'KO' ? '수용능력 제한' : 'Capacity limit'}</th>
                          <th className="p-3">{lang === 'KO' ? '배치 자산기자재' : 'Supported Amenities'}</th>
                          <th className="p-3 text-center">{lang === 'KO' ? '기본 가중치' : 'Priority'}</th>
                          <th className="p-3 pr-4 text-right">{lang === 'KO' ? '선택' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {processedRooms.map((room) => {
                          const isSelected = selectedRoom?.id === room.id;
                          return (
                            <tr
                              key={room.id}
                              className={`hover:bg-gray-50/50 transition-colors ${
                                isSelected ? 'bg-[#005BAC]/5' : ''
                              }`}
                            >
                              <td className="p-3 pl-4 font-mono font-extrabold text-[#005BAC]">
                                {room.id}
                              </td>
                              <td className="p-3 text-slate-500 font-medium">
                                {room.building}
                              </td>
                              <td className="p-3 text-center font-bold font-mono">
                                {lang === 'KO' ? `${room.roomNumber}호` : `${room.roomNumber}`}
                              </td>
                              <td className="p-3 text-slate-700 font-semibold font-mono">
                                {room.capacity} {t.peopleUnit}
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {room.equipment.map((eq) => (
                                    <span
                                      key={eq}
                                      className="text-[9px] font-bold bg-gray-100 text-slate-600 border px-1.5 py-0.2 rounded"
                                    >
                                      {eq}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="p-3 text-center font-bold text-amber-600 font-mono">
                                ★ {room.priority}
                              </td>
                              <td className="p-3 pr-4 text-right">
                                <button
                                  onClick={() => setSelectedRoom(room)}
                                  className="text-[#005BAC] font-extrabold hover:underline select-none cursor-pointer"
                                >
                                  {lang === 'KO' ? '예약하기' : 'Book Room'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>

            {/* Interactive Booking form with BFS collisions logic */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex items-center space-x-2 text-[#005BAC] border-b pb-3 border-[#E2E8F0]">
                  <Calendar className="w-5 h-5" />
                  <h3 className="font-bold text-sm tracking-tight">{t.roomDetails}</h3>
                </div>

                {selectedRoom ? (
                  <form onSubmit={triggerReservationSubmit} className="space-y-4">
                    <div className="p-3 bg-gray-50 border border-[#E2E8F0] rounded-xl">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-[#005BAC] font-mono leading-none">
                          {selectedRoom.id}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold leading-none uppercase">
                          {lang === 'KO' ? `수용 정원 ${selectedRoom.capacity}${t.peopleUnit}` : `Capacity ${selectedRoom.capacity} ${t.peopleUnit}`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">
                        {selectedRoom.building}
                      </p>
                    </div>

                    <div>
                      <label htmlFor="prof-booking-date" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        {t.reserveInputDate}
                      </label>
                      <input
                        id="prof-booking-date"
                        type="date"
                        required
                        value={bookingDate}
                        onChange={(e) => {
                          setBookingDate(e.target.value);
                          setConflictOccurred(false);
                          setBookingError(null);
                          setRecommendedRoom(null);
                        }}
                        className="w-full text-xs font-medium border border-[#E2E8F0] bg-gray-50/50 rounded-lg p-2.5 outline-none focus:ring-1 ring-[#005BAC] font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        {t.reserveInputPeriods}
                      </label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => {
                          const active = selectedPeriods.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                togglePeriodSelection(p);
                                setConflictOccurred(false);
                                setBookingError(null);
                                setRecommendedRoom(null);
                              }}
                              className={`py-1.5 text-xs font-extrabold rounded-lg font-mono border transition-all cursor-pointer ${
                                active
                                  ? 'bg-[#005BAC] text-white border-[#005BAC]'
                                  : 'bg-white text-slate-650 border-[#E2E8F0] hover:bg-slate-50'
                              }`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="prof-booking-purpose" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        {t.reserveInputPurpose}
                      </label>
                      <textarea
                        id="prof-booking-purpose"
                        rows={2}
                        value={bookingPurpose}
                        onChange={(e) => setBookingPurpose(e.target.value)}
                        placeholder={t.reserveInputPurposePlaceholder}
                        className="w-full text-xs font-medium border border-[#E2E8F0] bg-gray-50/50 rounded-lg p-2.5 outline-none focus:ring-1 ring-[#005BAC]"
                      />
                    </div>

                    {bookingError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-red-650">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide leading-none">{t.reserveConflictTitle}</p>
                          <p className="text-[10px] font-semibold leading-normal mt-0.5">{bookingError}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedRoom(null)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-slate-650 text-xs font-bold py-2.5 rounded-lg transition-colors cursor-pointer"
                      >
                        {lang === 'KO' ? '취소' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-[#005BAC] hover:bg-[#004a8d] text-white text-xs font-bold py-2.5 rounded-lg transition-all shadow-md cursor-pointer"
                      >
                        {t.reserveBtn}
                      </button>
                    </div>

                  </form>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400 font-medium italic">
                    {lang === 'KO' ? '강의실 목록에서 예약을 원하시는 강의실을 먼저 선택해 주세요.' : 'Please select a classroom from the table on the left to request a booking.'}
                  </div>
                )}
              </div>

              {/* BFS Alternative recommendation card block */}
              {conflictOccurred && (
                <div className="bg-[#005BAC] p-5 rounded-2xl text-white shadow-lg relative overflow-hidden animate-slide-up">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] bg-white/20 px-2.5 py-1 rounded border border-white/30 uppercase tracking-widest font-bold italic">
                        {lang === 'KO' ? '최단거리 우회공간 탐색 완료' : 'BFS Optimized Recommendation'}
                      </span>
                      <span className="text-xs font-bold">✨ AI</span>
                    </div>
                    <h4 className="text-base font-bold mb-1 italic">
                      {t.recommendTitle}
                    </h4>
                    <p className="text-xs text-white/85 mb-4 leading-relaxed">
                      {t.recommendDesc}
                    </p>

                    {recommendedRoom ? (
                      <div className="bg-white/10 rounded-xl p-3.5 border border-white/20 mb-4 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-white">{recommendedRoom.id} {lang === 'KO' ? '(98% 부합)' : '(98% Match)'}</span>
                          <span className="text-[10px] font-mono text-yellow-300 font-extrabold uppercase bg-white/10 px-1.5 py-0.2 rounded">{lang === 'KO' ? '인접 대안' : 'Next Door'}</span>
                        </div>
                        <p className="text-[10px] text-white/75 font-medium">
                          {t.building}: {recommendedRoom.building} | {t.capacity}: {recommendedRoom.capacity} {t.peopleUnit} | {t.equipment}: {recommendedRoom.equipment.join(', ')}
                        </p>
                        <p className="text-[9px] text-white/60 italic font-medium">
                          {lang === 'KO' ? '* 해당 강의실과 인접한 노드에 위치하며 충돌하지 않습니다.' : '* Located in the direct spatial adjacent neighborhood; no scheduling collisions detected.'}
                        </p>
                      </div>
                    ) : null}

                    {recommendedRoom ? (
                      <button
                        type="button"
                        onClick={bookRecommendedAlternate}
                        className="w-full bg-white text-[#005BAC] font-extrabold py-2.5 rounded-lg text-xs shadow-md hover:bg-gray-100 transition-transform active:scale-95 cursor-pointer"
                      >
                        {t.recommendBookBtn}
                      </button>
                    ) : (
                      <p className="text-xs text-yellow-300 font-bold font-sans italic p-2 bg-white/5 rounded border border-white/10 text-center">
                        ⚠️ {t.recommendEmpty}
                      </p>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>
          </div>
        )}

        {/* TAB 3: Fixed Academic Schedulesassigned to department */}
        {activeTab === 'academic-schedule' && (
          <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4 animate-fade-in">
            {/* ====================================================
            // TODO: 백엔드 API 연동 파트
            // - 담당 기능: 팀원 C 학과별 정규 주간 시간표 조회
            // - 기능 설명: 학과별 전공/교양 지정 교육과정 및 요일/교시 선점 정규 시간표 시간 그리드 렌더링용 데이터 수신 연동
            // ==================================================== */}
            <div className="flex items-center space-x-2 text-[#005BAC] border-b pb-3 border-[#E2E8F0]">
              <Grid className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm tracking-tight">{t.menuAcademicSchedule}</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
              {t.academicScheduleDesc}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/20 border-b border-[#E2E8F0] text-[9px] text-slate-400 uppercase font-mono">
                    <th className="p-3 pl-4">{lang === 'KO' ? '강좌 코드' : 'Lecture ID'}</th>
                    <th className="p-3">{t.colSemester}</th>
                    <th className="p-3">{t.colCourseName}</th>
                    <th className="p-3">{t.colProfessor}</th>
                    <th className="p-3">{lang === 'KO' ? '개설 학부' : 'Department Domain'}</th>
                    <th className="p-3">{lang === 'KO' ? '지정 강의실' : 'Reserved Room'}</th>
                    <th className="p-3 text-center">{lang === 'KO' ? '개설 요일' : 'Weekly Day'}</th>
                    <th className="p-3 pr-4 text-center">{lang === 'KO' ? '선점 교시' : 'Occupied Periods'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {FIXED_LECTURES.map((lec) => (
                    <tr key={lec.id} className="hover:bg-gray-50/30">
                      <td className="p-3 pl-4 font-mono font-bold text-slate-400">
                        {lec.id}
                      </td>
                      <td className="p-3 text-slate-650 font-semibold font-mono">
                        {lang === 'KO' ? '2026학년도 1학기' : '2026-Semester 1'}
                      </td>
                      <td className="p-3 font-bold text-slate-800">
                        {lang === 'KO' ? lec.courseName : lec.courseNameEn}
                      </td>
                      <td className="p-3 text-slate-600 font-medium">
                        {lec.instructor}
                      </td>
                      <td className="p-3 text-slate-550 font-medium">
                        {lang === 'KO' ? lec.dept : lec.deptEn}
                      </td>
                      <td className="p-3 font-mono font-extrabold text-[#005BAC]">
                        {lec.roomId}
                      </td>
                      <td className="p-3 text-center text-slate-705 font-bold">
                        {lang === 'KO' ? lec.dayOfWeek : lec.dayOfWeekEn}
                      </td>
                      <td className="p-3 pr-4 text-center">
                        <div className="inline-flex space-x-1 justify-center">
                          {lec.periods.map((p) => (
                            <span
                              key={p}
                              className="w-5 h-5 flex items-center justify-center bg-red-100 text-red-700 font-extrabold text-[10px] font-mono rounded"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: Personal Real-time Reservations List (My Page) */}
        {activeTab === 'my-bookings' && (
          <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4 animate-fade-in">
            <div className="flex items-center space-x-2 text-[#005BAC] border-b pb-3 border-[#E2E8F0]">
              <BookMarked className="w-5 h-5" />
              <h3 className="font-bold text-sm tracking-tight">
                {t.myResTitle}
              </h3>
            </div>

            <p className="text-xs text-slate-500 font-semibold font-sans">
              📋 {myReservations.length} {t.myResCount}
            </p>

            {myReservations.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-450 italic font-medium border border-dashed rounded-xl border-[#E2E8F0]">
                {t.noMyReservations}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/20 border-b border-[#E2E8F0] text-[9px] text-slate-400 uppercase font-mono">
                      <th className="p-3 pl-4">{t.resTableCode}</th>
                      <th className="p-3">{t.resTableRoom}</th>
                      <th className="p-3">{t.resTableDate}</th>
                      <th className="p-3 text-center">{t.resTablePeriods}</th>
                      <th className="p-3">{t.resTablePurpose}</th>
                      <th className="p-3 pr-4 text-right">{t.resTableAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] font-sans">
                    {myReservations.map((res) => (
                      <tr key={res.id} className="hover:bg-gray-50/30">
                        <td className="p-3 pl-4 font-mono font-bold text-slate-400">
                          {res.id}
                        </td>
                        <td className="p-3 font-mono font-extrabold text-[#005BAC]">
                          {res.roomId}
                        </td>
                        <td className="p-3 font-mono font-semibold text-slate-600">
                          {res.date}
                        </td>
                        <td className="p-3 text-center font-mono">
                          <div className="inline-flex space-x-1">
                            {res.periods.map((p) => (
                              <span
                                key={p}
                                className="w-5 h-5 flex items-center justify-center bg-[#005BAC]/5 text-[#005BAC] border border-[#005BAC]/15 text-[10px] rounded font-extrabold"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-slate-600 font-medium">
                          {res.purpose}
                        </td>
                        <td className="p-3 pr-4 text-right">
                          <button
                            onClick={() => triggerCancelBooking(res.id)}
                            className="text-red-605 font-bold hover:underline select-none cursor-pointer"
                          >
                            {t.resTableAction}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Footer / Status Bar - Matches High Density Academic theme precisely */}
      <footer className="h-10 bg-white border-t border-[#E2E8F0] px-6 mt-12 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Gachon University ClassFit System v4.0</span>
          <span className="hidden md:inline text-[9px] text-gray-300">|</span>
          <span className="hidden md:inline text-[10px] text-gray-400 font-medium">{t.footer}</span>
        </div>
        <div className="flex items-center space-x-4">
           <span className="text-[10px] flex items-center">
             <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span> {lang === 'KO' ? '전산 서버: 연결됨' : 'Server: Connected (SQL_V2)'}
           </span>
           <span className="text-[10px] text-gray-400 font-mono">{lang === 'KO' ? '네트워크 응답: 12ms' : 'Latency: 12ms'}</span>
        </div>
      </footer>
    </div>
  );
}
