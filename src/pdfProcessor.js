// src/pdfProcessor.js

// --- CONSTANTES ---
export const BITOLAS_COMERCIAIS = [4.2, 5.0, 6.3, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 32.0, 40.0];

// --- HELPERS ---
export const generateId = () => {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
};

// --- LEITURA DE PDF ---
export const extractTextFromPDF = async (file) => {
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
      // Juntamos tudo com espaço para o Regex pegar o fluxo contínuo
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + " |PAGE_BREAK| ";
  }
  return fullText;
};

// --- PARSER INTELIGENTE (REGEX DE FLUXO) ---
export const parseTextToItems = (text, fileName) => {
  const extracted = [];
  
  // 1. Tentar descobrir o NOME DO PROJETO (Localizador)
  // Procura por padrões comuns de cabeçalho
  let projectMatch = text.match(/LIVING-[A-Z0-9.]+/i) || text.match(/Obra:\s*([^\s|]+)/i) || text.match(/Resumo Geral da Entrega:\s*([^\s]+)/i);
  const projectName = projectMatch ? projectMatch[0].trim() : fileName.replace('.pdf', '');

  // 2. Limpeza básica para padronizar espaços e quebras
  // Substituímos quebras de linha reais por espaço para tratar como fluxo contínuo
  let cleanText = text.replace(/\s+/g, ' '); 

  // 3. REGEX PODEROSA
  // Padrão identificado: [Qtde] [Comp] [Pos] [Bit] [Aço] [Peso] [OS] "Elemento" [Nome]
  // Ex: "28 364 02 6,30 CA50 25,480 63 Elemento P70"
  // Grupos:
  // 1: Qtd (Ex: 28)
  // 2: Comprimento (Ex: 364)
  // 3: Posição (Ex: 02 ou 06A)
  // 4: Bitola (Ex: 6,30) - Com vírgula ou ponto
  // 5: Aço (Ex: CA50)
  // 6: Peso (Ex: 25,480)
  // 7: OS (Ex: 63) - Número logo antes da palavra Elemento
  // 8: Nome do Elemento (Ex: P70)
  
  const mainRegex = /(\d+)\s+(\d+)\s+([A-Z0-9]+)\s+([\d,.]+)\s+([A-Z0-9]+)\s+([\d,.]+)\s+(\d+)\s+Elemento\s+([A-Z0-9-]+)/gi;

  let match;
  while ((match = mainRegex.exec(cleanText)) !== null) {
      const qtd = parseInt(match[1]);
      const length = parseFloat(match[2]);
      const posicao = match[3];
      const bitolaVal = parseFloat(match[4].replace(',', '.'));
      // match[5] é o Aço (CA50)
      // match[6] é o Peso
      const os = match[7];
      const elemento = match[8];

      // Validação básica para evitar lixo
      if (BITOLAS_COMERCIAIS.includes(bitolaVal) && length > 0 && qtd > 0) {
          extracted.push({
              id: generateId(),
              origin: projectName, // Campo "Localizador"
              bitola: bitolaVal,
              qty: qtd,
              length: length,
              selected: true,
              // Novos Metadados
              elemento: elemento,
              posicao: posicao,
              os: os
          });
      }
  }

  // Fallback: Se a regex principal não pegar nada (talvez formato diferente), 
  // tenta a lógica antiga simplificada para não deixar o usuário na mão.
  if (extracted.length === 0) {
      console.warn("Regex principal falhou, tentando fallback simples...");
      // ... (Lógica antiga poderia vir aqui, mas vamos confiar na nova por enquanto)
  }

  return extracted;
};
