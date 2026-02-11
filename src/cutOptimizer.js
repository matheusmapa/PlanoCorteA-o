// src/cutOptimizer.js
import { generateId } from './pdfProcessor';

export const calculateCutPlan = (items, inventory, barraPadrao = 1200, perdaCorte = 0) => {
    const itemsByBitola = {};
    const inventoryByBitola = {};

    // Expande a demanda
    items.forEach(item => {
        if (!item.bitola) return;
        if (!itemsByBitola[item.bitola]) itemsByBitola[item.bitola] = [];
        for (let i = 0; i < item.qty; i++) {
            itemsByBitola[item.bitola].push({ 
                ...item, 
                realId: `${item.id}-${i}`,
                // Garantimos que os metadados estão aqui
                details: {
                    elemento: item.elemento || '',
                    posicao: item.posicao || '',
                    os: item.os || '',
                    origin: item.origin || ''
                }
            });
        }
    });

    // Expande o estoque
    inventory.forEach(inv => {
        if (!inventoryByBitola[inv.bitola]) inventoryByBitola[inv.bitola] = [];
        const qtdDisponivel = inv.qty || 1; 
        for(let i=0; i < qtdDisponivel; i++) {
            inventoryByBitola[inv.bitola].push({ ...inv, virtualId: `${inv.id}_copy_${i}`, used: false });
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

            // Lógica de encaixe (Best Fit)
            for (let i = 0; i < barsUsed.length; i++) {
                const bar = barsUsed[i];
                if (bar.remaining >= piece.length + perdaCorte) {
                    const waste = bar.remaining - (piece.length + perdaCorte);
                    if (waste < minWaste) {
                        minWaste = waste;
                        bestBarIndex = i;
                    }
                }
            }

            // Define o objeto do corte com os detalhes
            const cutObject = {
                length: piece.length,
                details: piece.details // Carrega P101, OS, etc
            };

            if (bestBarIndex !== -1) {
                barsUsed[bestBarIndex].cuts.push(cutObject);
                barsUsed[bestBarIndex].remaining -= (piece.length + perdaCorte);
                fitted = true;
            } else {
                // Tenta Estoque
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
                        cuts: [cutObject], // Array de objetos agora
                        id: stockList[bestStockIndex].id
                    });
                    fitted = true;
                } else {
                    // Barra Nova
                    barsUsed.push({
                        type: 'nova',
                        originalLength: barraPadrao,
                        remaining: barraPadrao - piece.length - perdaCorte,
                        cuts: [cutObject], // Array de objetos agora
                        id: 'new-' + generateId()
                    });
                }
            }
        });

        // Agrupamento Visual (Barras Idênticas)
        const groupedBars = [];
        barsUsed.forEach(bar => {
            // Ordena os cortes por tamanho para criar a assinatura visual
            const sortedCuts = [...bar.cuts].sort((a,b) => b.length - a.length);
            
            // A assinatura agora usa apenas o tamanho para agrupar visualmente, 
            // mas guardamos TODOS os detalhes de cada barra individual
            const signature = `${bar.type}-${bar.originalLength}-${sortedCuts.map(c => c.length).join(',')}`;
            
            const existingGroup = groupedBars.find(g => g.signature === signature);
            
            // Aqui tem um pulo do gato: Se agruparmos 10 barras iguais, precisamos guardar os detalhes das 10 barras.
            // Para simplificar a visualização, vamos agrupar, mas no detalhe expandido teríamos as etiquetas.
            if (existingGroup) {
                existingGroup.count++;
                // Adiciona os detalhes dos cortes dessa barra nova ao grupo existente
                existingGroup.allCutsDetails.push(sortedCuts);
            } else {
                groupedBars.push({ 
                    ...bar, 
                    cuts: sortedCuts, // Cortes ordenados (objetos)
                    count: 1, 
                    signature: signature,
                    allCutsDetails: [sortedCuts] // Array de Arrays de cortes
                });
            }
        });

        finalResult.push({ bitola: bitola, bars: groupedBars });
    });

    return finalResult;
};
