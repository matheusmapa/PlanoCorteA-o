import React, { useState, useEffect } from 'react';
import { 
  BarChart3, ArrowRight, ArrowLeft, Trash2, CheckCircle2, 
  AlertTriangle, Package, Scissors, Repeat, Scale, TrendingUp, 
  PieChart, Factory
} from 'lucide-react';

const PlanEvaluator = ({ savedPlans, onDeletePlan }) => {
  const [comparingPlans, setComparingPlans] = useState([]);

  useEffect(() => {
    if (savedPlans) setComparingPlans(savedPlans);
  }, [savedPlans]);

  // --- CÁLCULO DE MÉTRICAS (Refinado) ---
  const calculateMetrics = (results) => {
    let metrics = {
      totalBars12m: 0,      
      totalStockBars: 0,    
      usedLengthNew: 0,     
      rawLengthNew: 0,
      usedLengthStock: 0, // Novo: Comprimento total usado do estoque
      rawLengthStock: 0,  // Novo: Comprimento total bruto do estoque
      totalCutsCount: 0,    
      scrapTotal: 0,        
      usableLeftover: 0,    
      totalBarsCount: 0,
      uniqueBitolas: new Set(),
      totalPatterns: 0,
      totalPartsLength: 0 // Comprimento líquido das peças
    };

    if (!results) return metrics;

    results.forEach(group => {
      metrics.uniqueBitolas.add(group.bitola);
      
      group.bars.forEach(barGroup => {
        const count = barGroup.count;
        const cutsLength = barGroup.cuts.reduce((acc, cut) => acc + (typeof cut === 'number' ? cut : cut.length), 0);
        
        metrics.totalBarsCount += count;
        metrics.totalPatterns += 1;
        metrics.totalCutsCount += (barGroup.cuts.length * count);
        metrics.totalPartsLength += (cutsLength * count);

        if (barGroup.type === 'nova') {
          metrics.totalBars12m += count;
          metrics.rawLengthNew += (barGroup.originalLength * count);
          metrics.usedLengthNew += (cutsLength * count);
        } else {
          metrics.totalStockBars += count;
          metrics.rawLengthStock += (barGroup.originalLength * count);
          metrics.usedLengthStock += (cutsLength * count);
        }

        const totalRemaining = barGroup.remaining * count;
        if (barGroup.remaining < 30) {
          metrics.scrapTotal += totalRemaining;
        } else if (barGroup.remaining >= 100) {
          metrics.usableLeftover += totalRemaining;
        }
      });
    });

    // KPI 1: Eficiência de Compra (Yield sobre material novo)
    metrics.purchaseEfficiency = metrics.rawLengthNew > 0 
      ? (metrics.usedLengthNew / metrics.rawLengthNew) * 100 
      : metrics.totalStockBars > 0 ? 100 : 0;

    // KPI 2: Mix de Abastecimento (% do projeto que veio de estoque)
    const totalRawInput = metrics.rawLengthNew + metrics.rawLengthStock;
    metrics.stockMixPercent = totalRawInput > 0 
      ? (metrics.rawLengthStock / totalRawInput) * 100 
      : 0;

    // KPI 3: Repetibilidade
    metrics.repeatabilityScore = metrics.totalPatterns > 0 
      ? (metrics.totalBarsCount / metrics.totalPatterns) 
      : 0;

    return metrics;
  };

  const movePlan = (index, direction) => {
    const newOrder = [...comparingPlans];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newOrder.length) {
      [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
      setComparingPlans(newOrder);
    }
  };

  return (
    <div className="space-y-6 p-4 animate-in fade-in">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="text-indigo-600" /> Comparador Avançado
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Analise a eficiência financeira (compra) e operacional (estoque) lado a lado.
        </p>
      </div>

      {comparingPlans.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-50 border border-dashed rounded-lg">
          Nenhum plano salvo para comparar.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6 items-start custom-scrollbar">
          {comparingPlans.map((plan, index) => {
            const m = calculateMetrics(plan.results);
            const isEfficient = m.purchaseEfficiency >= 92;
            const usesStock = m.totalStockBars > 0;

            return (
              <div key={plan.id} className="min-w-[340px] w-[340px] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col transition-transform hover:scale-[1.01]">
                
                {/* HEADER */}
                <div className={`p-4 border-b ${isEfficient ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-800 truncate pr-2" title={plan.name}>{plan.name}</h3>
                    <div className="flex gap-1">
                      <button onClick={() => movePlan(index, -1)} disabled={index === 0} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowLeft size={16}/></button>
                      <button onClick={() => movePlan(index, 1)} disabled={index === comparingPlans.length - 1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowRight size={16}/></button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 flex justify-between items-center">
                    <span className="flex items-center gap-1"><CheckCircle2 size={12}/> {plan.createdAt?.toDate().toLocaleDateString()}</span>
                    <button onClick={(e) => onDeletePlan(plan.id, e)} className="text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={12}/> Excluir</button>
                  </div>
                </div>

                <div className="p-4 space-y-5 text-sm">
                  
                  {/* 1. KPI PRINCIPAL: APROVEITAMENTO DE COMPRA */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Eficiência de Compra</div>
                        <div className="text-[10px] text-slate-400">(Aço Novo)</div>
                    </div>
                    <div className="text-right">
                        <div className={`text-3xl font-black ${isEfficient ? 'text-green-600' : 'text-amber-600'}`}>
                            {m.purchaseEfficiency.toFixed(1)}%
                        </div>
                    </div>
                  </div>

                  {/* 2. MATRIZ DE ABASTECIMENTO (VISUAL BAR) */}
                  <div className="space-y-2">
                      <div className="flex justify-between items-end">
                          <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><PieChart size={12}/> Matriz de Insumos</h4>
                          {usesStock && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Usa Estoque</span>}
                      </div>
                      
                      {/* Barra Visual */}
                      <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex">
                          <div style={{width: `${100 - m.stockMixPercent}%`}} className="h-full bg-indigo-500" title="Aço Novo"></div>
                          <div style={{width: `${m.stockMixPercent}%`}} className="h-full bg-amber-400" title="Estoque"></div>
                      </div>
                      
                      {/* Legenda */}
                      <div className="flex justify-between text-[11px] font-medium text-slate-600">
                          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> {100 - m.stockMixPercent.toFixed(0)}% Novo</span>
                          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400"></div> {m.stockMixPercent.toFixed(0)}% Estoque</span>
                      </div>
                  </div>

                  {/* 3. DADOS DE CONSUMO (GRID) */}
                  <div className="grid grid-cols-2 gap-3">
                      <div className="bg-indigo-50 p-3 rounded border border-indigo-100">
                          <div className="flex items-center gap-1 mb-1 text-indigo-800">
                              <Package size={14} /> <span className="text-xs font-bold uppercase">Compras</span>
                          </div>
                          <div className="text-xl font-bold text-indigo-900">{m.totalBars12m} <span className="text-xs font-normal opacity-70">brs</span></div>
                          <div className="text-[10px] text-indigo-600 mt-0.5">{(m.rawLengthNew/100).toFixed(0)}m de aço novo</div>
                      </div>
                      
                      <div className={`p-3 rounded border ${usesStock ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                          <div className={`flex items-center gap-1 mb-1 ${usesStock ? 'text-amber-800' : 'text-slate-500'}`}>
                              <TrendingUp size={14} /> <span className="text-xs font-bold uppercase">Estoque</span>
                          </div>
                          <div className={`text-xl font-bold ${usesStock ? 'text-amber-900' : 'text-slate-400'}`}>{m.totalStockBars} <span className="text-xs font-normal opacity-70">un</span></div>
                          <div className={`text-[10px] mt-0.5 ${usesStock ? 'text-amber-700' : 'text-slate-400'}`}>{(m.rawLengthStock/100).toFixed(0)}m recuperados</div>
                      </div>
                  </div>

                  {/* 4. OPERACIONAL & SOBRAS */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Eficiência Operacional</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                         <div className="flex justify-between items-center">
                            <span className="text-slate-600 flex items-center gap-1"><Scissors size={12}/> Golpes:</span>
                            <span className="font-bold text-slate-800">{m.totalCutsCount}</span>
                         </div>
                         <div className="flex justify-between items-center" title="Barras processadas por setup">
                            <span className="text-slate-600 flex items-center gap-1"><Repeat size={12}/> Repet.:</span>
                            <span className="font-bold text-slate-800">{m.repeatabilityScore.toFixed(1)}</span>
                         </div>
                    </div>
                  </div>

                  {/* 5. SOBRAS (HIGHLIGHT) */}
                   <div className="flex gap-2 text-center pt-1">
                        <div className="flex-1 bg-red-50 p-2 rounded border border-red-100">
                            <div className="text-[9px] text-red-500 font-bold uppercase">Sucata (&lt;30cm)</div>
                            <div className="font-bold text-red-700">{(m.scrapTotal / 100).toFixed(1)}m</div>
                        </div>
                        <div className="flex-1 bg-green-50 p-2 rounded border border-green-100">
                            <div className="text-[9px] text-green-600 font-bold uppercase">Retalho (&gt;100cm)</div>
                            <div className="font-bold text-green-800">{(m.usableLeftover / 100).toFixed(1)}m</div>
                        </div>
                    </div>

                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`.custom-scrollbar::-webkit-scrollbar { height: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }`}</style>
    </div>
  );
};

export default PlanEvaluator;
