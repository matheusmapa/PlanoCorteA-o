import React, { useState, useEffect } from 'react';
import { 
  BarChart3, ArrowRight, ArrowLeft, Trash2, CheckCircle2, 
  AlertTriangle, Package, Scissors, Repeat, Scale 
} from 'lucide-react';

const PlanEvaluator = ({ savedPlans, onDeletePlan }) => {
  // Estado para armazenar os planos selecionados para comparação
  const [comparingPlans, setComparingPlans] = useState([]);

  // Carrega todos os planos inicialmente
  useEffect(() => {
    if (savedPlans) {
      setComparingPlans(savedPlans);
    }
  }, [savedPlans]);

  // --- LÓGICA DE CÁLCULO DAS MÉTRICAS ---
  const calculateMetrics = (results) => {
    let metrics = {
      totalBars12m: 0,      // Qtd Barras Novas
      totalStockBars: 0,    // Qtd Pontas de Estoque
      usedLengthNew: 0,     // Comprimento usado de barras novas
      usedLengthStock: 0,   // Comprimento usado de estoque
      totalCutsCount: 0,    // Total de golpes (cortes)
      scrapTotal: 0,        // Sucata (< 30cm)
      usableLeftover: 0,    // Sobra Útil (> 100cm)
      wasteTotal: 0,        // Perda total (cm)
      totalPartsLength: 0,  // Soma dos comprimentos das peças cortadas
      totalRawLength: 0,    // Soma do material bruto usado
      uniqueBitolas: new Set(),
      totalPatterns: 0,     // Grupos de corte (assinaturas)
      totalBarsCount: 0     // Contagem total de barras
    };

    if (!results) return metrics;

    results.forEach(group => {
      metrics.uniqueBitolas.add(group.bitola);
      
      group.bars.forEach(barGroup => {
        const count = barGroup.count;
        const barLength = barGroup.originalLength;
        const cutsLength = barGroup.cuts.reduce((a, b) => a + b, 0);
        const remaining = barGroup.remaining;
        
        // 1. Quantidades e Origem
        metrics.totalBarsCount += count;
        metrics.totalPatterns += 1; // Cada grupo visual é um padrão
        metrics.totalRawLength += (barLength * count);
        metrics.totalPartsLength += (cutsLength * count);

        if (barGroup.type === 'nova') {
          metrics.totalBars12m += count;
          metrics.usedLengthNew += (barLength * count);
        } else {
          metrics.totalStockBars += count;
          metrics.usedLengthStock += (barLength * count);
        }

        // 2. Cortes (Golpes)
        metrics.totalCutsCount += (barGroup.cuts.length * count);

        // 3. Classificação da Sobra (Sucata vs Útil)
        // Definição: < 30cm é lixo, > 100cm é útil. Entre 30 e 100 é "sobra técnica" (ainda perda)
        const totalRemaining = remaining * count;
        
        if (remaining < 30) {
          metrics.scrapTotal += totalRemaining;
        } else if (remaining >= 100) {
          metrics.usableLeftover += totalRemaining;
        } else {
          // Consideramos sucata técnica se não for útil
          metrics.wasteTotal += totalRemaining; 
        }
      });
    });

    // Cálculos Finais de Porcentagem
    metrics.globalUtilization = metrics.totalRawLength > 0 
      ? (metrics.totalPartsLength / metrics.totalRawLength) * 100 
      : 0;

    metrics.originNewPercent = metrics.totalRawLength > 0
      ? (metrics.usedLengthNew / metrics.totalRawLength) * 100
      : 0;

    // Repetibilidade: Média de barras por padrão (quanto maior, menos setup de máquina)
    metrics.repeatabilityScore = metrics.totalPatterns > 0 
      ? (metrics.totalBarsCount / metrics.totalPatterns) 
      : 0;

    return metrics;
  };

  // --- FUNÇÕES DE INTERFACE ---
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
          <BarChart3 className="text-indigo-600" /> Comparador de Cenários
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Analise a eficiência técnica e logística dos seus planos de corte.
        </p>
      </div>

      {comparingPlans.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-50 border border-dashed rounded-lg">
          Nenhum plano salvo para comparar. Salve alguns resultados na aba "Resultado".
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6 items-start custom-scrollbar">
          {comparingPlans.map((plan, index) => {
            const m = calculateMetrics(plan.results);
            const isEfficient = m.globalUtilization >= 92;

            return (
              <div key={plan.id} className="min-w-[320px] w-[320px] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col transition-transform hover:scale-[1.01]">
                
                {/* CABEÇALHO DO CARD */}
                <div className={`p-4 border-b ${isEfficient ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-800 truncate pr-2" title={plan.name}>{plan.name}</h3>
                    <div className="flex gap-1">
                      <button onClick={() => movePlan(index, -1)} disabled={index === 0} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowLeft size={16}/></button>
                      <button onClick={() => movePlan(index, 1)} disabled={index === comparingPlans.length - 1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowRight size={16}/></button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 flex justify-between">
                    <span>{plan.createdAt?.toDate().toLocaleDateString()}</span>
                    <button onClick={(e) => onDeletePlan(plan.id, e)} className="text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={12}/> Excluir</button>
                  </div>
                </div>

                {/* CORPO DE MÉTRICAS */}
                <div className="p-4 space-y-4 text-sm">
                  
                  {/* 1. Aproveitamento Global */}
                  <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wide">Aproveitamento</span>
                    <div className={`text-3xl font-black mt-1 ${isEfficient ? 'text-green-600' : 'text-amber-600'}`}>
                      {m.globalUtilization.toFixed(1)}%
                    </div>
                    {isEfficient 
                      ? <span className="text-xs text-green-600 font-medium flex items-center justify-center gap-1"><CheckCircle2 size={12}/> Meta Atingida</span> 
                      : <span className="text-xs text-amber-600 font-medium flex items-center justify-center gap-1"><AlertTriangle size={12}/> Abaixo de 92%</span>
                    }
                  </div>

                  {/* 2. Logística (Barras e Golpes) */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1 mb-2">Logística & Trabalho</h4>
                    
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-slate-600"><Package size={14} className="text-blue-500"/> Barras Novas (12m)</span>
                      <span className="font-bold text-slate-800 text-base">{m.totalBars12m} un</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-slate-600"><Scissors size={14} className="text-purple-500"/> Total de Golpes</span>
                      <span className="font-bold text-slate-800">{m.totalCutsCount}</span>
                    </div>

                    <div className="flex justify-between items-center" title="Quantas barras idênticas são processadas por vez (Média)">
                      <span className="flex items-center gap-2 text-slate-600"><Repeat size={14} className="text-indigo-500"/> Repetibilidade</span>
                      <span className="font-bold text-slate-800">{m.repeatabilityScore.toFixed(1)} <span className="text-[10px] text-slate-400">barras/padrão</span></span>
                    </div>

                    <div className="flex justify-between items-center">
                       <span className="flex items-center gap-2 text-slate-600"><Scale size={14} className="text-orange-500"/> Setup (Bitolas)</span>
                       <span className="font-bold text-slate-800">{m.uniqueBitolas.size} tipos</span>
                    </div>
                  </div>

                  {/* 3. Material & Desperdício */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1 mb-2">Material & Sobras</h4>

                    <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-red-50 p-2 rounded border border-red-100">
                            <div className="text-[10px] text-red-600 font-bold uppercase">Sucata Real</div>
                            <div className="font-bold text-red-700">{(m.scrapTotal + m.wasteTotal / 100).toFixed(1)}m</div>
                            <div className="text-[10px] text-red-400">Lixo (&lt;30cm)</div>
                        </div>
                        <div className="bg-green-50 p-2 rounded border border-green-100">
                            <div className="text-[10px] text-green-700 font-bold uppercase">Sobra Útil</div>
                            <div className="font-bold text-green-800">{(m.usableLeftover / 100).toFixed(1)}m</div>
                            <div className="text-[10px] text-green-500">Estoque (&gt;100cm)</div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500">Origem do Aço</span>
                            <span className="font-bold text-slate-700">{m.originNewPercent.toFixed(0)}% Novo / {100 - m.originNewPercent.toFixed(0)}% Retalho</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                            <div style={{width: `${m.originNewPercent}%`}} className="h-full bg-blue-500"></div>
                            <div style={{width: `${100 - m.originNewPercent}%`}} className="h-full bg-amber-400"></div>
                        </div>
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
