import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase'; 
import { collection, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Settings, LogOut, User, FolderHeart, FileText, Clipboard, Download, Save, Printer, FolderDown, Eraser, X, Plus } from 'lucide-react';
import { jsPDF } from "jspdf"; // Agora importando do NPM

// Componentes
import Login from './Login';
import Sidebar from './components/Sidebar';
import DemandList from './components/DemandList';
import { useFirestoreData } from './hooks/useFirestoreData';

// Lógica
import { extractTextFromPDF, parseTextToItems, generateId, BITOLAS_COMERCIAIS } from './pdfProcessor';
import { calculateCutPlan } from './cutOptimizer';

const OtimizadorCorteAco = ({ user }) => {
  const { projects, savedPlans, inventory, updateInventory } = useFirestoreData(user);
  
  const [activeTab, setActiveTab] = useState('input');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [items, setItems] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [results, setResults] = useState(null);
  
  // Modais e UI states
  const [editingProject, setEditingProject] = useState(null);
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [manualData, setManualData] = useState({ bitola: 10.0, length: 100, qty: 1 });
  const [activeResultsBitola, setActiveResultsBitola] = useState('todas');
  const [activeInventoryBitola, setActiveInventoryBitola] = useState('todas');

  // --- ACTIONS ---

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    setIsProcessing(true);
    
    const newFiles = [...uploadedFiles];
    let newItems = [];

    for (const file of files) {
       if (newFiles.some(f => f.name === file.name)) continue;
       newFiles.push({ id: generateId(), name: file.name, type: 'file', status: 'lendo' });
       try {
         let text = "";
         if (file.type === "application/pdf") text = await extractTextFromPDF(file);
         else text = await file.text();
         
         const extracted = parseTextToItems(text, file.name);
         newItems = [...newItems, ...extracted];
         
         const idx = newFiles.findIndex(f => f.name === file.name);
         if(idx !== -1) newFiles[idx].status = 'ok';
       } catch (err) {
         console.error(err);
         const idx = newFiles.findIndex(f => f.name === file.name);
         if(idx !== -1) newFiles[idx].status = 'erro';
       }
    }
    setUploadedFiles(newFiles);
    setItems(prev => [...prev, ...newItems]);
    setIsProcessing(false);
  };

  const handleRunOptimization = () => {
    setIsProcessing(true);
    // Timeout para dar chance da UI atualizar o spinner
    setTimeout(() => {
        try {
            const res = calculateCutPlan(items, inventory);
            setResults(res);
            setActiveTab('results');
            setActiveResultsBitola('todas');
        } catch (e) { alert("Erro no cálculo: " + e.message); } 
        finally { setIsProcessing(false); }
    }, 100);
  };

  const handleSaveProject = async () => {
     if(items.length === 0) return alert("Nada para salvar");
     const name = prompt("Nome do Projeto:");
     if(!name) return;
     try {
        await addDoc(collection(db, 'users', user.uid, 'projects'), { name, items, createdAt: serverTimestamp() });
        alert("Projeto salvo!");
     } catch (e) { alert("Erro ao salvar"); }
  };

  const handleSaveCutPlan = async () => {
      if (!results) return;
      const name = prompt("Nome do Plano:");
      if (!name) return;
      await addDoc(collection(db, 'users', user.uid, 'cutPlans'), { name, results, createdAt: serverTimestamp() });
      alert("Plano salvo!");
  };

  const generatePDF = () => {
      if(!results) return;
      const doc = new jsPDF();
      let yPos = 20;
      doc.setFontSize(18); doc.text("Plano de Corte", 105, yPos, { align: 'center' }); yPos += 15;
      doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 105, yPos, { align: 'center' }); yPos += 15;

      results.forEach(group => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        doc.setFillColor(240, 240, 240); doc.rect(10, yPos - 5, 190, 8, 'F');
        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text(`Bitola: ${group.bitola} mm`, 15, yPos); yPos += 10;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        
        group.bars.forEach(bar => {
             if (yPos > 260) { doc.addPage(); yPos = 20; }
             const typeText = bar.type === 'nova' ? "BARRA NOVA (12m)" : `PONTA ESTOQUE (${bar.originalLength}cm)`;
             doc.text(`${bar.count}x  ${typeText} (Sobra: ${bar.remaining.toFixed(0)}cm)`, 15, yPos);
             yPos += 6;
        });
        yPos += 5;
      });
      doc.save(`Plano_Corte_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const consolidateLeftovers = () => {
      // Lógica simplificada de sobras
      if(!results) return;
      const newItems = [];
      results.forEach(g => g.bars.forEach(b => {
          if(b.remaining > 50) newItems.push({ id: generateId(), bitola: parseFloat(g.bitola), length: parseFloat(b.remaining.toFixed(1)), qty: b.count, source: 'sobra_corte' });
      }));
      updateInventory([...inventory, ...newItems]);
      alert(`${newItems.length} sobras adicionadas ao estoque!`);
      setActiveTab('inventory');
  };

  // Callbacks para DemandList
  const updateItem = useCallback((id, field, val) => setItems(prev => prev.map(i => i.id === id ? {...i, [field]: val} : i)), []);
  const removeItem = useCallback((id) => setItems(prev => prev.filter(i => i.id !== id)), []);

  // Modal Helpers
  const confirmManualAdd = () => {
      const { bitola, length, qty } = manualData;
      const newItem = { id: generateId(), bitola: parseFloat(bitola), length: parseFloat(length), qty: parseInt(qty) };
      if(showManualInputModal) setItems(p => [...p, {...newItem, origin: 'Manual', selected: true}]);
      else updateInventory([...inventory, {...newItem, source: 'Manual'}]);
      setShowManualInputModal(false); setShowAddStockModal(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative overflow-x-hidden">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        projects={projects}
        savedPlans={savedPlans}
        onLoadProject={(proj) => {
            const newItems = proj.items.map(i => ({...i, id: generateId(), origin: `[PROJ] ${proj.name}`}));
            setItems(prev => [...prev, ...newItems]);
            setUploadedFiles(prev => [...prev, {id: proj.id, name: proj.name, type: 'project'}]);
            setIsSidebarOpen(false);
        }}
        onEditProject={setEditingProject}
        onLoadPlan={(plan) => { setResults(plan.results); setActiveTab('results'); setIsSidebarOpen(false); }}
        onDeletePlan={async (id, e) => { e.stopPropagation(); await deleteDoc(doc(db, 'users', user.uid, 'cutPlans', id)); }}
      />

      {/* Header */}
      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
            <h1 className="text-xl font-bold flex items-center gap-2"><Settings className="text-yellow-500"/> Otimizador</h1>
            <div className="flex gap-3 items-center">
                <button onClick={() => setIsSidebarOpen(true)} className="bg-indigo-700 px-3 py-1.5 rounded flex items-center gap-2 text-sm hover:bg-indigo-600 transition-colors"><FolderHeart size={16}/> Meus Arquivos</button>
                <div className="h-6 w-px bg-slate-700 mx-2"></div>
                <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-red-400"><LogOut size={20}/></button>
            </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 pb-20">
        <div className="flex gap-4 mb-6 border-b border-slate-200 overflow-x-auto">
            <button onClick={() => setActiveTab('input')} className={`pb-2 px-4 flex gap-2 whitespace-nowrap ${activeTab === 'input' ? 'border-b-2 border-blue-600 text-blue-600 font-bold' : 'text-slate-500'}`}><FileText size={18}/> Demanda</button>
            <button onClick={() => setActiveTab('inventory')} className={`pb-2 px-4 flex gap-2 whitespace-nowrap ${activeTab === 'inventory' ? 'border-b-2 border-blue-600 text-blue-600 font-bold' : 'text-slate-500'}`}><Clipboard size={18}/> Estoque ({inventory.length})</button>
            <button onClick={() => setActiveTab('results')} disabled={!results} className={`pb-2 px-4 flex gap-2 whitespace-nowrap ${activeTab === 'results' ? 'border-b-2 border-blue-600 text-blue-600 font-bold' : 'text-slate-400'}`}><Download size={18}/> Resultado</button>
        </div>

        {activeTab === 'input' && (
            <DemandList 
                items={items} uploadedFiles={uploadedFiles} isProcessing={isProcessing}
                onFileUpload={handleFileUpload} onRemoveFile={(f) => setUploadedFiles(prev => prev.filter(x => x.id !== f.id))}
                onUpdateItem={updateItem} onRemoveItem={removeItem} onClear={() => setItems([])}
                onSaveProject={handleSaveProject} onOpenManualModal={() => { setManualData({bitola:10,length:100,qty:1}); setShowManualInputModal(true); }} 
                onRunOptimization={handleRunOptimization}
            />
        )}

        {activeTab === 'inventory' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-slate-700">Estoque de Pontas</h2>
                    <div className="flex gap-2">
                        <button onClick={() => updateInventory([])} className="text-red-500 text-sm hover:underline px-2">Zerar</button>
                        <button onClick={() => { setManualData({bitola:10,length:100,qty:1}); setShowAddStockModal(true); }} className="bg-green-600 text-white px-3 py-1 rounded text-sm flex gap-1 items-center"><Plus size={16}/> Adicionar</button>
                    </div>
                </div>
                {/* Tabs de Bitola para Estoque */}
                <div className="flex gap-1 mb-4 border-b overflow-x-auto no-scrollbar">
                    {['todas', ...BITOLAS_COMERCIAIS].map(b => (
                        <button key={b} onClick={() => setActiveInventoryBitola(b)} className={`px-3 py-1 text-sm rounded-t border-t border-x ${activeInventoryBitola == b ? 'bg-white border-b-white text-blue-600 font-bold -mb-px' : 'bg-slate-50 text-slate-500'}`}>{b === 'todas' ? 'Todas' : b}</button>
                    ))}
                </div>
                <div className="overflow-auto max-h-[500px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 sticky top-0 text-xs text-slate-500 uppercase"><tr><th className="p-3">Bitola</th><th className="p-3">Comp.</th><th className="p-3">Qtd</th><th className="p-3">Origem</th><th className="p-3 text-right">Ação</th></tr></thead>
                        <tbody>
                            {inventory.filter(i => activeInventoryBitola === 'todas' || i.bitola == activeInventoryBitola).map(item => (
                                <tr key={item.id} className="border-b hover:bg-slate-50">
                                    <td className="p-3">{item.bitola}mm</td><td className="p-3">{item.length}cm</td>
                                    <td className="p-3 font-bold">{item.qty}</td><td className="p-3 text-slate-400 text-xs">{item.source || 'Manual'}</td>
                                    <td className="p-3 text-right"><button onClick={() => updateInventory(inventory.filter(x => x.id !== item.id))} className="text-red-400"><X size={16}/></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'results' && results && (
             <div className="space-y-6 animate-fade-in">
                 <div className="flex justify-between items-center bg-indigo-50 p-4 rounded border border-indigo-100">
                     <h2 className="text-xl font-bold text-indigo-900">Resultado</h2>
                     <div className="flex gap-2">
                         <button onClick={handleSaveCutPlan} className="bg-indigo-600 text-white px-3 py-1 rounded text-sm flex gap-1 items-center"><Save size={16}/> Salvar</button>
                         <button onClick={generatePDF} className="bg-white text-indigo-700 border border-indigo-200 px-3 py-1 rounded text-sm flex gap-1 items-center"><Printer size={16}/> PDF</button>
                         <button onClick={consolidateLeftovers} className="bg-green-600 text-white px-3 py-1 rounded text-sm flex gap-1 items-center"><FolderDown size={16}/> Salvar Sobras</button>
                         <button onClick={() => { setResults(null); setActiveTab('input'); }} className="text-red-500 bg-white px-3 py-1 rounded border border-red-200 text-sm flex gap-1 items-center"><Eraser size={16}/> Limpar</button>
                     </div>
                 </div>
                 
                 <div className="flex gap-1 mb-4 border-b overflow-x-auto no-scrollbar">
                    {['todas', ...results.map(r=>r.bitola)].map(b => (
                        <button key={b} onClick={() => setActiveResultsBitola(b)} className={`px-3 py-1 text-sm rounded-t border-t border-x ${activeResultsBitola == b ? 'bg-white border-b-white text-blue-600 font-bold -mb-px' : 'bg-slate-50 text-slate-500'}`}>{b === 'todas' ? 'Todas' : b + 'mm'}</button>
                    ))}
                </div>

                 {results.filter(g => activeResultsBitola === 'todas' || g.bitola == activeResultsBitola).map((group, idx) => (
                     <div key={idx} className="bg-white rounded border p-4 shadow-sm">
                         <h3 className="font-bold text-lg border-b pb-2 mb-4">{group.bitola}mm <span className="text-sm font-normal text-slate-500">({group.bars.reduce((acc,b)=>acc+b.count,0)} barras)</span></h3>
                         {group.bars.map((bar, bIdx) => (
                             <div key={bIdx} className="mb-4 last:mb-0">
                                 <div className="flex justify-between text-xs mb-1">
                                     <span className="font-bold">{bar.count}x {bar.type === 'nova' ? 'Barra Nova (12m)' : `Ponta ${bar.originalLength}cm`}</span>
                                     <span className={bar.remaining > 50 ? "text-green-600 font-bold" : "text-slate-400"}>Sobra: {bar.remaining.toFixed(1)}cm</span>
                                 </div>
                                 <div className="flex h-10 w-full bg-slate-200 rounded overflow-hidden border">
                                     {bar.cuts.map((cut, cIdx) => (
                                         <div key={cIdx} style={{ width: `${(cut / bar.originalLength)*100}%` }} className="h-full bg-blue-500 border-r border-white flex items-center justify-center text-white text-[10px] truncate" title={cut}>{cut}</div>
                                     ))}
                                 </div>
                             </div>
                         ))}
                     </div>
                 ))}
             </div>
        )}
      </main>

      {/* Modais */}
      {(showManualInputModal || showAddStockModal) && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 w-full max-w-sm">
                  <h3 className="font-bold text-lg mb-4">{showManualInputModal ? "Adicionar Peça" : "Adicionar ao Estoque"}</h3>
                  <div className="space-y-3">
                      <div><label className="block text-sm text-slate-600">Bitola</label><select value={manualData.bitola} onChange={e=>setManualData({...manualData, bitola: e.target.value})} className="w-full border p-2 rounded">{BITOLAS_COMERCIAIS.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
                      <div className="flex gap-3">
                          <div className="flex-1"><label className="block text-sm text-slate-600">Comp.(cm)</label><input type="number" value={manualData.length} onChange={e=>setManualData({...manualData, length: e.target.value})} className="w-full border p-2 rounded"/></div>
                          <div className="flex-1"><label className="block text-sm text-slate-600">Qtd</label><input type="number" value={manualData.qty} onChange={e=>setManualData({...manualData, qty: e.target.value})} className="w-full border p-2 rounded"/></div>
                      </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                      <button onClick={()=>{setShowManualInputModal(false);setShowAddStockModal(false);}} className="px-4 py-2 text-slate-500">Cancelar</button>
                      <button onClick={confirmManualAdd} className="bg-indigo-600 text-white px-4 py-2 rounded">Salvar</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

// Wrapper Auth
const App = () => {
    const [user, setUser] = useState(null);
    useEffect(() => onAuthStateChanged(auth, setUser), []);
    if (!user) return <Login />;
    return <OtimizadorCorteAco user={user} />;
};

export default App;
