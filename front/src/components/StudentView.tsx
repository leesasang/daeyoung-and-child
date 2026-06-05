import React, { useState, useEffect } from 'react';
import { Classroom, Reservation, SearchCriteria, UserSession } from '../types';
import { LangType, LANG_DICT } from '../localization';
import { getStoredRooms, getStoredReservations, saveStoredReservations } from '../algorithms/db_and_auth';
import { sortClassroomsQuickSort } from '../algorithms/quick_sort';
import { ReservationHashMapCache, verifyPeriodsConflict } from '../algorithms/conflict_check';
import { recommendAdjacentClassroomBFS } from '../algorithms/bfs_recommender';
import { ReservationHistoryManager } from '../algorithms/history_manager';
import HistoryController from './HistoryController';
import {
  Search,
  Calendar,
  Filter,
  SlidersHorizontal,
  ArrowUpDown,
  Laptop,
  CheckCircle,
  AlertTriangle,
  Undo2,
  Redo2,
  X,
  History,
  LogOut,
  Sparkles,
  BookMarked,
  Layers,
  MapPin,
  Users
} from 'lucide-react';

interface StudentViewProps {
  session: UserSession;
  lang: LangType;
  setLang: (l: LangType) => void;
  onLogout: () => void;
  historyMgr: ReservationHistoryManager;
}

