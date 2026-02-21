'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Activity, Zap, AlertTriangle, FileText, CheckCircle, ExternalLink, RefreshCw, Lock, Unlock, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001/api/v1';

export default function Home() {
  const [asset, setAsset] = useState('WETH');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDrill, setIsDrill] = useState(false);

  const runRiskAnalysis = async (drill: boolean) => {
    setLoading(true);
    setError(null);
    setIsDrill(drill);
    
    try {
      const endpoint = drill ? '/drill' : '/check';
      const response = await axios.post(`${GATEWAY_URL}${endpoint}`, { asset });
      setResult(response.data);
    } catch (err: any) {
      console.error('Risk analysis failed:', err);
      if (err.response?.status === 402) {
        setError('Payment Required: Drill requires a $0.001 USDC micropayment on Base Sepolia.');
      } else {
        setError('Failed to connect to Risk Gateway. Please ensure the service is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Top Navigation Bar */}
      <nav className="border-b border-slate-800/60 bg-[#0a0c10]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-1.5 rounded-lg shadow-lg shadow-blue-900/20">
              <Shield className="text-white w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white leading-none">REALITY FIREWALL</span>
              <span className="text-[10px] font-mono text-slate-500 tracking-widest uppercase">v3.0.0 Institutional</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" /> Gateway: Online</span>
              <span className="w-px h-3 bg-slate-800" />
              <span>Chainlink CRE: Active</span>
            </div>
            <button className="bg-slate-800/50 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-full border border-slate-700/50 transition-all">
              Connect Wallet
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Sidebar: Controls & Identity */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-[#11141b] border border-slate-800/60 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-6">
                <Activity className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Risk Orchestration</h2>
              </div>
              
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Target Asset</label>
                  <div className="relative">
                    <select 
                      value={asset}
                      onChange={(e) => setAsset(e.target.value)}
                      className="w-full bg-[#0a0c10] border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none transition-all"
                    >
                      <option>WETH</option>
                      <option>WBTC</option>
                      <option>USDC</option>
                      <option>LINK</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={() => runRiskAnalysis(false)}
                    disabled={loading}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-3.5 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading && !isDrill ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    RUN STANDARD CHECK
                  </button>
                  <button 
                    onClick={() => runRiskAnalysis(true)}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold py-3.5 rounded-xl shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading && isDrill ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
                    RUN PREMIUM DRILL
                  </button>
                </div>
                
                <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                  <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Premium drills utilize Chainlink CRE for deep signal analysis and require a $0.001 USDC micropayment via x402.
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-[#11141b] border border-slate-800/60 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Agent Identity</h2>
              </div>
              <div className="p-4 bg-[#0a0c10] rounded-xl border border-slate-800/60 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase">ERC-8004 Compliant</span>
                  <span className="text-[9px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/20 font-bold">ACTIVE</span>
                </div>
                <p className="text-[11px] font-mono text-slate-300 break-all leading-relaxed">
                  0x71C7656EC7ab88b098defB751B7401B5f6d8976F
                </p>
              </div>
            </section>
          </div>

          {/* Main Content: Analysis Results */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-xs font-medium"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </motion.div>
              )}

              {result ? (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  {/* Risk Score Header */}
                  <div className="bg-[#11141b] border border-slate-800/60 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[100px] -mr-32 -mt-32" />
                    
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em]">Risk Assessment</span>
                          {result.isDrill && <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 font-bold uppercase">Premium</span>}
                        </div>
                        <h3 className="text-3xl font-black text-white tracking-tight">{result.asset} <span className="text-slate-500 font-light">/ USD</span></h3>
                        <p className="text-xs text-slate-400 mt-1 font-mono">Run ID: {result.runId}</p>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Risk Level</p>
                          <div className={`text-xl font-black tracking-tighter ${
                            result.level >= 3 ? 'text-red-500' : result.level >= 2 ? 'text-yellow-500' : 'text-green-500'
                          }`}>
                            {result.levelLabel}
                          </div>
                        </div>
                        <div className="w-px h-10 bg-slate-800" />
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Score</p>
                          <div className="text-4xl font-black text-white">{result.score}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="space-y-4 md:col-span-2">
                        <div>
                          <div className="flex justify-between text-[11px] font-bold mb-2">
                            <span className="text-slate-400 uppercase tracking-wider">Oracle Divergence</span>
                            <span className={result.divergencePct > 5 ? 'text-red-400' : 'text-blue-400'}>{result.divergencePct.toFixed(2)}%</span>
                          </div>
                          <div className="h-2 bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/30">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(result.divergencePct * 5, 100)}%` }}
                              className={`h-full rounded-full ${result.divergencePct > 5 ? 'bg-red-500' : 'bg-blue-500'}`}
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[#0a0c10] p-4 rounded-xl border border-slate-800/60">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Staleness</p>
                            <p className="text-sm font-mono text-white">{result.stalenessSeconds}s</p>
                          </div>
                          <div className="bg-[#0a0c10] p-4 rounded-xl border border-slate-800/60">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Liquidity</p>
                            <p className="text-sm font-mono text-white">${(result.liquidityUsd / 1e6).toFixed(2)}M</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-5 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-3">
                          <Activity className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-[10px] font-bold text-white uppercase tracking-wider">AI Threat Analysis</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed italic">
                          "{result.aiAnalysis}"
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Receipt */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#11141b] border border-slate-800/60 rounded-2xl p-6 shadow-xl">
                      <div className="flex items-center gap-2 mb-5">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recommended Actions</h3>
                      </div>
                      <div className="space-y-3">
                        {result.actions.map((action: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-[#0a0c10] rounded-xl border border-slate-800/60 group hover:border-slate-700 transition-all">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                              action.severity === 'critical' ? 'bg-red-500' : action.severity === 'high' ? 'bg-orange-500' : 'bg-blue-500'
                            }`} />
                            <div>
                              <p className="text-[11px] font-bold text-white uppercase tracking-tight">{action.type.replace('_', ' ')}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{action.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#11141b] border border-slate-800/60 rounded-2xl p-6 shadow-xl flex flex-col">
                      <div className="flex items-center gap-2 mb-5">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Defense Receipt</h3>
                      </div>
                      <div className="flex-1 space-y-4">
                        <div className="bg-[#0a0c10] p-4 rounded-xl border border-slate-800/60 space-y-3">
                          <div>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Evidence Hash (SHA-256)</p>
                            <p className="text-[10px] font-mono text-blue-400 break-all leading-relaxed">{result.evidenceHash}</p>
                          </div>
                          {result.signature && (
                            <div>
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">EIP-712 Signature</p>
                              <p className="text-[10px] font-mono text-indigo-400 break-all leading-relaxed truncate">{result.signature}</p>
                            </div>
                          )}
                        </div>
                        
                        <button className="w-full bg-white hover:bg-slate-200 text-slate-900 text-xs font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-white/5">
                          <CheckCircle className="w-4 h-4" />
                          ANCHOR ON SEPOLIA
                        </button>
                        
                        <div className="flex justify-center">
                          <button className="text-[10px] font-bold text-slate-500 hover:text-white flex items-center gap-1.5 transition-colors uppercase tracking-widest">
                            View Verification Details <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-[500px] bg-[#11141b] border border-slate-800/60 border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-500 space-y-6 shadow-inner"
                >
                  <div className="relative">
                    <Activity className="w-16 h-16 opacity-10" />
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                      transition={{ duration: 4, repeat: Infinity }}
                      className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full"
                    />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">System Ready</p>
                    <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                      Select an institutional asset and initiate a risk analysis to generate a verifiable defense receipt.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-slate-800/60 bg-[#0a0c10] py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 opacity-50">
            <Shield className="w-5 h-5" />
            <span className="text-xs font-bold tracking-tighter">REALITY FIREWALL V3</span>
          </div>
          
          <div className="flex gap-10 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
            <span className="hover:text-blue-400 transition-colors cursor-pointer">Documentation</span>
            <span className="hover:text-blue-400 transition-colors cursor-pointer">Security Audit</span>
            <span className="hover:text-blue-400 transition-colors cursor-pointer">Chainlink CRE</span>
            <span className="hover:text-blue-400 transition-colors cursor-pointer">x402 Protocol</span>
          </div>
          
          <div className="text-[10px] font-mono text-slate-600">
            © 2026 REALITY FIREWALL | ALL RIGHTS RESERVED
          </div>
        </div>
      </footer>
    </div>
  );
}
