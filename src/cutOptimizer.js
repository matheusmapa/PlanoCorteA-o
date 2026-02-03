// src/cutOptimizer.js
import { generateId } from './pdfProcessor';

export const calculateCutPlan = (items, inventory, barraPadrao = 1200, perdaCorte = 0) => {
    // 1. Preparação dos dados (Agrupamento por bitola)
    const itemsByBitola = {};
    const inventoryByBitola = {};

    // Expande a demanda (items) baseada na quantidade (qty)
    items.forEach(item => {
        // Se o item não tiver bitola definida ou não for válido, ignoramos (segurança)
        if (!item.bitola) return;
        
        if (!itemsByBitola[item.bitola]) itemsByBitola[item.bitola] = [];
        for (let i = 0; i < item.qty; i++) {
            itemsByBitola[item.bitola].push({ ...item, realId: `${item.id}-${i}` });
        }
    });

    // Expande o estoque (inventory) baseada na quantidade (qty)
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

    // 2. Execução do Algoritmo de Corte
    Object.keys(itemsByBitola).forEach(bitola => {
        // Ordena demanda do maior para o menor (estratégia Best Fit Decreasing geralmente é melhor)
        const demandList = itemsByBitola[bitola].sort((a, b) => b.length - a.length);
        
        // Ordena estoque do menor para o maior (tentar gastar as pontas menores primeiro)
        const stockList = inventoryByBitola[bitola] ? inventoryByBitola[bitola].sort((a, b) => a.length - b.length) : [];

        const barsUsed = [];

        demandList.forEach(piece => {
            let fitted = false;
            let bestBarIndex = -1;
            let minWaste = Infinity;

            // A) Tenta encaixar em barras já iniciadas (que sobraram de cortes anteriores neste loop)
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

            if (bestBarIndex !== -1) {
                barsUsed[bestBarIndex].cuts.push(piece.length);
                barsUsed[bestBarIndex].remaining -= (piece.length + perdaCorte);
                fitted = true;
            }

            // B) Se não coube nas iniciadas, tenta pegar uma ponta do ESTOQUE
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
                        remaining: stockList[bestStockIndex].length - piece.length - perdaCorte,
                        cuts: [piece.length],
                        id: stockList[bestStockIndex].id
                    });
                    fitted = true;
                }
            }

            // C) Se não coube no estoque, pega uma BARRA NOVA
            if (!fitted) {
                barsUsed.push({
                    type: 'nova',
                    originalLength: barraPadrao,
                    remaining: barraPadrao - piece.length - perdaCorte,
                    cuts: [piece.length],
                    id: 'new-' + generateId()
                });
            }
        });

        // 3. Agrupamento visual (Barras idênticas)
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

    return finalResult;
};
