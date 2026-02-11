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
      // Concatenamos com espaço para garantir o fluxo contínuo para o Regex
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + " |PAGE_BREAK| ";
  }
  return fullText;
};

// --- PARSER INTELIGENTE ---
export const parseTextToItems = (text, fileName) => {
  const extracted = [];
  
  // 1. Tenta descobrir o NOME DO PROJETO (Localizador)
  let projectMatch = text.match(/LIVING-[A-Z0-9.]+/i) || text.match(/Obra:\s*([^\s|]+)/i) || text.match(/Resumo Geral da Entrega:\s*([^\s]+)/i);
  const projectName = projectMatch ? projectMatch[0].trim() : fileName.replace('.pdf', '');

  // 2. Limpeza LEVE (apenas padronizar espaços)
  // IMPORTANTE: Não remover "CA" ou outras strings que servem de âncora
  let cleanText = text.replace(/\s+/g, ' '); 

  // 3. REGEX DE FLUXO (Captura o bloco inteiro)
  // Padrão: Qtd -> Comp -> Pos -> Bitola -> Aço -> Peso -> OS -> Elemento -> Nome
  // Ex: "28 364 02 6,30 CA50 25,480 63 Elemento P70"
  const mainRegex = /(\d+)\s+(\d+)\s+([A-Z0-9]+)\s+([\d,.]+)\s+([A-Z0-9]+)\s+([\d,.]+)\s+(\d+)\s+Elemento\s+([A-Z0-9-]+)/gi;

  let match;
  while ((match = mainRegex.exec(cleanText)) !== null) {
      const qtd = parseInt(match[1]);
      const length = parseFloat(match[2]);
      const posicao = match[3];
      const bitolaVal = parseFloat(match[4].replace(',', '.'));
      // match[5] é o Aço (ex: CA50)
      // match[6] é o Peso
      const os = match[7];
      const elemento = match[8];

      if (BITOLAS_COMERCIAIS.includes(bitolaVal) && length > 0 && qtd > 0) {
          extracted.push({
              id: generateId(),
              origin: projectName,
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

  // Fallback: Se não encontrou nada com o Regex novo, tenta um padrão simplificado
  // (Útil se o arquivo for apenas uma lista simples sem Elemento/OS)
  if (extracted.length === 0) {
      console.warn("Formato complexo não detectado, tentando padrão simples...");
      // Padrão simples: Bitola... Qtd... Comp... (Lógica legada simplificada)
      const simpleRegex = /Bitola.*?([\d,.]+).*?Qtde.*?(\d+).*?Compr.*?(\d+)/gi;
      let simpleMatch;
      while ((simpleMatch = simpleRegex.exec(cleanText)) !== null) {
           // ... (Implementação de fallback se necessário, mas o foco é o formato novo)
      }
  }

  return extracted;
};
