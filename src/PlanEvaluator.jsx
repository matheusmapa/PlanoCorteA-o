import React, { useState, useEffect } from 'react';
import { 
  BarChart3, ArrowRight, ArrowLeft, Trash2, CheckCircle2, 
  AlertTriangle, Package, Scissors, Repeat, Scale, TrendingUp, DollarSign
} from 'lucide-react';

const PlanEvaluator = ({ savedPlans, onDeletePlan }) => {
  const [comparingPlans, setComparingPlans] = useState([]);

  useEffect(() => {
    if (savedPlans) setComparingPlans(savedPlans);
  }, [savedPlans]);

  // --- NOVA LÓGICA DE MÉTRICAS ---
  const calculateMetrics = (results) => {
    let metrics = {
      totalBars12m: 0,      
      totalStockBars: 0,    
      usedLengthNew: 0,     
      rawLengthNew: 0,      // Soma apenas das barras novas
      totalCutsCount: 0,    
      scrapTotal: 0,        
      usableLeftover: 0,    
      totalBarsCount: 0,
      uniqueBitolas: new Set(),
      totalPatterns: 0
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

        if (barGroup.type === 'nova') {
          metrics.totalBars12m += count;
          metrics.rawLengthNew += (barGroup.originalLength * count);
          metrics.usedLengthNew += (cutsLength * count);
        } else {
          metrics.totalStockBars += count;
          // Não somamos estoque no rawLengthNew para não "sujar" a eficiência de compra
        }

        const totalRemaining = barGroup.remaining * count;
        if (barGroup.remaining < 30) {
          metrics.scrapTotal += totalRemaining;
        } else if (barGroup.remaining >= 100) {
          metrics.usableLeftover += totalRemaining;
        }
      });
    });

    // 1. Aproveitamento REAL (Apenas sobre o aço novo comprado)
    // Se não usou barra nova, o aproveitamento é 100% (Reciclagem pura)
    metrics.purchaseEfficiency = metrics.rawLengthNew > 0 
      ? (metrics.usedLengthNew / metrics.rawLengthNew) * 100 
      : metrics.totalStockBars > 0 ? 100 : 0;

    // 2. Pontuação de Repetibilidade
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
          <BarChart3 className="text-indigo-600" /> Comparador de Cenários
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Analise a eficiência de compra e o uso inteligente de estoque.
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
            // Meta: Eficiência de compra > 92% OU Uso intenso de estoque
            const isEfficient = m.purchaseEfficiency >= 92 || (m.totalStockBars > 0 && m.purchaseEfficiency > 85);

            return (
              <div key={plan.id} className="min-w-[320px] w-[320px] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col transition-transform hover:scale-[1.01]">
                
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

                <div className="p-4 space-y-4 text-sm">
                  
                  {/* KPI PRINCIPAL: EFICIÊNCIA DE COMPRA */}
                  <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-100 relative overflow-hidden">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Aproveitamento (Aço Novo)</span>
                    <div className={`text-3xl font-black mt-1 ${isEfficient ? 'text-green-600' : 'text-amber-600'}`}>
                      {m.purchaseEfficiency.toFixed(1)}%
                    </div>
                    {m.totalStockBars > 0 && (
                        <div className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-1 rounded-bl">
                            + ESTOQUE
                        </div>
                    )}
                  </div>

                  {/* ECONOMIA REAL */}
                  <div className="bg-indigo-50 p-3 rounded border border-indigo-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Package className="text-indigo-600" size={18} />
                            <div className="leading-tight">
                                <div className="text-xs text-indigo-800 font-bold uppercase">Barras Novas</div>
                                <div className="text-[10px] text-indigo-600">Necessárias</div>
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-indigo-900">{m.totalBars12m}</div>
                  </div>

                  {/* USO DE ESTOQUE */}
                  {m.totalStockBars > 0 ? (
                      <div className="bg-amber-50 p-3 rounded border border-amber-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="text-amber-600" size={18} />
                                <div className="leading-tight">
                                    <div className="text-xs text-amber-800 font-bold uppercase">Estoque Salvo</div>
                                    <div className="text-[10px] text-amber-600">Pontas Reutilizadas</div>
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-amber-800">{m.totalStockBars}</div>
                      </div>
                  ) : (
                      <div className="text-center text-xs text-slate-400 py-2 border border-dashed rounded">
                          Nenhum estoque utilizado
                      </div>
                  )}

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Detalhes Técnicos</h4>
                    
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-slate-600"><Scissors size={14}/> Cortes (Golpes)</span>
                      <span className="font-bold text-slate-800">{m.totalCutsCount}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-slate-600"><Repeat size={14}/> Repetibilidade</span>
                      <span className="font-bold text-slate-800">{m.repeatabilityScore.toFixed(1)} <span className="text-[10px]">un/padrão</span></span>
                    </div>
                  </div>

                  {/* MATERIAL E SOBRAS */}
                   <div className="grid grid-cols-2 gap-2 text-center pt-2">
                        <div className="bg-red-50 p-2 rounded border border-red-100">
                            <div className="text-[10px] text-red-600 font-bold uppercase">Sucata</div>
                            <div className="font-bold text-red-700">{(m.scrapTotal / 100).toFixed(1)}m</div>
                        </div>
                        <div className="bg-green-50 p-2 rounded border border-green-100">
                            <div className="text-[10px] text-green-700 font-bold uppercase">Retalho Útil</div>
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
