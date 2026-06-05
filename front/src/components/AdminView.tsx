import React, { useState, useEffect } from 'react';
import { Classroom, Reservation, UserSession } from '../types';
import { LangType, LANG_DICT } from '../localization';
import {
  getStoredRooms,
  saveStoredRooms,
  getStoredReservations,
  saveStoredReservations,
  initializeDB
} from '../algorithms/db_and_auth';
import { analyzeClassroomsSlidingWindow, SlidingWindowResult } from '../algorithms/sliding_window';
import {
  Layers,
  Plus,
  Edit,
  Trash2,
  Check,
  Sparkles,
  Sliders,
  BarChart3,
  RefreshCw,
  LogOut,
  Settings,
  AlertTriangle,
  HelpCircle,
  Clock,
  Database
} from 'lucide-react';

interface AdminViewProps {
  session: UserSession;
  lang: LangType;
  setLang: (l: LangType) => void;
  onLogout: () => void;
  triggerSyncNotification: (msg: string) => void;
}

export default function AdminView({
  session,
  lang,
  setLang,
  onLogout,
  triggerSyncNotification,
}: AdminViewProps) {
  const t = LANG_DICT[lang];

  // Tab routing
  const [activeTab, setActiveTab] = useState<'surveillance' | 'crud' | 'statistics' | 'infrastructure'>('surveillance');

  // DB States
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  // Sliding window configs
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [windowSize, setWindowSize] = useState<number>(3); // consecutive idle periods required

  // CRUD Forms States
  const [editingRoom, setEditingRoom] = useState<Classroom | null>(null);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);

  // Form Fields
  const [formId, setFormId] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formBuilding, setFormBuilding] = useState('AI Building (IT융합대학)');
  const [formCapacity, setFormCapacity] = useState<number>(40);
  const [formEquipment, setFormEquipment] = useState('');
  const [formNearby, setFormNearby] = useState('');
  const [formPriority, setFormPriority] = useState<number>(5);

  const loadAllData = () => {
    setClassrooms(getStoredRooms());
    setReservations(getStoredReservations());
  };

  // Synchronized Streamlit rerun simulator for React state refresh
  const st = {
    rerun: () => {
      loadAllData();
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Sync / Reset Database seeder
  const handleFullReset = () => {
    if (window.confirm(lang === 'KO' ? '마스터 CSV 데이터셋으로 데이터베이스를 완전히 초기화하시겠습니까?' : 'Do you want to reset the database with the master CSV dataset?')) {
      // ====================================================
      // TODO: 백엔드 API 연동 파트
      // - 담당 기능: 팀원 D 시스템 인프라 통제 (CSV 동기화 / DB 마스터 초기화)
      // - 기능 설명: 백엔드 쉘 가동 또는 마스터 CSV 로더 호출하여 DB 초기화(InitializeDB) 후 즉시 st.rerun() 처리
      // ====================================================
      initializeDB(true);
      st.rerun();
      triggerSyncNotification(t.infraResetSuccess);
    }
  };

  // Erase only reservations
  const handlePurgeReservations = () => {
    if (window.confirm(lang === 'KO' ? '학내 활성 예약을 전제 포맷하시겠습니까?' : 'Do you want to purge all active reservation logs?')) {
      // ====================================================
      // TODO: 백엔드 API 연동 파트
      // - 담당 기능: 팀원 D 시스템 인프라 통제 (예약 이력 포맷)
      // - 기능 설명: 백엔드 API 호출하여 예약 데이터 무조건 초기화한 후 즉시 st.rerun() 처리
      // ====================================================
      saveStoredReservations([]);
      st.rerun();
      triggerSyncNotification(t.infraPurgeSuccess);
    }
  };

  // Initialize CRUD values for edit mode
  const populateEditForm = (room: Classroom) => {
    setIsAddingNew(false);
    setEditingRoom(room);
    setFormId(room.id);
    setFormNumber(room.roomNumber);
    setFormBuilding(room.building);
    setFormCapacity(room.capacity);
    setFormEquipment(room.equipment.join(', '));
    setFormNearby(room.nearby ? room.nearby.join(', ') : '');
    setFormPriority(room.priority);
  };

  const populateAddForm = () => {
    setIsAddingNew(true);
    setEditingRoom(null);
    setFormId('');
    setFormNumber('');
    setFormBuilding('AI Building (IT융합대학)');
    setFormCapacity(40);
    setFormEquipment('Projector, Whiteboard');
    setFormNearby('');
    setFormPriority(5);
  };

  // Submit CRUD Room handler
  const handleCrudSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanId = formId.trim().toUpperCase();
    if (!cleanId) return;

    const parsedEq = formEquipment
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const parsedNearby = formNearby
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item.length > 0);

    const newRoomObj: Classroom = {
      id: cleanId,
      roomNumber: formNumber.trim() || cleanId.split('-')[1] || '000',
      building: formBuilding,
      capacity: Number(formCapacity),
      equipment: parsedEq,
      nearby: parsedNearby,
      priority: Number(formPriority),
    };

    let roomsList = getStoredRooms();

    if (isAddingNew) {
      if (roomsList.some((r) => r.id === cleanId)) {
        alert(lang === 'KO' ? '이미 존재하는 강의실 ID입니다.' : 'Classroom ID already exists.');
        return;
      }
      roomsList.push(newRoomObj);
      triggerSyncNotification(t.crudAddSuccess);
    } else if (editingRoom) {
      roomsList = roomsList.map((r) => (r.id === editingRoom.id ? newRoomObj : r));
      triggerSyncNotification(t.crudUpdateSuccess);
    }

    // ====================================================
    // TODO: 백엔드 API 연동 파트
    // - 담당 기능: 팀원 C 종합 가용성 및 시설 관리 CRUD (추가/수정)
    // - 기능 설명: 강의실 추가/수정 폼 액션 트리거 처리 성공 시 데이터 전송 후 전역 st.rerun() 연동 처리
    // ====================================================
    saveStoredRooms(roomsList);
    setEditingRoom(null);
    setIsAddingNew(false);
    st.rerun();
  };

  // Delete Room handle
  const handleDeleteRoom = (roomId: string) => {
    if (!window.confirm(t.confirmDelete)) return;

    // ====================================================
    // TODO: 백엔드 API 연동 파트
    // - 담당 기능: 팀원 C 종합 가용성 및 시설 관리 CRUD (삭제)
    // - 기능 설명: 강의실 고유 ID 기준 삭제 처리 성공 시 전역 st.rerun() 연동 처리
    // ====================================================
    const remaining = classrooms.filter((r) => r.id !== roomId);
    saveStoredRooms(remaining);

    // Also purge reservations pointing to deleted room for database integrity
    const activeRes = getStoredReservations();
    const updatedRes = activeRes.filter((res) => res.roomId !== roomId);
    saveStoredReservations(updatedRes);

    triggerSyncNotification(t.crudDeleteSuccess);
    st.rerun();
  };

  // Compute sliding window priorities
  const slidingResults: SlidingWindowResult[] = analyzeClassroomsSlidingWindow(
    classrooms,
    targetDate,
    windowSize
  );

  // Group By statistics emulating highly optimized SQL grouping queries
  const getStatsByClassroom = () => {
    const countsMap: { [roomId: string]: number } = {};
    for (const r of classrooms) {
      countsMap[r.id] = 0;
    }
    for (const res of reservations) {
      if (countsMap[res.roomId] !== undefined) {
        countsMap[res.roomId]++;
      } else {
        countsMap[res.roomId] = 1;
      }
    }
    return Object.entries(countsMap).map(([id, count]) => ({ id, count }));
  };

  const getStatsByBuilding = () => {
    const countsMap: { [b: string]: number } = {};
    for (const res of reservations) {
      const roomObj = classrooms.find((r) => r.id === res.roomId);
      const bLabel = roomObj ? roomObj.building.split('(')[0].trim() : 'Other Department';
      countsMap[bLabel] = (countsMap[bLabel] || 0) + 1;
    }
    return Object.entries(countsMap).map(([building, count]) => ({ building, count }));
  };

  const classroomStatsList = getStatsByClassroom().sort((a, b) => b.count - a.count);
  const buildingStatsList = getStatsByBuilding().sort((a, b) => b.count - a.count);

  const totalReservationsCount = reservations.length;
  const topBookedRoom =
    classroomStatsList.length > 0 && classroomStatsList[0].count > 0
      ? classroomStatsList[0].id
      : 'N/A';

  const uniqueUsersCount = new Set(reservations.map((res) => res.userId)).size;

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] text-[#1E293B]">
      {/* Header and Brand - Matches High Density Academic theme precisely */}
      <header id="admin-header" className="flex flex-col md:flex-row md:items-center justify-between min-h-16 px-6 py-3 bg-[#005BAC] text-white shadow-md z-10 gap-4 sticky top-0">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center shadow-xs">
            <span className="text-[#005BAC] font-bold text-xl font-sans">C</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight font-sans">
              ClassFit <span className="font-light opacity-85 text-xs ml-2 uppercase tracking-wide">Academic System</span>
            </h1>
            <p className="text-[10px] text-white/70 font-mono tracking-widest uppercase">
              Gachon Campus Administration
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
              <p className="text-[9px] opacity-80 uppercase tracking-widest leading-none mt-0.5">Admin ({t.roleAdmin})</p>
            </div>
            
            {/* Logout trigger */}
            <button
              id="admin-logout"
              onClick={onLogout}
              className="p-1 px-2.5 bg-white/10 hover:bg-red-600/75 text-white text-[10px] uppercase tracking-wider font-extrabold rounded border border-white/20 transition-all cursor-pointer flex items-center"
            >
              <LogOut className="w-3 h-3 mr-1" />
              {t.logoutButton}
            </button>
          </div>
        </div>
      </header>

      {/* Admin Content Navigation Tabs */}
      <main id="admin-main" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        
        {/* Navigation Sidebar-style top grid bar */}
        <div className="flex flex-wrap border border-[#E2E8F0] gap-3 bg-white p-1 rounded-xl shadow-xs">
          <button
            onClick={() => {
              setActiveTab('surveillance');
              loadAllData();
            }}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'surveillance'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>📊 {t.menuAdminDashboard}</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('crud');
              loadAllData();
            }}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'crud'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>⚙️ {t.menuRoomManagement}</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('statistics');
              loadAllData();
            }}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'statistics'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>📈 {t.menuStatistics}</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('infrastructure');
              loadAllData();
            }}
            className={`py-2 px-4 text-xs font-bold tracking-tight rounded-lg transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'infrastructure'
                ? 'bg-[#005BAC]/10 text-[#005BAC] border-r-4 border-[#005BAC]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>🛡️ {t.menuSystemControl}</span>
          </button>
        </div>

        {/* Tab 1: Real-time Surveillance Dashboard (Sliding Window & Priority Queue) */}
        {activeTab === 'surveillance' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <h3 className="text-sm font-extrabold text-slate-800 font-sans">
                {t.adminDashTitle}
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-sans">
                {t.adminDashDesc}
              </p>

              {/* Setting Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 bg-slate-50 p-4 border border-slate-150 rounded-xl">
                <div className="space-y-1.5">
                  <label htmlFor="target-date" className="text-xs font-bold text-slate-700 block col-span-full">
                    {lang === 'KO' ? '점검 조회 날짜' : 'Target Inspection Date'}
                  </label>
                  <input
                    id="target-date"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-800 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                    <label htmlFor="window-slider">{t.windowSizeLabel}</label>
                    <span className="text-[#005BAC] font-mono">{windowSize} 교시</span>
                  </div>
                  <input
                    id="window-slider"
                    type="range"
                    min="1"
                    max="9"
                    step="1"
                    value={windowSize}
                    onChange={(e) => setWindowSize(Number(e.target.value))}
                    className="w-full accent-[#005BAC]"
                  />
                </div>

                <div className="text-slate-400 text-[10px] sm:text-xs">
                  <p className="font-bold text-slate-500 leading-normal mb-1">{lang === 'KO' ? 'ℹ️ 슬라이딩 윈도우 알고리즘 정보' : 'ℹ️ algorithm metadata'}</p>
                  <p className="leading-snug">
                    {t.windowSizeDesc} {lang === 'KO' ? '강의실 정렬 시 우선순위 가중치 큐 연산을 통합 적용하였습니다.' : 'Classroom sorting integrates real Priority Queue sorting weights!'}
                  </p>
                </div>
              </div>
            </div>

            {/* Results Grid aligned by PQ weights */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="px-5 py-4 bg-slate-50/75 border-b border-slate-205">
                <h4 className="text-xs font-extrabold text-[#005BAC] uppercase tracking-wider font-sans">
                  {t.emptySlotsHeader} ({slidingResults.length})
                </h4>
              </div>

              {slidingResults.length > 0 ? (
                <div className="overflow-x-auto text-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/50 text-slate-600 text-[10.5px] font-bold uppercase tracking-wider font-mono">
                        <th className="px-5 py-3">{t.colRoom}</th>
                        <th className="px-5 py-3">{t.colBuilding}</th>
                        <th className="px-5 py-3">{t.colMaxCapacity}</th>
                        <th className="px-5 py-3">{t.colLongestStreak}</th>
                        <th className="px-5 py-3">{t.colWindowStreak}</th>
                        <th className="px-5 py-3 text-right">{t.colPriorityScore}</th>
                        <th className="px-5 py-3 text-right">{t.colStatus}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-xs">
                      {slidingResults.map(({ room, longestStreak, compliantWindows, priorityScore }) => {
                        const scoreBg =
                          priorityScore >= 80 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200';
                        return (
                          <tr key={room.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5 font-extrabold font-mono text-slate-900">
                              {room.id}
                            </td>
                            <td className="px-5 py-3.5 text-slate-500 font-sans">
                              {room.building}
                            </td>
                            <td className="px-5 py-3.5 font-bold">
                              {room.capacity} {t.peopleUnit}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="inline-block px-2 py-0.5 rounded-sm bg-blue-50 text-[#005BAC] font-bold font-mono text-[10px]">
                                {longestStreak} {t.periods}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {compliantWindows.slice(0, 3).map((win, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold rounded-sm font-mono"
                                  >
                                    {win}
                                  </span>
                                ))}
                                {compliantWindows.length > 3 && (
                                  <span className="text-[10px] text-slate-400 font-bold col-span-full">
                                    +{compliantWindows.length - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right font-semibold">
                              <span className={`inline-block border px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${scoreBg}`}>
                                {lang === 'KO' ? `우선순위 지수: ${priorityScore}` : `Priority Weight: ${priorityScore}`}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-extrabold bg-emerald-100 text-emerald-800 rounded-sm">
                                ● {lang === 'KO' ? '공석' : 'FREE'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-500 space-y-2">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-medium font-sans">
                    {t.allRoomsFull}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Room Asset Management CRUD Dashboard */}
        {activeTab === 'crud' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* CRUD form */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest font-mono">
                  {isAddingNew ? t.addRoomBtn : editingRoom ? t.editRoomBtn : (lang === 'KO' ? '작업 제어 패널' : 'Actions Panel')}
                </h4>
                {!isAddingNew && !editingRoom && (
                  <button
                    onClick={populateAddForm}
                    className="px-3 py-1 bg-[#005BAC] hover:bg-[#004b8d] text-white text-xs font-bold rounded-md flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.addRoomBtn}</span>
                  </button>
                )}
              </div>

              {isAddingNew || editingRoom ? (
                <form onSubmit={handleCrudSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="form-room-id" className="text-xs font-bold text-slate-700 block">
                      {t.inputId}
                    </label>
                    <input
                      id="form-room-id"
                      type="text"
                      required
                      disabled={!!editingRoom} // disabled on edit for SQL key integrity
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                      placeholder={t.inputIdPlaceholder}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-400 font-mono tracking-wide"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="form-room-number" className="text-xs font-bold text-slate-700 block">
                        {t.inputNumber}
                      </label>
                      <input
                        id="form-room-number"
                        type="text"
                        required
                        value={formNumber}
                        onChange={(e) => setFormNumber(e.target.value)}
                        placeholder={t.inputNumberPlaceholder}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-hidden"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="form-room-capacity" className="text-xs font-bold text-slate-700 block">
                        {t.capacity}
                      </label>
                      <input
                        id="form-room-capacity"
                        type="number"
                        required
                        min="5"
                        max="200"
                        value={formCapacity}
                        onChange={(e) => setFormCapacity(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="form-room-building" className="text-xs font-bold text-slate-700 block">
                      {t.inputBuilding}
                    </label>
                    <select
                      id="form-room-building"
                      value={formBuilding}
                      onChange={(e) => setFormBuilding(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-800"
                    >
                      <option value="AI Building (IT융합대학)">AI Building (IT융합대학)</option>
                      <option value="Global Center (글로벌센터)">Global Center (글로벌센터)</option>
                      <option value="College of Engineering (공과대학)">College of Engineering (공과대학)</option>
                      <option value="Arts and Design Building (예술대학)">Arts and Design Building (예술대학)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="form-room-equipment" className="text-xs font-bold text-slate-700 block">
                      {t.inputEquipment}
                    </label>
                    <input
                      id="form-room-equipment"
                      type="text"
                      value={formEquipment}
                      onChange={(e) => setFormEquipment(e.target.value)}
                      placeholder={t.inputEquipmentPlaceholder}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="form-room-nearby" className="text-xs font-bold text-slate-700 block">
                      {t.inputNearby}
                    </label>
                    <input
                      id="form-room-nearby"
                      type="text"
                      value={formNearby}
                      onChange={(e) => setFormNearby(e.target.value)}
                      placeholder={t.inputNearbyPlaceholder}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-hidden font-mono text-[#005BAC]"
                    />
                  </div>

                  <div className="space-y-1.5 col-span-full">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                      <label htmlFor="form-room-priority">{t.inputPriority}</label>
                      <span className="text-[#005BAC] font-mono">{formPriority} / 10</span>
                    </div>
                    <input
                      id="form-room-priority"
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={formPriority}
                      onChange={(e) => setFormPriority(Number(e.target.value))}
                      className="w-full accent-[#005BAC]"
                    />
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-100 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoom(null);
                        setIsAddingNew(false);
                      }}
                      className="px-3.5 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-md hover:bg-slate-200 cursor-pointer"
                    >
                      {lang === 'KO' ? '취소' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#005BAC] text-white text-xs font-bold rounded-md hover:bg-[#004b8d] cursor-pointer"
                    >
                      {lang === 'KO' ? '저장' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="py-12 text-center text-slate-400 font-sans space-y-3">
                  <Settings className="w-10 h-10 text-slate-300 mx-auto animate-spin" style={{ animationDuration: '6s' }} />
                  <p className="text-xs font-medium">
                    {lang === 'KO' ? '강의실 목록 구역에서 [수정] 아이콘을 누르거나 [새 강의실 등록] 버튼을 클릭해 작업을 시작해 주십시오.' : 'Click edit or "Register New Classroom" below to populate CRUD forms.'}
                  </p>
                </div>
              )}
            </div>

            {/* Classrooms List with edit/delete controls */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="px-5 py-4 bg-slate-50/75 border-b border-slate-205 flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest font-sans">
                  {t.roomMgmtTitle} ({classrooms.length})
                </h4>
              </div>

              <div className="divide-y divide-slate-150 text-slate-800">
                {classrooms.map((room) => {
                  return (
                    <div key={room.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-all gap-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold font-mono tracking-tight text-slate-900">{room.id}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.2 border border-slate-200 rounded-sm">
                            {room.building.split('(')[0].trim()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {t.capacity}: <strong>{room.capacity}</strong> | {lang === 'KO' ? '배정 가중치' : 'Priority Flag'}: <strong>{room.priority}</strong>
                        </p>
                        <p className="text-[10px] text-slate-400 truncate max-w-sm">
                          🛠️ {room.equipment.join(', ')}
                        </p>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => populateEditForm(room)}
                          className="p-1.5 hover:bg-amber-50 rounded-md text-slate-400 hover:text-amber-600 border border-transparent hover:border-amber-200 transition-colors cursor-pointer"
                          title={lang === 'KO' ? '영구 자산수정' : 'Modify Record'}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="p-1.5 hover:bg-rose-50 rounded-md text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                          title={lang === 'KO' ? '해당 자산삭제' : 'Decommission Asset'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* Tab 3: Usage Statistics Group By report (SQL GROUP BY simulator) */}
        {activeTab === 'statistics' && (
          <div className="space-y-6">
            {/* ====================================================
            // TODO: 백엔드 API 연동 파트
            // - 담당 기능: 팀원 C 통계 현황 인포그래픽 바인딩
            // - 기능 설명: 대관 총량, 혼잡 요일, 가교 비율 등 통계 차트 및 인포그래픽 요약 리포트 빌드용 실시간 백엔드 쿼리 연동
            // ==================================================== */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <h3 className="text-sm font-extrabold text-slate-800 font-sans">
                {t.statsTitle}
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-sans">
                {t.statsDesc}
              </p>

              {/* Aggregation Highlights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                
                <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-2xl flex items-center space-x-4">
                  <div className="p-3 bg-indigo-500 text-white rounded-xl shadow-xs shrink-0">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest font-mono">
                      {t.statsTotalRes}
                    </span>
                    <h5 className="text-2xl font-extrabold text-slate-800 font-sans tracking-tight mt-0.5">
                      {totalReservationsCount}
                    </h5>
                  </div>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-100 p-5 rounded-2xl flex items-center space-x-4">
                  <div className="p-3 bg-emerald-500 text-white rounded-xl shadow-xs shrink-0">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest font-mono">
                      {t.statsTopRoom}
                    </span>
                    <h5 className="text-2xl font-extrabold text-slate-800 font-sans tracking-tight mt-0.5 font-mono text-emerald-800 block">
                      {topBookedRoom}
                    </h5>
                  </div>
                </div>

                <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl flex items-center space-x-4">
                  <div className="p-3 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest font-mono">
                      {t.statsActiveUsers}
                    </span>
                    <h5 className="text-2xl font-extrabold text-slate-800 font-sans mt-0.5 block">
                      {uniqueUsersCount}
                    </h5>
                  </div>
                </div>

              </div>
            </div>

            {/* Tabular/Graphical grouping representation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Classroom GROUP BY count metrics */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans border-b border-slate-100 pb-3 mb-4">
                  📊 {t.chartTitleResByRoom} (SQL GROUP BY roomId)
                </h4>

                {classroomStatsList.length > 0 ? (
                  <div className="space-y-4">
                    {classroomStatsList.slice(0, 5).map(({ id, count }) => {
                      const maxCount = Math.max(...classroomStatsList.map(item => item.count)) || 1;
                      const percentage = Math.round((count / maxCount) * 100);
                      return (
                        <div key={id} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-extrabold font-mono tracking-wide text-slate-800">{id}</span>
                            <span className="font-bold text-slate-600 font-sans">{count}{lang === 'KO' ? '회 대여 예약됨' : ' rentals booked'}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-[#005BAC] h-full rounded-full transition-all duration-1000"
                              style={{ width: `${Math.max(percentage, 5)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic text-center py-8">{t.noStatsData}</p>
                )}
              </div>

              {/* Building GROUP BY count metrics */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-slate-800">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans border-b border-slate-100 pb-3 mb-4">
                  🏢 {t.chartTitleByBuilding} (SQL GROUP BY building)
                </h4>

                {buildingStatsList.length > 0 ? (
                  <div className="space-y-4">
                    {buildingStatsList.map(({ building, count }) => {
                      const maxCount = Math.max(...buildingStatsList.map(item => item.count)) || 1;
                      const percentage = Math.round((count / maxCount) * 100);
                      return (
                        <div key={building} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold font-sans text-slate-800">{building}</span>
                            <span className="font-semibold text-slate-500 font-mono">{count}{lang === 'KO' ? '건 예약됨' : ' reservations'}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-[#005BAC] h-full rounded-full"
                              style={{ width: `${Math.max(percentage, 5)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic text-center py-8">{t.noStatsData}</p>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Tab 4: System maintenance controls (Member D's Backends) */}
        {activeTab === 'infrastructure' && (
          <div className="bg-white border-2 border-dashed border-[#005BAC]/30 rounded-2xl p-8 max-w-2xl mx-auto shadow-xs text-slate-800 text-center space-y-6 animate-fade-in">
            <div className="inline-flex p-4 bg-[#005BAC]/10 text-[#005BAC] rounded-full border border-[#005BAC]/25">
              <Settings className="w-10 h-10 animate-spin" style={{ animationDuration: '10s' }} />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-extrabold text-slate-900 font-sans">
                {t.infraTitle}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed font-sans">
                {t.infraDesc}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto pt-4 border-t border-slate-100">
              
              <button
                onClick={handleFullReset}
                className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer shadow-2xs hover:shadow-xs group text-center"
              >
                <RefreshCw className="w-6 h-6 text-[#005BAC] group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-xs font-bold text-[#005BAC] font-sans">
                  {t.btnRestoreDb}
                </span>
                <span className="text-[10px] text-slate-400 leading-normal block">
                  {lang === 'KO' ? '초기 마스터 CSV 레코드 복구' : 'Seed Baseline CSV records'}
                </span>
              </button>

              <button
                onClick={handlePurgeReservations}
                className="p-4 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer shadow-2xs hover:shadow-xs text-center"
              >
                <Trash2 className="w-6 h-6 text-rose-600" />
                <span className="text-xs font-bold text-rose-700 font-sans">
                  {t.btnPurgeDb}
                </span>
                <span className="text-[10px] text-slate-400 leading-normal block">
                  {lang === 'KO' ? '학내 예약을 완전히 포맷합니다.' : 'Purge all reservation history locks safely'}
                </span>
              </button>

            </div>
            
            <p className="text-[10px] text-slate-400">
              {lang === 'KO'
                ? '* 모든 예약 내역 스택 카운터 및 인접 강의실 BFS 추천 최단거리 행렬은 컴파일 시 실시간 반영됩니다.'
                : '* Action stack size counters and DFS/BFS adjacent adjacency node references are updated dynamically on compile execution.'}
            </p>
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
             <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></span> {lang === 'KO' ? '운영 모드: 최고 관리 대시보드' : 'Mode: Administrative (Cluster_V4)'}
           </span>
           <span className="text-[10px] text-gray-400 font-mono">{lang === 'KO' ? '텔레메트리: 정상 작동' : 'Telemetry: Online'}</span>
        </div>
      </footer>
    </div>
  );
}
