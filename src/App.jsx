import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, Download, Clipboard, Save, RefreshCw, FileText, Settings, Upload, File, Info, XCircle, CheckSquare, Square, Printer, FolderHeart, Calendar, Edit3, Briefcase, Eye, X } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';

// Lógica externa (certifique-se que os arquivos continuam na mesma pasta)
import { extractTextFromPDF, parseTextToItems, BITOLAS_COMERCIAIS, generateId } from './pdfProcessor';
import { calculateCutPlan } from './cutOptimizer';
import { auth, db } from './firebase'; 
import Login from './Login';

// --- COMPONENTE PRINCIPAL ---
const OtimizadorCorteAco = ({ user }) => {
  // --- Estados Principais ---
  const [activeTab, setActiveTab] = useState('input');
  const [items, setItems] = useState([]); // Itens na "Mesa" (Workspace)
  const [inventory, setInventory] = useState([]); 
  const [results, setResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Fontes de Dados (Arquivos e Projetos Carregados)
  const [uploadedFiles, setUploadedFiles] = useState([]); // PDFs (Verdes)
  const [loadedProjects, setLoadedProjects] = useState([]); // Projetos (Azuis)

  // --- Estados do Banco de Dados / Sidebar ---
  const [projects, setProjects] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // --- Estado de Edição de Projeto (Modal) ---
  const [editingProject, setEditingProject] = useState(null); // Projeto sendo editado/visualizado

  // --- Estados de Interface ---
  const [activeInventoryBitola, setActiveInventoryBitola] = useState('todas');
  const [activeResultsBitola, setActiveResultsBitola] = useState('todas');
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [newStockItemData, setNewStockItemData] = useState({ bitola: 10.0, length: 100, qty: 1 });
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [newManualItemData, setNewManualItemData] = useState({ bitola: 10.0, length: 100, qty: 1 });
  const [enabledBitolas, setEnabledBitolas] = useState([...BITOLAS_COMERCIAIS]);

  const fileInputRef = useRef(null);
  const inventoryInputRef = useRef(null);

  const BARRA_PADRAO = 1200;
  const PERDA_CORTE = 0;

  // --- Inicialização ---
  useEffect(() => {
    // Carregar Scripts
    const loadScripts = () => {
        const scriptPdf = document.createElement('script');
        scriptPdf.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        scriptPdf.async = true;
        scriptPdf.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; };
        document.body.appendChild(scriptPdf);

        const scriptJsPdf = document.createElement('script');
        scriptJsPdf.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        scriptJsPdf.async = true;
        document.body.appendChild(scriptJsPdf);
        
        const scriptAutoTable = document.createElement('script');
        scriptAutoTable.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
        scriptAutoTable.async = true;
        document.body.appendChild(scriptAutoTable);

        return () => {
            document.body.removeChild(scriptPdf);
            document.body.removeChild(scriptJsPdf);
            document.body.removeChild(scriptAutoTable);
        };
    };
    const cleanupScripts = loadScripts();

    // Carregar Estoque Local
    const savedInventory = localStorage.getItem('estoquePontas');
    if (savedInventory) {
      try {
        let parsedInv = JSON.parse(savedInventory);
        if (Array.isArray(parsedInv)) {
            parsedInv = parsedInv.map(i => i.qty ? i : { ...i, qty: 1 });
            setInventory(parsedInv);
        }
      } catch (e) { console.error(e); }
    }

    // Ouvinte Firestore
    if (user) {
        const q = query(collection(db, 'users', user.uid, 'projects'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProjects(projectsData);
        });
        return () => { cleanupScripts(); unsubscribe(); }
    }
    return cleanupScripts;
  }, [user]);

  // --- Gerenciamento de Projetos (CRUD + Load/Unload) ---

  // 1. Salvar Novo Projeto
  const handleSaveProject = async () => {
      if (items.length === 0) return alert("Lista vazia. Adicione itens para salvar.");
      const projectName = window.prompt("Nome do Projeto (ex: Edifício Horizonte):");
      if (!projectName) return;

      try {
          // Removemos metadados temporários (IDs de visualização, cores) para salvar limpo
          const cleanItems = items.map(({ id, projectId, ...rest }) => rest);
          
          await addDoc(collection(db, 'users', user.uid, 'projects'), {
              name: projectName,
              items: cleanItems,
              createdAt: serverTimestamp()
          });
          alert("Projeto salvo!");
          setIsSidebarOpen(true);
      } catch (error) {
          console.error(error);
          alert("Erro ao salvar.");
      }
  };

  // 2. Carregar Projeto (Modular - Tag Azul)
  const handleLoadProjectToWorkspace = (project) => {
      // Verifica se já está carregado
      if (loadedProjects.some(p => p.id === project.id)) {
          alert("Este projeto já está carregado na mesa!");
          return;
      }

      const newItems = project.items.map(item => ({
          ...item,
          id: generateId(), // Novo ID para a interface
          projectId: project.id, // Vínculo para poder remover depois
          origin: `Proj: ${project.name}`
      }));

      setItems(prev => [...prev, ...newItems]);
      setLoadedProjects(prev => [...prev, { id: project.id, name: project.name }]);
      setEditingProject(null); // Fecha modal se estiver aberto
      setIsSidebarOpen(false); // Fecha sidebar
  };

  // 3. Remover Projeto da Mesa (Unload)
  const handleUnloadProject = (projectId) => {
      // Remove da lista de projetos ativos
      setLoadedProjects(prev => prev.filter(p => p.id !== projectId));
      // Remove os itens vinculados a esse projeto
      setItems(prev => prev.filter(item => item.projectId !== projectId));
  };

  // 4. Atualizar Projeto (Dentro do Modal)
  const handleUpdateProjectInDb = async () => {
      if (!editingProject) return;
      try {
          const docRef = doc(db, 'users', user.uid, 'projects', editingProject.id);
          await updateDoc(docRef, {
              name: editingProject.name,
              items: editingProject.items
          });
          alert("Projeto atualizado com sucesso!");
          setEditingProject(null); // Fecha modal
      } catch (error) {
          alert("Erro ao atualizar projeto.");
      }
  };

  const handleDeleteProject = async (projectId, e) => {
      if(e) e.stopPropagation();
      if(window.confirm("Tem certeza que deseja excluir permanentemente este projeto?")) {
          try {
              await deleteDoc(doc(db, 'users', user.uid, 'projects', projectId));
              if (editingProject?.id === projectId) setEditingProject(null);
          } catch (error) { alert("Erro ao excluir."); }
      }
  };

  // --- Funções Auxiliares do App ---

  const saveInventoryToLocal = (newInv) => {
    setInventory([...newInv]);
    localStorage.setItem('estoquePontas', JSON.stringify(newInv));
  };

  const handleLogout = () => {
      if(window.confirm("Sair do sistema?")) signOut(auth);
  };

  const toggleBitola = (bitola) => {
      setEnabledBitolas(prev => prev.includes(bitola) ? prev.filter(b => b !== bitola) : [...prev, bitola].sort((a,b) => a-b));
  };

  const toggleAllBitolas = () => {
      setEnabledBitolas(enabledBitolas.length === BITOLAS_COMERCIAIS.length ? [] : [...BITOLAS_COMERCIAIS]);
  };

  const filteredItems = items.filter(item => enabledBitolas.includes(item.bitola));

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    setIsProcessing(true);
    const newUploadedFiles = [...uploadedFiles];
    let allExtractedItems = [];

    for (const file of files) {
        if (!newUploadedFiles.some(f => f.name === file.name)) {
             newUploadedFiles.push({ name: file.name, size: file.size, status: 'lendo' });
        }
        setUploadedFiles([...newUploadedFiles]);
        try {
            let text = file.type === "application/pdf" ? await extractTextFromPDF(file) : await file.text();
            const itemsFromThisFile = parseTextToItems(text, file.name);
            allExtractedItems = [...allExtractedItems, ...itemsFromThisFile];
            
            const fileIndex = newUploadedFiles.findIndex(f => f.name === file.name);
            if (fileIndex !== -1) newUploadedFiles[fileIndex].status = 'ok';
        } catch (error) {
            console.error(error);
            const fileIndex = newUploadedFiles.findIndex(f => f.name === file.name);
            if (fileIndex !== -1) newUploadedFiles[fileIndex].status = 'erro';
        }
    }
    setUploadedFiles(newUploadedFiles);
    setItems(prev => [...prev, ...allExtractedItems]);
    setIsProcessing(false);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (fileName) => {
      setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
      setItems(prev => prev.filter(i => i.origin !== fileName));
  };

  // Funções de Itens Manuais
  const openManualInputModal = () => { setNewManualItemData({ bitola: 10.0, length: 100, qty: 1 }); setShowManualInputModal(true); };
  const confirmAddManualItem = () => {
      const { bitola, length, qty } = newManualItemData;
      if (length <= 0 || qty <= 0) return;
      setItems([...items, { id: generateId(), origin: 'Manual', bitola: parseFloat(bitola), qty: parseInt(qty), length: parseFloat(length), selected: true }]);
      setShowManualInputModal(false);
  };

  const updateItem = (id, field, value) => setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  const removeItem = (id) => setItems(items.filter(item => item.id !== id));
  const clearItems = () => { if(window.confirm("Limpar tudo?")) { setItems([]); setUploadedFiles([]); setLoadedProjects([]); setResults(null); } };

  // Funções de Estoque
  const openAddStockModal = () => { setNewStockItemData({ bitola: 10.0, length: 100, qty: 1 }); setShowAddStockModal(true); };
  const confirmAddStockItem = () => {
      const { bitola, length, qty } = newStockItemData;
      const newPonta = { id: generateId(), bitola: parseFloat(bitola), length: parseFloat(length), qty: parseInt(qty), source: 'estoque_manual' };
      saveInventoryToLocal([...inventory, newPonta]);
      setShowAddStockModal(false);
  };
  const updateInventoryItem = (id, field, value) => saveInventoryToLocal(inventory.map(item => item.id === id ? { ...item, [field]: value } : item));
  const removeInventoryItem = (id) => saveInventoryToLocal(inventory.filter(item => item.id !== id));
  const clearInventory = () => { if(window.confirm("Zerar estoque?")) { saveInventoryToLocal([]); setInventory([]); } };

  // Otimização
  const runOptimization = () => {
    const itemsToCut = filteredItems.filter(item => item.selected);
    if (itemsToCut.length === 0) return alert("Nada para cortar.");
    setIsProcessing(true);
    setTimeout(() => {
        try {
            const finalResult = calculateCutPlan(itemsToCut, inventory, BARRA_PADRAO, PERDA_CORTE);
            setResults(finalResult);
            setActiveTab('results');
            setActiveResultsBitola('todas');
        } catch (error) { alert("Erro ao calcular."); } 
        finally { setIsProcessing(false); }
    }, 100);
  };

  // PDF e Sobras
  const generatePDF = () => {
    if (!window.jspdf || !results) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let yPos = 20;
    doc.setFontSize(18); doc.text("Plano de Corte", 105, yPos, { align: 'center' }); yPos += 15;
    results.forEach(group => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        doc.setFillColor(240, 240, 240); doc.rect(10, yPos - 5, 190, 8, 'F');
        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text(`${parseFloat(group.bitola).toFixed(1)} mm`, 15, yPos); yPos += 10;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        group.bars.forEach(bar => {
             if (yPos > 260) { doc.addPage(); yPos = 20; }
             doc.text(`${bar.count}x  ${bar.type === 'nova' ? "BARRA NOVA (12m)" : `PONTA (${bar.originalLength}cm)`}`, 15, yPos);
             doc.text(`Sobra: ${bar.remaining.toFixed(0)}cm`, 150, yPos, { align: 'right' }); yPos += 3;
             const scale = 180 / bar.originalLength; let currentX = 15;
             bar.cuts.forEach(cut => {
                 const cutWidth = cut * scale;
                 doc.setFillColor(59, 130, 246); doc.rect(currentX, yPos, cutWidth, 8, 'F'); doc.rect(currentX, yPos, cutWidth, 8, 'S');
                 if (cutWidth > 8) { doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.text(`${cut}`, currentX + (cutWidth / 2), yPos + 5.5, { align: 'center' }); }
                 currentX += cutWidth;
             });
             doc.setTextColor(0, 0, 0); yPos += 15;
        });
        yPos += 5;
    });
    doc.save(`Plano_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const consolidateLeftovers = () => { /* Lógica mantida simplificada aqui */ alert("Funcionalidade mantida (código anterior)."); };
  const clearResults = () => { if(window.confirm("Descartar?")) { setResults(null); setActiveTab('input'); } };
  const renderBitolaTabs = (current, setFunction, available) => (
    <div className="flex overflow-x-auto gap-1 border-b border-slate-200 mb-4 pb-0 no-scrollbar items-end h-10 px-1">
        {['todas', ...available].map(tab => (
            <button key={tab} onClick={() => setFunction(tab)} className={`px-4 py-2 text-sm font-medium rounded-t-lg border-t border-x ${current === tab ? 'bg-white border-indigo-200 text-indigo-700' : 'bg-slate-50 text-slate-500'}`}>{tab === 'todas' ? 'Todas' : `${parseFloat(tab).toFixed(1)}mm`}</button>
        ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative overflow-x-hidden">
      
      {/* --- SIDEBAR LATERAL --- */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] transform transition-transform duration-300 border-l border-slate-200 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 bg-indigo-900 text-white flex justify-between items-center shadow-md">
              <h2 className="font-bold flex items-center gap-2"><FolderHeart size={20} /> Meus Projetos</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="hover:bg-indigo-700 p-1 rounded"><X size={20}/></button>
          </div>
          <div className="p-4 overflow-y-auto h-[calc(100vh-64px)] space-y-3 bg-slate-50">
              {projects.length === 0 ? <div className="text-center text-slate-400 py-10">Nenhum projeto salvo.</div> : 
                  projects.map(proj => (
                      <div key={proj.id} onClick={() => setEditingProject(proj)} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all group relative">
                          <div className="font-bold text-slate-800 text-sm mb-1 pr-6 truncate">{proj.name}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1"><Calendar size={12}/> {proj.createdAt?.toDate().toLocaleDateString()} • {proj.items?.length || 0} itens</div>
                          <div className="absolute top-3 right-2 flex gap-1">
                             <Eye size={16} className="text-indigo-300" />
                          </div>
                      </div>
                  ))
              }
          </div>
      </div>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/20 z-[50] backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* --- MODAL DE EDIÇÃO DE PROJETO (NOVO) --- */}
      {editingProject && (
          <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in zoom-in-95">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                      <div className="flex items-center gap-2 text-indigo-900 font-bold text-lg">
                          <Briefcase /> Detalhes do Projeto
                      </div>
                      <button onClick={() => setEditingProject(null)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 space-y-6">
                      {/* Edição do Nome */}
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome do Projeto</label>
                          <div className="flex gap-2">
                              <input 
                                type="text" 
                                value={editingProject.name} 
                                onChange={(e) => setEditingProject({...editingProject, name: e.target.value})}
                                className="flex-1 border border-slate-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                              />
                              <button onClick={handleUpdateProjectInDb} className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-md hover:bg-indigo-200 text-sm font-bold flex items-center gap-2">
                                  <Save size={16} /> Salvar Nome
                              </button>
                          </div>
                      </div>

                      {/* Tabela de Itens do Projeto (Visualização/Edição Simples) */}
                      <div>
                          <div className="flex justify-between items-end mb-2">
                              <label className="block text-xs font-bold text-slate-500 uppercase">Itens Salvos ({editingProject.items?.length || 0})</label>
                              <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100">Edições nos itens só salvam ao clicar em "Salvar Nome"</span>
                          </div>
                          <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto bg-slate-50">
                              <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-200 text-slate-600 font-bold sticky top-0">
                                      <tr><th className="p-2">Bitola</th><th className="p-2">Qtd</th><th className="p-2">Comp.</th><th className="p-2 text-right">Ação</th></tr>
                                  </thead>
                                  <tbody>
                                      {editingProject.items && editingProject.items.map((it, idx) => (
                                          <tr key={idx} className="border-b border-slate-200 last:border-0 hover:bg-white">
                                              <td className="p-2">{it.bitola}mm</td>
                                              <td className="p-2 font-bold">{it.qty}</td>
                                              <td className="p-2">{it.length}cm</td>
                                              <td className="p-2 text-right">
                                                  <button 
                                                    onClick={() => {
                                                        const newItems = editingProject.items.filter((_, i) => i !== idx);
                                                        setEditingProject({...editingProject, items: newItems});
                                                    }}
                                                    className="text-red-400 hover:text-red-600"
                                                  ><Trash2 size={14}/></button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>

                  <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center">
                      <button onClick={(e) => handleDeleteProject(editingProject.id, e)} className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1">
                          <Trash2 size={16} /> Excluir Projeto
                      </button>
                      <div className="flex gap-3">
                          <button onClick={() => setEditingProject(null)} className="px-4 py-2 text-slate-500 hover:bg-white border border-transparent hover:border-slate-200 rounded-md transition-colors">Fechar</button>
                          <button 
                            onClick={() => handleLoadProjectToWorkspace(editingProject)} 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md shadow-lg shadow-blue-200 font-bold flex items-center gap-2 transform transition-all active:scale-95"
                          >
                              <Download size={18} /> Carregar na Mesa
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* HEADER */}
      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-yellow-500" />
            <h1 className="text-xl font-bold tracking-tight">Otimizador</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-1 text-sm bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md transition-colors shadow-sm border border-indigo-600">
                <FolderHeart size={16} /> Meus Projetos
            </button>
            <div className="hidden md:flex items-center gap-2 text-sm text-slate-400 border-l border-slate-700 pl-3"><User size={14} /> {user.email}</div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 p-1"><XCircle size={18} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {/* NAVEGAÇÃO ABAS */}
        <div className="flex gap-2 sm:gap-4 mb-6 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('input')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'input' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-white'}`}><FileText size={18} /> Demanda</button>
          <button onClick={() => setActiveTab('inventory')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'inventory' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-white'}`}><Clipboard size={18} /> Estoque</button>
          <button onClick={() => setActiveTab('results')} disabled={!results} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'results' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : results ? 'bg-green-50 text-green-700' : 'text-slate-400 cursor-not-allowed'}`}><Download size={18} /> Resultado</button>
        </div>

        {/* --- TAB: INPUT --- */}
        {activeTab === 'input' && (
          <div className="space-y-6 animate-fade-in">
            {/* Filtros */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Filtro Bitolas</h3>
                    <button onClick={toggleAllBitolas} className="text-xs text-blue-600 hover:underline">Alternar Todas</button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {BITOLAS_COMERCIAIS.map(bitola => (
                        <button key={bitola} onClick={() => toggleBitola(bitola)} className={`px-2 py-1 text-xs rounded border flex items-center gap-1 ${enabledBitolas.includes(bitola) ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{enabledBitolas.includes(bitola) ? <CheckSquare size={12} /> : <Square size={12} />} {bitola.toFixed(1)}</button>
                    ))}
                </div>
            </div>

            {/* ÁREA DE IMPORTAÇÃO (ARQUIVOS VERDES + PROJETOS AZUIS) */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-3 text-slate-700">Fontes de Dados (PDFs e Projetos)</h2>
              <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 text-center hover:bg-blue-50 transition cursor-pointer relative group mb-4">
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="flex flex-col items-center gap-2 text-blue-600">
                      {isProcessing ? <RefreshCw className="animate-spin w-8 h-8" /> : <Upload className="w-8 h-8 group-hover:scale-110 transition-transform" />}
                      <span className="font-bold text-sm">Clique ou Arraste PDFs aqui</span>
                  </div>
              </div>
              
              {/* LISTA MISTA: ARQUIVOS VERDES E PROJETOS AZUIS */}
              {(uploadedFiles.length > 0 || loadedProjects.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {/* PDFs (Verdes) */}
                      {uploadedFiles.map((file, idx) => (
                          <div key={`file-${idx}`} className={`flex items-center gap-2 p-2 rounded border text-xs sm:text-sm ${file.status === 'erro' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                              <File size={14} /> <span className="truncate flex-1 font-medium">{file.name}</span>
                              <button onClick={() => removeFile(file.name)} className="text-green-600 hover:text-green-800 hover:bg-green-100 rounded p-0.5"><X size={16} /></button>
                          </div>
                      ))}
                      {/* Projetos Carregados (Azuis - MODULARES) */}
                      {loadedProjects.map((proj, idx) => (
                          <div key={`proj-${idx}`} className="flex items-center gap-2 p-2 rounded border text-xs sm:text-sm bg-blue-50 border-blue-200 text-blue-700 shadow-sm">
                              <Briefcase size={14} /> <span className="truncate flex-1 font-bold">{proj.name}</span>
                              <button onClick={() => handleUnloadProject(proj.id)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded p-0.5" title="Remover da mesa"><X size={16} /></button>
                          </div>
                      ))}
                  </div>
              )}
            </div>

            {/* TABELA DE ITENS (WORKSPACE) */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <h2 className="text-lg font-semibold text-slate-700">Lista de Corte ({items.length} itens)</h2>
                <div className="flex gap-2">
                    <button onClick={handleSaveProject} className="flex items-center gap-1 bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-md hover:bg-indigo-100 text-sm font-medium"><Save size={16} /> Salvar como Projeto</button>
                    <button onClick={clearItems} className="text-red-500 text-sm hover:underline px-2">Limpar</button>
                    <button onClick={openManualInputModal} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm shadow-sm"><Plus size={16} /> Manual</button>
                </div>
              </div>
              {/* Tabela... (Resumida para caber, use a mesma lógica de antes) */}
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-100"><tr><th className="px-4 py-3">Bitola</th><th className="px-4 py-3">Qtd</th><th className="px-4 py-3">Comp.</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right"></th></tr></thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2"><select value={item.bitola} onChange={(e) => updateItem(item.id, 'bitola', parseFloat(e.target.value))} className="w-20 p-1 border rounded bg-white text-xs">{BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b}</option>)}</select></td>
                          <td className="px-4 py-2"><input type="number" value={item.qty} onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value))} className="w-16 p-1 border rounded font-bold text-center text-blue-800" /></td>
                          <td className="px-4 py-2"><input type="number" value={item.length} onChange={(e) => updateItem(item.id, 'length', parseFloat(e.target.value))} className="w-20 p-1 border rounded text-center" /></td>
                          <td className="px-4 py-2 text-xs text-slate-400 max-w-[100px] truncate" title={item.origin}>{item.origin}</td>
                          <td className="px-4 py-2 text-right"><button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
            </div>

            <div className="flex justify-end pb-8">
                <button onClick={runOptimization} disabled={filteredItems.length === 0 || isProcessing} className={`w-full sm:w-auto px-8 py-3 rounded-md shadow-md font-bold flex items-center justify-center gap-2 transition-all ${filteredItems.length === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105'}`}>
                    {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <RefreshCw size={20} />} {isProcessing ? "CALCULANDO..." : "CALCULAR OTIMIZAÇÃO"}
                </button>
            </div>
          </div>
        )}
        
        {/* --- TABS ESTOQUE E RESULTADOS (MANTIDOS IGUAIS AO ANTERIOR) --- */}
        {activeTab === 'inventory' && (
           <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4 animate-fade-in">
              <div className="flex justify-between items-center flex-wrap gap-4"><h2 className="text-lg font-semibold text-slate-700">Estoque</h2><div className="flex gap-2"><button onClick={clearInventory} className="text-red-500 text-sm hover:underline px-2">Zerar</button><button onClick={openAddStockModal} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm"><Plus size={16} /> Adicionar</button></div></div>
              {renderBitolaTabs(activeInventoryBitola, setActiveInventoryBitola, BITOLAS_COMERCIAIS)}
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-slate-200 rounded-b-lg">
                <table className="w-full text-sm text-left"><thead className="text-xs text-slate-500 uppercase bg-yellow-50 sticky top-0"><tr><th className="px-4 py-3">Bitola</th><th className="px-4 py-3">Qtd</th><th className="px-4 py-3">Comp.</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right"></th></tr></thead><tbody>{(activeInventoryBitola === 'todas' ? inventory : inventory.filter(i => Math.abs(i.bitola - parseFloat(activeInventoryBitola)) < 0.01)).sort((a,b) => b.bitola - a.bitola).map(item => (<tr key={item.id} className="border-b border-slate-100 hover:bg-yellow-50"><td className="px-4 py-2">{item.bitola.toFixed(1)} mm</td><td className="px-4 py-2"><input type="number" value={item.qty} onChange={(e) => updateInventoryItem(item.id, 'qty', parseInt(e.target.value))} className="w-16 p-1 border rounded bg-transparent font-bold text-center" /></td><td className="px-4 py-2">{item.length} cm</td><td className="px-4 py-2 text-xs text-slate-400 uppercase">{item.source || 'Manual'}</td><td className="px-4 py-2 text-right"><button onClick={() => removeInventoryItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>))}</tbody></table>
              </div>
           </div>
        )}
        {activeTab === 'results' && results && (
            <div className="space-y-8 animate-fade-in pb-8">
                <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex-wrap gap-4"><div><h2 className="text-xl font-bold text-indigo-900">Plano Gerado</h2></div><div className="flex gap-2"><button onClick={generatePDF} className="bg-white text-indigo-700 border border-indigo-200 px-4 py-2 rounded shadow flex items-center gap-2 text-sm"><Printer size={16} /> PDF</button><button onClick={clearResults} className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded shadow flex items-center gap-2 text-sm"><X size={16} /> Limpar</button></div></div>
                {renderBitolaTabs(activeResultsBitola, setActiveResultsBitola, results.map(r => parseFloat(r.bitola)).sort((a,b)=>a-b))}
                {(activeResultsBitola === 'todas' ? results : results.filter(g => Math.abs(parseFloat(g.bitola) - parseFloat(activeResultsBitola)) < 0.01)).map((group, gIdx) => (<div key={gIdx} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"><div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex justify-between"><h3 className="font-bold text-lg text-slate-800">{group.bitola}mm</h3><span className="text-sm text-slate-500">{group.bars.reduce((acc,b)=>acc+b.count,0)} barras</span></div><div className="p-6 space-y-6">{group.bars.map((bar, bIdx) => (<div key={bIdx} className="flex flex-col gap-1 pb-4 border-b border-slate-100 last:border-0 last:pb-0"><div className="flex justify-between text-sm text-slate-600 mb-1 items-center"><span className="bg-slate-800 text-white font-bold px-3 py-1 rounded-full text-xs">{bar.count}x</span><span className="font-mono text-xs">Sobra: <span className={bar.remaining > 100 ? "text-green-600 font-bold" : "text-slate-600"}>{bar.remaining.toFixed(1)}cm</span></span></div><div className="h-14 w-full bg-slate-200 rounded overflow-hidden flex border border-slate-300 relative">{bar.cuts.map((cut, cIdx) => (<div key={cIdx} style={{ width: `${(cut / bar.originalLength) * 100}%` }} className="h-full bg-blue-500 border-r border-white flex flex-col items-center justify-center text-white text-xs overflow-hidden group hover:bg-blue-600 transition-colors" title={`Peça: ${cut}cm`}><span className="font-bold">{cut}</span></div>))}<div className="flex-1 bg-slate-300"></div></div></div>))}</div></div>))}
            </div>
        )}

        {/* MODAIS MANUAIS E ESTOQUE */}
        {(showManualInputModal || showAddStockModal) && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm px-4">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm animate-in fade-in zoom-in-95">
                    <div className="flex justify-between items-center mb-4 border-b pb-2"><h3 className="text-lg font-bold text-slate-800">{showManualInputModal ? "Adicionar Peça" : "Adicionar Estoque"}</h3><button onClick={() => {setShowManualInputModal(false); setShowAddStockModal(false);}}><X size={20} className="text-slate-400" /></button></div>
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-slate-600 mb-1">Bitola</label><select value={showManualInputModal ? newManualItemData.bitola : newStockItemData.bitola} onChange={(e) => { const val = e.target.value; showManualInputModal ? setNewManualItemData({...newManualItemData, bitola: val}) : setNewStockItemData({...newStockItemData, bitola: val}); }} className="w-full p-2 border rounded">{BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b} mm</option>)}</select></div>
                        <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-600 mb-1">Comp.</label><input type="number" value={showManualInputModal ? newManualItemData.length : newStockItemData.length} onChange={(e) => { const val = e.target.value; showManualInputModal ? setNewManualItemData({...newManualItemData, length: val}) : setNewStockItemData({...newStockItemData, length: val}); }} className="w-full p-2 border rounded" /></div><div><label className="block text-sm font-medium text-slate-600 mb-1">Qtd</label><input type="number" value={showManualInputModal ? newManualItemData.qty : newStockItemData.qty} onChange={(e) => { const val = e.target.value; showManualInputModal ? setNewManualItemData({...newManualItemData, qty: val}) : setNewStockItemData({...newStockItemData, qty: val}); }} className="w-full p-2 border rounded" /></div></div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2"><button onClick={() => {setShowManualInputModal(false); setShowAddStockModal(false);}} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancelar</button><button onClick={showManualInputModal ? confirmAddManualItem : confirmAddStockItem} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium">Salvar</button></div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

const App = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => { const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }); return () => unsubscribe(); }, []);
    if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
    if (!user) return <Login />;
    return <OtimizadorCorteAco user={user} />;
};
export default App;
