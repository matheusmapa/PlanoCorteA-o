import * as pdfjsLib from 'pdfjs-dist';

// --- CORREÇÃO DO ERRO ---
// Em vez de importar localmente (o que quebra no Vercel/Vite), usamos o CDN direto.
// Isso garante que o worker seja carregado sem depender do build do Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

// --- CONSTANTES ---
export const BITOLAS_COMERCIAIS = [4.2, 5.0, 6.3, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 32.0, 40.0];

// --- HELPERS ---
export const generateId = () => {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
};

// --- LEITURA DE PDF ---
export const extractTextFromPDF = async (file) => {
  try {
      const arrayBuffer = await file.arrayBuffer();
      // Usamos a lib importada 'pdfjsLib'
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
  } catch (error) {
      console.error("Erro ao ler PDF:", error);
      throw new Error("Falha ao processar o arquivo PDF. Verifique se é um PDF válido.");
  }
};

// --- PARSER (Lógica de Extração) ---
export const parseTextToItems = (text, fileName) => {
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
