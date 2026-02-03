import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, Download, Clipboard, ArrowRight, Save, RefreshCw, FileText, Settings, Upload, File, Info, XCircle, CheckSquare, Square, Printer, FolderDown, FolderUp, X, Eraser } from 'lucide-react';

const OtimizadorCorteAco = () => {
  // --- Estados ---
  const [activeTab, setActiveTab] = useState('input'); // input, inventory, results
  const [items, setItems] = useState([]); // DEMANDA
  const [inventory, setInventory] = useState([]); // ESTOQUE
  const [results, setResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  // Estados de Navegação por Abas de Bitola
  const [activeInventoryBitola, setActiveInventoryBitola] = useState('todas');
  const [activeResultsBitola, setActiveResultsBitola] = useState('todas');

  // Estados do Modal de Adicionar Estoque
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [newStockItemData, setNewStockItemData] = useState({ bitola: 10.0, length: 100, qty: 1 });

  // Estados do Modal de Adicionar Item Manual (Input)
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [newManualItemData, setNewManualItemData] = useState({ bitola: 10.0, length: 100, qty: 1 });

  // Filtro de quais bitolas aceitar na importação e visualização
  const BITOLAS_COMERCIAIS = [4.2, 5.0, 6.3, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 32.0, 40.0];
  const [enabledBitolas, setEnabledBitolas] = useState([...BITOLAS_COMERCIAIS]);

  const fileInputRef = useRef(null);
  const inventoryInputRef = useRef(null); // Ref para importação de estoque

  // --- Constantes ---
  const BARRA_PADRAO = 1200; // 12 metros
  const PERDA_CORTE = 0; // Perda por corte

  // --- Função Helper para Gerar IDs Únicos ---
  const generateId = () => {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  };

  // --- Carregar Scripts Externos ---
  useEffect(() => {
    // PDF.js
    const scriptPdf = document.createElement('script');
    scriptPdf.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    scriptPdf.async = true;
    scriptPdf.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    };
    document.body.appendChild(scriptPdf);

    // jsPDF
    const scriptJsPdf = document.createElement('script');
    scriptJsPdf.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    scriptJsPdf.async = true;
    document.body.appendChild(scriptJsPdf);
    
    // AutoTable
    const scriptAutoTable = document.createElement('script');
    scriptAutoTable.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
    scriptAutoTable.async = true;
    document.body.appendChild(scriptAutoTable);

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

    return () => {
      document.body.removeChild(scriptPdf);
      document.body.removeChild(scriptJsPdf);
      document.body.removeChild(scriptAutoTable);
    }
  }, []);

  const saveInventoryToLocal = (newInv) => {
    setInventory([...newInv]); // Garante nova referência para re-render
    localStorage.setItem('estoquePontas', JSON.stringify(newInv));
  };

  // --- Lógica de Filtro de Bitolas ---
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

  // --- DERIVED STATE: Items Filtrados ---
  const filteredItems = items.filter(item => enabledBitolas.includes(item.bitola));

  // --- Lógica de Leitura de PDF (Entrada) ---
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
            if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                pageText += "\n";
            }
            pageText += item.str + " ";
            lastY = item.transform[5];
        }
        fullText += pageText + "\n--- PAGE BREAK ---\n";
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
            let text = "";
            if (file.type === "application/pdf") {
                text = await extractTextFromPDF(file);
            } else {
                text = await file.text();
            }

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
        .replace(/\$/g, '')
        .replace(/\\times/g, 'x')
        .replace(/\\/g, '')
        .replace(/CONSUMIDOR FINAL\/CF/g, '')
        .replace(/Código: \d+/g, '')
        .replace(/L\d+=.*?(\n|$)/g, '') 
        .replace(/Peso.*?(\n|$)/g, '')  
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

            let qtd = 0;
            let length = 0;

            if (qtdeMatch && comprMatch) {
                length = parseFloat(comprMatch[1]);
                const qStr = qtdeMatch[1];
                if (qStr.toLowerCase().includes('x') || qStr.includes('*')) {
                    const parts = qStr.toLowerCase().replace('x', '*').split('*');
                    qtd = parseInt(parts[0]) * parseInt(parts[1]);
                } else {
                    qtd = parseInt(qStr);
                }
            } 
            else {
                const fallbackNums = contextChunk.matchAll(/(\d+(?:\s*[xX*]\s*\d+)?)/g);
                const candidates = [];
                for (const m of fallbackNums) {
                    candidates.push(m[1]);
                    if (candidates.length >= 2) break;
                }

                if (candidates.length >= 2) {
                    const valAStr = candidates[0];
                    const valBStr = candidates[1];
                    let valA = 0, valB = 0;
                    let isAMult = false, isBMult = false;

                    if (valAStr.toLowerCase().includes('x') || valAStr.includes('*')) {
                        const parts = valAStr.toLowerCase().replace('x', '*').split('*');
                        valA = parseInt(parts[0]) * parseInt(parts[1]);
                        isAMult = true;
                    } else { valA = parseFloat(valAStr); }

                    if (valBStr.toLowerCase().includes('x') || valBStr.includes('*')) {
                        const parts = valBStr.toLowerCase().replace('x', '*').split('*');
                        valB = parseInt(parts[0]) * parseInt(parts[1]);
                        isBMult = true;
                    } else { valB = parseFloat(valBStr); }

                    if (isAMult && !isBMult) { qtd = valA; length = valB; }
                    else if (!isAMult && isBMult) { length = valA; qtd = valB; }
                    else if (valA === 1200 && valB !== 1200) { length = valA; qtd = valB; }
                    else if (valB === 1200 && valA !== 1200) { qtd = valA; length = valB; }
                    else {
                        if (valA > 50 && valB < 30) { length = valA; qtd = valB; }
                        else if (valB > 50 && valA < 30) { qtd = valA; length = valB; }
                        else { length = valA; qtd = valB; }
                    }
                }
            }

            if (length > 20 && length <= 1200 && qtd > 0) {
                 const isDuplicate = extracted.some(i => 
                    Math.abs(i.bitola - bitolaVal) < 0.01 && 
                    i.length === length && 
                    i.qty === qtd
                 );
                 
                 if (!isDuplicate) {
                     extracted.push({
                        id: generateId(),
                        origin: fileName,
                        bitola: bitolaVal,
                        qty: qtd,
                        length: length,
                        selected: true
                     });
                 }
            }
        }
    }

    return extracted;
  };

  // --- Manipulação de Itens (Demanda) ---
  const openManualInputModal = () => {
    setNewManualItemData({ bitola: 10.0, length: 100, qty: 1 });
    setShowManualInputModal(true);
  };

  const confirmAddManualItem = () => {
      const { bitola, length, qty } = newManualItemData;
      if (length <= 0 || qty <= 0) {
          alert("Comprimento e Quantidade devem ser maiores que zero.");
          return;
      }
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

  // --- Manipulação de Estoque (Pontas) ---
  
  const openAddStockModal = () => {
      setNewStockItemData({ bitola: 10.0, length: 100, qty: 1 });
      setShowAddStockModal(true);
  };

  const confirmAddStockItem = () => {
      const { bitola, length, qty } = newStockItemData;
      if (length <= 0 || qty <= 0) {
          alert("Comprimento e Quantidade devem ser maiores que zero.");
          return;
      }
      
      const newPonta = { 
          id: generateId(), 
          bitola: parseFloat(bitola), 
          length: parseFloat(length), 
          qty: parseInt(qty), 
          source: 'estoque_manual' 
      };
      
      saveInventoryToLocal([...inventory, newPonta]);
      setShowAddStockModal(false);
  };

  const updateInventoryItem = (id, field, value) => {
    const newInv = inventory.map(item => item.id === id ? { ...item, [field]: value } : item);
    saveInventoryToLocal(newInv);
  };

  const removeInventoryItem = (id) => {
    saveInventoryToLocal(inventory.filter(item => item.id !== id));
  };

  const clearInventory = () => {
      if(window.confirm("Tem certeza que deseja APAGAR TODO o estoque de pontas?\nIsso não pode ser desfeito.")) {
          saveInventoryToLocal([]);
          setInventory([]); // Força atualização visual
      }
  }

  // --- BACKUP E RESTAURAÇÃO DE ESTOQUE ---
  const exportInventoryJSON = () => {
      const dataStr = JSON.stringify(inventory, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `Backup_Estoque_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
  };

  const handleRestoreClick = () => {
      // Gatilho seguro para o input file
      if (inventoryInputRef.current) {
          inventoryInputRef.current.click();
      }
  };

  const importInventoryJSON = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const importedData = JSON.parse(e.target.result);
              if (Array.isArray(importedData)) {
                  const validData = importedData.map(item => ({
                      id: item.id || generateId(),
                      bitola: parseFloat(item.bitola) || 0,
                      length: parseFloat(item.length) || 0,
                      qty: parseInt(item.qty) || 1,
                      source: item.source || 'importado'
                  })).filter(i => i.bitola > 0 && i.length > 0);

                  if(validData.length > 0) {
                      if(window.confirm(`Encontrados ${validData.length} itens no arquivo.\nDeseja substituir seu estoque atual por estes itens?`)){
                          saveInventoryToLocal(validData);
                          alert("Estoque restaurado com sucesso!");
                      }
                  } else {
                      alert("O arquivo não contém itens válidos.");
                  }
              } else {
                  alert("Arquivo inválido. Formato incorreto.");
              }
          } catch (err) {
              alert("Erro ao ler arquivo. Verifique se é um JSON válido.");
          }
          // Limpa o input para permitir selecionar o mesmo arquivo novamente
          if(inventoryInputRef.current) inventoryInputRef.current.value = '';
      };
      reader.readAsText(file);
  };
  
  const exportInventoryPDF = () => {
    if (!window.jspdf) return alert("Biblioteca PDF carregando...");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Relatório de Estoque de Pontas", 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 26);
    const tableData = inventory
      .sort((a,b) => a.bitola - b.bitola || b.length - a.length)
      .map(item => [
          `${item.bitola.toFixed(1)} mm`,
          item.qty,
          `${item.length} cm`,
          `${(item.length * item.qty / 100).toFixed(2)} m`,
          item.source || '-'
    ]);
    doc.autoTable({
        head: [['Bitola', 'Qtd', 'Comprimento Unit.', 'Total Linear', 'Origem']],
        body: tableData,
        startY: 30,
    });
    doc.save(`Relatorio_Estoque_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`);
  };

  // --- OTIMIZAÇÃO E AGRUPAMENTO ---
  const runOptimization = () => {
    if (filteredItems.length === 0) {
        alert("Nenhum item válido para cortar (verifique se a lista está vazia ou se as bitolas estão desmarcadas).");
        return;
    }

    const itemsByBitola = {};
    const inventoryByBitola = {};

    filteredItems.forEach(item => {
        if (!item.selected) return;
        if (!itemsByBitola[item.bitola]) itemsByBitola[item.bitola] = [];
        for (let i = 0; i < item.qty; i++) {
            itemsByBitola[item.bitola].push({ ...item, realId: `${item.id}-${i}` });
        }
    });

    inventory.forEach(inv => {
        if (!inventoryByBitola[inv.bitola]) inventoryByBitola[inv.bitola] = [];
        const qtdDisponivel = inv.qty || 1; 
        for(let i=0; i < qtdDisponivel; i++) {
            inventoryByBitola[inv.bitola].push({ 
                ...inv, 
                virtualId: `${inv.id}_copy_${i}`,
                used: false 
            });
        }
    });

    const finalResult = [];

    Object.keys(itemsByBitola).forEach(bitola => {
        const demandList = itemsByBitola[bitola].sort((a, b) => b.length - a.length);
        const stockList = inventoryByBitola[bitola] ? inventoryByBitola[bitola].sort((a, b) => a.length - b.length) : [];

        const barsUsed = [];

        demandList.forEach(piece => {
            let fitted = false;
            let bestBarIndex = -1;
            let minWaste = Infinity;

            for (let i = 0; i < barsUsed.length; i++) {
                const bar = barsUsed[i];
                if (bar.remaining >= piece.length + PERDA_CORTE) {
                    const waste = bar.remaining - (piece.length + PERDA_CORTE);
                    if (waste < minWaste) {
                        minWaste = waste;
                        bestBarIndex = i;
                    }
                }
            }

            if (bestBarIndex !== -1) {
                barsUsed[bestBarIndex].cuts.push(piece.length);
                barsUsed[bestBarIndex].remaining -= (piece.length + PERDA_CORTE);
                fitted = true;
            }

            if (!fitted) {
                let bestStockIndex = -1;
                let minStockWaste = Infinity;

                for (let i = 0; i < stockList.length; i++) {
                    if (!stockList[i].used && stockList[i].length >= piece.length) {
                        const waste = stockList[i].length - piece.length;
                        if (waste < minStockWaste) {
                            minStockWaste = waste;
                            bestStockIndex = i;
                        }
                    }
                }

                if (bestStockIndex !== -1) {
                    stockList[bestStockIndex].used = true;
                    barsUsed.push({
                        type: 'estoque',
                        originalLength: stockList[bestStockIndex].length,
                        remaining: stockList[bestStockIndex].length - piece.length - PERDA_CORTE,
                        cuts: [piece.length],
                        id: stockList[bestStockIndex].id
                    });
                    fitted = true;
                }
            }

            if (!fitted) {
                barsUsed.push({
                    type: 'nova',
                    originalLength: BARRA_PADRAO,
                    remaining: BARRA_PADRAO - piece.length - PERDA_CORTE,
                    cuts: [piece.length],
                    id: 'new-' + generateId()
                });
            }
        });

        const groupedBars = [];
        barsUsed.forEach(bar => {
            const sortedCuts = [...bar.cuts].sort((a,b) => b-a);
            const signature = `${bar.type}-${bar.originalLength}-${sortedCuts.join(',')}`;
            const existingGroup = groupedBars.find(g => g.signature === signature);
            if (existingGroup) {
                existingGroup.count++;
                existingGroup.ids.push(bar.id);
            } else {
                groupedBars.push({ ...bar, cuts: sortedCuts, count: 1, signature: signature, ids: [bar.id] });
            }
        });

        finalResult.push({ bitola: bitola, bars: groupedBars });
    });

    setResults(finalResult);
    setActiveTab('results');
    // Ao calcular, define a aba de resultados como 'todas' para mostrar o geral inicialmente
    setActiveResultsBitola('todas');
  };

  const generatePDF = () => {
    if (!window.jspdf || !results) return alert("Biblioteca PDF ainda não carregada ou sem resultados.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let yPos = 20;
    
    doc.setFontSize(18);
    doc.text("Plano de Corte - Otimizador de Aço", 105, yPos, { align: 'center' });
    yPos += 15;
    
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 105, yPos, { align: 'center' });
    yPos += 15;

    // Filtra para o PDF apenas o que está sendo visualizado na tela, ou tudo?
    // Geralmente PDF imprime tudo, mas podemos dar opção. Por padrão, vamos imprimir TUDO.
    results.forEach(group => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        doc.setFillColor(240, 240, 240);
        doc.rect(10, yPos - 5, 190, 8, 'F');
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Bitola: ${parseFloat(group.bitola).toFixed(1)} mm`, 15, yPos);
        yPos += 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        group.bars.forEach(bar => {
             if (yPos > 260) { doc.addPage(); yPos = 20; }
             const typeText = bar.type === 'nova' ? "BARRA NOVA (1200cm)" : `PONTA ESTOQUE (${bar.originalLength}cm)`;
             const wasteText = `Sobra: ${bar.remaining.toFixed(0)}cm`;
             doc.setFont("helvetica", "bold");
             doc.text(`${bar.count}x  ${typeText}`, 15, yPos);
             doc.setFont("helvetica", "normal");
             doc.text(wasteText, 150, yPos, { align: 'right' });
             yPos += 3;
             const scale = 180 / bar.originalLength;
             let currentX = 15;
             const barHeight = 8;
             bar.cuts.forEach(cut => {
                 const cutWidth = cut * scale;
                 doc.setFillColor(59, 130, 246);
                 doc.rect(currentX, yPos, cutWidth, barHeight, 'F');
                 doc.rect(currentX, yPos, cutWidth, barHeight, 'S');
                 if (cutWidth > 8) {
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(8);
                    const textX = currentX + (cutWidth / 2);
                    doc.text(`${cut}`, textX, yPos + 5.5, { align: 'center' });
                 }
                 currentX += cutWidth;
             });
             if (bar.remaining > 0) {
                 const remainingWidth = bar.remaining * scale;
                 doc.setFillColor(220, 220, 220);
                 doc.rect(currentX, yPos, remainingWidth, barHeight, 'F');
                 doc.rect(currentX, yPos, remainingWidth, barHeight, 'S');
                 doc.setTextColor(100, 100, 100);
                 doc.setFontSize(8);
                 if (remainingWidth > 15) {
                    doc.text("Sobra", currentX + (remainingWidth/2), yPos + 5.5, { align: 'center' });
                 }
             }
             doc.setTextColor(0, 0, 0);
             yPos += 15;
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
                barGroup.ids.forEach(id => {
                    usedCounts[id] = (usedCounts[id] || 0) + 1;
                });
            }
        });
    });

    let updatedInventory = inventory.map(item => {
        if (usedCounts[item.id]) {
            const newQty = item.qty - usedCounts[item.id];
            return { ...item, qty: Math.max(0, newQty) };
        }
        return item;
    }).filter(item => item.qty > 0);

    results.forEach(group => {
        group.bars.forEach(barGroup => {
            if (barGroup.remaining > 50) { 
                const bitola = parseFloat(group.bitola);
                const length = parseFloat(barGroup.remaining.toFixed(1));
                const qtyToAdd = barGroup.count; 

                const existingIndex = updatedInventory.findIndex(
                    i => Math.abs(i.bitola - bitola) < 0.01 && Math.abs(i.length - length) < 0.1
                );

                if (existingIndex !== -1) {
                    updatedInventory[existingIndex].qty += qtyToAdd;
                } else {
                    updatedInventory.push({
                        id: generateId(),
                        bitola: bitola,
                        length: length,
                        qty: qtyToAdd,
                        source: 'sobra_corte'
                    });
                }
            }
        });
    });

    saveInventoryToLocal(updatedInventory);
    alert(`Estoque atualizado! As sobras foram somadas e as barras usadas removidas.`);
    setActiveTab('inventory');
  };

  const clearResults = () => {
    if(window.confirm("Deseja descartar o plano de corte atual?")) {
        setResults(null);
        setActiveTab('input');
    }
  };

  // --- Função Helper para Renderizar Abas de Bitola ---
  const renderBitolaTabs = (current, setFunction, availableBitolas) => {
    // Adiciona 'todas' no início da lista
    const tabs = ['todas', ...availableBitolas];
    return (
        <div className="flex overflow-x-auto gap-1 border-b border-slate-200 mb-4 pb-0 no-scrollbar items-end h-10 px-1">
            {tabs.map(tab => {
                const isActive = current === tab;
                let label = tab === 'todas' ? 'Todas' : `${parseFloat(tab).toFixed(1)} mm`;
                if(tab !== 'todas') {
                    // Contagem opcional para dar mais contexto (se for aba de results, por exemplo)
                    // Mas manter simples é melhor por agora.
                }

                return (
                    <button
                        key={tab}
                        onClick={() => setFunction(tab)}
                        className={`
                            px-4 py-2 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap border-t border-x relative
                            ${isActive 
                                ? 'bg-white border-indigo-200 text-indigo-700 z-10 top-[1px] shadow-[0_-2px_3px_rgba(0,0,0,0.02)] border-b-white h-10' 
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 h-9 mb-0.5'}
                        `}
                    >
                        {label}
                    </button>
                )
            })}
        </div>
    );
  };

  // --- Função para determinar a classe do botão Resultado ---
  const getResultsTabClass = () => {
      // Se estiver ativo
      if (activeTab === 'results') {
          return 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm';
      }
      // Se não estiver ativo mas tiver resultados (clicável e visualmente disponível)
      if (results) {
          return 'bg-green-50 text-green-700 hover:bg-green-100 border-b-2 border-transparent hover:border-green-300 transition-all';
      }
      // Se não tiver resultados (bloqueado)
      return 'text-slate-400 cursor-not-allowed';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-yellow-500" />
            <h1 className="text-xl font-bold tracking-tight">Otimizador Corte & Dobra</h1>
          </div>
          <div className="text-sm text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
            Barras Padrão: 1200cm (Automático)
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        
        <div className="flex gap-4 mb-6 border-b border-slate-200 pb-2 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('input')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'input' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-white'}`}
          >
            <FileText size={18} /> Inserir PDF(s)
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'inventory' ? 'bg-white border-b-2 border-blue-600 text-blue-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-white'}`}
          >
            <Clipboard size={18} /> Estoque Pontas ({inventory.reduce((acc, i) => acc + i.qty, 0)})
          </button>
          <button 
            onClick={() => setActiveTab('results')}
            disabled={!results}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${getResultsTabClass()}`}
          >
            <Download size={18} /> Resultado {results ? '(Pronto)' : ''}
          </button>
        </div>

        {/* --- TAB: INPUT --- */}
        {activeTab === 'input' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Filtro Visual: Exibir bitolas</h3>
                    <button onClick={toggleAllBitolas} className="text-xs text-blue-600 hover:underline">
                        {enabledBitolas.length === BITOLAS_COMERCIAIS.length ? "Desmarcar todas" : "Marcar todas"}
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {BITOLAS_COMERCIAIS.map(bitola => {
                        const isSelected = enabledBitolas.includes(bitola);
                        return (
                            <button 
                                key={bitola}
                                onClick={() => toggleBitola(bitola)}
                                className={`px-3 py-1 text-sm rounded-full border transition-all flex items-center gap-1 ${
                                    isSelected 
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                {bitola.toFixed(1)}mm
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-3 text-slate-700">1. Carregar Arquivos (PDF ou Texto)</h2>
              <div className="border-2 border-dashed border-blue-200 rounded-lg p-8 text-center hover:bg-blue-50 transition cursor-pointer relative group">
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    multiple 
                    accept=".pdf,.txt,.csv" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-3 text-blue-600">
                      {isProcessing ? (
                          <RefreshCw className="animate-spin w-10 h-10" />
                      ) : (
                          <Upload className="w-10 h-10 group-hover:scale-110 transition-transform" />
                      )}
                      <span className="font-bold">
                          {isProcessing ? "Lendo arquivos..." : "Clique ou Arraste seus PDFs aqui"}
                      </span>
                  </div>
              </div>
              {uploadedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {uploadedFiles.map((file, idx) => (
                              <div key={idx} className={`flex items-center gap-2 p-2 rounded border text-sm group ${file.status === 'erro' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                                  <File size={14} />
                                  <span className="truncate flex-1 font-medium">{file.name}</span>
                                  {file.status === 'ok' && <span className="text-xs font-bold bg-green-200 px-1 rounded text-green-800">LIDO</span>}
                                  {file.status === 'erro' && <span className="text-xs font-bold bg-red-200 px-1 rounded text-red-800">ERRO</span>}
                                  <button onClick={() => removeFile(file.name)} className="ml-2 text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-100 transition-colors"><XCircle size={16} /></button>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                    <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                        2. Lista de Peças a Cortar (Demanda)
                        <div className="group relative">
                            <Info size={16} className="text-slate-400 cursor-help"/>
                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 bg-slate-800 text-white text-xs p-2 rounded shadow-lg z-10">
                                Esta é a lista de peças que você PRECISA ter cortadas no final.
                            </div>
                        </div>
                    </h2>
                </div>
                <div className="flex gap-2">
                    <button onClick={clearItems} className="text-red-500 text-sm hover:underline px-2">Limpar Lista</button>
                    <button onClick={openManualInputModal} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm">
                        <Plus size={16} /> Adicionar Manual
                    </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-md border border-dashed border-slate-300">
                  <p className="font-medium">Lista de corte vazia.</p>
                  <p className="text-sm mt-1">Carregue um PDF acima ou adicione itens manualmente.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-100">
                      <tr>
                        <th className="px-4 py-3">Bitola (mm)</th>
                        <th className="px-4 py-3">Qtde</th>
                        <th className="px-4 py-3">Comp. (cm)</th>
                        <th className="px-4 py-3">Origem</th>
                        <th className="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* MUDANÇA: Renderiza apenas items filtrados */}
                      {filteredItems.length === 0 && items.length > 0 && (
                          <tr>
                              <td colSpan="5" className="text-center py-4 text-slate-500 italic">
                                  Existem itens carregados, mas estão ocultos pelo filtro de bitolas acima.
                              </td>
                          </tr>
                      )}
                      {filteredItems.map((item, idx) => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <select 
                                value={item.bitola} 
                                onChange={(e) => updateItem(item.id, 'bitola', parseFloat(e.target.value))}
                                className="w-24 p-1.5 border rounded bg-white"
                            >
                                {BITOLAS_COMERCIAIS.map(b => (
                                    <option key={b} value={b}>{b.toFixed(1)}</option>
                                ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="number" 
                              value={item.qty} 
                              onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value))}
                              className="w-20 p-1.5 border rounded font-bold text-blue-800"
                              min="1"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="number" 
                              value={item.length} 
                              onChange={(e) => updateItem(item.id, 'length', parseFloat(e.target.value))}
                              className="w-24 p-1.5 border rounded"
                              min="1"
                            />
                          </td>
                           <td className="px-4 py-2 text-xs text-slate-500 truncate max-w-[100px]" title={item.origin}>
                            {item.origin}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pb-8">
                <button 
                    onClick={runOptimization}
                    disabled={filteredItems.length === 0}
                    className={`px-8 py-3 rounded-md shadow-md font-bold flex items-center gap-2 transition-all ${filteredItems.length === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105'}`}
                >
                    <RefreshCw size={20} /> CALCULAR PLANO DE CORTE
                </button>
            </div>
          </div>
        )}

        {/* --- TAB: INVENTORY --- */}
        {activeTab === 'inventory' && (
           <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-700">Estoque de Pontas (Sobras)</h2>
                    <p className="text-sm text-slate-500">Sobras agrupadas por tamanho. Total de peças: <span className="font-bold text-slate-800">{inventory.reduce((acc, i) => acc + i.qty, 0)}</span></p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {/* Input file escondido para restauração */}
                    <input 
                        ref={inventoryInputRef}
                        type="file" 
                        accept=".json"
                        onChange={importInventoryJSON}
                        className="hidden" 
                    />

                    {/* BACKUP BUTTONS */}
                    <div className="flex items-center gap-2 border-r pr-2 mr-2">
                        <button onClick={exportInventoryJSON} className="flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-md hover:bg-slate-200 text-xs font-semibold" title="Baixar arquivo de dados para backup">
                            <FolderDown size={14} /> Backup (JSON)
                        </button>
                        <button onClick={handleRestoreClick} className="flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-md hover:bg-slate-200 text-xs font-semibold" title="Restaurar dados de um arquivo">
                            <FolderUp size={14} /> Restaurar
                        </button>
                    </div>
                    
                    <button onClick={exportInventoryPDF} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-md hover:bg-indigo-100 text-xs font-semibold">
                        <Printer size={14} /> Relatório PDF
                    </button>
                    <button onClick={clearInventory} className="text-red-500 text-sm hover:underline px-2">Zerar</button>
                    <button onClick={openAddStockModal} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm">
                        <Plus size={16} /> Adicionar
                    </button>
                  </div>
              </div>
              
              {/* --- ABAS DE BITOLA (INVENTORY) --- */}
              {renderBitolaTabs(activeInventoryBitola, setActiveInventoryBitola, BITOLAS_COMERCIAIS)}

              <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-slate-200 rounded-b-lg">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-yellow-50 sticky top-0">
                        <tr>
                            <th className="px-4 py-3">Bitola (mm)</th>
                            <th className="px-4 py-3">Qtd</th>
                            <th className="px-4 py-3">Comp. (cm)</th>
                            <th className="px-4 py-3">Origem</th>
                            <th className="px-4 py-3 text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(() => {
                            // Filtro por aba
                            const displayedInventory = activeInventoryBitola === 'todas'
                                ? inventory
                                : inventory.filter(i => Math.abs(i.bitola - parseFloat(activeInventoryBitola)) < 0.01);
                            
                            if (displayedInventory.length === 0) {
                                return (
                                    <tr><td colSpan="5" className="text-center py-8 text-slate-400">
                                        {activeInventoryBitola === 'todas' 
                                            ? "Nenhuma ponta no estoque." 
                                            : `Nenhuma ponta de ${parseFloat(activeInventoryBitola).toFixed(1)}mm no estoque.`}
                                    </td></tr>
                                );
                            }

                            return displayedInventory.sort((a,b) => b.bitola - a.bitola).map(item => (
                                <tr key={item.id} className="border-b border-slate-100 hover:bg-yellow-50">
                                    <td className="px-4 py-2">
                                        <select 
                                            value={item.bitola} 
                                            onChange={(e) => updateInventoryItem(item.id, 'bitola', parseFloat(e.target.value))}
                                            className="w-24 p-1 border rounded bg-transparent"
                                        >
                                            {BITOLAS_COMERCIAIS.map(b => (
                                                <option key={b} value={b}>{b.toFixed(1)}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-2">
                                        <input 
                                            type="number" 
                                            value={item.qty} 
                                            onChange={(e) => updateInventoryItem(item.id, 'qty', parseInt(e.target.value))}
                                            className="w-20 p-1 border rounded bg-transparent font-bold text-slate-700"
                                            min="1"
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input 
                                            type="number" 
                                            value={item.length} 
                                            onChange={(e) => updateInventoryItem(item.id, 'length', parseFloat(e.target.value))}
                                            className="w-24 p-1 border rounded bg-transparent font-semibold"
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-xs text-slate-400 uppercase">
                                        {item.source || 'Manual'}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <button onClick={() => removeInventoryItem(item.id)} className="text-red-400 hover:text-red-600">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        })()}
                    </tbody>
                </table>
              </div>
           </div>
        )}

        {/* --- MODAL DE ADICIONAR ITEM AO ESTOQUE --- */}
        {showAddStockModal && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className="text-lg font-bold text-slate-800">Adicionar Ponta ao Estoque</h3>
                        <button onClick={() => setShowAddStockModal(false)} className="text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Bitola (mm)</label>
                            <select 
                                value={newStockItemData.bitola}
                                onChange={(e) => setNewStockItemData({...newStockItemData, bitola: e.target.value})}
                                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            >
                                {BITOLAS_COMERCIAIS.map(b => (
                                    <option key={b} value={b}>{b.toFixed(1)} mm</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Comprimento (cm)</label>
                                <input 
                                    type="number"
                                    value={newStockItemData.length}
                                    onChange={(e) => setNewStockItemData({...newStockItemData, length: e.target.value})}
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    min="1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Quantidade</label>
                                <input 
                                    type="number"
                                    value={newStockItemData.qty}
                                    onChange={(e) => setNewStockItemData({...newStockItemData, qty: e.target.value})}
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    min="1"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-2">
                        <button 
                            onClick={() => setShowAddStockModal(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={confirmAddStockItem}
                            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
                        >
                            Salvar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- MODAL DE ADICIONAR ITEM MANUAL (INPUT) --- */}
        {showManualInputModal && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className="text-lg font-bold text-slate-800">Adicionar Item Manual</h3>
                        <button onClick={() => setShowManualInputModal(false)} className="text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Bitola (mm)</label>
                            <select 
                                value={newManualItemData.bitola}
                                onChange={(e) => setNewManualItemData({...newManualItemData, bitola: e.target.value})}
                                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            >
                                {BITOLAS_COMERCIAIS.map(b => (
                                    <option key={b} value={b}>{b.toFixed(1)} mm</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Comprimento (cm)</label>
                                <input 
                                    type="number"
                                    value={newManualItemData.length}
                                    onChange={(e) => setNewManualItemData({...newManualItemData, length: e.target.value})}
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    min="1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Quantidade</label>
                                <input 
                                    type="number"
                                    value={newManualItemData.qty}
                                    onChange={(e) => setNewManualItemData({...newManualItemData, qty: e.target.value})}
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    min="1"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-2">
                        <button 
                            onClick={() => setShowManualInputModal(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={confirmAddManualItem}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                        >
                            Adicionar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- TAB: RESULTS --- */}
        {activeTab === 'results' && results && (
            <div className="space-y-8 animate-fade-in pb-8">
                
                <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex-wrap gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-indigo-900">Plano de Corte Gerado</h2>
                        <p className="text-sm text-indigo-700">Barras idênticas foram agrupadas.</p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <button 
                            onClick={generatePDF}
                            className="bg-white text-indigo-700 border border-indigo-200 px-4 py-2 rounded shadow hover:bg-indigo-50 flex items-center gap-2"
                        >
                            <Printer size={18} /> Baixar PDF
                        </button>
                        <button 
                            onClick={consolidateLeftovers}
                            className="bg-indigo-600 text-white px-6 py-2 rounded shadow hover:bg-indigo-700 flex items-center gap-2"
                        >
                            <Save size={18} /> Salvar Sobras
                        </button>
                        <div className="w-px h-8 bg-indigo-200 mx-2"></div>
                        <button 
                            onClick={clearResults}
                            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded shadow hover:bg-red-100 flex items-center gap-2"
                            title="Descartar este resultado"
                        >
                            <Eraser size={18} /> Limpar
                        </button>
                    </div>
                </div>
                
                {/* --- ABAS DE BITOLA (RESULTS) --- */}
                {/* Calcula quais bitolas realmente tem resultados para mostrar nas abas */}
                {(() => {
                    const resultBitolas = results.map(r => parseFloat(r.bitola)).sort((a,b) => a-b);
                    return renderBitolaTabs(activeResultsBitola, setActiveResultsBitola, resultBitolas);
                })()}

                {/* --- CONTEÚDO RESULTS FILTRADO --- */}
                {(() => {
                    const displayedResults = activeResultsBitola === 'todas'
                        ? results
                        : results.filter(group => Math.abs(parseFloat(group.bitola) - parseFloat(activeResultsBitola)) < 0.01);
                    
                    if (displayedResults.length === 0) {
                         return <div className="text-center text-slate-500 py-12">Nenhum resultado para esta bitola.</div>;
                    }

                    return displayedResults.map((group, gIdx) => {
                        const totalBars = group.bars.reduce((acc, b) => acc + b.count, 0);
                        return (
                            <div key={gIdx} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                                <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex justify-between">
                                    <h3 className="font-bold text-lg text-slate-800">Bitola: {group.bitola}mm</h3>
                                    <span className="text-sm text-slate-500">{totalBars} barras necessárias</span>
                                </div>
                                <div className="p-6 space-y-6">
                                    {group.bars.map((bar, bIdx) => (
                                        <div key={bIdx} className="flex flex-col gap-1 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                                            <div className="flex justify-between text-sm text-slate-600 mb-1 items-center">
                                                <div className="flex items-center gap-3">
                                                    <span className="bg-slate-800 text-white font-bold px-3 py-1 rounded-full text-xs">
                                                        {bar.count}x
                                                    </span>
                                                    <span className="font-semibold uppercase tracking-wider flex items-center gap-1 text-xs">
                                                        {bar.type === 'nova' ? (
                                                            <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">Barra Nova (12m)</span>
                                                        ) : (
                                                            <span className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">Ponta Estoque ({bar.originalLength}cm)</span>
                                                        )}
                                                    </span>
                                                </div>
                                                <span className="font-mono text-xs">Sobra: <span className={bar.remaining > 100 ? "text-green-600 font-bold" : "text-slate-600"}>{bar.remaining.toFixed(1)}cm</span></span>
                                            </div>
                                            <div className="h-14 w-full bg-slate-200 rounded overflow-hidden flex border border-slate-300 relative">
                                                {bar.cuts.map((cut, cIdx) => {
                                                    const widthPerc = (cut / bar.originalLength) * 100;
                                                    return (
                                                        <div 
                                                            key={cIdx} 
                                                            style={{ width: `${widthPerc}%` }}
                                                            className="h-full bg-blue-500 border-r border-white flex flex-col items-center justify-center text-white text-xs overflow-hidden whitespace-nowrap hover:bg-blue-600 transition-colors relative group"
                                                            title={`Cortar peça de ${cut}cm`}
                                                        >
                                                            <span className="font-bold text-sm">{cut}</span>
                                                            <span className="text-[10px] opacity-75">cm</span>
                                                        </div>
                                                    )
                                                })}
                                                <div className="flex-1 bg-slate-300 pattern-diagonal-lines flex items-center justify-center">
                                                    {bar.remaining > 10 && <span className="text-xs text-slate-500 italic font-medium">{bar.remaining.toFixed(0)}cm</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    });
                })()}
            </div>
        )}

      </main>
      <style>{`
        .pattern-diagonal-lines {
            background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.5) 5px, rgba(255,255,255,0.5) 10px);
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default OtimizadorCorteAco;
