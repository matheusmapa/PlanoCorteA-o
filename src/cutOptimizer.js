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
                // Salva os detalhes para uso posterior
                details: {
                    elemento: item.elemento || '',
                    posicao: item.posicao || '',
                    os: item.os || '',
                    origin: item.origin || ''
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

            // Tenta encaixar em barras iniciadas
            for (let i = 0; i < barsUsed.length; i++) {
                const bar = barsUsed[i];
                if (bar.remaining >= piece.length + perdaCorte) {
                    const waste = bar.remaining - (piece.length + perdaCorte);
                    if (waste < minWaste) { minWaste = waste; bestBarIndex = i; }
                }
            }

            if (bestBarIndex !== -1) {
                // Adiciona o corte (número) E o detalhe (objeto)
                barsUsed[bestBarIndex].cuts.push(piece.length);
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
                        cutsDetails: [piece.details], // ARRAY NOVO
                        id: stockList[bestStockIndex].id
                    });
                    fitted = true;
                } else {
                    barsUsed.push({
                        type: 'nova',
                        originalLength: barraPadrao,
                        remaining: barraPadrao - piece.length - perdaCorte,
                        cuts: [piece.length],
                        cutsDetails: [piece.details], // ARRAY NOVO
                        id: 'new-' + generateId()
                    });
                }
            }
        });

        // 3. Agrupamento e Ordenação Visual
        const groupedBars = [];
        
        barsUsed.forEach(bar => {
            // Precisamos ordenar os cortes (maior pro menor) MAS manter os detalhes sincronizados
            // Criamos um array temporário combinado para ordenar
            const combined = bar.cuts.map((len, idx) => ({ len, det: bar.cutsDetails[idx] }));
            combined.sort((a, b) => b.len - a.len);

            // Desacopla novamente
            const sortedCuts = combined.map(c => c.len);
            const sortedDetails = combined.map(c => c.det);

            const signature = `${bar.type}-${bar.originalLength}-${sortedCuts.join(',')}`;
            const existingGroup = groupedBars.find(g => g.signature === signature);

            if (existingGroup) {
                existingGroup.count++;
                // Acumula os detalhes de TODAS as barras deste grupo
                existingGroup.allDetails.push(sortedDetails);
            } else {
                groupedBars.push({ 
                    ...bar, 
                    cuts: sortedCuts, 
                    count: 1, 
                    signature: signature,
                    // Inicializa array de detalhes do grupo (Array de Arrays)
                    allDetails: [sortedDetails] 
                });
            }
        });

        finalResult.push({ bitola: bitola, bars: groupedBars });
    });

    return finalResult;
};
