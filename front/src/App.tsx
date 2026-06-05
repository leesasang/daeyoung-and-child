import React, { useState, useEffect } from 'react';
import { LangType, LANG_DICT } from './localization';
import { UserSession } from './types';
import LoginGate from './components/LoginGate';
import StudentView from './components/StudentView';
import AdminView from './components/AdminView';
import ProfessorView from './components/ProfessorView';
import { ReservationHistoryManager } from './algorithms/history_manager';
import { initializeDB } from './algorithms/db_and_auth';
import { Sparkles, X, Bell } from 'lucide-react';

export default function App() {
  const [lang, setLang] = useState<LangType>('KO');
  const [session, setSession] = useState<UserSession | null>(null);

  // Synchronized message banners for admin CSV syncs or CRUD triggers
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  // Instantiate Member D's ReservationHistoryManager globally
  const [historyMgr] = useState(() => new ReservationHistoryManager());

  useEffect(() => {
    // Standard initialization triggers
    initializeDB();

    // Recover login session if present for smooth classroom reservation workflows
    const storedSession = sessionStorage.getItem('classfit_session');
    if (storedSession) {
      setSession(JSON.parse(storedSession));
    }

    // Recover preferred language settings
    const storedLang = localStorage.getItem('classfit_lang');
    if (storedLang === 'KO' || storedLang === 'EN') {
      setLang(storedLang);
    }
  }, []);

  const handleLangToggle = (newLang: LangType) => {
    setLang(newLang);
    localStorage.setItem('classfit_lang', newLang);
  };

  const handleLoginSuccess = (userSession: UserSession) => {
    setSession(userSession);
    sessionStorage.setItem('classfit_session', JSON.stringify(userSession));
  };

  const handleLogout = () => {
    setSession(null);
    sessionStorage.removeItem('classfit_session');
  };

  // Triggers visual bubble notifications
  const pushNotificationBanner = (msg: string) => {
    setSyncNotification(msg);
    setTimeout(() => {
      setSyncNotification(null);
    }, 4500);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans transition-all selection:bg-[#005BAC]/20 selection:text-slate-905">
      
      {/* Background Micro Sync Notification Banner */}
      {syncNotification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-4 rounded-xl border border-slate-800 shadow-xl max-w-sm flex items-start space-x-3 animate-slide-up">
          <div className="p-1.5 bg-[#005BAC] text-white rounded-md shrink-0">
            <Bell className="w-4 h-4 animate-bounce" />
          </div>
          <div className="flex-1 space-y-0.5">
            <p className="text-[10px] font-bold text-blue-400 font-mono uppercase tracking-widest">
              ClassFit System Sync
            </p>
            <p className="text-xs font-semibold leading-relaxed text-slate-200">
              {syncNotification}
            </p>
          </div>
          <button
            onClick={() => setSyncNotification(null)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Screen Routing */}
      {!session ? (
        <LoginGate
          lang={lang}
          setLang={handleLangToggle}
          onLoginSuccess={handleLoginSuccess}
        />
      ) : session.role === 'admin' ? (
        <AdminView
          session={session}
          lang={lang}
          setLang={handleLangToggle}
          onLogout={handleLogout}
          triggerSyncNotification={pushNotificationBanner}
        />
      ) : session.role === 'professor' ? (
        <ProfessorView
          session={session}
          lang={lang}
          setLang={handleLangToggle}
          onLogout={handleLogout}
          historyMgr={historyMgr}
        />
      ) : (
        <StudentView
          session={session}
          lang={lang}
          setLang={handleLangToggle}
          onLogout={handleLogout}
          historyMgr={historyMgr}
        />
      )}
    </div>
  );
}
