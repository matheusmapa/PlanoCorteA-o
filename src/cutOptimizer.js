// src/cutOptimizer.js
import { generateId } from './pdfProcessor';

export const calculateCutPlan = (items, inventory, barraPadrao = 1200, perdaCorte = 0) => {
    // 1. Preparação dos dados
    const itemsByBitola = {};
    const inventoryByBitola = {};

    items.forEach(item => {
        if (!item.bitola) return;
        if (!itemsByBitola[item.bitola]) itemsByBitola[item.bitola] = [];
        
        // Explode a quantidade em itens individuais
        for (let i = 0; i < item.qty; i++) {
            itemsByBitola[item.bitola].push({ 
                ...item, 
                realId: `${item.id}-${i}`,
                // Salva os detalhes num objeto separado para transportar
                details: {
                    elemento: item.elemento || '',
                    posicao: item.posicao || '',
                    os: item.os || '',
                    origin: item.origin || '' // Localizador
                }
            });
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

    // 2. Otimização
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
                if (bar.remaining >= piece.length + perdaCorte) {
                    const waste = bar.remaining - (piece.length + perdaCorte);
                    if (waste < minWaste) { minWaste = waste; bestBarIndex = i; }
                }
            }

            if (bestBarIndex !== -1) {
                barsUsed[bestBarIndex].cuts.push(piece.length);
                // Guardamos o detalhe sincronizado com o corte
                barsUsed[bestBarIndex].cutsDetails.push(piece.details);
                barsUsed[bestBarIndex].remaining -= (piece.length + perdaCorte);
                fitted = true;
            } else {
                // Tenta Estoque ou Nova
                let bestStockIndex = -1;
                let minStockWaste = Infinity;

                for (let i = 0; i < stockList.length; i++) {
                    if (!stockList[i].used && stockList[i].length >= piece.length) {
                        const waste = stockList[i].length - piece.length;
                        if (waste < minStockWaste) { minStockWaste = waste; bestStockIndex = i; }
                    }
                }

                if (bestStockIndex !== -1) {
                    stockList[bestStockIndex].used = true;
                    barsUsed.push({
                        type: 'estoque',
                        originalLength: stockList[bestStockIndex].length,
                        remaining: stockList[bestStockIndex].length - piece.length - perdaCorte,
                        cuts: [piece.length],
                        cutsDetails: [piece.details], // Array paralelo
                        id: stockList[bestStockIndex].id
                    });
                    fitted = true;
                } else {
                    barsUsed.push({
                        type: 'nova',
                        originalLength: barraPadrao,
                        remaining: barraPadrao - piece.length - perdaCorte,
                        cuts: [piece.length],
                        cutsDetails: [piece.details], // Array paralelo
                        id: 'new-' + generateId()
                    });
                }
            }
        });

        // 3. Agrupamento Visual
        const groupedBars = [];
        
        barsUsed.forEach(bar => {
            // Unificamos Comprimento + Detalhes num objeto único para facilitar
            const combined = bar.cuts.map((len, idx) => ({ 
                length: len, 
                details: bar.cutsDetails[idx] 
            }));
            
            // Ordena do maior para o menor corte
            combined.sort((a, b) => b.length - a.length);

            // Cria assinatura baseada APENAS nos comprimentos (para agrupar visualmente)
            const sortedLengths = combined.map(c => c.length);
            const signature = `${bar.type}-${bar.originalLength}-${sortedLengths.join(',')}`;
            
            const existingGroup = groupedBars.find(g => g.signature === signature);

            if (existingGroup) {
                existingGroup.count++;
                existingGroup.ids.push(bar.id);
                existingGroup.allDetails.push(combined.map(c => c.details));
            } else {
                groupedBars.push({ 
                    ...bar, 
                    cuts: combined, // Objeto completo {length, details}
                    count: 1, 
                    signature: signature, 
                    ids: [bar.id],
                    allDetails: [combined.map(c => c.details)] 
                });
            }
        });

        finalResult.push({ bitola: bitola, bars: groupedBars });
    });

    return finalResult;
};