export default function StudentView({
  session,
  lang,
  setLang,
  onLogout,
  historyMgr,
}: StudentViewProps) {
  const t = LANG_DICT[lang];

  // Global State Stores
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeTab, setActiveTab] = useState<'search' | 'my-bookings'>('search');

  // Interactive search criteria
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>({
    building: 'All',
    capacity: 0,
    equipment: [],
    searchQuery: '',
    sortBy: 'id',
    sortOrder: 'asc',
  });

  // Selection states for Room booking
  const [selectedRoom, setSelectedRoom] = useState<Classroom | null>(null);
  const [bookingDate, setBookingDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedPeriods, setSelectedPeriods] = useState<number[]>([]);
  const [bookingPurpose, setBookingPurpose] = useState<string>('');

  // Conflict and BFS recommendation state
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [conflictOccurred, setConflictOccurred] = useState<boolean>(false);
  const [recommendedRoom, setRecommendedRoom] = useState<Classroom | null>(null);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);

  // Stack Counts for dynamic UI
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // Load classrooms and active reservations
  const loadWorkspaceData = () => {
    setClassrooms(getStoredRooms());
    setReservations(getStoredReservations());
    setUndoCount(historyMgr.getUndoCount());
    setRedoCount(historyMgr.getRedoCount());
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

  // 💡 향후 백엔드 파이썬 API 연동을 위한 가이드 핸들러
  const handleUndo = async () => {
    // TODO: 팀원 D의 백엔드 history_manager undo API 호출 연결부
    // 예: const res = await fetch('/api/history/undo', { method: 'POST' });
    console.log("백엔드 실행 취소(Undo) API 연결 예정 위치");

    // [프론트엔드 자체 작동 시뮬레이션 코드]
    const res = historyMgr.undo();
    setBookingSuccessMsg(t[res.messageKey as keyof typeof t] as string);
    setBookingError(null);
    setConflictOccurred(false);
    setSelectedRoom(null);
    st.rerun();
  };

  // 💡 향후 백엔드 파이썬 API 연동을 위한 가이드 핸들러
  const handleRedo = async () => {
    // TODO: 팀원 D의 백엔드 history_manager redo API 호출 연결부
    // 예: const res = await fetch('/api/history/redo', { method: 'POST' });
    console.log("백엔드 다시 실행(Redo) API 연결 예정 위치");

    // [프론트엔드 자체 작동 시뮬레이션 코드]
    const res = historyMgr.redo();
    setBookingSuccessMsg(t[res.messageKey as keyof typeof t] as string);
    setBookingError(null);
    setConflictOccurred(false);
    setSelectedRoom(null);
    st.rerun();
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

  // Compute filtering + Member B's Linked List QuickSort pipeline
  const getProcessedClassrooms = (): Classroom[] => {
    // ====================================================
    // TODO: 백엔드 API 연동 파트
    // - 담당 기능: 팀원 B 강의실 검색 및 정렬
    // - 기능 설명: UI 필터 조건(건물, 수용인원, 기자재 등)을 SQL WHERE 조건으로 백엔드에 제공하고 연결 리스트 및 퀵 정렬 결과 수집 연동
    // ====================================================
    // 1. SQL WHERE simulator filter
    let results = classrooms.filter((room) => {
      // Building filter
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
      // Equipment filter (must contain all selected equipments)
      for (const eq of searchCriteria.equipment) {
        if (!room.equipment.includes(eq)) {
          return false;
        }
      }
      // Text query match
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

    // 2. Member B's Quick Sort Execution
    const asc = searchCriteria.sortOrder === 'asc';
    return sortClassroomsQuickSort(results, searchCriteria.sortBy, asc);
  };

  // Toggle bookable period clicks
  const togglePeriodSelection = (p: number) => {
    setSelectedPeriods((prev) => {
      if (prev.includes(p)) {
        return prev.filter((item) => item !== p).sort((a, b) => a - b);
      } else {
        return [...prev, p].sort((a, b) => a - b);
      }
    });
  };

  // Form submission handler using Member A's algorithms
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

    // ====================================================
    // TODO: 백엔드 API 연동 파트
    // - 담당 기능: 팀원 A 예약 검증 및 신청
    // - 기능 설명: 학번 9자리, 강의실 ID, 이용 교시 배열 전송 및 Hash Map 캐시와 이진 탐색 기법을 통한 충돌 검증 진행 후 예약 정보 전송
    // ====================================================
    const cache = new ReservationHashMapCache();
    const hasConflict = verifyPeriodsConflict(
      cache,
      selectedRoom.id,
      bookingDate,
      selectedPeriods
    );

    if (hasConflict) {
      // ====================================================
      // TODO: 백엔드 API 연동 파트
      // - 담당 기능: 팀원 D 스마트 추천 복구
      // - 기능 설명: 예약 신청 충돌 시 BFS 알고리즘 기반 인접 공실 탐색 결과 수신 및 추천 UI 활성화 
      // ====================================================
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
        purpose: bookingPurpose.trim() || 'Academic Study Group',
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
      st.rerun();
    }
  };

  // Reserve recommended adjacent rooms instantly
  const bookRecommendedAlternate = () => {
    if (!recommendedRoom) return;

    // ====================================================
    // TODO: 백엔드 API 연동 파트
    // - 담당 기능: 팀원 A 및 팀원 D 대안 추천 예약
    // - 기능 설명: BFS로 추천받은 대안 강의실에 대하여 해시맵 캐시 충돌 검사 실행 후 예약 신청 완료 후 st.rerun() 처리
    // ====================================================
    const newRes: Reservation = {
      id: `RES-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      roomId: recommendedRoom.id,
      userId: session.userId,
      date: bookingDate,
      periods: [...selectedPeriods],
      purpose: bookingPurpose.trim() || 'Academic Study Group (Recommended Alternative Match)',
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
    st.rerun();
  };

  // Cancel reservation
  const triggerCancelBooking = (resId: string) => {
    if (!window.confirm(t.resCancelConfirm)) return;

    // ====================================================
    // TODO: 백엔드 API 연동 파트
    // - 담당 기능: 팀원 A 예약 취소 및 반환
    // - 기능 설명: 특정 예약 고유 번호(resId)와 사용자 식별자(학번)를 검증하고 예약을 데이터베이스에서 제거한 후 st.rerun() 처리
    // ====================================================
    const all = getStoredReservations();
    const target = all.find((item) => item.id === resId);
    if (!target) return;

    const filtered = all.filter((item) => item.id !== resId);
    saveStoredReservations(filtered);

    // Record deletion for reverse LIFO pop
    historyMgr.recordAction('DELETE', target);

    setBookingSuccessMsg(t.resCancelSuccess);
    st.rerun();
  };

  const processedRooms = getProcessedClassrooms();
  const myReservations = reservations.filter((r) => r.userId === session.userId);

  // Available unique equipment items in the campus data
  const equipmentOptions = ['Projector', 'Whiteboard', 'PC Lab', 'Sound System', 'Wireless Mic'];

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] text-[#1E293B]">
      {/* Header and Brand - Matches High Density Academic theme precisely */}
      <header id="student-header" className="flex flex-col md:flex-row md:items-center justify-between min-h-16 px-6 py-3 bg-[#005BAC] text-white shadow-md z-10 gap-4 sticky top-0">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center shadow-xs">
            <span className="text-[#005BAC] font-bold text-xl font-sans">C</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight font-sans">
              ClassFit <span className="font-light opacity-85 text-xs ml-2 uppercase tracking-wide">{lang === 'KO' ? '학업 예약 시스템' : 'Academic System'}</span>
            </h1>
            <p className="text-[10px] text-white/70 font-mono tracking-widest uppercase">
              {lang === 'KO' ? '가천대학교 학생 전용 포털 (스터디룸/세미나지원)' : 'Gachon Campus Reservation'}
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

          {/* User information & Logout Section */}
          <div className="flex items-center space-x-3 border-l border-white/20 pl-4">
            <div className="text-right">
              <p className="text-xs font-bold font-sans tracking-tight">{session.name} ({session.userId})</p>
              <p className="text-[9px] opacity-80 uppercase tracking-widest leading-none mt-0.5">Student ({t.roleStudent})</p>
            </div>
            
            {/* Logout trigger */}
            <button
              id="btn-logout"
              onClick={onLogout}
              className="p-1 px-2.5 bg-white/10 hover:bg-red-600/75 text-white text-[10px] uppercase tracking-wider font-extrabold rounded border border-white/20 transition-all cursor-pointer flex items-center"
            >
              <LogOut className="w-3 h-3 mr-1" />
              {t.logoutButton}
            </button>
          </div>
        </div>
      </header>

      <main id="student-main" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        
        {/* Sync action message alerts */}
        {bookingSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-250 rounded-xl flex items-center space-x-3 text-emerald-800 animate-slide-up shadow-sm">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold font-sans">{bookingSuccessMsg}</span>
          </div>
        )}

        {/* Tab Navigation buttons */}
        <div className="flex border-b border-[#E2E8F0] gap-3 bg-white p-1 rounded-xl shadow-xs border">
          <button
            onClick={() => setActiveTab('search')}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'search'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>{t.menuSearch}</span>
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

        {/* Tab Content 1: Search and Filter Console */}
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Filter and Sorting panel */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-800 font-sans inline-flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-[#005BAC]" />
                  <span>{t.searchTitle}</span>
                </h3>
              </div>

              {/* Text Search input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 block">
                  {lang === 'KO' ? '키워드 검색' : 'Keyword Search'}
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchCriteria.searchQuery}
                    onChange={(e) =>
                      setSearchCriteria((prev) => ({ ...prev, searchQuery: e.target.value }))
                    }
                    placeholder={t.searchQueryPlaceholder}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-sans focus:outline-hidden focus:ring-1 focus:ring-[#005BAC] focus:border-[#005BAC]"
                  />
                </div>
              </div>

              {/* Building Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 block">
                  {t.filterBuilding}
                </label>
                <select
                  value={searchCriteria.building}
                  onChange={(e) =>
                    setSearchCriteria((prev) => ({ ...prev, building: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 font-medium focus:outline-hidden"
                >
                  <option value="All">{t.filterAll}</option>
                  <option value="AI Building">AI Building (IT융합대학)</option>
                  <option value="Global Center">Global Center (글로벌센터)</option>
                  <option value="College of Engineering">College of Engineering (공과대학)</option>
                </select>
              </div>

              {/* Minimum Capacity slider value */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>{t.filterCapacity}</span>
                  <span className="text-[#005BAC] font-mono">{searchCriteria.capacity} {t.peopleUnit}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={searchCriteria.capacity}
                  onChange={(e) =>
                    setSearchCriteria((prev) => ({ ...prev, capacity: Number(e.target.value) }))
                  }
                  className="w-full accent-[#005BAC]"
                />
              </div>

              {/* Multi-equipment selections */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 block">
                  {t.filterEquipment}
                </label>
                <div className="grid grid-cols-1 gap-1.5 bg-slate-50 p-3 rounded-lg border border-slate-150">
                  {equipmentOptions.map((eq) => {
                    const isChecked = searchCriteria.equipment.includes(eq);
                    return (
                      <label key={eq} className="flex items-center space-x-2 text-xs font-medium text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleEqCheckboxChange(eq)}
                          className="rounded-sm text-[#005BAC] accent-[#005BAC] focus:ring-0"
                        />
                        <span>{eq}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Algorithm Quick Sort controller */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#005BAC]" />
                    {t.sortByLabel} (Quick Sort)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={searchCriteria.sortBy}
                    onChange={(e) =>
                      setSearchCriteria((prev) => ({
                        ...prev,
                        sortBy: e.target.value as 'id' | 'capacity' | 'priority',
                      }))
                    }
                    className="px-2 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-700"
                  >
                    <option value="id">{lang === 'KO' ? 'ID (강의실명)' : 'Room Name ID'}</option>
                    <option value="capacity">{t.capacity}</option>
                    <option value="priority">{lang === 'KO' ? '교내 우선순위' : 'Usage Weight'}</option>
                  </select>

                  <select
                    value={searchCriteria.sortOrder}
                    onChange={(e) =>
                      setSearchCriteria((prev) => ({
                        ...prev,
                        sortOrder: e.target.value as 'asc' | 'desc',
                      }))
                    }
                    className="px-2 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-700 font-semibold"
                  >
                    <option value="asc">↑ {t.sortAsc}</option>
                    <option value="desc">↓ {t.sortDesc}</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 font-medium font-sans">
                  {t.searchDesc}
                </p>
              </div>

            </div>

            {/* Right Classrooms Results and Active Selection Booking Form */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Classroom Booking Form Panel (Displays dynamically when classroom is selected) */}
              {selectedRoom ? (
                <div className="bg-white border-2 border-[#005BAC] rounded-2xl p-6 shadow-md animate-fade-in space-y-6 relative">
                  <button
                    onClick={() => {
                      setSelectedRoom(null);
                      setBookingError(null);
                      setConflictOccurred(false);
                      setRecommendedRoom(null);
                    }}
                    className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  <div className="flex items-start space-x-3 border-b border-slate-100 pb-4">
                    <div className="p-3 bg-[#005BAC]/10 rounded-xl text-[#005BAC] shrink-0">
                      <Layers className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-[#005BAC] uppercase tracking-wider font-mono">
                        {selectedRoom.building}
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900 font-sans mt-0.5">
                        {t.roomDetails} : {selectedRoom.id}
                      </h3>
                      <p className="text-xs text-slate-500 font-sans mt-0.5">
                        {t.capacity}: <strong>{selectedRoom.capacity} {t.peopleUnit}</strong> | {t.equipment}: {selectedRoom.equipment.join(', ')}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={triggerReservationSubmit} className="space-y-4">
                    {/* Date picker */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          {t.reserveInputDate}
                        </label>
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="date"
                            required
                            min={new Date().toISOString().split('T')[0]}
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-hidden"
                          />
                        </div>
                      </div>

                      {/* Purpose block */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          {t.reserveInputPurpose}
                        </label>
                        <input
                          type="text"
                          required
                          value={bookingPurpose}
                          onChange={(e) => setBookingPurpose(e.target.value)}
                          placeholder={t.reserveInputPurposePlaceholder}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-hidden"
                        />
                      </div>
                    </div>

                    {/* Periods checkable block */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block col-span-full">
                        {t.reserveInputPeriods}
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => {
                          const isSel = selectedPeriods.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => togglePeriodSelection(p)}
                              className={`py-2 px-1 focus:outline-hidden rounded-md text-xs font-bold font-mono transition-all border text-center cursor-pointer ${
                                isSel
                                  ? 'bg-[#005BAC] text-white border-[#005BAC] shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {p}P
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium pt-1">
                        {lang === 'KO' ? '* 1~9교시: 오전 09:00 ~ 오후 18:00 (1시간 단위 예약 배정)' : '* Periods 1~9: 09:00 AM ~ 18:00 PM (1 Hour interval schedules)'}
                      </p>
                    </div>

                    {/* Error Alerts */}
                    {bookingError && (
                      <div className="p-3 bg-rose-50 border border-rose-250 rounded-xl flex items-start space-x-2 animate-shake">
                        <AlertTriangle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-rose-700">
                          <strong className="block font-bold">{t.reserveConflictTitle}</strong>
                          <span className="font-medium mt-0.5 block leading-relaxed">{bookingError}</span>
                        </div>
                      </div>
                    )}

                    {/* BFS Recommendation visualizer Card (Member D) - High Density Design Motif */}
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
                          <p className="text-xs text-white/85 mb-4">
                            {t.recommendDesc}
                          </p>

                          {recommendedRoom ? (
                            <div className="bg-white/10 rounded-xl p-3.5 border border-white/20 mb-4 space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-white">{recommendedRoom.id} {lang === 'KO' ? '(98% 부합)' : '(98% Match)'}</span>
                                <span className="text-[10px] font-mono text-yellow-300 font-extrabold uppercase bg-white/10 px-1.5 py-0.2 rounded">{lang === 'KO' ? '인접 대안' : 'Next Door'}</span>
                              </div>
                              <p className="text-[10px] text-white/75">
                                {t.building}: {recommendedRoom.building} | {t.capacity}: {recommendedRoom.capacity} {t.peopleUnit} | {t.equipment}: {recommendedRoom.equipment.join(', ')}
                              </p>
                              <p className="text-[9px] text-white/60 italic">
                                {lang === 'KO' ? '* 선택하신 시간대에 공석인 유사한 기자재를 구비한 최단 경로 상의 대안 강의실입니다.' : '* Similar equipment, same cluster floor, currently vacant for your requested periods.'}
                              </p>
                            </div>
                          ) : null}

                          {recommendedRoom ? (
                            <button
                              type="button"
                              onClick={bookRecommendedAlternate}
                              className="w-full bg-white text-[#005BAC] font-bold py-2.5 rounded-lg text-xs shadow-md hover:bg-gray-100 transition-transform active:scale-95 cursor-pointer"
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

                    <div className="flex justify-end pt-3 border-t border-slate-100 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRoom(null);
                          setBookingError(null);
                          setConflictOccurred(false);
                          setRecommendedRoom(null);
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                      >
                        {lang === 'KO' ? '취소' : 'Cancel'}
                      </button>

                      <button
                        type="submit"
                        disabled={selectedPeriods.length === 0}
                        className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${
                          selectedPeriods.length > 0
                            ? 'bg-[#005BAC] hover:bg-[#004b8d] text-white shadow-xs cursor-pointer'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {t.reserveBtn}
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              {/* Classrooms List Header and Grid */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="px-5 py-4 bg-slate-50/75 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans">
                    {t.roomListTitle} ({processedRooms.length})
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold font-mono uppercase bg-white border border-slate-200 px-2 py-0.5 rounded-sm">
                    {searchCriteria.sortBy.toUpperCase()} {lang === 'KO' ? '정렬 기준' : 'SORT'}
                  </span>
                </div>

                <div className="divide-y divide-slate-150">
                  {processedRooms.length > 0 ? (
                    processedRooms.map((room) => {
                      const isActiveBooking = selectedRoom?.id === room.id;
                      return (
                        <div
                          key={room.id}
                          className={`p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                            isActiveBooking ? 'bg-[#005BAC]/5 border-l-4 border-[#005BAC]' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="space-y-1.5 max-w-xl">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-extrabold text-slate-900 font-sans">
                                {room.id}
                              </span>
                              <span className="bg-slate-100 border border-slate-205 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {room.building}
                              </span>
                              <span className="bg-blue-50 text-blue-800 text-[9px] font-bold px-1.5 py-0.2 rounded-sm border border-blue-100">
                                {lang === 'KO' ? `배정 우선순위 가중치: ${room.priority}` : `Priority Weight: ${room.priority}`}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-y-1 gap-x-4 text-xs text-slate-500">
                              <span className="inline-flex items-center">
                                <Users className="w-3.5 h-3.5 text-slate-400 mr-1" />
                                {t.capacity}: {room.capacity} {t.peopleUnit}
                              </span>
                              <span className="inline-flex items-center">
                                <Laptop className="w-3.5 h-3.5 text-slate-400 mr-1" />
                                {room.equipment.join(', ')}
                              </span>
                            </div>

                            {room.nearby && room.nearby.length > 0 && (
                              <p className="text-[10px] text-slate-400 font-medium">
                                {lang === 'KO' ? '🔗 탐색 대상 인접 노드 (BFS 우회경로 목록): ' : '🔗 Nearby nodes check (BFS adjacents): '}{' '}
                                <strong className="text-[#005BAC]">{room.nearby.join(', ')}</strong>
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => {
                              setSelectedRoom(room);
                              setBookingError(null);
                              setConflictOccurred(false);
                              setRecommendedRoom(null);
                              setSelectedPeriods([]);
                              setBookingPurpose('');
                            }}
                            className="px-4 py-2 bg-white hover:bg-[#005BAC] border border-slate-300 hover:border-[#005BAC] text-slate-700 hover:text-white text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-2xs hover:shadow-xs self-start md:self-center"
                          >
                            {lang === 'KO' ? '예약하기' : 'Book Room'}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center bg-white text-slate-500 space-y-2">
                      <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                      <p className="text-sm font-medium font-sans">
                        {t.noRoomsFound}
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
          </div>
        )}

        {/* Tab Content 2: My Reservation History list */}
        {activeTab === 'my-bookings' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs animate-fade-in text-slate-800">
            <div className="px-5 py-4 bg-slate-50/75 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                {/* ====================================================
                // TODO: 백엔드 API 연동 파트
                // - 담당 기능: 팀원 B 내 예약 확인
                // - 기능 설명: 학생 개인의 학번(학번: {session.userId})에 해당하는 실시간 대관 로그 리스트업 조회 API 연동
                // ==================================================== */}
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-sans">
                  {t.myResTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  <strong>{session.userId}</strong> - {myReservations.length} {t.myResCount}
                </p>
              </div>

              {/* LIFO Undo/Redo Controls isolated here */}
              <HistoryController
                undoCount={undoCount}
                redoCount={redoCount}
                onUndo={handleUndo}
                onRedo={handleRedo}
                lang={lang}
              />
            </div>

            {myReservations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/50 text-slate-500 text-[11px] font-bold uppercase tracking-wider font-mono">
                      <th className="px-5 py-3">{t.resTableCode}</th>
                      <th className="px-5 py-3">{t.resTableRoom}</th>
                      <th className="px-5 py-3">{t.resTableDate}</th>
                      <th className="px-5 py-3">{t.resTablePeriods}</th>
                      <th className="px-5 py-3">{t.resTablePurpose}</th>
                      <th className="px-5 py-3 text-right">{t.resTableAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 text-xs">
                    {myReservations.map((res) => {
                      return (
                        <tr key={res.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-semibold font-mono text-[#005BAC]">
                            {res.id}
                          </td>
                          <td className="px-5 py-3.5 font-bold">
                            {res.roomId}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 font-mono">
                            {res.date}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {res.periods.map((p) => (
                                <span
                                  key={p}
                                  className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold font-mono rounded-sm"
                                >
                                  {p}P
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 italic font-sans max-w-xs truncate">
                            {res.purpose}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => triggerCancelBooking(res.id)}
                              className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-white bg-white hover:bg-rose-600 border border-rose-300 hover:border-transparent rounded-md transition-all cursor-pointer"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <p className="text-sm font-medium font-sans">
                  {t.noMyReservations}
                </p>
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
