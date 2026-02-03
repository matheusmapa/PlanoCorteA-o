import React, { memo } from 'react';
import { Trash2, Save, Plus, RefreshCw, Upload, File, FolderHeart, XCircle } from 'lucide-react';
import { BITOLAS_COMERCIAIS } from '../pdfProcessor';

// Componente otimizado de linha
const DemandRow = memo(({ item, onUpdate, onRemove }) => (
  <tr className="border-b border-slate-100 hover:bg-slate-50">
    <td className="px-4 py-2">
      <select 
        value={item.bitola} 
        onChange={(e) => onUpdate(item.id, 'bitola', parseFloat(e.target.value))} 
        className="w-20 p-1 border rounded bg-white text-sm"
      >
        {BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
    </td>
    <td className="px-4 py-2">
      <input type="number" value={item.qty} onChange={(e) => onUpdate(item.id, 'qty', parseInt(e.target.value))} className="w-16 p-1 border rounded font-bold text-blue-800 text-center" />
    </td>
    <td className="px-4 py-2">
      <input type="number" value={item.length} onChange={(e) => onUpdate(item.id, 'length', parseFloat(e.target.value))} className="w-20 p-1 border rounded text-center" />
    </td>
    <td className="px-4 py-2 text-xs text-slate-400 max-w-[100px] truncate" title={item.origin}>
      {item.origin && item.origin.includes('[PROJETO]') ? <span className="text-blue-500 font-semibold">{item.origin}</span> : item.origin}
    </td>
    <td className="px-4 py-2 text-right">
      <button onClick={() => onRemove(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
    </td>
  </tr>
));

const DemandList = ({ 
  items, 
  uploadedFiles, 
  isProcessing, 
  onFileUpload, 
  onRemoveFile, 
  onUpdateItem, 
  onRemoveItem, 
  onClear, 
  onSaveProject, 
  onOpenManualModal, 
  onRunOptimization 
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Upload */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold mb-3 text-slate-700">Arquivos e Módulos</h2>
        <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 text-center hover:bg-blue-50 transition cursor-pointer relative group">
          <input type="file" multiple accept=".pdf,.txt,.csv" onChange={onFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="flex flex-col items-center gap-3 text-blue-600">
            {isProcessing ? <RefreshCw className="animate-spin w-10 h-10" /> : <Upload className="w-10 h-10" />}
            <span className="font-bold">{isProcessing ? "Lendo arquivos..." : "Clique ou Arraste PDFs aqui"}</span>
          </div>
        </div>
        
        {uploadedFiles.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {uploadedFiles.map((file, idx) => (
              <div key={idx} className={`flex items-center gap-2 p-2 rounded border text-sm ${file.type === 'project' ? 'bg-blue-50 text-blue-800' : 'bg-green-50 text-green-800'}`}>
                {file.type === 'project' ? <FolderHeart size={16}/> : <File size={16}/>}
                <span className="truncate flex-1 font-bold">{file.name}</span>
                <button onClick={() => onRemoveFile(file)} className="hover:text-red-600"><XCircle size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-700">Lista de Corte ({items.length})</h2>
          <div className="flex gap-2">
            <button onClick={onSaveProject} className="flex gap-1 bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1 rounded text-sm hover:bg-indigo-100"><Save size={16} /> Salvar</button>
            <button onClick={onOpenManualModal} className="flex gap-1 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"><Plus size={16} /> Manual</button>
            <button onClick={onClear} className="text-red-500 text-sm hover:underline px-2">Limpar</button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-100 sticky top-0">
              <tr><th className="px-4 py-3">Bitola</th><th className="px-4 py-3">Qtd</th><th className="px-4 py-3">Comp.</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right">Ação</th></tr>
            </thead>
            <tbody>
              {items.map(item => (
                <DemandRow key={item.id} item={item} onUpdate={onUpdateItem} onRemove={onRemoveItem} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botão Calcular */}
      <div className="flex justify-end pb-8">
        <button onClick={onRunOptimization} disabled={items.length === 0 || isProcessing} className="bg-indigo-600 text-white px-8 py-3 rounded-md shadow-md font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:bg-slate-300 transition-all">
          {isProcessing ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
          {isProcessing ? "CALCULANDO..." : "CALCULAR OTIMIZAÇÃO"}
        </button>
      </div>
    </div>
  );
};

export default DemandList;
