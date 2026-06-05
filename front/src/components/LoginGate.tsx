import React, { useState } from 'react';
import { LangType, LANG_DICT } from '../localization';
import { authenticateUser } from '../algorithms/db_and_auth';
import { UserSession } from '../types';
import { BookOpen, ShieldAlert } from 'lucide-react';

interface LoginGateProps {
  lang: LangType;
  setLang: (l: LangType) => void;
  onLoginSuccess: (session: UserSession) => void;
}

export default function LoginGate({ lang, setLang, onLoginSuccess }: LoginGateProps) {
  const [userIdInput, setUserIdInput] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const t = LANG_DICT[lang];

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    const trimmed = userIdInput.trim();

    // ====================================================
    // TODO: 백엔드 API 연동 파트
    // - 담당 기능: 백엔드 통합 로그인 (SSO) 인증 연동
    // - 기능 설명: 백엔드 함수 호출 및 데이터 바인딩 후 상태 갱신(rerun / State Sync) 처리
    // ====================================================

    if (trimmed === 'admin') {
      const adminSession: UserSession = {
        userId: 'admin',
        role: 'admin',
        name: lang === 'KO' ? 'Gachon Staff (가천 행정관)' : 'Gachon Staff',
      };
      onLoginSuccess(adminSession);
    } else if (trimmed.length === 7 && /^\d+$/.test(trimmed)) {
      const profSession: UserSession = {
        userId: trimmed,
        role: 'professor',
        name: lang === 'KO' ? `교수님 (${trimmed})` : `Professor (${trimmed})`,
      };
      onLoginSuccess(profSession);
    } else if (trimmed.length === 9 && /^\d+$/.test(trimmed)) {
      const studentSession: UserSession = {
        userId: trimmed,
        role: 'student',
        name: lang === 'KO' ? `학생 (${trimmed})` : `Student (${trimmed})`,
      };
      onLoginSuccess(studentSession);
    } else {
      setErrorText(t.loginError);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-[#1E293B]">
      {/* Top Banner & Language Selector - Match Design HTML perfectly */}
      <div className="absolute top-6 right-6 flex items-center space-x-3 bg-white px-4 py-2 rounded-xl border border-[#E2E8F0] shadow-sm">
        <label htmlFor="lang-select" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans">
          {t.langSelectLabel}
        </label>
        <div className="flex bg-[#E2E8F0]/30 rounded-full p-0.5 border border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => setLang('KO')}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
              lang === 'KO' ? 'bg-[#005BAC] text-white shadow-xs' : 'text-slate-500 hover:text-[#005BAC]'
            }`}
          >
            KO
          </button>
          <button
            type="button"
            onClick={() => setLang('EN')}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-all cursor-pointer ${
              lang === 'EN' ? 'bg-[#005BAC] text-white shadow-xs' : 'text-slate-500 hover:text-[#005BAC]'
            }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* Main Login Box */}
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl shadow-lg overflow-hidden animate-fade-in">
        {/* Blue Header Branding Block - Match Design HTML Header */}
        <div className="bg-[#005BAC] p-8 text-center relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-28 h-28 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-md mb-4 text-[#005BAC]">
              <span className="font-extrabold text-2xl font-sans tracking-tighter">C</span>
            </div>
            <h1 className="text-xl font-extrabold font-sans text-white tracking-tight">
              ClassFit <span className="font-light opacity-80 text-sm ml-2 uppercase tracking-wide">Academic System</span>
            </h1>
            <p className="text-slate-200 text-xs mt-2 font-sans max-w-xs leading-relaxed opacity-85">
              {t.loginCardDesc}
            </p>
          </div>
          <div className="absolute top-0 right-0 px-2.5 py-0.5 bg-yellow-400 font-mono text-[9px] font-bold text-[#005BAC] rounded-bl-lg tracking-wider">
            Gachon Academic v4.0
          </div>
        </div>

        {/* Form Body block */}
        <form onSubmit={handleLogin} className="p-6 space-y-5">
          <div className="space-y-2">
            <label htmlFor="user-id-input" className="block text-xs font-bold text-slate-500 uppercase tracking-widest font-sans">
              {t.userIdLabel}
            </label>
            <input
              id="user-id-input"
              type="text"
              required
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder={t.userIdPlaceholder}
              className="w-full px-3.5 py-2.5 border border-[#E2E8F0] bg-gray-50/50 rounded-xl font-sans text-sm tracking-wide focus:outline-hidden focus:ring-1 focus:ring-[#005BAC] focus:border-[#005BAC] transition-all"
            />
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed font-sans">
              💡 {lang === 'KO' ? '학생: 학번 9자리 (예: 202410123) | 교수: 사번 7자리 (예: 1024101) | 관리자: admin 입력' : 'Student: 9-digit ID (e.g. 202410123) | Professor: 7-digit ID (e.g. 1024101) | Admin: admin'}
            </p>
          </div>

          {errorText && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="text-[11px] text-red-600 font-semibold font-sans leading-relaxed">
                {errorText}
              </span>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-[#005BAC] hover:bg-[#004a8d] text-white py-3 px-4 rounded-lg font-bold font-sans text-sm transition-colors shadow-md hover:shadow-lg cursor-pointer text-center"
          >
            {t.loginButton}
          </button>
        </form>

        {/* Info footer lock */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-[#E2E8F0] text-center flex items-center justify-between">
          <span className="text-[9px] text-slate-400 font-mono uppercase tracking-widest">
            Database Status
          </span>
          <span className="text-[9px] text-[#005BAC] font-mono uppercase tracking-widest font-bold">
            Connected: SQL_V2
          </span>
        </div>
      </div>

      <div className="mt-8 text-center px-4 max-w-sm">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest font-sans">
          Gachon University ClassFit System v4.0
        </p>
        <p className="text-[10px] text-slate-400 font-medium leading-relaxed font-sans mt-1">
          {t.footer}
        </p>
      </div>
    </div>
  );
}
