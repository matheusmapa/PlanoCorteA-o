import React from 'react';
import { FolderHeart, FileText, Download, CheckSquare, Trash2, X, Calendar, Edit3 } from 'lucide-react';

const Sidebar = ({ 
  isOpen, 
  onClose, 
  projects, 
  savedPlans, 
  onLoadProject, 
  onEditProject, 
  onLoadPlan, 
  onDeletePlan 
}) => {
  return (
    <>
      <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out border-l border-slate-200 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 bg-indigo-900 text-white flex justify-between items-center shadow-md">
          <h2 className="font-bold flex items-center gap-2"><FolderHeart size={20} /> Meus Arquivos</h2>
          <button onClick={onClose} className="hover:bg-indigo-700 p-1 rounded"><X size={20}/></button>
        </div>
        
        <div className="p-4 overflow-y-auto h-[calc(100vh-64px)] space-y-6 bg-slate-50">
          {/* Projetos */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 pl-1 flex items-center gap-2">
              <FileText size={14}/> Projetos (Demanda)
            </h3>
            {projects.length === 0 ? (
              <div className="text-center text-slate-400 py-4 text-sm border border-dashed rounded bg-white">Nenhum projeto salvo.</div>
            ) : (
              <div className="space-y-2">
                {projects.map(proj => (
                  <div key={proj.id} onClick={() => onEditProject(proj)} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md cursor-pointer group relative transition-all">
                    <div className="font-bold text-slate-800 text-sm mb-1 truncate pr-6">{proj.name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar size={12}/> {proj.createdAt?.toDate ? proj.createdAt.toDate().toLocaleDateString() : 'Data N/A'}
                    </div>
                    <div className="absolute top-3 right-3 text-indigo-300 group-hover:text-indigo-600"><Edit3 size={14} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Planos Salvos */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 pl-1 pt-4 border-t border-slate-200 flex items-center gap-2">
              <Download size={14}/> Planos Calculados
            </h3>
            {savedPlans.length === 0 ? (
                <div className="text-center text-slate-400 py-4 text-sm border border-dashed rounded bg-white">Nenhum plano salvo.</div>
            ) : (
                <div className="space-y-2">
                    {savedPlans.map(plan => (
                    <div key={plan.id} onClick={() => onLoadPlan(plan)} className="bg-green-50 p-3 rounded-lg border border-green-200 shadow-sm hover:shadow-md cursor-pointer group relative transition-all">
                        <div className="font-bold text-green-900 text-sm mb-1 truncate pr-6">{plan.name}</div>
                        <div className="text-xs text-green-700/70 flex items-center gap-1"><CheckSquare size={12}/> {plan.createdAt?.toDate ? plan.createdAt.toDate().toLocaleDateString() : 'Data N/A'}</div>
                        <button onClick={(e) => onDeletePlan(plan.id, e)} className="absolute top-3 right-3 text-red-300 hover:text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                    </div>
                    ))}
                </div>
            )}
          </div>
        </div>
      </div>
      {/* Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/20 z-[50] backdrop-blur-sm" onClick={onClose}></div>}
    </>
  );
};

export default Sidebar;
