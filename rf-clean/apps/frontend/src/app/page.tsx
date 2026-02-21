
'use client';

import React, { useState } from 'react';
import { Shield, Activity, Zap, AlertTriangle, FileText, CheckCircle, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Home() {
  const [asset, setAsset] = useState('WETH');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runCheck = async () => {
    setLoading(true);
    // Simulate API call to /check
    setTimeout(() => {
      setResult({
        asset,
        score: 15,
        level: 0,
        divergencePct: 0.2,
        actions: ['MONITOR_CLOSELY'],
        isDrill: false,
        evidenceHash: '0x' + 'a'.repeat(64),
        timestamp: Date.now()
      });
      setLoading(false);
    }, 1500);
  };

  const runDrill = async () => {
    setLoading(true);
    // Simulate API call to /drill (x402)
    setTimeout(() => {
      setResult({
        asset,
        score: 85,
        level: 4,
        divergencePct: 12.5,
        actions: ['MONITOR_CLOSELY', 'REDUCE_LTV', 'CAP_SUPPLY', 'FREEZE_MARKET'],
        isDrill: true,
        paymentVerified: true,
        evidenceHash: '0x' + 'd'.repeat(64),
        timestamp: Date.now()
      });
      setLoading(false);
    }, 2000);
  };

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-lg">
            <Shield className="text-slate-900 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">REALITY FIREWALL <span className="text-slate-500">v3</span></h1>
        </div>
        <div className="flex gap-4">
          <div className="px-4 py-2 glass-card text-sm font-mono flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            GATEWAY: ONLINE
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Controls */}
        <div className="space-y-6">
          <section className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-slate-400" />
              Risk Orchestration
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Target Asset</label>
                <select 
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option>WETH</option>
                  <option>WBTC</option>
                  <option>USDC</option>
                  <option>LINK</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={runCheck}
                  disabled={loading}
                  className="bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  Run CHECK
                </button>
                <button 
                  onClick={runDrill}
                  disabled={loading}
                  className="bg-white hover:bg-slate-200 text-slate-900 text-sm font-bold py-2 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  Run DRILL
                </button>
              </div>
              <p className="text-[10px] text-slate-500 text-center">
                DRILL requires a $0.001 USDC micropayment via x402 (Base Sepolia)
              </p>
            </div>
          </section>

          <section className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-400" />
              Agent Identity
            </h2>
            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
              <p className="text-xs font-mono text-slate-400 break-all">
                ERC-8004: 0x71C7656EC7ab88b098defB751B7401B5f6d8976F
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">VERIFIED ARCHITECT</span>
              </div>
            </div>
          </section>
        </div>

        {/* Middle Column: Results */}
        <div className="lg:col-span-2 space-y-6">
          {result ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Risk Gauge */}
              <div className="glass-card p-8">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest">Risk Analysis Result</h3>
                    <p className="text-3xl font-bold mt-1">{result.asset} / USD</p>
                  </div>
                  <div className={`px-4 py-1 rounded-full text-xs font-bold border ${
                    result.level >= 3 ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'
                  }`}>
                    {result.level >= 3 ? 'CRITICAL ALERT' : 'STABLE'}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1">Risk Score</p>
                    <p className={`text-5xl font-black ${result.level >= 3 ? 'text-red-500' : 'text-white'}`}>{result.score}</p>
                    <p className="text-[10px] text-slate-500 mt-2">0 (Safe) - 100 (Critical)</p>
                  </div>
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Oracle Divergence</span>
                        <span className={result.divergencePct > 5 ? 'text-red-400' : 'text-slate-200'}>{result.divergencePct}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ${result.divergencePct > 5 ? 'bg-red-500' : 'bg-slate-400'}`}
                          style={{ width: `${Math.min(result.divergencePct * 5, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-900/50 rounded border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase">Staleness</p>
                        <p className="text-sm font-mono">32s</p>
                      </div>
                      <div className="p-3 bg-slate-900/50 rounded border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase">Liquidity</p>
                        <p className="text-sm font-mono">$4.2M</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommended Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-6">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    Recommended Actions
                  </h3>
                  <div className="space-y-2">
                    {result.actions.map((action: string, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-2 bg-slate-900/30 rounded border border-slate-800/50">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span className="text-xs font-mono">{action}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card p-6">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Defense Receipt
                  </h3>
                  <div className="space-y-3">
                    <div className="text-[10px] font-mono text-slate-500 break-all bg-black/20 p-2 rounded">
                      HASH: {result.evidenceHash}
                    </div>
                    <button className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2 transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" />
                      ANCHOR ON SEPOLIA
                    </button>
                    <div className="flex justify-center">
                      <a href="#" className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1">
                        View on Explorer <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full min-h-[400px] glass-card flex flex-col items-center justify-center text-slate-500 space-y-4 border-dashed">
              <Activity className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">Select an asset and run a risk check to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-20 pt-8 border-t border-slate-800 flex justify-between items-center text-[10px] text-slate-500 font-mono">
        <div>© 2026 REALITY FIREWALL V3 | DETERMINISTIC RISK ORCHESTRATION</div>
        <div className="flex gap-6">
          <span>CHAINLINK CRE</span>
          <span>x402 PAYMENTS</span>
          <span>ERC-8004 IDENTITY</span>
        </div>
      </footer>
    </main>
  );
}
