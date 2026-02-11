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
      
      // Melhoramos a extração para manter um pouco mais da estrutura visual
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + " |PAGE_BREAK| ";
  }
  return fullText;
};

// --- PARSER INTELIGENTE POR BLOCOS ---
export const parseTextToItems = (text, fileName) => {
    const extracted = [];
    
    // 1. Tentar descobrir o NOME DO PROJETO (Localizador)
    // Procura por "Resumo Geral da Entrega: XXXX" ou "LIVING-MA.114" no cabeçalho
    let projectMatch = text.match(/LIVING-[A-Z0-9.]+/i) || text.match(/Obra:\s*([^\s|]+)/i);
    const projectName = projectMatch ? projectMatch[0].trim() : fileName.replace('.pdf', '');

    // 2. Limpeza básica para padronizar
    let cleanText = text.replace(/\s+/g, ' '); // Remove quebras de linha e espaços duplos

    // 3. Estratégia: Dividir o texto em blocos onde cada bloco começa com "Elemento"
    // O PDF lista assim: "Elemento P101 ... Posição 07 ... OS 1"
    const blocks = cleanText.split(/Elemento/gi);

    // Ignora o primeiro pedaço (cabeçalho antes do primeiro elemento)
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];

        // --- EXTRAÇÃO DOS CAMPOS COM REGEX ---
        
        // Nome do Elemento (pega a primeira palavra logo após a quebra)
        const elementoMatch = block.match(/^[\s:]*([A-Z0-9-]+)/i);
        const elemento = elementoMatch ? elementoMatch[1] : "Desconhecido";

        // Bitola (procura "Bitola (mm)" seguido de numero)
        const bitolaMatch = block.match(/Bitola\s*\(mm\)\s*([\d,.]+)/i) || block.match(/([\d,.]+)\s*Bitola/i);
        
        // Quantidade (pode ser "Qtde" ou "Rep. x Var.")
        // Prioridade para Rep. x Var. se existir, pois geralmente define a quantidade total em alguns layouts
        let qty = 0;
        const repVarMatch = block.match(/Rep\.\s*x\s*Var\.\s*(\d+)/i);
        const qtdeMatch = block.match(/Qtde\s*[:.]?\s*(\d+)/i);

        if (repVarMatch) {
            qty = parseInt(repVarMatch[1]);
        } else if (qtdeMatch) {
            qty = parseInt(qtdeMatch[1]);
        }

        // Comprimento (procura "Compr. (cm)" seguido de numero)
        const comprMatch = block.match(/Compr\.\s*\(cm\)\s*(\d+)/i);
        
        // Posição (Posição 07)
        const posMatch = block.match(/Posição\s*([A-Z0-9]+)/i);
        const posicao = posMatch ? posMatch[1] : "?";

        // OS (OS 58)
        const osMatch = block.match(/OS\s*(\d+)/i);
        const os = osMatch ? osMatch[1] : "";

        // --- VALIDAÇÃO E ADIÇÃO ---
        if (bitolaMatch && qty > 0 && comprMatch) {
            const bitolaVal = parseFloat(bitolaMatch[1].replace(',', '.'));
            const length = parseFloat(comprMatch[1]);

            // Filtra bitolas válidas e tamanhos lógicos
            if (BITOLAS_COMERCIAIS.includes(bitolaVal) && length > 0) {
                extracted.push({
                    id: generateId(),
                    origin: projectName, // Agora usamos o Nome do Projeto extraído
                    bitola: bitolaVal,
                    qty: qty,
                    length: length,
                    selected: true,
                    // Novos campos metadados
                    elemento: elemento,
                    posicao: posicao,
                    os: os
                });
            }
        }
    }

    return extracted;
};
