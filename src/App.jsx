import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, Download, Clipboard, ArrowRight, Save, RefreshCw, FileText, Settings, Upload, File, Info, XCircle, CheckSquare, Square, Printer, FolderDown, FolderUp, X, Eraser, LogOut, Lock, FolderOpen, Calendar, ChevronRight } from 'lucide-react';

// --- FIREBASE CONFIGURATION & IMPORTS ---
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, query, where, getDocs, deleteDoc, doc, orderBy, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyACYH1e2FyvW0_xwbyePye_tPA2GB7BpQs",
  authDomain: "planodecorte-8c2d9.firebaseapp.com",
  projectId: "planodecorte-8c2d9",
  storageBucket: "planodecorte-8c2d9.firebasestorage.app",
  messagingSenderId: "816729895481",
  appId: "1:816729895481:web:b97c7089897216c28ed3e8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- COMPONENTE DE LOGIN ---
const LoginScreen = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      let msg = "Erro ao fazer login.";
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = "E-mail ou senha incorretos.";
      } else if (err.code === 'auth/invalid-email') {
        msg = "Formato de e-mail inválido.";
      } else if (err.code === 'auth/too-many-requests') {
        msg = "Muitas tentativas. Tente novamente mais tarde.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-indigo-600 p-4 rounded-full shadow-lg mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Acesso Restrito</h1>
          <p className="text-slate-500 text-sm">Otimizador de Corte & Dobra</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              placeholder="seu@email.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
              <XCircle size={16} /> {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full py-3 rounded-lg font-bold text-white shadow-md transition-all flex justify-center items-center gap-2 ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02]'}`}
          >
            {loading ? <RefreshCw className="animate-spin" size={20} /> : "ENTRAR"}
          </button>
        </form>
        
        <div className="mt-6 text-center text-xs text-slate-400 border-t pt-4">
          Acesso exclusivo para funcionários autorizados.
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL (OTIMIZADOR) ---
const OtimizadorCorteAco = ({ user, onLogout }) => {
  // --- Estados ---
  const [activeTab, setActiveTab] = useState('input');
  const [items, setItems] = useState([]); // DEMANDA
  const [inventory, setInventory] = useState([]); // ESTOQUE
  const [results, setResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  // Estados Firebase (Projetos Salvos)
  const [savedPlans, setSavedPlans] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  
  // Estados de Navegação por Abas de Bitola
  const [activeInventoryBitola, setActiveInventoryBitola] = useState('todas');
  const [activeResultsBitola, setActiveResultsBitola] = useState('todas');

  // Estados dos Modais
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [newStockItemData, setNewStockItemData] = useState({ bitola: 10.0, length: 100, qty: 1 });
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [newManualItemData, setNewManualItemData] = useState({ bitola: 10.0, length: 100, qty: 1 });

  // Filtro de Bitolas
  const BITOLAS_COMERCIAIS = [4.2, 5.0, 6.3, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 32.0, 40.0];
  const [enabledBitolas, setEnabledBitolas] = useState([...BITOLAS_COMERCIAIS]);

  const fileInputRef = useRef(null);
  const inventoryInputRef = useRef(null);

  const BARRA_PADRAO = 1200;
  const PERDA_CORTE = 0;

  // --- Função Helper para IDs ---
  const generateId = () => {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  };

  // --- Inicialização e Carregamento ---
  useEffect(() => {
    // Scripts PDF
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
    scriptJsPdf.onload = () => {
        const scriptAutoTable = document.createElement('script');
        scriptAutoTable.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
        scriptAutoTable.async = true;
        document.body.appendChild(scriptAutoTable);
    };
    document.body.appendChild(scriptJsPdf);
    
    // Estoque LocalStorage
    const savedInventory = localStorage.getItem('estoquePontas');
    if (savedInventory) {
      try {
        let parsedInv = JSON.parse(savedInventory);
        if (Array.isArray(parsedInv)) {
            parsedInv = parsedInv.map(i => i.qty ? i : { ...i, qty: 1 });
            setInventory(parsedInv);
        }
      } catch (e) {
        console.error("Erro ao carregar estoque salvo", e);
      }
    }

    // Carregar Projetos Salvos do Firestore
    if (user) {
      fetchSavedPlans();
    }
  }, [user]);

  // --- FUNÇÕES FIREBASE (SALVAR/CARREGAR) ---

  const fetchSavedPlans = async () => {
    setLoadingPlans(true);
    try {
      const q = query(
        collection(db, "plans"), 
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const plans = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSavedPlans(plans);
    } catch (error) {
      console.error("Erro ao buscar planos:", error);
      // Fallback para caso falte o índice composto no Firestore (comum em dev)
      if (error.code === 'failed-precondition') {
          const qSimple = query(collection(db, "plans"), where("userId", "==", user.uid));
          const snap = await getDocs(qSimple);
          const plans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Ordena manualmente no cliente
          plans.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setSavedPlans(plans);
      }
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleSavePlan = async () => {
    if (items.length === 0) {
      alert("A lista está vazia! Adicione itens antes de salvar.");
      return;
    }

    const planName = window.prompt("Dê um nome para este plano de corte:");
    if (!planName) return;

    try {
      await addDoc(collection(db, "plans"), {
        userId: user.uid,
        name: planName,
        items: items, // Salva a lista de input
        createdAt: serverTimestamp(),
        totalItems: items.length,
        itemsSummary: `${items.length} peças` // Apenas para exibição rápida
      });
      alert("Plano salvo com sucesso!");
      fetchSavedPlans(); // Atualiza a lista lateral
      setIsSidebarOpen(true); // Abre a sidebar pra mostrar que salvou
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar o plano. Verifique sua conexão.");
    }
  };

  const handleLoadPlan = (plan) => {
    if (items.length > 0) {
      if (!window.confirm("Isso irá substituir a lista atual de peças. Deseja continuar?")) {
        return;
      }
    }
    setItems(plan.items);
    setUploadedFiles([]); // Limpa referências de arquivos antigos pois os itens agora vêm do banco
    setResults(null); // Limpa resultados anteriores
    setActiveTab('input');
    setIsSidebarOpen(false); // Fecha sidebar
  };

  const handleDeletePlan = async (planId, e) => {
    e.stopPropagation(); // Evita acionar o load ao clicar no delete
    if (!window.confirm("Tem certeza que deseja excluir este plano salvo?")) return;

    try {
      await deleteDoc(doc(db, "plans", planId));
      setSavedPlans(prev => prev.filter(p => p.id !== planId));
    } catch (error) {
      console.error("Erro ao deletar:", error);
      alert("Erro ao excluir plano.");
    }
  };


  // --- MANIPULAÇÃO DE ESTADO LOCAL ---

  const saveInventoryToLocal = (newInv) => {
    setInventory([...newInv]);
    localStorage.setItem('estoquePontas', JSON.stringify(newInv));
  };

  const toggleBitola = (bitola) => {
      setEnabledBitolas(prev => 
          prev.includes(bitola) 
            ? prev.filter(b => b !== bitola)
            : [...prev, bitola].sort((a,b) => a-b)
      );
  };

  const toggleAllBitolas = () => {
      if (enabledBitolas.length === BITOLAS_COMERCIAIS.length) {
          setEnabledBitolas([]);
      } else {
          setEnabledBitolas([...BITOLAS_COMERCIAIS]);
      }
  };

  const filteredItems = items.filter(item => enabledBitolas.includes(item.bitola));

  // --- LEITURA DE PDF ---
  const extractTextFromPDF = async (file) => {
    if (!window.pdfjsLib) {
        alert("Aguarde um momento, carregando biblioteca de PDF...");
        return "";
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let lastY = -1;
        let pageText = "";
        for (const item of textContent.items) {
            if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) pageText += "\n";
            pageText += item.str + " ";
            lastY = item.transform[5];
        }
        fullText += pageText + "\n";
    }
    return fullText;
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    setIsProcessing(true);
    const newUploadedFiles = [...uploadedFiles];
    let allExtractedItems = [];

    for (const file of files) {
        if (newUploadedFiles.some(f => f.name === file.name)) {
             setItems(prev => prev.filter(i => i.origin !== file.name));
        } else {
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
            console.error("Erro:", error);
            const fileIndex = newUploadedFiles.findIndex(f => f.name === file.name);
            if (fileIndex !== -1) newUploadedFiles[fileIndex].status = 'erro';
        }
    }
    setUploadedFiles(newUploadedFiles);
    setItems(prevItems => [...prevItems, ...allExtractedItems]);
    setIsProcessing(false);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (fileName) => {
      setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
      setItems(prev => prev.filter(i => i.origin !== fileName));
  };

  const parseTextToItems = (text, fileName) => {
    let cleanText = text
        .replace(/CA\s*-?\s*\d+/gi, '') 
        .replace(/\$/g, '').replace(/\\times/g, 'x').replace(/\\/g, '')
        .replace(/CONSUMIDOR FINAL\/CF/g, '').replace(/Código: \d+/g, '')
        .replace(/L\d+=.*?(\n|$)/g, '').replace(/Peso.*?(\n|$)/g, '')  
        .replace(/Bitola \(mm\)|Aço|Trechos|Página \d+ de \d+/gi, '');

    const normalizedText = cleanText.replace(/,/g, '.').replace(/\s+/g, ' ');
    const extracted = [];
    const bitolaRegex = /(\d+[.,]\d+)/g;
    let match;

    while ((match = bitolaRegex.exec(normalizedText)) !== null) {
        const bitolaVal = parseFloat(match[1]);
        if (BITOLAS_COMERCIAIS.includes(bitolaVal)) {
            const startIndex = bitolaRegex.lastIndex;
            const contextChunk = normalizedText.substring(startIndex, startIndex + 180);
            const qtdeMatch = contextChunk.match(/Qtde\s*[a-zA-Z]*\s*[:.]?\s*(\d+(?:\s*[xX*]\s*\d+)?)/i);
            const comprMatch = contextChunk.match(/Compr\w*\s*[:.]?\s*(\d{2,4})/i);
            let qtd = 0, length = 0;

            if (qtdeMatch && comprMatch) {
                length = parseFloat(comprMatch[1]);
                const qStr = qtdeMatch[1];
                if (qStr.toLowerCase().includes('x') || qStr.includes('*')) {
                    const parts = qStr.toLowerCase().replace('x', '*').split('*');
                    qtd = parseInt(parts[0]) * parseInt(parts[1]);
                } else { qtd = parseInt(qStr); }
            } else {
                const fallbackNums = contextChunk.matchAll(/(\d+(?:\s*[xX*]\s*\d+)?)/g);
                const candidates = [];
                for (const m of fallbackNums) { candidates.push(m[1]); if (candidates.length >= 2) break; }
                if (candidates.length >= 2) {
                    let valA = 0, valB = 0, isAMult = false, isBMult = false;
                    const valAStr = candidates[0], valBStr = candidates[1];

                    if (valAStr.toLowerCase().includes('x') || valAStr.includes('*')) {
                        const parts = valAStr.toLowerCase().replace('x', '*').split('*');
                        valA = parseInt(parts[0]) * parseInt(parts[1]); isAMult = true;
                    } else { valA = parseFloat(valAStr); }

                    if (valBStr.toLowerCase().includes('x') || valBStr.includes('*')) {
                        const parts = valBStr.toLowerCase().replace('x', '*').split('*');
                        valB = parseInt(parts[0]) * parseInt(parts[1]); isBMult = true;
                    } else { valB = parseFloat(valBStr); }

                    if (isAMult && !isBMult) { qtd = valA; length = valB; }
                    else if (!isAMult && isBMult) { length = valA; qtd = valB; }
                    else if (valA === 1200 && valB !== 1200) { length = valA; qtd = valB; }
                    else if (valB === 1200 && valA !== 1200) { qtd = valA; length = valB; }
                    else { if (valA > 50 && valB < 30) { length = valA; qtd = valB; } else if (valB > 50 && valA < 30) { qtd = valA; length = valB; } else { length = valA; qtd = valB; } }
                }
            }
            if (length > 20 && length <= 1200 && qtd > 0) {
                 const isDuplicate = extracted.some(i => Math.abs(i.bitola - bitolaVal) < 0.01 && i.length === length && i.qty === qtd);
                 if (!isDuplicate) extracted.push({ id: generateId(), origin: fileName, bitola: bitolaVal, qty: qtd, length: length, selected: true });
            }
        }
    }
    return extracted;
  };

  // --- MODAIS E AÇÕES (DEMANDA) ---
  const openManualInputModal = () => { setNewManualItemData({ bitola: 10.0, length: 100, qty: 1 }); setShowManualInputModal(true); };
  const confirmAddManualItem = () => {
      const { bitola, length, qty } = newManualItemData;
      if (length <= 0 || qty <= 0) { alert("Inválido."); return; }
      setItems([...items, { id: generateId(), origin: 'Manual', bitola: parseFloat(bitola), qty: parseInt(qty), length: parseFloat(length), selected: true }]);
      setShowManualInputModal(false);
  };
  const updateItem = (id, field, value) => setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  const removeItem = (id) => setItems(items.filter(item => item.id !== id));
  const clearItems = () => { if(window.confirm("Limpar lista?")) { setItems([]); setUploadedFiles([]); setResults(null); if(fileInputRef.current) fileInputRef.current.value = ''; } };

  // --- MODAIS E AÇÕES (ESTOQUE) ---
  const openAddStockModal = () => { setNewStockItemData({ bitola: 10.0, length: 100, qty: 1 }); setShowAddStockModal(true); };
  const confirmAddStockItem = () => {
      const { bitola, length, qty } = newStockItemData;
      if (length <= 0 || qty <= 0) { alert("Inválido."); return; }
      saveInventoryToLocal([...inventory, { id: generateId(), bitola: parseFloat(bitola), length: parseFloat(length), qty: parseInt(qty), source: 'estoque_manual' }]);
      setShowAddStockModal(false);
  };
  const updateInventoryItem = (id, field, value) => saveInventoryToLocal(inventory.map(item => item.id === id ? { ...item, [field]: value } : item));
  const removeInventoryItem = (id) => saveInventoryToLocal(inventory.filter(item => item.id !== id));
  const clearInventory = () => { if(window.confirm("Zerar estoque?")) { saveInventoryToLocal([]); setInventory([]); } };

  // --- BACKUP / RESTORE / PDF ---
  const exportInventoryJSON = () => {
      const dataStr = JSON.stringify(inventory, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', `Backup_Estoque_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`);
      linkElement.click();
  };
  const handleRestoreClick = () => inventoryInputRef.current && inventoryInputRef.current.click();
  const importInventoryJSON = (event) => {
      const file = event.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const importedData = JSON.parse(e.target.result);
              if (Array.isArray(importedData)) {
                  const validData = importedData.map(item => ({ id: item.id || generateId(), bitola: parseFloat(item.bitola) || 0, length: parseFloat(item.length) || 0, qty: parseInt(item.qty) || 1, source: item.source || 'importado' })).filter(i => i.bitola > 0 && i.length > 0);
                  if(validData.length > 0 && window.confirm("Substituir estoque?")) saveInventoryToLocal(validData);
              }
          } catch (err) { alert("Erro JSON."); }
          if(inventoryInputRef.current) inventoryInputRef.current.value = '';
      };
      reader.readAsText(file);
  };
  const exportInventoryPDF = () => {
    if (!window.jspdf) return alert("Carregando PDF...");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const inventoryToPrint = activeInventoryBitola === 'todas' ? inventory : inventory.filter(i => Math.abs(i.bitola - parseFloat(activeInventoryBitola)) < 0.01);
    if (inventoryToPrint.length === 0) return alert("Nada para imprimir.");
    doc.text(activeInventoryBitola === 'todas' ? "Estoque Geral" : `Estoque ${parseFloat(activeInventoryBitola).toFixed(1)}mm`, 14, 20);
    doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 26);
    const tableData = inventoryToPrint.sort((a,b) => a.bitola - b.bitola || b.length - a.length).map(item => [`${item.bitola.toFixed(1)} mm`, item.qty, `${item.length} cm`, `${(item.length * item.qty / 100).toFixed(2)} m`, item.source || '-']);
    if (doc.autoTable) { doc.autoTable({ head: [['Bitola', 'Qtd', 'Comp.', 'Total', 'Origem']], body: tableData, startY: 30 }); doc.save("Estoque.pdf"); }
  };

  // --- OTIMIZAÇÃO ---
  const runOptimization = () => {
    if (filteredItems.length === 0) { alert("Nenhum item válido."); return; }
    const itemsByBitola = {}, inventoryByBitola = {};
    filteredItems.forEach(item => {
        if (!item.selected) return;
        if (!itemsByBitola[item.bitola]) itemsByBitola[item.bitola] = [];
        for (let i = 0; i < item.qty; i++) itemsByBitola[item.bitola].push({ ...item, realId: `${item.id}-${i}` });
    });
    inventory.forEach(inv => {
        if (!inventoryByBitola[inv.bitola]) inventoryByBitola[inv.bitola] = [];
        for(let i=0; i < (inv.qty || 1); i++) inventoryByBitola[inv.bitola].push({ ...inv, virtualId: `${inv.id}_copy_${i}`, used: false });
    });
    const finalResult = [];
    Object.keys(itemsByBitola).forEach(bitola => {
        const demandList = itemsByBitola[bitola].sort((a, b) => b.length - a.length);
        const stockList = inventoryByBitola[bitola] ? inventoryByBitola[bitola].sort((a, b) => a.length - b.length) : [];
        const barsUsed = [];
        demandList.forEach(piece => {
            let fitted = false, bestBarIndex = -1, minWaste = Infinity;
            for (let i = 0; i < barsUsed.length; i++) {
                if (barsUsed[i].remaining >= piece.length + PERDA_CORTE) {
                    const waste = barsUsed[i].remaining - (piece.length + PERDA_CORTE);
                    if (waste < minWaste) { minWaste = waste; bestBarIndex = i; }
                }
            }
            if (bestBarIndex !== -1) { barsUsed[bestBarIndex].cuts.push(piece.length); barsUsed[bestBarIndex].remaining -= (piece.length + PERDA_CORTE); fitted = true; }
            if (!fitted) {
                let bestStockIndex = -1, minStockWaste = Infinity;
                for (let i = 0; i < stockList.length; i++) {
                    if (!stockList[i].used && stockList[i].length >= piece.length) {
                        const waste = stockList[i].length - piece.length;
                        if (waste < minStockWaste) { minStockWaste = waste; bestStockIndex = i; }
                    }
                }
                if (bestStockIndex !== -1) {
                    stockList[bestStockIndex].used = true;
                    barsUsed.push({ type: 'estoque', originalLength: stockList[bestStockIndex].length, remaining: stockList[bestStockIndex].length - piece.length - PERDA_CORTE, cuts: [piece.length], id: stockList[bestStockIndex].id });
                    fitted = true;
                }
            }
            if (!fitted) barsUsed.push({ type: 'nova', originalLength: BARRA_PADRAO, remaining: BARRA_PADRAO - piece.length - PERDA_CORTE, cuts: [piece.length], id: 'new-' + generateId() });
        });
        const groupedBars = [];
        barsUsed.forEach(bar => {
            const sortedCuts = [...bar.cuts].sort((a,b) => b-a);
            const signature = `${bar.type}-${bar.originalLength}-${sortedCuts.join(',')}`;
            const existingGroup = groupedBars.find(g => g.signature === signature);
            if (existingGroup) { existingGroup.count++; existingGroup.ids.push(bar.id); } 
            else groupedBars.push({ ...bar, cuts: sortedCuts, count: 1, signature: signature, ids: [bar.id] });
        });
        finalResult.push({ bitola: bitola, bars: groupedBars });
    });
    setResults(finalResult); setActiveTab('results'); setActiveResultsBitola('todas');
  };

  const generatePDF = () => {
    if (!window.jspdf || !results) return alert("Erro PDF.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let yPos = 20;
    const titleText = activeResultsBitola === 'todas' ? "Plano Geral" : `Plano ${parseFloat(activeResultsBitola).toFixed(1)}mm`;
    doc.setFontSize(18); doc.text(titleText, 105, yPos, { align: 'center' }); yPos += 15;
    doc.setFontSize(10); doc.text(`Data: ${new Date().toLocaleString()}`, 105, yPos, { align: 'center' }); yPos += 15;
    const resultsToPrint = activeResultsBitola === 'todas' ? results : results.filter(group => Math.abs(parseFloat(group.bitola) - parseFloat(activeResultsBitola)) < 0.01);
    if (resultsToPrint.length === 0) return alert("Sem dados.");
    resultsToPrint.forEach(group => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        doc.setFillColor(240, 240, 240); doc.rect(10, yPos - 5, 190, 8, 'F');
        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text(`Bitola: ${parseFloat(group.bitola).toFixed(1)} mm`, 15, yPos);
        yPos += 10; doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        group.bars.forEach(bar => {
             if (yPos > 260) { doc.addPage(); yPos = 20; }
             const typeText = bar.type === 'nova' ? "BARRA NOVA (12m)" : `PONTA (${bar.originalLength}cm)`;
             doc.setFont("helvetica", "bold"); doc.text(`${bar.count}x  ${typeText}`, 15, yPos);
             doc.setFont("helvetica", "normal"); doc.text(`Sobra: ${bar.remaining.toFixed(0)}cm`, 150, yPos, { align: 'right' });
             yPos += 3;
             const scale = 180 / bar.originalLength; let currentX = 15; const barHeight = 8;
             bar.cuts.forEach(cut => {
                 const cutWidth = cut * scale;
                 doc.setFillColor(59, 130, 246); doc.rect(currentX, yPos, cutWidth, barHeight, 'F'); doc.rect(currentX, yPos, cutWidth, barHeight, 'S');
                 if (cutWidth > 8) { doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.text(`${cut}`, currentX + (cutWidth / 2), yPos + 5.5, { align: 'center' }); }
                 currentX += cutWidth;
             });
             if (bar.remaining > 0) {
                 const remainingWidth = bar.remaining * scale;
                 doc.setFillColor(220, 220, 220); doc.rect(currentX, yPos, remainingWidth, barHeight, 'F'); doc.rect(currentX, yPos, remainingWidth, barHeight, 'S');
                 doc.setTextColor(100, 100, 100); doc.setFontSize(8); if (remainingWidth > 15) doc.text("Sobra", currentX + (remainingWidth/2), yPos + 5.5, { align: 'center' });
             }
             doc.setTextColor(0, 0, 0); yPos += 15;
        });
        yPos += 5;
    });
    doc.save("Plano_Corte.pdf");
  };

  const consolidateLeftovers = () => {
    if (!results) return;
    const usedCounts = {};
    results.forEach(group => group.bars.forEach(barGroup => { if (barGroup.type === 'estoque') barGroup.ids.forEach(id => usedCounts[id] = (usedCounts[id] || 0) + 1); }));
    let updatedInventory = inventory.map(item => { if (usedCounts[item.id]) { const newQty = item.qty - usedCounts[item.id]; return { ...item, qty: Math.max(0, newQty) }; } return item; }).filter(item => item.qty > 0);
    results.forEach(group => group.bars.forEach(barGroup => {
            if (barGroup.remaining > 50) { 
                const bitola = parseFloat(group.bitola), length = parseFloat(barGroup.remaining.toFixed(1)), qtyToAdd = barGroup.count; 
                const existingIndex = updatedInventory.findIndex(i => Math.abs(i.bitola - bitola) < 0.01 && Math.abs(i.length - length) < 0.1);
                if (existingIndex !== -1) updatedInventory[existingIndex].qty += qtyToAdd;
                else updatedInventory.push({ id: generateId(), bitola: bitola, length: length, qty: qtyToAdd, source: 'sobra_corte' });
            }
        }));
    saveInventoryToLocal(updatedInventory); alert("Estoque atualizado!"); setActiveTab('inventory');
  };

  const renderBitolaTabs = (current, setFunction, availableBitolas) => {
    const tabs = ['todas', ...availableBitolas];
    return (
        <div className="flex overflow-x-auto gap-1 border-b border-slate-200 mb-4 pb-0 no-scrollbar items-end h-10 px-1">
            {tabs.map(tab => (
                <button key={tab} onClick={() => setFunction(tab)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap border-t border-x relative ${current === tab ? 'bg-white border-indigo-200 text-indigo-700 z-10 top-[1px] shadow-[0_-2px_3px_rgba(0,0,0,0.02)] border-b-white h-10' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 h-9 mb-0.5'}`}>
                    {tab === 'todas' ? 'Todas' : `${parseFloat(tab).toFixed(1)} mm`}
                </button>
            ))}
        </div>
    );
  };
  const getResultsTabClass = () => activeTab === 'results' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : (results ? 'bg-green-50 text-green-700 hover:bg-green-100 border-b-2 border-transparent' : 'text-slate-400 cursor-not-allowed');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex overflow-hidden">
      
      {/* --- SIDEBAR (Projetos Salvos) --- */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl transform transition-transform duration-300 z-[60] border-l border-slate-200 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center shadow-md">
           <h2 className="font-bold flex items-center gap-2"><FolderOpen size={18}/> Projetos Salvos</h2>
           <button onClick={() => setIsSidebarOpen(false)} className="hover:bg-slate-700 p-1 rounded"><X size={20}/></button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100vh-60px)] space-y-3 bg-slate-50">
           {loadingPlans ? (
             <div className="flex justify-center p-8 text-slate-400"><RefreshCw className="animate-spin"/></div>
           ) : savedPlans.length === 0 ? (
             <div className="text-center text-slate-400 text-sm py-8">Nenhum projeto salvo.</div>
           ) : (
             savedPlans.map(plan => (
               <div key={plan.id} onClick={() => handleLoadPlan(plan)} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all group relative">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-slate-800 truncate pr-6">{plan.name}</h3>
                    <button 
                      onClick={(e) => handleDeletePlan(plan.id, e)} 
                      className="text-slate-300 hover:text-red-500 transition-colors p-1 absolute top-2 right-2"
                      title="Excluir Projeto"
                    >
                      <Trash2 size={16}/>
                    </button>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                    <Calendar size={12}/>
                    {plan.createdAt?.seconds ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString() : 'Agora'}
                  </div>
                  <div className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded inline-block font-medium">
                    {plan.itemsSummary || 'Vários itens'}
                  </div>
                  <div className="mt-2 text-indigo-600 text-xs font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Carregar <ChevronRight size={12}/>
                  </div>
               </div>
             ))
           )}
        </div>
      </div>

      {/* --- CONTEÚDO PRINCIPAL --- */}
      <div className={`flex-1 flex flex-col h-screen transition-all duration-300 overflow-y-auto ${isSidebarOpen ? 'mr-0' : ''}`}>
        <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50">
            <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
                <Settings className="w-6 h-6 text-yellow-500" />
                <h1 className="text-xl font-bold tracking-tight">Otimizador Corte & Dobra</h1>
            </div>
            <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="flex items-center gap-1 bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors font-medium border border-indigo-500 shadow-sm"
                >
                  <FolderOpen size={16} /> <span className="hidden sm:inline">Meus Projetos</span>
                </button>
                <div className="w-px h-6 bg-slate-700 mx-1"></div>
                {user && (
                <button 
                    onClick={onLogout}
                    className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors font-medium"
                >
                    <LogOut size={16} /> Sair
                </button>
                )}
            </div>
            </div>
        </header>

        <main className="max-w-6xl mx-auto p-4 w-full">
            
            <div className="flex gap-4 mb-6 border-b border-slate-200 pb-2 overflow-x-auto">
            <button onClick={() => setActiveTab('input')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'input' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-white'}`}><FileText size={18} /> Inserir PDF(s)</button>
            <button onClick={() => setActiveTab('inventory')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'inventory' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-white'}`}><Clipboard size={18} /> Estoque ({inventory.reduce((acc, i) => acc + i.qty, 0)})</button>
            <button onClick={() => setActiveTab('results')} disabled={!results} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${getResultsTabClass()}`}><Download size={18} /> Resultado {results ? '(Pronto)' : ''}</button>
            </div>

            {/* --- TAB: INPUT --- */}
            {activeTab === 'input' && (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Filtro Visual</h3>
                        <button onClick={toggleAllBitolas} className="text-xs text-blue-600 hover:underline">{enabledBitolas.length === BITOLAS_COMERCIAIS.length ? "Desmarcar todas" : "Marcar todas"}</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {BITOLAS_COMERCIAIS.map(bitola => (
                            <button key={bitola} onClick={() => toggleBitola(bitola)} className={`px-3 py-1 text-sm rounded-full border transition-all flex items-center gap-1 ${enabledBitolas.includes(bitola) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                                {enabledBitolas.includes(bitola) ? <CheckSquare size={14} /> : <Square size={14} />} {bitola.toFixed(1)}mm
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-3 text-slate-700">1. Carregar Arquivos</h2>
                <div className="border-2 border-dashed border-blue-200 rounded-lg p-8 text-center hover:bg-blue-50 transition cursor-pointer relative group">
                    <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="flex flex-col items-center gap-3 text-blue-600">
                        {isProcessing ? <RefreshCw className="animate-spin w-10 h-10" /> : <Upload className="w-10 h-10 group-hover:scale-110 transition-transform" />}
                        <span className="font-bold">{isProcessing ? "Lendo..." : "Clique ou Arraste PDFs"}</span>
                    </div>
                </div>
                {uploadedFiles.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {uploadedFiles.map((file, idx) => (
                            <div key={idx} className={`flex items-center gap-2 p-2 rounded border text-sm ${file.status === 'erro' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                                <File size={14} /> <span className="truncate flex-1">{file.name}</span>
                                <button onClick={() => removeFile(file.name)}><XCircle size={16} className="text-slate-400 hover:text-red-500"/></button>
                            </div>
                        ))}
                    </div>
                )}
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                        2. Lista de Peças 
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">{items.length} itens</span>
                    </h2>
                    <div className="flex gap-2">
                         {items.length > 0 && (
                           <button 
                             onClick={handleSavePlan}
                             className="flex items-center gap-1 bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-md hover:bg-indigo-50 text-sm font-medium shadow-sm"
                           >
                             <Save size={16} /> Salvar Projeto
                           </button>
                         )}
                        <button onClick={clearItems} className="text-red-500 text-sm hover:underline px-2">Limpar</button>
                        <button onClick={openManualInputModal} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm"><Plus size={16} /> Manual</button>
                    </div>
                </div>

                <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-100 sticky top-0 z-10">
                        <tr><th className="px-4 py-3">Bitola</th><th className="px-4 py-3">Qtde</th><th className="px-4 py-3">Comp.(cm)</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right">Ação</th></tr>
                        </thead>
                        <tbody>
                        {filteredItems.length === 0 && items.length > 0 && <tr><td colSpan="5" className="text-center py-4 italic text-slate-500">Itens ocultos pelo filtro.</td></tr>}
                        {filteredItems.length === 0 && items.length === 0 && <tr><td colSpan="5" className="text-center py-8 text-slate-400">Lista vazia.</td></tr>}
                        {filteredItems.map((item) => (
                            <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-2"><select value={item.bitola} onChange={(e) => updateItem(item.id, 'bitola', parseFloat(e.target.value))} className="p-1 border rounded bg-white">{BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b}</option>)}</select></td>
                            <td className="px-4 py-2"><input type="number" value={item.qty} onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value))} className="w-16 p-1 border rounded font-bold text-blue-800" min="1"/></td>
                            <td className="px-4 py-2"><input type="number" value={item.length} onChange={(e) => updateItem(item.id, 'length', parseFloat(e.target.value))} className="w-20 p-1 border rounded" min="1"/></td>
                            <td className="px-4 py-2 text-xs truncate max-w-[100px] text-slate-500" title={item.origin}>{item.origin}</td>
                            <td className="px-4 py-2 text-right"><button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                </div>

                <div className="flex justify-end pb-8">
                    <button onClick={runOptimization} disabled={filteredItems.length === 0} className={`px-8 py-3 rounded-md shadow-md font-bold flex items-center gap-2 transition-all ${filteredItems.length === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105'}`}>
                        <RefreshCw size={20} /> CALCULAR PLANO
                    </button>
                </div>
            </div>
            )}

            {/* --- TAB: INVENTORY --- */}
            {activeTab === 'inventory' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4 animate-fade-in">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <div><h2 className="text-lg font-semibold text-slate-700">Estoque (Sobras)</h2></div>
                    <div className="flex gap-2 flex-wrap">
                        <input ref={inventoryInputRef} type="file" accept=".json" onChange={importInventoryJSON} className="hidden" />
                        <div className="flex items-center gap-2 border-r pr-2 mr-2">
                            <button onClick={exportInventoryJSON} className="btn-secondary text-xs"><FolderDown size={14} /> Backup</button>
                            <button onClick={handleRestoreClick} className="btn-secondary text-xs"><FolderUp size={14} /> Restaurar</button>
                        </div>
                        <button onClick={exportInventoryPDF} className="btn-secondary text-xs text-indigo-700 bg-indigo-50 border-indigo-200"><Printer size={14} /> PDF</button>
                        <button onClick={clearInventory} className="text-red-500 text-sm hover:underline px-2">Zerar</button>
                        <button onClick={openAddStockModal} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700"><Plus size={16} /> Adicionar</button>
                    </div>
                </div>
                {renderBitolaTabs(activeInventoryBitola, setActiveInventoryBitola, BITOLAS_COMERCIAIS)}
                <div className="overflow-x-auto max-h-[500px] border border-slate-200 rounded-b-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-yellow-50 text-xs text-slate-500 uppercase sticky top-0"><tr><th className="px-4 py-3">Bitola</th><th className="px-4 py-3">Qtd</th><th className="px-4 py-3">Comp.</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
                        <tbody>
                            {(() => {
                                const list = activeInventoryBitola === 'todas' ? inventory : inventory.filter(i => Math.abs(i.bitola - parseFloat(activeInventoryBitola)) < 0.01);
                                if (list.length === 0) return <tr><td colSpan="5" className="text-center py-8 text-slate-400">Vazio.</td></tr>;
                                return list.sort((a,b) => b.bitola - a.bitola).map(item => (
                                    <tr key={item.id} className="border-b border-slate-100 hover:bg-yellow-50">
                                        <td className="px-4 py-2"><select value={item.bitola} onChange={(e) => updateInventoryItem(item.id, 'bitola', parseFloat(e.target.value))} className="p-1 border rounded bg-transparent">{BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b}</option>)}</select></td>
                                        <td className="px-4 py-2"><input type="number" value={item.qty} onChange={(e) => updateInventoryItem(item.id, 'qty', parseInt(e.target.value))} className="w-16 p-1 border rounded bg-transparent font-bold" min="1"/></td>
                                        <td className="px-4 py-2"><input type="number" value={item.length} onChange={(e) => updateInventoryItem(item.id, 'length', parseFloat(e.target.value))} className="w-20 p-1 border rounded bg-transparent"/></td>
                                        <td className="px-4 py-2 text-xs text-slate-400 uppercase">{item.source || 'Manual'}</td>
                                        <td className="px-4 py-2 text-right"><button onClick={() => removeInventoryItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td>
                                    </tr>
                                ));
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* --- TAB: RESULTS --- */}
            {activeTab === 'results' && results && (
            <div className="space-y-8 animate-fade-in pb-8">
                <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex-wrap gap-4">
                    <div><h2 className="text-xl font-bold text-indigo-900">Plano Gerado</h2></div>
                    <div className="flex gap-2 items-center">
                        <button onClick={generatePDF} className="bg-white text-indigo-700 border border-indigo-200 px-4 py-2 rounded shadow hover:bg-indigo-50 flex items-center gap-2"><Printer size={18} /> PDF</button>
                        <button onClick={consolidateLeftovers} className="bg-indigo-600 text-white px-6 py-2 rounded shadow hover:bg-indigo-700 flex items-center gap-2"><Save size={18} /> Salvar Sobras</button>
                        <div className="w-px h-8 bg-indigo-200 mx-2"></div>
                        <button onClick={clearResults} className="text-red-600 border border-red-200 px-4 py-2 rounded shadow hover:bg-red-50 flex items-center gap-2 bg-white"><Eraser size={18} /> Limpar</button>
                    </div>
                </div>
                {renderBitolaTabs(activeResultsBitola, setActiveResultsBitola, results.map(r => parseFloat(r.bitola)).sort((a,b) => a-b))}
                {(() => {
                    const displayed = activeResultsBitola === 'todas' ? results : results.filter(g => Math.abs(parseFloat(g.bitola) - parseFloat(activeResultsBitola)) < 0.01);
                    if (displayed.length === 0) return <div className="text-center py-12 text-slate-500">Sem dados.</div>;
                    return displayed.map((group, gIdx) => (
                        <div key={gIdx} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-4">
                            <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex justify-between"><h3 className="font-bold text-slate-800">Bitola: {group.bitola}mm</h3><span className="text-sm text-slate-500">{group.bars.reduce((acc, b) => acc + b.count, 0)} barras</span></div>
                            <div className="p-6 space-y-6">
                                {group.bars.map((bar, bIdx) => (
                                    <div key={bIdx} className="flex flex-col gap-1 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                                        <div className="flex justify-between text-sm text-slate-600 mb-1 items-center">
                                            <div className="flex items-center gap-3"><span className="bg-slate-800 text-white font-bold px-3 py-1 rounded-full text-xs">{bar.count}x</span><span className="font-semibold uppercase text-xs">{bar.type === 'nova' ? <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded">Barra Nova (12m)</span> : <span className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Ponta ({bar.originalLength}cm)</span>}</span></div>
                                            <span className="font-mono text-xs">Sobra: <span className={bar.remaining > 100 ? "text-green-600 font-bold" : "text-slate-600"}>{bar.remaining.toFixed(1)}cm</span></span>
                                        </div>
                                        <div className="h-14 w-full bg-slate-200 rounded overflow-hidden flex border border-slate-300 relative">
                                            {bar.cuts.map((cut, cIdx) => <div key={cIdx} style={{ width: `${(cut / bar.originalLength) * 100}%` }} className="h-full bg-blue-500 border-r border-white flex flex-col items-center justify-center text-white text-xs hover:bg-blue-600 transition-colors" title={`${cut}cm`}><span className="font-bold">{cut}</span></div>)}
                                            <div className="flex-1 bg-slate-300 flex items-center justify-center pattern-diagonal-lines">{bar.remaining > 10 && <span className="text-xs text-slate-500 italic font-medium">{bar.remaining.toFixed(0)}cm</span>}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ));
                })()}
            </div>
            )}
        </main>
      </div>

      {/* --- MODAIS DE INPUT (Manter estrutura original ou simplificar visualmente) --- */}
      {showManualInputModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded p-6 w-full max-w-sm">
                <h3 className="font-bold mb-4">Adicionar Item Manual</h3>
                <div className="space-y-3">
                    <select value={newManualItemData.bitola} onChange={(e) => setNewManualItemData({...newManualItemData, bitola: e.target.value})} className="w-full p-2 border rounded">{BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b} mm</option>)}</select>
                    <div className="flex gap-2"><input type="number" placeholder="Comp (cm)" value={newManualItemData.length} onChange={(e) => setNewManualItemData({...newManualItemData, length: e.target.value})} className="w-full p-2 border rounded" /><input type="number" placeholder="Qtd" value={newManualItemData.qty} onChange={(e) => setNewManualItemData({...newManualItemData, qty: e.target.value})} className="w-full p-2 border rounded" /></div>
                </div>
                <div className="mt-4 flex justify-end gap-2"><button onClick={() => setShowManualInputModal(false)} className="px-3 py-1 bg-slate-200 rounded">Cancelar</button><button onClick={confirmAddManualItem} className="px-3 py-1 bg-green-600 text-white rounded">Adicionar</button></div>
            </div>
        </div>
      )}

       {showAddStockModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded p-6 w-full max-w-sm">
                <h3 className="font-bold mb-4">Adicionar ao Estoque</h3>
                <div className="space-y-3">
                    <select value={newStockItemData.bitola} onChange={(e) => setNewStockItemData({...newStockItemData, bitola: e.target.value})} className="w-full p-2 border rounded">{BITOLAS_COMERCIAIS.map(b => <option key={b} value={b}>{b} mm</option>)}</select>
                    <div className="flex gap-2"><input type="number" placeholder="Comp (cm)" value={newStockItemData.length} onChange={(e) => setNewStockItemData({...newStockItemData, length: e.target.value})} className="w-full p-2 border rounded" /><input type="number" placeholder="Qtd" value={newStockItemData.qty} onChange={(e) => setNewStockItemData({...newStockItemData, qty: e.target.value})} className="w-full p-2 border rounded" /></div>
                </div>
                <div className="mt-4 flex justify-end gap-2"><button onClick={() => setShowAddStockModal(false)} className="px-3 py-1 bg-slate-200 rounded">Cancelar</button><button onClick={confirmAddStockItem} className="px-3 py-1 bg-indigo-600 text-white rounded">Salvar</button></div>
            </div>
        </div>
      )}

      <style>{`.pattern-diagonal-lines { background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.5) 5px, rgba(255,255,255,0.5) 10px); } .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } .btn-secondary { display: flex; align-items: center; gap: 0.25rem; background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-weight: 600; transition: background-color 0.2s; } .btn-secondary:hover { background-color: #e2e8f0; }`}</style>
    </div>
  );
};

// --- APP WRAPPER ---
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

  const handleLogout = async () => { await signOut(auth); };

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><RefreshCw className="animate-spin text-indigo-600 w-12 h-12" /></div>;
  if (!user) return <LoginScreen />;
  return <OtimizadorCorteAco user={user} onLogout={handleLogout} />;
};

export default App;
