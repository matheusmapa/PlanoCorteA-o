import React, { useState, useMemo } from 'react';
import { calculateCutPlan } from './cutOptimizer';
import { 
  Lightbulb, AlertTriangle, ArrowRight, CheckCircle2, 
  Scale, Split, Boxes, TrendingUp, DollarSign
} from 'lucide-react';

const StrategyAnalyzer = ({ projects, inventory, onLoadProject }) => {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  // 1. Encontra o projeto selecionado (O "Urgente")
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // 2. Lógica de Simulação Inteligente
  const analysisResult = useMemo(() => {
    if (!selectedProject) return null;

    // A) Simula Cenário SOLO (Modo Single)
    // Nota: Usamos barra padrão de 1200cm para análise pura de eficiência do projeto
    const soloPlan = calculateCutPlan(selectedProject.items, [], 1200, 0);
    
    const calculateMetrics = (results) => {
      let totalRaw = 0;
      let totalUsed = 0;
      let barCount = 0;
      
      results.forEach(group => {
        group.bars.forEach(bar => {
            barCount += bar.count;
            totalRaw += (bar.originalLength * bar.count);
            totalUsed += (bar.cuts.reduce((a, b) => a + b, 0) * bar.count);
        });
      });
      
      return {
        efficiency: totalRaw > 0 ? (totalUsed / totalRaw) * 100 : 0,
        waste: totalRaw - totalUsed,
        bars: barCount
      };
    };

    const soloMetrics = calculateMetrics(soloPlan);

    // B) Simula Cenário MULTI (Procura o "Par Perfeito")
    let bestPartner = null;
    let bestCombinedMetrics = null;

    // Filtra outros projetos que não sejam o selecionado
    const otherProjects = projects.filter(p => p.id !== selectedProject.id);

    otherProjects.forEach(partner => {
        // Combina os itens (Adiciona prefixo para rastrear origem se necessário, mas aqui é só simulação)
        const combinedItems = [...selectedProject.items, ...partner.items];
        const combinedPlan = calculateCutPlan(combinedItems, [], 1200, 0);
        const combinedMetrics = calculateMetrics(combinedPlan);

        // Se a eficiência melhorou significativamente (> 3%), é um candidato
        if (combinedMetrics.efficiency > soloMetrics.efficiency + 1) {
            // Se ainda não temos um melhor, ou se este é melhor que o anterior
            if (!bestCombinedMetrics || combinedMetrics.efficiency > bestCombinedMetrics.efficiency) {
                bestPartner = partner;
                bestCombinedMetrics = combinedMetrics;
            }
        }
    });

    return {
        solo: soloMetrics,
        partner: bestPartner,
        combined: bestCombinedMetrics
    };
  }, [selectedProject, projects]);

  const handleLoadStrategy = (mode) => {
      if (mode === 'solo') {
          onLoadProject([selectedProject]);
      } else if (mode === 'multi' && analysisResult.partner) {
          onLoadProject([selectedProject, analysisResult.partner]);
      }
  };

  if (projects.length === 0) {
      return (
        <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
            <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Salve alguns projetos na aba lateral para começar a usar a Inteligência de Estratégia.</p>
        </div>
      );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* SELEÇÃO DO PROJETO "PIVÔ" */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Lightbulb className="text-amber-500" /> Analisador de Estratégia
        </h2>
        
        <label className="block text-sm font-medium text-slate-600 mb-2">Qual projeto você precisa entregar <span className="text-red-500 font-bold">HOJE</span>?</label>
        <select 
            value={selectedProjectId} 
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full p-3 border border-slate-300 rounded-lg text-lg focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
        >
            <option value="">Selecione um projeto da fila...</option>
            {projects.map(p => (
                <option key={p.id} value={p.id}>
                    {p.name} ({p.items.length} peças) - {p.createdAt?.toDate().toLocaleDateString()}
                </option>
            ))}
        </select>
      </div>

      {selectedProject && analysisResult && (
        <div className="grid md:grid-cols-2 gap-6">
            
            {/* CARD 1: MODO SINGLE (PADRÃO) */}
            <div className={`relative p-6 rounded-xl border-2 transition-all ${
                analysisResult.solo.efficiency >= 92 
                ? 'border-green-500 bg-green-50/50 shadow-md ring-1 ring-green-500' 
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
                {analysisResult.solo.efficiency >= 92 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1">
                        <CheckCircle2 size={12}/> RECOMENDADO
                    </div>
                )}

                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Split className="text-blue-500" size={20}/> Modo Single
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Rodar apenas "{selectedProject.name}"</p>
                    </div>
                    <div className="text-right">
                        <span className="block text-3xl font-black text-slate-800">{analysisResult.solo.efficiency.toFixed(1)}%</span>
                        <span className="text-xs font-bold text-slate-400 uppercase">Eficiência</span>
                    </div>
                </div>

                <ul className="space-y-3 mb-6">
                    <li className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle2 className="text-green-500 mt-0.5" size={16}/>
                        <span><strong className="text-slate-800">Logística Simples:</strong> Sem mistura de peças. Risco zero de entregar errado.</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle2 className="text-green-500 mt-0.5" size={16}/>
                        <span><strong className="text-slate-800">Cobrança Justa:</strong> O cliente paga exatamente pela perda que gerou.</span>
                    </li>
                    {analysisResult.solo.efficiency < 85 && (
                        <li className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded">
                            <AlertTriangle className="mt-0.5 shrink-0" size={16}/>
                            <span>Atenção: Eficiência baixa. Muita sucata será gerada. Considere combinar.</span>
                        </li>
                    )}
                </ul>

                <button 
                    onClick={() => handleLoadStrategy('solo')}
                    className="w-full py-3 rounded-lg font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                >
                    Carregar Solo <ArrowRight size={16}/>
                </button>
            </div>

            {/* CARD 2: MODO MULTI (OTIMIZADO) */}
            <div className={`relative p-6 rounded-xl border-2 transition-all ${
                analysisResult.partner && analysisResult.combined.efficiency > analysisResult.solo.efficiency + 3 
                ? 'border-indigo-500 bg-indigo-50/50 shadow-md ring-1 ring-indigo-500' 
                : 'border-slate-200 bg-slate-50 opacity-80'
            }`}>
                {analysisResult.partner && analysisResult.combined.efficiency > analysisResult.solo.efficiency + 3 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1">
                        <TrendingUp size={12}/> GRANDE ECONOMIA
                    </div>
                )}

                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Boxes className="text-indigo-500" size={20}/> Modo Multi
                        </h3>
                        {analysisResult.partner ? (
                            <p className="text-xs text-slate-500 mt-1">Combinar com "{analysisResult.partner.name}"</p>
                        ) : (
                            <p className="text-xs text-slate-400 mt-1">Nenhum parceiro ideal encontrado</p>
                        )}
                    </div>
                    <div className="text-right">
                        {analysisResult.combined ? (
                            <>
                                <span className="block text-3xl font-black text-indigo-700">{analysisResult.combined.efficiency.toFixed(1)}%</span>
                                <span className="text-xs font-bold text-green-600 flex justify-end items-center gap-1">
                                    <TrendingUp size={10}/> +{(analysisResult.combined.efficiency - analysisResult.solo.efficiency).toFixed(1)}%
                                </span>
                            </>
                        ) : (
                            <span className="block text-3xl font-black text-slate-300">--%</span>
                        )}
                    </div>
                </div>

                {analysisResult.partner ? (
                    <ul className="space-y-3 mb-6">
                        <li className="flex items-start gap-2 text-sm text-slate-600">
                            <CheckCircle2 className="text-green-500 mt-0.5" size={16}/>
                            <span><strong className="text-slate-800">Redução de Sucata:</strong> Otimiza as sobras do Projeto A com peças do B.</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
                            <AlertTriangle className="mt-0.5 shrink-0" size={16}/>
                            <span><strong className="text-amber-700">Alerta de Logística:</strong> "Salada Mista". Exige separação manual rigorosa após o corte.</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm text-slate-500">
                            <DollarSign className="text-slate-400 mt-0.5" size={16}/>
                            <span>Ideal se ambos os clientes aceitarem dividir o lucro da otimização.</span>
                        </li>
                    </ul>
                ) : (
                    <div className="py-8 text-center text-slate-400 text-sm">
                        Não encontramos outro projeto na fila que melhore significativamente a eficiência deste.
                    </div>
                )}

                <button 
                    onClick={() => handleLoadStrategy('multi')}
                    disabled={!analysisResult.partner}
                    className="w-full py-3 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                    Carregar Combinado <ArrowRight size={16}/>
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default StrategyAnalyzer;
