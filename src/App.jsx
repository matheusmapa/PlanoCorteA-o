import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, Download, Clipboard, Save, RefreshCw, FileText, Settings, Upload, File, Info, XCircle, CheckSquare, Square, Printer, FolderDown, FolderUp, X, Eraser, LogOut, User, Menu, FolderHeart, Calendar, Edit3, Check } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
// ADICIONADO: setDoc para salvar documentos com ID específico
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp, setDoc } from 'firebase/firestore';

// Lógica externa
import { extractTextFromPDF, parseTextToItems, BITOLAS_COMERCIAIS, generateId } from './pdfProcessor';
import { calculateCutPlan } from './cutOptimizer';
import { auth, db } from './firebase'; 
import Login from './Login';

// --- COMPONENTE PRINCIPAL ---
const OtimizadorCorteAco = ({ user }) => {
  // --- Estados Principais ---
  const [activeTab, setActiveTab] = useState('input');
  const [items, setItems] = useState([]); // DEMANDA
  const [inventory, setInventory] = useState([]); // ESTOQUE
  const [results, setResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // NOVA CHAVE: Usar sobras de estoque? (Padrão: Sim)
  const [useLeftovers, setUseLeftovers] = useState(true);
  
  // Arquivos: uploadedFiles agora pode conter arquivos REAIS ou PROJETOS CARREGADOS
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // --- Estados do Banco de Dados ---
  const [projects, setProjects] = useState([]); // INPUT (Projetos salvos)
  const [savedPlans, setSavedPlans] = useState([]); // OUTPUT (Planos de corte salvos)
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null); // Projeto sendo editado no modal
  
  // --- Estados de Interface ---
  const [activeInventoryBitola, setActiveInventoryBitola] = useState('todas');
  const [activeResultsBitola, setActiveResultsBitola] = useState('todas');
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [newStockItemData, setNewStockItemData] = useState({ bitola: 10.0, length: 100, qty: 1 });
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [newManualItemData, setNewManualItemData] = useState({ bitola: 10.0, length: 100, qty: 1 });
  const [enabledBitolas, setEnabledBitolas] = useState([...BITOLAS_COMERCIAIS]);

  const fileInputRef = useRef(null);

  const BARRA_PADRAO = 1200;
  const PERDA_CORTE = 0;

  // --- Inicialização e Banco de Dados ---
  useEffect(() => {
    // 1. Carregar Scripts Externos (PDF.js, etc)
    const loadScripts = () => {
        const scriptPdf = document.createElement('script');
        scriptPdf.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        scriptPdf.async = true;
        scriptPdf.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        };
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

    // 2. Tenta carregar LocalStorage primeiro (para ter algo rápido na tela)
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

    // 3. Ouvintes do Firestore
    if (user) {
        // A) Projetos de Demanda (Input)
        const qProjects = query(collection(db, 'users', user.uid, 'projects'), orderBy('createdAt', 'desc'));
        const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
            const projectsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setProjects(projectsData);
        });

        // B) Planos de Corte Salvos (Output)
        const qPlans = query(collection(db, 'users', user.uid, 'cutPlans'), orderBy('createdAt', 'desc'));
        const unsubscribePlans = onSnapshot(qPlans, (snapshot) => {
            const plansData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setSavedPlans(plansData);
        });

        // C) ESTOQUE DE PONTAS (NOVO) - Escuta o documento único de estoque
        const inventoryDocRef = doc(db, 'users', user.uid, 'appData', 'inventory');
        const unsubscribeInventory = onSnapshot(inventoryDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.items && Array.isArray(data.items)) {
                    // Atualiza o estado com o que veio do banco
                    setInventory(data.items);
                    // Atualiza o local storage também para manter sincronia
                    localStorage.setItem('estoquePontas', JSON.stringify(data.items));
                }
            }
        });

        return () => {
            cleanupScripts();
            unsubscribeProjects();
            unsubscribePlans();
            unsubscribeInventory();
        }
    }

    return cleanupScripts;
  }, [user]);

  // --- NOVA FUNÇÃO: Atualizar Estoque (Local + Banco) ---
  const updateInventory = async (newInv) => {
    // 1. Atualiza visualmente na hora (Optimistic UI)
    setInventory(newInv);
    
    // 2. Salva no LocalStorage (Backup)
    localStorage.setItem('estoquePontas', JSON.stringify(newInv));

    // 3. Salva no Firestore
    if (user) {
        try {
            // Usamos setDoc com { merge: true } ou sobrescrevemos. 
            // Vamos salvar num documento fixo chamado 'inventory' dentro de uma coleção 'appData'
            await setDoc(doc(db, 'users', user.uid, 'appData', 'inventory'), {
                items: newInv,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Erro ao salvar estoque no banco:", error);
            // Opcional: Mostrar um toast de erro
        }
    }
  };

  // --- Funções: Planos de Corte (Output) ---
  const handleSaveCutPlan = async () => {
      if (!results) return alert("Não há resultado gerado para salvar.");
      
      const planName = window.prompt("Nome para este Plano de Corte (ex: Lote A - 03/02):");
      if (!planName) return;

      try {
          await addDoc(collection(db, 'users', user.uid, 'cutPlans'), {
              name: planName,
              results: results,
              createdAt: serverTimestamp()
          });
          alert("Plano salvo com sucesso!");
          setIsSidebarOpen(true);
      } catch (error) {
          console.error("Erro ao salvar plano:", error);
          alert("Erro ao salvar o plano.");
      }
  };

  const handleLoadCutPlan = (plan) => {
      if(window.confirm(`Carregar o plano "${plan.name}"? Isso substituirá o resultado atual da tela.`)) {
          setResults(plan.results);
          setActiveTab('results');
          setActiveResultsBitola('todas');
          setIsSidebarOpen(false);
      }
  };

  const handleDeleteCutPlan = async (planId, e) => {
      e.stopPropagation();
      if(window.confirm("Excluir este plano de corte do histórico permanentemente?")) {
          try {
              await deleteDoc(doc(db, 'users', user.uid, 'cutPlans', planId));
          } catch (error) {
              alert("Erro ao excluir.");
          }
      }
  };

  // --- Funções: Projetos de Demanda (Input) ---
  const handleSaveProject = async () => {
      if (items.length === 0) return alert("A lista de corte está vazia. Nada para salvar.");
      
      const projectName = window.prompt("Nome do Projeto (ex: Obra Residencial Silva):");
      if (!projectName) return;

      try {
          await addDoc(collection(db, 'users', user.uid, 'projects'), {
              name: projectName,
              items: items,
              createdAt: serverTimestamp()
          });
          alert("Projeto salvo com sucesso! Confira na aba lateral.");
          setIsSidebarOpen(true);
      } catch (error) {
          console.error("Erro ao salvar:", error);
          alert("Erro ao salvar projeto.");
      }
  };

  const handleUpdateProjectName = async (projectId, newName) => {
      if (!newName.trim()) return;
      try {
          await updateDoc(doc(db, 'users', user.uid, 'projects', projectId), {
              name: newName
          });
          setEditingProject(prev => ({...prev, name: newName}));
      } catch (error) {
          console.error("Erro ao atualizar:", error);
          alert("Erro ao renomear projeto.");
      }
  };

  const loadProjectAsModule = (project) => {
      if (uploadedFiles.some(f => f.id === project.id)) {
          alert("Este projeto já foi adicionado à lista.");
          return;
      }
      const projectOriginName = `[PROJETO] ${project.name}`;
      const newItems = project.items.map(item => ({
          ...item,
          id: generateId(),
          origin: projectOriginName
      }));

      setItems(prev => [...prev, ...newItems]);
      setUploadedFiles(prev => [
          ...prev, 
          { 
              id: project.id, 
              name: project.name, 
              originName: projectOriginName,
              type: 'project', 
              status: 'ok',
              count: newItems.length
          }
      ]);
      setEditingProject(null);
      setIsSidebarOpen(false);
  };

  const handleDeleteProject = async (projectId) => {
      if(window.confirm("Tem certeza que deseja excluir este projeto PERMANENTEMENTE do banco de dados?")) {
          try {
              await deleteDoc(doc(db, 'users', user.uid, 'projects', projectId));
              setEditingProject(null);
          } catch (error) {
              alert("Erro ao excluir.");
          }
      }
  };

  // --- Funções Gerais do App ---

  const handleLogout = () => {
      if(window.confirm("Deseja realmente sair?")) {
          signOut(auth);
      }
  };

  const toggleBitola = (bitola) => {
      setEnabledBitolas(prev => 
          prev.includes(bitola) ? prev.filter(b => b !== bitola) : [...prev, bitola].sort((a,b) => a-b)
      );
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
        if (newUploadedFiles.some(f => f.name === file.name && f.type === 'file')) {
             setItems(prev => prev.filter(i => i.origin !== file.name));
        } else {
             newUploadedFiles.push({ id: generateId(), name: file.name, size: file.size, type: 'file', status: 'lendo' });
        }
        setUploadedFiles([...newUploadedFiles]);

        try {
            let text = "";
            if (file.type === "application/pdf") {
                text = await extractTextFromPDF(file);
            } else {
                text = await file.text();
            }

            const itemsFromThisFile = parseTextToItems(text, file.name);
            allExtractedItems = [...allExtractedItems, ...itemsFromThisFile];
            
            const fileIndex = newUploadedFiles.findIndex(f => f.name === file.name && f.type === 'file');
            if (fileIndex !== -1) newUploadedFiles[fileIndex].status = 'ok';

        } catch (error) {
            console.error("Erro:", error);
            const fileIndex = newUploadedFiles.findIndex(f => f.name === file.name && f.type === 'file');
            if (fileIndex !== -1) newUploadedFiles[fileIndex].status = 'erro';
        }
    }

    setUploadedFiles(newUploadedFiles);
    setItems(prevItems => [...prevItems, ...allExtractedItems]);
    setIsProcessing(false);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFileOrProject = (fileData) => {
      setUploadedFiles(prev => prev.filter(f => f.id !== fileData.id));
      const originToRemove = fileData.type === 'project' ? fileData.originName : fileData.name;
      setItems(prev => prev.filter(i => i.origin !== originToRemove));
  };

  const openManualInputModal = () => {
    setNewManualItemData({ bitola: 10.0, length: 100, qty: 1 });
    setShowManualInputModal(true);
  };

  const confirmAddManualItem = () => {
      const { bitola, length, qty } = newManualItemData;
      if (length <= 0 || qty <= 0) return alert("Valores inválidos");
      const newItem = {
          id: generateId(),
          origin: 'Manual',
          bitola: parseFloat(bitola),
          qty: parseInt(qty),
          length: parseFloat(length),
          selected: true
      };
      setItems([...items, newItem]);
      setShowManualInputModal(false);
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  const removeItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };
  const clearItems = () => {
      if(window.confirm("Limpar toda a lista de corte e os arquivos carregados?")) {
          setItems([]);
          setUploadedFiles([]);
          setResults(null);
          if(fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const openAddStockModal = () => {
      setNewStockItemData({ bitola: 10.0, length: 100, qty: 1 });
      setShowAddStockModal(true);
  };

  const confirmAddStockItem = () => {
      const { bitola, length, qty } = newStockItemData;
      if (length <= 0 || qty <= 0) return alert("Valores inválidos");
      const newPonta = { id: generateId(), bitola: parseFloat(bitola), length: parseFloat(length), qty: parseInt(qty), source: 'estoque_manual' };
      // USANDO A NOVA FUNÇÃO
      updateInventory([...inventory, newPonta]);
      setShowAddStockModal(false);
  };

  const updateInventoryItem = (id, field, value) => {
    const newInv = inventory.map(item => item.id === id ? { ...item, [field]: value } : item);
    // USANDO A NOVA FUNÇÃO
    updateInventory(newInv);
  };

  const removeInventoryItem = (id) => {
    // USANDO A NOVA FUNÇÃO
    updateInventory(inventory.filter(item => item.id !== id));
  };

  const clearInventory = () => {
      if(window.confirm("Tem certeza que deseja APAGAR TODO o estoque de pontas?")) {
          // USANDO A NOVA FUNÇÃO
          updateInventory([]);
      }
  }

  // --- OTIMIZAÇÃO (MODIFICADA PARA USAR O ESTADO) ---
  const runOptimization = () => {
    const itemsToCut = filteredItems.filter(item => item.selected);
    if (itemsToCut.length === 0) return alert("Nenhum item válido para cortar.");
    setIsProcessing(true);
    setTimeout(() => {
        try {
            // SE A CHAVE ESTIVER LIGADA, USA O INVENTORY. SE NÃO, USA ARRAY VAZIO.
            const inventoryToUse = useLeftovers ? inventory : [];
            const finalResult = calculateCutPlan(itemsToCut, inventoryToUse, BARRA_PADRAO, PERDA_CORTE);
            
            setResults(finalResult);
            setActiveTab('results');
            setActiveResultsBitola('todas');
        } catch (error) {
            console.error(error);
            alert("Erro ao calcular.");
        } finally {
            setIsProcessing(false);
        }
    }, 100);
  };

  // --- PDF ---
  const generatePDF = () => {
    if (!window.jspdf || !results) return alert("Biblioteca PDF não carregada.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let yPos = 20;
    doc.setFontSize(18); doc.text("Plano de Corte", 105, yPos, { align: 'center' }); yPos += 15;
    doc.setFontSize(10); doc.text(`Data: ${new Date().toLocaleDateString()}`, 105, yPos, { align: 'center' }); yPos += 15;

    results.forEach(group => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        doc.setFillColor(240, 240, 240); doc.rect(10, yPos - 5, 190, 8, 'F');
        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text(`Bitola: ${parseFloat(group.bitola).toFixed(1)} mm`, 15, yPos); yPos += 10;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        group.bars.forEach(bar => {
             if (yPos > 260) { doc.addPage(); yPos = 20; }
             const typeText = bar.type === 'nova' ? "BARRA NOVA (1200cm)" : `PONTA ESTOQUE (${bar.originalLength}cm)`;
             doc.setFont("helvetica", "bold"); doc.text(`${bar.count}x  ${typeText}`, 15, yPos);
             doc.setFont("helvetica", "normal"); doc.text(`Sobra: ${bar.remaining.toFixed(0)}cm`, 150, yPos, { align: 'right' }); yPos += 3;
             const scale = 180 / bar.originalLength; let currentX = 15;
             bar.cuts.forEach(cut => {
                 const cutWidth = cut * scale;
                 doc.setFillColor(59, 130, 246); doc.rect(currentX, yPos, cutWidth, 8, 'F'); doc.rect(currentX, yPos, cutWidth, 8, 'S');
                 if (cutWidth > 8) { doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.text(`${cut}`, currentX + (cutWidth / 2), yPos + 5.5, { align: 'center' }); }
                 currentX += cutWidth;
             });
             if (bar.remaining > 0) {
                 const remainingWidth = bar.remaining * scale;
                 doc.setFillColor(220, 220, 220); doc.rect(currentX, yPos, remainingWidth, 8, 'F'); doc.rect(currentX, yPos, remainingWidth, 8, 'S');
             }
             doc.setTextColor(0, 0, 0); yPos += 15;
        });
        yPos += 5;
    });
    doc.save(`Plano_Corte_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const consolidateLeftovers = () => {
    if (!results) return;
    const usedCounts = {};
    results.forEach(group => {
        group.bars.forEach(barGroup => {
            if (barGroup.type === 'estoque') {
                barGroup.ids.forEach(id => { usedCounts[id] = (usedCounts[id] || 0) + 1; });
            }const consolidateLeftovers = () => {
    if (!results) return;
    
    // --- ADICIONADO: Confirmação antes de salvar ---
    if (!window.confirm("Deseja realmente salvar as sobras deste plano no estoque?")) return;
    // -----------------------------------------------

    const usedCounts = {};
    results.forEach(group => {
        group.bars.forEach(barGroup => {
            if (barGroup.type === 'estoque') {
                barGroup.ids.forEach(id => { usedCounts[id] = (usedCounts[id] || 0) + 1; });
            }
        });
    });
    
    // Atualiza quantidades existentes
    let updatedInventory = inventory.map(item => {
        if (usedCounts[item.id]) { const newQty = item.qty - usedCounts[item.id]; return { ...item, qty: Math.max(0, newQty) }; }
        return item;
    }).filter(item => item.qty > 0);

    // Adiciona novas sobras
    results.forEach(group => {
        group.bars.forEach(barGroup => {
            if (barGroup.remaining > 50) { 
                const bitola = parseFloat(group.bitola); const length = parseFloat(barGroup.remaining.toFixed(1)); const qtyToAdd = barGroup.count; 
                const existingIndex = updatedInventory.findIndex(i => Math.abs(i.bitola - bitola) < 0.01 && Math.abs(i.length - length) < 0.1);
                if (existingIndex !== -1) { updatedInventory[existingIndex].qty += qtyToAdd; } 
                else { updatedInventory.push({ id: generateId(), bitola, length, qty: qtyToAdd, source: 'sobra_corte' }); }
            }
        });
    });

    // Salva no banco e local
    updateInventory(updatedInventory);
    
    alert(`Estoque atualizado com sucesso!`);
    setActiveTab('inventory');
  };

  // --- NOVA FUNÇÃO: EXECUTAR PROJETO (INTEGRADA) ---
  const handleExecuteProject = async () => {
    if (!results) return;

    // 1. Calcular o consumo do estoque (BAIXA)
    const usedCounts = {};
    let usedStockCount = 0;

    results.forEach(group => {
        group.bars.forEach(barGroup => {
            if (barGroup.type === 'estoque') {
                usedStockCount += barGroup.count;
                barGroup.ids.forEach(id => { 
                    usedCounts[id] = (usedCounts[id] || 0) + 1; 
                });
            }
        });
    });

    // 2. Confirmações
    if (!window.confirm(`Deseja realmente dar baixa em ${usedStockCount} itens de estoque e finalizar este corte?`)) return;
    
    const saveNewLeftovers = window.confirm("Gostaria de salvar as pontas restantes (sobras) no estoque?");

    // 3. Processar Estoque
    // A) Baixa dos usados
    let updatedInventory = inventory.map(item => {
        if (usedCounts[item.id]) { 
            const newQty = item.qty - usedCounts[item.id]; 
            return { ...item, qty: Math.max(0, newQty) }; 
        }
        return item;
    }).filter(item => item.qty > 0);

    // B) Entrada das sobras (se confirmado)
    if (saveNewLeftovers) {
        results.forEach(group => {
            group.bars.forEach(barGroup => {
                if (barGroup.remaining > 50) { 
                    const bitola = parseFloat(group.bitola); 
                    const length = parseFloat(barGroup.remaining.toFixed(1)); 
                    const qtyToAdd = barGroup.count; 
                    
                    const existingIndex = updatedInventory.findIndex(i => 
                        Math.abs(i.bitola - bitola) < 0.01 && 
                        Math.abs(i.length - length) < 0.1
                    );

                    if (existingIndex !== -1) { 
                        updatedInventory[existingIndex].qty += qtyToAdd; 
                    } else { 
                        updatedInventory.push({ 
                            id: generateId(), 
                            bitola, 
                            length, 
                            qty: qtyToAdd, 
                            source: 'sobra_projeto' 
                        }); 
                    }
                }
            });
        });
    }

    // 4. Salvar
    await updateInventory(updatedInventory);
    alert("Projeto executado e estoque atualizado!");
    setActiveTab('inventory');
  };

  const clearResults = () => { if(window.confirm("Descartar plano?")) { setResults(null); setActiveTab('input'); } };

  // --- Helpers UI ---
  const renderBitolaTabs = (current, setFunction, availableBitolas) => {
    const tabs = ['todas', ...availableBitolas];
    return (
        <div className="flex overflow-x-auto gap-1 border-b border-slate-200 mb-4 pb-0 no-scrollbar items-end h-10 px-1">
            {tabs.map(tab => (
                <button key={tab} onClick={() => setFunction(tab)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap border-t border-x relative ${current === tab ? 'bg-white border-indigo-200 text-indigo-700 z-10 top-[1px] shadow-[0_-2px_3px_rgba(0,0,0,0.02)] border-b-white h-10' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                    {tab === 'todas' ? 'Todas' : `${parseFloat(tab).toFixed(1)} mm`}
                </button>
            ))}
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative overflow-x-hidden">
      
      {/* --- SIDEBAR LATERAL (MEUS ARQUIVOS) --- */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out border-l border-slate-200 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 bg-indigo-900 text-white flex justify-between items-center shadow-md">
              <h2 className="font-bold flex items-center gap-2"><FolderHeart size={20} /> Meus Arquivos</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="hover:bg-indigo-700 p-1 rounded"><X size={20}/></button>
          </div>
          <div className="p-4 overflow-y-auto h-[calc(100vh-64px)] space-y-6 bg-slate-50">
              
              {/* SEÇÃO 1: PROJETOS (INPUT) */}
              <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 pl-1 flex items-center gap-2">
                      <FileText size={14}/> Projetos (Demanda)
                  </h3>
                  {projects.length === 0 ? (
                      <div className="text-center text-slate-400 py-4 text-sm border border-dashed rounded bg-white">Nenhum projeto salvo.</div>
                  ) : (
                      <div className="space-y-2">
                          {projects.map(proj => (
                              <div 
                                key={proj.id} 
                                onClick={() => setEditingProject(proj)}
                                className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all group relative"
                              >
                                  <div className="font-bold text-slate-800 text-sm mb-1 pr-6 truncate">{proj.name}</div>
                                  <div className="text-xs text-slate-500 flex items-center gap-1">
                                      <Calendar size={12}/> {proj.createdAt?.toDate().toLocaleDateString()} - {proj.items.length} peças
                                  </div>
                                  <div className="absolute top-3 right-3 text-indigo-300 group-hover:text-indigo-600 transition-colors">
                                    <Edit3 size={14} />
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>

              {/* SEÇÃO 2: PLANOS DE CORTE (OUTPUT) */}
              <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 pl-1 flex items-center gap-2 pt-4 border-t border-slate-200">
                      <Download size={14}/> Planos Calculados
                  </h3>
                  {savedPlans.length === 0 ? (
                      <div className="text-center text-slate-400 py-4 text-sm border border-dashed rounded bg-white">Nenhum plano salvo.</div>
                  ) : (
                      <div className="space-y-2">
                          {savedPlans.map(plan => (
                              <div 
                                key={plan.id} 
                                onClick={() => handleLoadCutPlan(plan)}
                                className="bg-green-50 p-3 rounded-lg border border-green-200 shadow-sm hover:shadow-md hover:border-green-400 cursor-pointer transition-all group relative"
                              >
                                  <div className="font-bold text-green-900 text-sm mb-1 pr-6 truncate">{plan.name}</div>
                                  <div className="text-xs text-green-700/70 flex items-center gap-1">
                                      <CheckSquare size={12}/> {plan.createdAt?.toDate().toLocaleDateString()}
                                  </div>
                                  {/* Botão de Excluir Plano */}
                                  <button 
                                      onClick={(e) => handleDeleteCutPlan(plan.id, e)}
                                      className="absolute top-3 right-3 text-red-300 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                      title="Excluir Plano"
                                  >
                                      <Trash2 size={14} />
                                  </button>
                              </div>
                          ))}
                      </div>
                  )}
              </div>

          </div>
      </div>

      {/* OVERLAY DA SIDEBAR */}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/20 z-[50] backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* --- MODAL DE EDIÇÃO DO PROJETO (INPUT) --- */}
      {editingProject && (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center backdrop-blur-sm p-4">
              <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                      <h3 className="font-bold text-indigo-900 flex items-center gap-2"><Edit3 size={18}/> Editar Projeto</h3>
                      <button onClick={() => setEditingProject(null)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome do Projeto</label>
                          <div className="flex gap-2">
                              <input 
                                type="text" 
                                value={editingProject.name} 
                                onChange={(e) => setEditingProject({...editingProject, name: e.target.value})}
                                className="flex-1 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                              <button 
                                onClick={() => handleUpdateProjectName(editingProject.id, editingProject.name)}
                                className="bg-indigo-100 text-indigo-700 p-2 rounded hover:bg-indigo-200" title="Salvar Nome"
                              >
                                  <Save size={18} />
                              </button>
                          </div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded border border-slate-100 text-sm text-slate-600">
                          <p><strong>Itens:</strong> {editingProject.items.length} peças</p>
                          <p><strong>Data:</strong> {editingProject.createdAt?.toDate().toLocaleDateString()}</p>
                      </div>
                      
                      <div className="pt-4 flex flex-col gap-2">
                          <button 
                            onClick={() => loadProjectAsModule(editingProject)}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                          >
                              <FolderDown size={20} /> Carregar no Workspace
                          </button>
                          <p className="text-xs text-center text-slate-400 mb-2">Adiciona este projeto como um módulo na tela principal.</p>
                          
                          <div className="border-t pt-3 mt-2 flex justify-between items-center">
                             <span className="text-xs text-red-400 cursor-pointer hover:underline hover:text-red-600" onClick={() => handleDeleteProject(editingProject.id)}>Excluir Projeto</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-yellow-500" />
            <h1 className="text-xl font-bold tracking-tight hidden sm:block">Otimizador Corte & Dobra</h1>
            <h1 className="text-xl font-bold tracking-tight sm:hidden">Otimizador</h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
                onClick={() => setIsSidebarOpen(true)}
                className="flex items-center gap-1 text-sm bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md transition-colors shadow-sm border border-indigo-600"
            >
                <FolderHeart size={16} /> <span className="hidden sm:inline">Meus Arquivos</span>
            </button>

            <div className="hidden md:flex items-center gap-2 text-sm text-slate-400 border-l border-slate-700 pl-3">
                <User size={14} />
                <span className="max-w-[150px] truncate">{user.email}</span>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 p-1"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        
        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex gap-2 sm:gap-4 mb-6 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('input')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'input' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-white'}`}>
            <FileText size={18} /> Demanda
          </button>
          <button onClick={() => setActiveTab('inventory')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'inventory' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-white'}`}>
            <Clipboard size={18} /> Estoque ({inventory.reduce((acc, i) => acc + i.qty, 0)})
          </button>
          <button onClick={() => setActiveTab('results')} disabled={!results} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'results' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : results ? 'bg-green-50 text-green-700' : 'text-slate-400 cursor-not-allowed'}`}>
            <Download size={18} /> Resultado
          </button>
        </div>

        {/* --- TAB: INPUT (DEMANDA) --- */}
        {activeTab === 'input' && (
          <div className="space-y-6 animate-fade-in">
            {/* Filtro de Bitolas */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Filtrar visualização</h3>
                    <button onClick={toggleAllBitolas} className="text-xs text-blue-600 hover:underline">{enabledBitolas.length === BITOLAS_COMERCIAIS.length ? "Desmarcar todas" : "Marcar todas"}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {BITOLAS_COMERCIAIS.map(bitola => (
                        <button key={bitola} onClick={() => toggleBitola(bitola)} className={`px-2 py-1 text-xs sm:text-sm rounded border transition-all flex items-center gap-1 ${enabledBitolas.includes(bitola) ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            {enabledBitolas.includes(bitola) ? <CheckSquare size={12} /> : <Square size={12} />} {bitola.toFixed(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Upload Area & Modulos Carregados */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-3 text-slate-700">Arquivos e Módulos</h2>
              <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 sm:p-10 text-center hover:bg-blue-50 transition cursor-pointer relative group">
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="flex flex-col items-center gap-3 text-blue-600">
                      {isProcessing ? <RefreshCw className="animate-spin w-10 h-10" /> : <Upload className="w-10 h-10 group-hover:scale-110 transition-transform" />}
                      <span className="font-bold text-sm sm:text-base">{isProcessing ? "Lendo arquivos..." : "Clique ou Arraste PDFs aqui"}</span>
                  </div>
              </div>
              
              {/* Arquivos e Projetos Carregados */}
              {uploadedFiles.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {uploadedFiles.map((file, idx) => (
                          <div 
                            key={idx} 
                            // Renderização Condicional: AZUL para Projeto, VERDE para Arquivo
                            className={`flex items-center gap-2 p-3 rounded border shadow-sm transition-all ${
                                file.type === 'project' 
                                ? 'bg-blue-50 border-blue-200 text-blue-800' 
                                : file.status === 'erro' 
                                    ? 'bg-red-50 border-red-200 text-red-700' 
                                    : 'bg-green-50 border-green-200 text-green-700'
                            }`}
                          >
                              {file.type === 'project' ? <FolderHeart size={18} className="text-blue-500"/> : <File size={18} className="text-green-500"/>}
                              
                              <div className="flex-1 overflow-hidden">
                                  <span className="font-bold text-sm block truncate">{file.name}</span>
                                  <span className="text-xs opacity-70 block">
                                      {file.type === 'project' ? 'Módulo Carregado' : 'Arquivo PDF Importado'}
                                  </span>
                              </div>

                              <button onClick={() => removeFileOrProject(file)} className="text-slate-400 hover:text-red-600 p-1"><XCircle size={18} /></button>
                          </div>
                      ))}
                  </div>
              )}
            </div>

            {/* Lista de Itens */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                    Lista de Corte <span className="text-sm font-normal text-slate-400">({items.length} itens)</span>
                </h2>
                <div className="flex gap-2">
                    <button onClick={handleSaveProject} className="flex items-center gap-1 bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-md hover:bg-indigo-100 text-sm font-medium transition-colors">
                        <Save size={16} /> <span className="hidden sm:inline">Salvar Projeto</span>
                    </button>
                    <button onClick={clearItems} className="text-red-500 text-sm hover:underline px-2">Limpar</button>
                    <button onClick={openManualInputModal} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm shadow-sm transition-transform active:scale-95">
                        <Plus size={16} /> Manual
                    </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-md border border-dashed border-slate-300">
                  <p className="font-medium">Lista vazia.</p>
                  <p className="text-sm mt-1">Importe um PDF, adicione manualmente ou carregue um projeto salvo.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-100">
                      <tr><th className="px-4 py-3">Bitola</th><th className="px-4 py-3">Qtd</th><th className="px-4 py-3">Comp. (cm)</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right">Ação</th></tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <select value={item.bitola} onChange={(e) => updateItem(item.id, 'bitola', parseFloat(e.target.value))} className="w-20 p-1 border rounded bg-white text-xs sm:text-sm">
                                {BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2"><input type="number" value={item.qty} onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value))} className="w-16 p-1 border rounded font-bold text-blue-800 text-center" /></td>
                          <td className="px-4 py-2"><input type="number" value={item.length} onChange={(e) => updateItem(item.id, 'length', parseFloat(e.target.value))} className="w-20 p-1 border rounded text-center" /></td>
                          <td className="px-4 py-2 text-xs text-slate-400 max-w-[100px] truncate" title={item.origin}>
                              {item.origin && item.origin.includes('[PROJETO]') 
                                ? <span className="text-blue-500 font-semibold">{item.origin}</span>
                                : item.origin
                              }
                          </td>
                          <td className="px-4 py-2 text-right"><button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* BOTÕES E CONTROLES (MODIFICADO COM O CHECKBOX) */}
            <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pb-8">
                
                {/* --- NOVA CHAVE DE USAR PONTAS --- */}
                <label className="flex items-center gap-3 cursor-pointer bg-white px-4 py-3 rounded-md border border-slate-200 shadow-sm hover:border-indigo-300 transition-all select-none group">
                    <div className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${useLeftovers ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                        {/* Ícone de Check */}
                        {useLeftovers && <Check size={14} className="text-white" />}
                    </div>
                    <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={useLeftovers} 
                        onChange={(e) => setUseLeftovers(e.target.checked)} 
                    />
                    <span className={`text-sm font-bold ${useLeftovers ? 'text-indigo-700' : 'text-slate-500'}`}>
                        Usar Pontas de Estoque?
                    </span>
                </label>

                <button onClick={runOptimization} disabled={filteredItems.length === 0 || isProcessing} className={`w-full sm:w-auto px-8 py-3 rounded-md shadow-md font-bold flex items-center justify-center gap-2 transition-all ${filteredItems.length === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105'}`}>
                    {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                    {isProcessing ? "CALCULANDO..." : "CALCULAR OTIMIZAÇÃO"}
                </button>
            </div>
          </div>
        )}

        {/* --- TAB: INVENTORY --- */}
        {activeTab === 'inventory' && (
           <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4 animate-fade-in">
              <div className="flex justify-between items-center flex-wrap gap-4">
                  <h2 className="text-lg font-semibold text-slate-700">Estoque de Pontas</h2>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={clearInventory} className="text-red-500 text-sm hover:underline px-2">Zerar</button>
                    <button onClick={openAddStockModal} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm"><Plus size={16} /> Adicionar</button>
                  </div>
              </div>
              {renderBitolaTabs(activeInventoryBitola, setActiveInventoryBitola, BITOLAS_COMERCIAIS)}
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-slate-200 rounded-b-lg">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-yellow-50 sticky top-0">
                        <tr><th className="px-4 py-3">Bitola</th><th className="px-4 py-3">Qtd</th><th className="px-4 py-3">Comp.</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right">Ação</th></tr>
                    </thead>
                    <tbody>
                        {(activeInventoryBitola === 'todas' ? inventory : inventory.filter(i => Math.abs(i.bitola - parseFloat(activeInventoryBitola)) < 0.01))
                            .sort((a,b) => b.bitola - a.bitola).map(item => (
                            <tr key={item.id} className="border-b border-slate-100 hover:bg-yellow-50">
                                <td className="px-4 py-2">{item.bitola.toFixed(1)} mm</td>
                                <td className="px-4 py-2"><input type="number" value={item.qty} onChange={(e) => updateInventoryItem(item.id, 'qty', parseInt(e.target.value))} className="w-16 p-1 border rounded bg-transparent font-bold text-slate-700 text-center" /></td>
                                <td className="px-4 py-2">{item.length} cm</td>
                                <td className="px-4 py-2 text-xs text-slate-400 uppercase">{item.source || 'Manual'}</td>
                                <td className="px-4 py-2 text-right"><button onClick={() => removeInventoryItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
           </div>
        )}

        {/* --- MODAIS (ADICIONAR ITEM MANUAL / ESTOQUE) --- */}
        {(showManualInputModal || showAddStockModal) && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm px-4">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className="text-lg font-bold text-slate-800">{showManualInputModal ? "Adicionar Peça" : "Adicionar ao Estoque"}</h3>
                        <button onClick={() => {setShowManualInputModal(false); setShowAddStockModal(false);}}><X size={20} className="text-slate-400" /></button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Bitola</label>
                            <select value={showManualInputModal ? newManualItemData.bitola : newStockItemData.bitola} onChange={(e) => {
                                const val = e.target.value;
                                showManualInputModal ? setNewManualItemData({...newManualItemData, bitola: val}) : setNewStockItemData({...newStockItemData, bitola: val});
                            }} className="w-full p-2 border rounded">{BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b} mm</option>)}</select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Comprimento (cm)</label>
                                <input type="number" value={showManualInputModal ? newManualItemData.length : newStockItemData.length} onChange={(e) => {
                                    const val = e.target.value;
                                    showManualInputModal ? setNewManualItemData({...newManualItemData, length: val}) : setNewStockItemData({...newStockItemData, length: val});
                                }} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Quantidade</label>
                                <input type="number" value={showManualInputModal ? newManualItemData.qty : newStockItemData.qty} onChange={(e) => {
                                    const val = e.target.value;
                                    showManualInputModal ? setNewManualItemData({...newManualItemData, qty: val}) : setNewStockItemData({...newStockItemData, qty: val});
                                }} className="w-full p-2 border rounded" />
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2">
                        <button onClick={() => {setShowManualInputModal(false); setShowAddStockModal(false);}} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                        <button onClick={showManualInputModal ? confirmAddManualItem : confirmAddStockItem} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium">Salvar</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- TAB: RESULTS --- */}
        {activeTab === 'results' && results && (
            <div className="space-y-8 animate-fade-in pb-8">
                <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex-wrap gap-4">
                    <div><h2 className="text-xl font-bold text-indigo-900">Plano Gerado</h2></div>
                    <div className="flex gap-2 items-center flex-wrap">
                        {/* Botão de Execução do Projeto */}
                        <button 
                            onClick={handleExecuteProject} 
                            className="bg-purple-600 text-white px-4 py-2 rounded shadow flex items-center gap-2 text-sm hover:bg-purple-700 transition-colors font-bold border border-purple-800"
                            title="Baixar estoque usado e salvar sobras"
                        >
                            <CheckSquare size={16} /> Executar Projeto
                        </button>
                        
                        {/* Botão Salvar Plano */}
                        <button onClick={handleSaveCutPlan} className="bg-indigo-600 text-white px-4 py-2 rounded shadow flex items-center gap-2 text-sm hover:bg-indigo-700 transition-colors">
                            <Save size={16} /> Salvar Plano
                        </button>
                        
                        <button onClick={generatePDF} className="bg-white text-indigo-700 border border-indigo-200 px-4 py-2 rounded shadow flex items-center gap-2 text-sm hover:bg-indigo-50">
                            <Printer size={16} /> PDF
                        </button>
                        <button onClick={consolidateLeftovers} className="bg-green-600 text-white px-4 py-2 rounded shadow flex items-center gap-2 text-sm hover:bg-green-700">
                            <FolderDown size={16} /> Salvar Sobras
                        </button>
                        <button onClick={clearResults} className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded shadow flex items-center gap-2 text-sm hover:bg-red-100">
                            <Eraser size={16} /> Limpar
                        </button>
                    </div>
                </div>
                {renderBitolaTabs(activeResultsBitola, setActiveResultsBitola, results.map(r => parseFloat(r.bitola)).sort((a,b)=>a-b))}
                {(activeResultsBitola === 'todas' ? results : results.filter(g => Math.abs(parseFloat(g.bitola) - parseFloat(activeResultsBitola)) < 0.01)).map((group, gIdx) => (
                    <div key={gIdx} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex justify-between"><h3 className="font-bold text-lg text-slate-800">{group.bitola}mm</h3><span className="text-sm text-slate-500">{group.bars.reduce((acc,b)=>acc+b.count,0)} barras</span></div>
                        <div className="p-6 space-y-6">
                            {group.bars.map((bar, bIdx) => (
                                <div key={bIdx} className="flex flex-col gap-1 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                                    <div className="flex justify-between text-sm text-slate-600 mb-1 items-center">
                                        <div className="flex items-center gap-3"><span className="bg-slate-800 text-white font-bold px-3 py-1 rounded-full text-xs">{bar.count}x</span><span className="font-semibold uppercase tracking-wider text-xs">{bar.type === 'nova' ? <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded">Barra Nova (12m)</span> : <span className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Ponta ({bar.originalLength}cm)</span>}</span></div>
                                        <span className="font-mono text-xs">Sobra: <span className={bar.remaining > 100 ? "text-green-600 font-bold" : "text-slate-600"}>{bar.remaining.toFixed(1)}cm</span></span>
                                    </div>
                                    <div className="h-14 w-full bg-slate-200 rounded overflow-hidden flex border border-slate-300 relative">
                                        {bar.cuts.map((cut, cIdx) => (
                                            <div key={cIdx} style={{ width: `${(cut / bar.originalLength) * 100}%` }} className="h-full bg-blue-500 border-r border-white flex flex-col items-center justify-center text-white text-xs overflow-hidden group hover:bg-blue-600 transition-colors" title={`Peça: ${cut}cm`}>
                                                <span className="font-bold">{cut}</span>
                                            </div>
                                        ))}
                                        <div className="flex-1 bg-slate-300 pattern-diagonal-lines"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )}
      </main>
      <style>{`.pattern-diagonal-lines { background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.5) 5px, rgba(255,255,255,0.5) 10px); } .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </div>
  );
};

// --- WRAPPER DE AUTH ---
const App = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
    if (!user) return <Login />;
    return <OtimizadorCorteAco user={user} />;
};

export default App;
