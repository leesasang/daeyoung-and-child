import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { LangType } from '../localization';

interface HistoryControllerProps {
  undoCount: number;
  redoCount: number;
  onUndo: () => void;
  onRedo: () => void;
  lang: LangType;
}

export default function HistoryController({
  undoCount,
  redoCount,
  onUndo,
  onRedo,
  lang,
}: HistoryControllerProps) {
  return (
    <div className="flex items-center space-x-2 select-none">
      <button
        onClick={onUndo}
        disabled={undoCount === 0}
        id="history-undo-button"
        title={lang === 'KO' ? '실행 취소' : 'Undo Action'}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center transition-all duration-200 ${
          undoCount > 0
            ? 'text-[#005BAC] bg-white border border-[#005BAC]/25 hover:bg-[#005BAC]/5 hover:border-[#005BAC]/45 shadow-2xs hover:shadow-1xs cursor-pointer'
            : 'text-slate-400 bg-slate-50 border border-slate-200/50 cursor-not-allowed opacity-60'
        }`}
      >
        <Undo2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
        <span>{lang === 'KO' ? '실행 취소' : 'Undo'}</span>
        <span
          id="history-undo-count"
          className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-mono font-black ${
            undoCount > 0 ? 'bg-[#005BAC]/10 text-[#005BAC]' : 'bg-slate-200 text-slate-400'
          }`}
        >
          {undoCount}
        </span>
      </button>

      <div className="w-px h-5 bg-slate-200" />

      <button
        onClick={onRedo}
        disabled={redoCount === 0}
        id="history-redo-button"
        title={lang === 'KO' ? '다시 실행' : 'Redo Action'}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center transition-all duration-200 ${
          redoCount > 0
            ? 'text-[#005BAC] bg-white border border-[#005BAC]/25 hover:bg-[#005BAC]/5 hover:border-[#005BAC]/45 shadow-2xs hover:shadow-1xs cursor-pointer'
            : 'text-slate-400 bg-slate-50 border border-slate-200/50 cursor-not-allowed opacity-60'
        }`}
      >
        <Redo2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
        <span>{lang === 'KO' ? '다시 실행' : 'Redo'}</span>
        <span
          id="history-redo-count"
          className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-mono font-black ${
            redoCount > 0 ? 'bg-[#005BAC]/10 text-[#005BAC]' : 'bg-slate-200 text-slate-400'
          }`}
        >
          {redoCount}
        </span>
      </button>
    </div>
  );
}
