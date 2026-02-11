import React, { useState, useEffect } from 'react';
import { calculateCutPlan } from './cutOptimizer';
import { 
  Lightbulb, AlertTriangle, ArrowRight, CheckCircle2, 
  Scale, Layers, Split, TrendingUp, Package, X, CheckSquare, Square, Calendar, Check, Truck
} from 'lucide-react';

const StrategyAnalyzer = ({ projects, inventory, onClose, onLoadStrategy }) => {
  const [step, setStep] = useState('select');
  const [selectedIds, setSelectedIds] = useState([]);
  const [useLeftovers, setUseLeftovers] = useState(true); 
  const [analysis, setAnalysis] = useState(null);
  const [isComputing, setIsComputing] = useState(false);

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  };

  const handleAnalyze = () => {
    if (selectedIds.length < 2) return;
    setStep('analyze');
  };

  useEffect(() => {
    if (step !== 'analyze') return;
    setIsComputing(true);
    const selectedProjects = projects.filter(p => selectedIds.includes(p.id));
    const inventoryToUse = useLeftovers ? inventory : [];

    setTimeout(() => {
      // 1. CENÁRIO SEPARADO
      let separateMetrics = { totalBars: 0, totalStockUsed: 0, totalWaste: 0, rawLength: 0, usedLength: 0, totalItems: 0 };

      selectedProjects.forEach(proj => {
        const plan = calculateCutPlan(proj.items, inventoryToUse, 1200, 0); 
        separateMetrics.totalItems += proj.items.length;
        
        plan.forEach(group => {
            group.bars.forEach(bar => {
                const cutsLen = bar.cuts.reduce((a, b) => a + (typeof b === 'number' ? b : b.length), 0);
                if (bar.type === 'nova') {
                    separateMetrics.totalBars += bar.count;
                } else {
                    separateMetrics.totalStockUsed += bar.count;
                }
                separateMetrics.rawLength += (bar.originalLength * bar.count);
                separateMetrics.usedLength += (cutsLen * bar.count);
                if (bar.remaining < 100) separateMetrics.totalWaste += (bar.remaining * bar.count);
            });
        });
      });

      // 2. CENÁRIO UNIFICADO
      const allItems = selectedProjects.flatMap(p => p.items.map(i => ({...i, origin: p.name})));
      const combinedPlan = calculateCutPlan(allItems, inventoryToUse, 1200, 0);
      let combinedMetrics = { totalBars: 0, totalStockUsed: 0, totalWaste: 0, rawLength: 0, usedLength: 0 };

      combinedPlan.forEach(group => {
          group.bars.forEach(bar => {
              const cutsLen = bar.cuts.reduce((a, b) => a + (typeof b === 'number' ? b : b.length), 0);
              if (bar.type === 'nova') {
                  combinedMetrics.totalBars += bar.count;
              } else {
                  combinedMetrics.totalStockUsed += bar.count;
              }
              combinedMetrics.rawLength += (bar.originalLength * bar.count);
              combinedMetrics.usedLength += (cutsLen * bar.count);
              if (bar.remaining < 100) combinedMetrics.totalWaste += (bar.remaining * bar.count);
          });
      });

      // --- INTELIGÊNCIA DE DECISÃO (MENOS BURRA) ---
      
      const barsSaved = separateMetrics.totalBars - combinedMetrics.totalBars;
      // Economia percentual de barras
      const percentSaved = separateMetrics.totalBars > 0 
        ? (barsSaved / separateMetrics.totalBars) * 100 
        : 0;

      // Penalidade Logística:
      // Assume-se que misturar projetos custa "esforço".
      // Se a economia for menor que 5% das barras OU menos que 2 barras inteiras,
      // geralmente não compensa a bagunça de misturar etiquetas.
      
      let recommendation = 'separate';
      let reason = "A economia não justifica a complexidade logística.";

      if (barsSaved >= 3 || percentSaved > 5.0) {
          recommendation = 'combined';
          reason = `Economia significativa de ${barsSaved} barras (${percentSaved.toFixed(1)}%). Vale a pena o esforço logístico.`;
      } else if (barsSaved > 0 && separateMetrics.totalItems < 50) {
          // Se for pouca peça, vale a pena misturar mesmo economizando pouco
          recommendation = 'combined';
          reason = "Projetos pequenos: fácil de organizar, vale economizar qualquer quantia.";
      }

      setAnalysis({
        separate: separateMetrics,
        combined: combinedMetrics,
        diff: { barsSaved, percentSaved },
        recommendation,
        reason
      });

      setIsComputing(false);
    }, 500); // Delayzinho pra dar emoção

  }, [step, selectedIds, projects, inventory, useLeftovers]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
                <Lightbulb className="text-amber-400" /> Analisador de Estratégia
            </h2>
            <button onClick={onClose} className="hover:bg-white/10 p-1 rounded transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {step === 'select' && (
                <div className="space-y-4">
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-bold text-slate-800">Seleção de Projetos</h3>
                        <p className="text-slate-500 text-sm">Compare: Cortar Individualmente vs. Unificar Lotes</p>
                    </div>

                    <div className="flex justify-end mb-2">
                       <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-slate-200 shadow-sm hover:border-indigo-300 select-none">
                            <div className={`w-4 h-4 flex items-center justify-center rounded border transition-colors ${useLeftovers ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                {useLeftovers && <Check size={12} className="text-white" />}
                            </div>
                            <input type="checkbox" className="hidden" checked={useLeftovers} onChange={(e) => setUseLeftovers(e.target.checked)} />
                            <span className={`text-xs font-bold ${useLeftovers ? 'text-indigo-700' : 'text-slate-500'}`}>
                                Usar Estoque? ({inventory.reduce((acc, i) => acc + i.qty, 0)} itens)
                            </span>
                        </label>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                        {projects.length === 0 && <p className="text-slate-400 col-span-2 text-center py-8">Nenhum projeto salvo.</p>}
                        {projects.map(proj => {
                            const isSelected = selectedIds.includes(proj.id);
                            return (
                                <div key={proj.id} onClick={() => toggleSelection(proj.id)} className={`p-4 rounded-lg border cursor-pointer transition-all flex items-start gap-3 hover:shadow-md ${isSelected ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                                    <div className={isSelected ? "text-indigo-600" : "text-slate-300"}>{isSelected ? <CheckSquare size={20} /> : <Square size={20} />}</div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">{proj.name}</div>
                                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Calendar size={12}/> {proj.createdAt?.toDate().toLocaleDateString()} • {proj.items.length} peças</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {step === 'analyze' && (
                <div className="h-full">
                    {isComputing ? (
                         <div className="flex flex-col items-center justify-center h-64">
                            <Layers className="w-16 h-16 text-indigo-500 animate-bounce mb-4" />
                            <p className="text-indigo-900 font-bold animate-pulse text-lg">Calculando cenários...</p>
                            <p className="text-slate-500 text-sm">Ponderando custo material vs. complexidade...</p>
                        </div>
                    ) : analysis ? (
                        <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
                             <div className="flex justify-between items-center mb-4">
                                <button onClick={() => setStep('select')} className="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Voltar</button>
                                {analysis.recommendation === 'combined' 
                                    ? <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold border border-green-200 flex items-center gap-1"><Layers size={12}/> RECOMENDADO: UNIFICAR</span>
                                    : <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold border border-blue-200 flex items-center gap-1"><Split size={12}/> RECOMENDADO: SEPARAR</span>
                                }
                             </div>
                             
                             <div className="bg-slate-100 p-4 rounded-lg border border-slate-200 text-center mb-4">
                                 <p className="text-sm text-slate-700 font-medium">"{analysis.reason}"</p>
                             </div>

                             <div className="grid md:grid-cols-2 gap-6">
                                <div className={`p-5 rounded-xl border-2 flex flex-col ${analysis.recommendation === 'separate' ? 'border-blue-500 bg-blue-50/50 shadow-lg' : 'border-slate-200 bg-white opacity-60'}`}>
                                    <div className="flex items-center gap-2 mb-3 text-blue-700 font-bold"><Split size={20}/> Separados (Conservador)</div>
                                    <div className="space-y-3 text-sm flex-1">
                                        <div className="flex justify-between border-b border-blue-200 pb-2"><span>Barras Novas:</span> <strong>{analysis.separate.totalBars}</strong></div>
                                        <div className="flex justify-between text-slate-500"><span>Estoque Usado:</span> {analysis.separate.totalStockUsed} un</div>
                                        <div className="flex justify-between items-center pt-1"><span className="flex gap-1 items-center"><Truck size={12}/> Complexidade:</span> <span className="text-green-600 font-bold text-xs">BAIXA (Ideal)</span></div>
                                    </div>
                                    <button onClick={() => { onLoadStrategy(projects.filter(p => selectedIds.includes(p.id)), 'separate'); onClose(); }} className="mt-4 w-full py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded hover:bg-slate-50">Carregar Separados</button>
                                </div>

                                <div className={`p-5 rounded-xl border-2 flex flex-col ${analysis.recommendation === 'combined' ? 'border-green-500 bg-green-50/50 shadow-lg' : 'border-slate-200 bg-white opacity-60'}`}>
                                    <div className="flex items-center gap-2 mb-3 text-green-700 font-bold"><Layers size={20}/> Unificados (Ousado)</div>
                                    <div className="space-y-3 text-sm flex-1">
                                        <div className="flex justify-between border-b border-green-200 pb-2">
                                            <span>Barras Novas:</span> 
                                            <div><strong>{analysis.combined.totalBars}</strong> {analysis.diff.barsSaved > 0 && <span className="text-xs text-green-600 bg-green-200 px-1 rounded ml-1">-{analysis.diff.barsSaved}</span>}</div>
                                        </div>
                                        <div className="flex justify-between text-slate-500"><span>Estoque Usado:</span> {analysis.combined.totalStockUsed} un</div>
                                        <div className="flex justify-between items-center pt-1"><span className="flex gap-1 items-center"><Truck size={12}/> Complexidade:</span> <span className="text-amber-600 font-bold text-xs">ALTA (Cuidado)</span></div>
                                    </div>
                                    <button onClick={() => { onLoadStrategy(projects.filter(p => selectedIds.includes(p.id)), 'combined'); onClose(); }} className="mt-4 w-full py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 shadow-sm">Unificar e Carregar</button>
                                </div>
                             </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>

        {step === 'select' && (
            <div className="p-4 border-t bg-white flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-800">Cancelar</button>
                <button onClick={handleAnalyze} disabled={selectedIds.length < 2} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-sm">Analisar Estratégia</button>
            </div>
        )}
      </div>
    </div>
  );
};

export default StrategyAnalyzer;
