/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Brain, Shield, AlertTriangle, CheckCircle,
  Download, BarChart3, Globe, Zap, Database,
  ChevronDown, ChevronUp, History, Info, ExternalLink,
  Search, Wallet, Link2, Copy, ArrowLeft, Leaf, X, Sparkles, Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PillNav, { PillNavItem } from './components/reactbits/PillNav';
// Ballpit removed — plain background used instead
import { ShinyText } from './components/reactbits/ShinyText';
import { GlassButton } from './components/reactbits/GlassButton';
import { TiltCard } from './components/reactbits/TiltCard';
import { GlassIcons } from './components/reactbits/GlassIcons';
import GlassSurface from './components/reactbits/GlassSurface';
import LiquidEther from './components/reactbits/LiquidEther';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  storeReportOnChain, getReportFromChain, hashBuffer,
  isMetaMaskInstalled, connectWallet, switchToSepolia,
  getCurrentChainId, SEPOLIA_CHAIN_ID, CONTRACT_ADDRESS
} from './blockchain';

ChartJS.register(ArcElement, Tooltip, Legend);

// --- Types ---
interface SubScores {
  e: { emissions_data: number; improvement: number; renewable_targets: number; third_party_audit: number; water_waste_bio: number };
  s: { worker_safety: number; diversity: number; fair_wage: number; community: number; supply_chain: number };
  g: { board_independence: number; anti_corruption: number; exec_pay: number; audit_committee: number; whistleblower: number };
}
interface GWFlag { type: string; severity: string; title: string; description: string; evidence: string; }
interface ESGResult {
  company_name: string; report_year: string; overall_score: number; grade: string;
  env_score: number; soc_score: number; gov_score: number;
  sub_scores: SubScores; flags: GWFlag[];
  strengths: string[]; weaknesses: string[]; summary: string;
  blockchain_hash: string; red_flags?: string[];
  created_at?: string;
}

// --- Sub-Score Definitions ---
const E_CATS = [
  { key: 'emissions_data', label: 'Scope 1/2/3 Emissions', max: 25 },
  { key: 'improvement', label: 'Year-on-Year Improvement', max: 20 },
  { key: 'renewable_targets', label: 'Renewable Energy Targets', max: 15 },
  { key: 'third_party_audit', label: 'Third-Party Audit', max: 25 },
  { key: 'water_waste_bio', label: 'Water / Waste / Biodiversity', max: 15 },
];
const S_CATS = [
  { key: 'worker_safety', label: 'Worker Safety', max: 25 },
  { key: 'diversity', label: 'Diversity & Inclusion', max: 25 },
  { key: 'fair_wage', label: 'Fair Wage Policy', max: 20 },
  { key: 'community', label: 'Community Investment', max: 15 },
  { key: 'supply_chain', label: 'Supply Chain Standards', max: 15 },
];
const G_CATS = [
  { key: 'board_independence', label: 'Board Independence', max: 25 },
  { key: 'anti_corruption', label: 'Anti-Corruption Policy', max: 25 },
  { key: 'exec_pay', label: 'Executive Pay Transparency', max: 20 },
  { key: 'audit_committee', label: 'Audit Committee', max: 20 },
  { key: 'whistleblower', label: 'Whistleblower Protection', max: 10 },
];
const SEV_COLORS: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#3B82F6' };

export default function App() {
  const [page, setPage] = useState<'home' | 'analyze' | 'results' | 'verify'>('home');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ESGResult | null>(null);
  const [history, setHistory] = useState<ESGResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pdfHash, setPdfHash] = useState<string | null>(null);
  const [ipfsCid, setIpfsCid] = useState<string | null>(null);
  const [scoreReportBytes, setScoreReportBytes] = useState<ArrayBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchHistory(); }, []);
  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      setHistory(data.map((r: any) => {
        let full: any = {};
        if (r.full_result) { try { full = JSON.parse(r.full_result); } catch {} }
        return {
          ...r, ...full,
          red_flags: typeof r.red_flags === 'string' ? JSON.parse(r.red_flags) : r.red_flags,
          sub_scores: full.sub_scores || r.sub_scores || { e: {}, s: {}, g: {} },
          flags: full.flags || r.flags || [],
          strengths: full.strengths || r.strengths || [],
          weaknesses: full.weaknesses || r.weaknesses || [],
        };
      }));
    } catch (err) { console.error("Failed to fetch history", err); }
  };

  const deleteReport = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this analysis?")) return;
    try { const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' }); if (res.ok) fetchHistory(); } catch (err) { console.error(err); }
  };

  const buildScoreReportPDF = (data: ESGResult): jsPDF => {
    const doc = new jsPDF();
    doc.setFillColor(0, 200, 150); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.text('GreenLedger ESG Scorecard', 15, 25);
    doc.setFontSize(10); doc.text(`Generated ${new Date().toLocaleDateString()}`, 150, 25);
    doc.setTextColor(30, 41, 59); doc.setFontSize(18); doc.text(data.company_name, 15, 55);
    doc.setFontSize(12); doc.text(`Report Year: ${data.report_year}`, 15, 62);
    autoTable(doc, { startY: 70, head: [['Metric', 'Score', 'Grade']], body: [
      ['Overall GreenScore', String(data.overall_score), data.grade],
      ['Environmental (E)', String(data.env_score), ''], ['Social (S)', String(data.soc_score), ''], ['Governance (G)', String(data.gov_score), ''],
    ], theme: 'grid', headStyles: { fillColor: [0, 200, 150] } });
    let finalY = (doc as any).lastAutoTable?.finalY || 120;
    if (data.strengths?.length) {
      finalY += 10; doc.setFontSize(14); doc.setTextColor(0, 168, 122); doc.text('Strengths', 15, finalY);
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);
      data.strengths.forEach(s => { finalY += 8; doc.text(`+ ${s}`, 18, finalY); });
    }
    if (data.weaknesses?.length) {
      finalY += 10; doc.setFontSize(14); doc.setTextColor(244, 63, 94); doc.text('Key Gaps', 15, finalY);
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);
      data.weaknesses.forEach(w => { finalY += 8; doc.text(`- ${w}`, 18, finalY); });
    }
    if (data.sub_scores) {
      finalY += 12;
      const subRows: string[][] = [];
      const addSubs = (label: string, scores: any, cats: {key:string;label:string;max:number}[]) => {
        cats.forEach(c => subRows.push([`${label} - ${c.label}`, `${Number(scores?.[c.key])||0}/${c.max}`]));
      };
      addSubs('E', data.sub_scores.e, [{key:'emissions_data',label:'Emissions Data',max:25},{key:'improvement',label:'YoY Improvement',max:20},{key:'renewable_targets',label:'Renewable Targets',max:15},{key:'third_party_audit',label:'Third-Party Audit',max:25},{key:'water_waste_bio',label:'Water/Waste/Bio',max:15}]);
      addSubs('S', data.sub_scores.s, [{key:'worker_safety',label:'Worker Safety',max:25},{key:'diversity',label:'Diversity',max:25},{key:'fair_wage',label:'Fair Wage',max:20},{key:'community',label:'Community',max:15},{key:'supply_chain',label:'Supply Chain',max:15}]);
      addSubs('G', data.sub_scores.g, [{key:'board_independence',label:'Board Independence',max:25},{key:'anti_corruption',label:'Anti-Corruption',max:25},{key:'exec_pay',label:'Exec Pay',max:20},{key:'audit_committee',label:'Audit Committee',max:20},{key:'whistleblower',label:'Whistleblower',max:10}]);
      autoTable(doc, { startY: finalY, head: [['Sub-Category', 'Score']], body: subRows, theme: 'grid', headStyles: { fillColor: [0, 200, 150] }, styles: { fontSize: 8 } });
      finalY = (doc as any).lastAutoTable?.finalY || finalY + 80;
    }
    if (data.flags?.length) {
      finalY += 10; if (finalY > 250) { doc.addPage(); finalY = 20; }
      doc.setFontSize(14); doc.setTextColor(244, 63, 94); doc.text('Greenwash Flags', 15, finalY);
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);
      data.flags.forEach(f => { finalY += 8; if (finalY > 280) { doc.addPage(); finalY = 20; } doc.text(`[${f.severity}] ${f.title}: ${f.description}`, 15, finalY); });
    }
    if (data.blockchain_hash) {
      finalY += 12; if (finalY > 270) { doc.addPage(); finalY = 20; }
      doc.setFontSize(8); doc.setTextColor(148, 163, 184);
      doc.text(`Blockchain SHA-256: ${data.blockchain_hash}`, 15, finalY);
    }
    return doc;
  };

  const generatePDF = (data: ESGResult) => {
    if (scoreReportBytes) {
      const blob = new Blob([scoreReportBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${data.company_name}_ESG_Report.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const doc = buildScoreReportPDF(data);
      doc.save(`${data.company_name}_ESG_Report.pdf`);
    }
  };

  const analyzeWithAI = async (pdfBuffer: ArrayBuffer): Promise<ESGResult> => {
    const pdfjsLib = await import('pdfjs-dist');
    const { getDocument, GlobalWorkerOptions } = pdfjsLib;
    GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
    const pdf = await getDocument({ data: pdfBuffer }).promise;
    let fullText = '';
    const numPages = Math.min(pdf.numPages, 50);
    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        fullText += tc.items.map((item: any) => item.str).join(' ') + '\n';
        setProgress(Math.round((i / numPages) * 50));
    }
    const text = fullText.substring(0, 30000);
    if (text.trim().length < 50) throw new Error('PDF appears to be image-based. Text extraction failed.');

    setProgress(60);
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${response.status}`);
    }
    setProgress(90);
    return await response.json();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') { setError("Please upload a valid PDF."); return; }
    setIsAnalyzing(true); setError(null); setProgress(0); setResult(null); setIpfsCid(null); setPdfHash(null); setScoreReportBytes(null);
    try {
      const buffer = await file.arrayBuffer();
      setProgress(10);
      // Run AI analysis on the original PDF
      const analysis = await analyzeWithAI(buffer);
      setProgress(92);

      // Generate the score report PDF and hash it
      const scoreDoc = buildScoreReportPDF(analysis);
      const scoreBytes = scoreDoc.output('arraybuffer') as ArrayBuffer;
      setScoreReportBytes(scoreBytes);
      const scoreHash = await hashBuffer(scoreBytes);
      analysis.blockchain_hash = scoreHash;
      setPdfHash(scoreHash);

      // Upload score report PDF to IPFS via Pinata
      const u8 = new Uint8Array(scoreBytes);
      let binary = '';
      for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
      const base64 = btoa(binary);
      try {
        const ipfsRes = await fetch('/api/ipfs/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, fileName: `${analysis.company_name}_ESG_Report.pdf`, docHash: scoreHash }),
        });
        if (ipfsRes.ok) {
          const ipfsData = await ipfsRes.json();
          setIpfsCid(ipfsData.ipfsCid);
        }
      } catch (ipfsErr) { console.warn('IPFS upload failed:', ipfsErr); }

      setProgress(96);
      const saveRes = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(analysis) });
      if (saveRes.ok) fetchHistory();
      setResult(analysis); setProgress(100); setPage('results');
    } catch (err: any) { setError("Analysis failed: " + (err.message || "Unknown error")); }
    finally { setIsAnalyzing(false); }
  };

  const handleReset = () => { setPage('home'); setResult(null); setPdfHash(null); setIpfsCid(null); setScoreReportBytes(null); setError(null); setProgress(0); };

  return (
    <div className="min-h-screen relative bg-[#060B14] overflow-hidden">
      {/* Background Effect */}
      <div className="fixed inset-0 z-0 opacity-80 mix-blend-screen pointer-events-none">
        <LiquidEther
          colors={['#5227FF', '#FF9FFC', '#B19EEF']}
          mouseForce={40}
          cursorSize={150}
          isViscous
          viscous={30}
          iterationsViscous={32}
          iterationsPoisson={32}
          resolution={0.5}
          isBounce={false}
          autoDemo
          autoSpeed={1.0}
          autoIntensity={3.5}
          takeoverDuration={0.25}
          autoResumeDelay={1000}
          autoRampDuration={0.6}
        />
      </div>

      {/* Navigation */}
      <div className="fixed top-0 left-0 right-0 z-[100] mt-4 flex justify-center">
        <PillNav 
          logoAlt="GreenLedger Logo"
          activeHref={`#${page}`}
          baseColor="rgba(30, 41, 59, 1)"
            pillTextColor="#f8fafc"
          pillColor="#10b981"
          hoveredPillTextColor="#060010"
          items={[
            { id: 'logo', label: 'GreenLedger', href: '#home', onClick: handleReset },
            { id: '1', label: 'Verify Report', href: '#verify', onClick: () => setPage('verify') },
            { id: '2', label: 'Pricing', href: '#pricing' },
            { id: '3', label: 'Dashboard', href: '#dashboard', onClick: () => setShowHistory(!showHistory) },
            { id: '4', label: 'New Analysis', href: '#analyze', onClick: () => setPage('analyze') },
          ] as PillNavItem[]} 
        />
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf" />

      {/* HOME PAGE */}
      {page === 'home' && (
        <section className="relative pt-36 pb-20 z-10 min-h-[calc(100vh-80px)] flex flex-col items-center justify-center">
          <div className="w-full max-w-6xl mx-auto px-6 flex flex-col gap-6 items-center text-center">
            
            {/* Tile 1: Title */}
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full relative z-20">
              <GlassSurface className="md:p-16 w-full">
<div className="p-10 flex flex-col items-center w-full">
                <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full border border-slate-700 bg-black/60 backdrop-blur-xl text-sm font-bold text-slate-300 mb-8 shadow-sm">
                  <Scan className="w-4 h-4 text-slate-100" /> <ShinyText text="AI ESG Detection Engine v2.0 Live" />
                </div>
                <h1 className="text-5xl md:text-[6.5rem] font-black tracking-tight text-white leading-[1.1]">
                  Institutional ESG<br/>Verification Platform
                </h1>
              </div>
</GlassSurface>
            </motion.div>

            {/* Tile 2: Subheading */}
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.1}} className="w-full max-w-4xl relative z-20">
              <GlassSurface className="md:p-12 w-full">
<div className="p-8 flex items-center justify-center w-full">
                <p className="text-xl md:text-2xl text-slate-100 font-medium text-center leading-relaxed m-0">
                  Instantly verify and score ESG reports using Polygon blockchain immutability and our Explainable AI <span className="font-black text-emerald-600">Logical Detection</span> engine.
                </p>
              </div>
</GlassSurface>
            </motion.div>

            {/* Tile 3: Buttons */}
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.2}} className="w-full max-w-4xl relative z-20">
              <GlassSurface className="md:p-14 w-full">
                <div className="p-10 flex flex-col sm:flex-row items-center justify-center gap-8 w-full">
                  <button onClick={() => setPage('verify')} className="flex items-center justify-center gap-4 px-14 py-8 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 text-white text-xl font-extrabold hover:bg-white/20 hover:scale-[1.02] transition-all shadow-2xl shadow-emerald-500/20 w-full sm:w-[320px]">
                    Verify Document <Search className="w-7 h-7 text-emerald-400" />
                  </button>
                  <button onClick={() => setPage('analyze')} className="flex items-center justify-center gap-4 px-14 py-8 rounded-2xl bg-emerald-500/10 backdrop-blur-xl border border-emerald-500/30 text-emerald-400 text-xl font-extrabold hover:bg-emerald-500/20 hover:scale-[1.02] transition-all shadow-xl shadow-emerald-500/20 w-full sm:w-[320px]">
                    New Analysis <Upload className="w-7 h-7 text-emerald-400" />
                  </button>
                </div>
              </GlassSurface>
            </motion.div>

            {/* Tile 4: Architecture Intro */}
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.3}} className="w-full max-w-4xl relative z-20">
              <GlassSurface className="md:p-10 w-full">
<div className="p-8 flex items-center justify-center w-full">
                <h3 className="text-xl md:text-2xl font-bold text-white m-0 text-center leading-relaxed">
                  GreenLedger operates on a zero-trust architecture powered by Layer-2 blockchain cryptography and heuristic AI validation.
                </h3>
              </div>
</GlassSurface>
            </motion.div>

            {/* Tile 5: Architecture Features */}
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.4}} className="w-full relative z-20">
              <GlassIcons items={[
                { icon: Brain, title: "Explainable AI Engine", desc: "15 sub-category scoring with distinct greenwash detection." },
                { icon: Shield, title: "Ethereum Immutable Ledger", desc: "Hashes stored on-chain to prevent historical report tampering." },
                { icon: CheckCircle, title: "Persistent Verification", desc: "Export professional PDF scorecards instantly verified anywhere." },
              ]} />
            </motion.div>
          </div>
        </section>
      )}

      {/* ANALYZE PAGE */}
      {page === 'analyze' && (
        <section className="relative pt-36 pb-20 z-10 min-h-[calc(100vh-80px)] flex flex-col items-center justify-center">
          <div className="w-full max-w-6xl mx-auto px-6 flex flex-col gap-6 items-center">
            
            {/* Tile 1: Analyze Header */}
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full relative z-20">
              <GlassSurface className="md:p-14 w-full">
<div className="p-10 flex flex-col items-center text-center w-full">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-700 bg-black/60 backdrop-blur-xl text-xs font-bold text-slate-300 mb-6 shadow-sm">
                  <Brain className="w-3.5 h-3.5 text-slate-100" /> <ShinyText text="New ESG Analysis" />
                </div>
                <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white m-0">
                  Upload Report
                </h2>
              </div>
</GlassSurface>
            </motion.div>

            {/* Tile 2: Upload Area */}
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.1}} className="w-full max-w-4xl relative z-20">
              <GlassSurface className="w-full">
<div className="p-10 flex flex-col items-center w-full">
                {!isAnalyzing && (
                  <motion.div whileHover={{scale:1.02}} onClick={() => fileInputRef.current?.click()} className="glass-strong rounded-3xl p-12 text-center hover:border-emerald-400 hover:shadow-emerald-500/10 cursor-pointer group relative overflow-hidden w-full shadow-lg transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-200/50 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10">
                      <div className="w-20 h-20 rounded-[1.5rem] bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-300 shadow-sm">
                        <Upload className="w-10 h-10 text-slate-300 group-hover:text-emerald-600 transition-colors" />
                      </div>
                      <h4 className="text-2xl font-bold text-slate-100 mb-3">Drop your ESG document here</h4>
                      <p className="text-slate-500 font-semibold mb-2">PDF format only. Standard reports supported.</p>
                      <p className="text-slate-500 text-xs font-medium">Processed securely via heuristic AI logic.</p>
                      {error && <p className="mt-6 text-rose text-sm font-bold glass rounded-xl px-4 py-2 inline-block">{error}</p>}
                    </div>
                  </motion.div>
                )}

              {isAnalyzing && (
                <div className="bg-white/50 backdrop-blur-xl border border-white/60 rounded-3xl p-14 text-center w-full shadow-xl">
                  <div className="w-16 h-16 border-[5px] border-slate-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-6 shadow-md" />
                  <h4 className="text-2xl font-bold text-slate-100 mb-3">Processing Document</h4>
                  <p className="text-slate-500 font-bold">{progress < 50 ? "Extracting textual logic..." : progress < 90 ? "AI analyzing pattern detection matrices..." : "Finalizing verification..."}</p>
                  {error && <p className="mt-4 text-amber font-bold text-sm bg-amber-50/80 rounded-xl px-4 py-2 inline-block border border-amber-200">{error}</p>}
                  <div className="mt-10 h-3 bg-slate-800/80 rounded-full overflow-hidden shadow-inner"><motion.div initial={{width:0}} animate={{width:`${progress}%`}} className="h-full bg-emerald-500 rounded-full" /></div>
                </div>
              )}
              
              {!isAnalyzing && (
                  <div className="mt-10 w-full flex justify-center">
                    <button onClick={handleReset} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-100 hover:bg-slate-800/50 transition-all flex items-center gap-2">
                      <ArrowLeft className="w-4 h-4" /> Cancel Analysis
                    </button>
                  </div>
              )}
              </div>
</GlassSurface>
            </motion.div>

          </div>
        </section>
      )}

      {/* RESULTS PAGE */}
      {page === 'results' && result && <ResultsPage result={result} pdfHash={pdfHash} onDownload={generatePDF} ipfsCid={ipfsCid} />}

      {/* VERIFY PAGE */}
      {page === 'verify' && <VerifyPage />}

      {/* HISTORY PANEL */}
      <AnimatePresence>
        {showHistory && (
          <motion.section initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} className="fixed inset-0 z-[60] bg-slate-200/10 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto mt-20 p-6">
              <div className="glass-strong rounded-3xl p-8 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2"><History className="w-5 h-5 text-emerald" /> Analysis History</h2>
                  <button onClick={() => setShowHistory(false)} className="p-2 rounded-xl hover:bg-slate-800/60 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.length === 0 ? <p className="text-slate-500 italic col-span-2">No previous analyses yet.</p> : history.map((item, idx) => (
                    <div key={idx} className="glass rounded-xl p-5 hover:border-emerald/30 transition-all cursor-pointer group" onClick={() => { setResult(item); setPage('results'); setShowHistory(false); }}>
                      <div className="flex justify-between items-start mb-3">
                        <div><h4 className="font-bold text-slate-100 group-hover:text-emerald-dark transition-colors">{item.company_name}</h4><p className="text-xs text-slate-500">{item.report_year}</p></div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-lg bg-gradient-to-r from-emerald/10 to-teal/10 text-emerald-dark font-bold text-sm">{item.overall_score}</span>
                          <button onClick={(e) => deleteReport((item as any).id, e)} className="p-1 rounded-lg text-slate-300 hover:text-rose hover:bg-rose/10 transition-all"><X className="w-3 h-3" /></button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {[{l:'E',v:item.env_score,c:'emerald'},{l:'S',v:item.soc_score,c:'amber'},{l:'G',v:item.gov_score,c:'sky'}].map(p => (
                          <span key={p.l} className="text-[10px] px-2 py-0.5 rounded-md bg-[#060B14] text-slate-500 font-medium">{p.l}: {p.v}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Footer */}
      {page === 'home' && (
        <footer className="py-12 border-t border-slate-700/50 relative z-10 bg-white/20 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-100" />
              <span className="font-bold text-slate-300">GreenLedger</span>
            </div>
            <p className="text-slate-500 text-xs font-medium">© 2025 GreenLedger Verification Platform. All rights reserved.</p>
          </div>
        </footer>
      )}
    </div>
  );
}

// ==================== RESULTS PAGE ====================
function ResultsPage({ result, pdfHash, onDownload, ipfsCid }: { result: ESGResult; pdfHash: string | null; onDownload: (d: ESGResult) => void; ipfsCid: string | null }) {
  const [openPillar, setOpenPillar] = useState<string | null>('e');
  const gradeColors: Record<string,string> = { A: 'from-emerald to-teal', B: 'from-sky to-emerald', C: 'from-amber to-sky', D: 'from-rose to-amber', F: 'from-rose to-red-600' };
  return (
    <motion.section initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} className="relative z-10 w-full py-12 pt-24 px-4 sm:px-6 lg:px-8 flex justify-center">
      <div className="w-full max-w-[1200px] space-y-6">
      {/* Header Card */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full relative z-20">
        <GlassSurface className="md:p-14 overflow-hidden w-full">
<div className="p-10 flex flex-col items-center gap-12 w-full">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald/10 to-transparent rounded-bl-full pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-center w-full gap-8 relative z-10">
          <div className="flex-1 min-w-0 text-center md:text-left">
            <h2 className="text-4xl md:text-6xl font-black text-white mb-2">{result.company_name}</h2>
            <p className="text-emerald-dark font-black tracking-[0.2em] uppercase text-sm">{result.report_year} ESG ANALYSIS</p>
            {result.summary && <p className="text-base text-slate-500 mt-4 max-w-3xl leading-relaxed mx-auto md:mx-0">{result.summary}</p>}
          </div>
          <div className="flex flex-col items-center gap-4 shrink-0">
            <div className={`px-10 py-4 rounded-3xl bg-gradient-to-r ${gradeColors[result.grade] || gradeColors.C} text-white font-black text-3xl shadow-xl shadow-slate-900/10`}>
              GRADE {result.grade}
            </div>
            <button onClick={() => onDownload(result)} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 border border-slate-700 text-slate-500 font-bold hover:bg-[#060B14] hover:text-emerald-dark transition-all shadow-sm w-full justify-center">
              <Download className="w-5 h-5" /> Download PDF
            </button>
          </div>
        </div>

        {/* Chart + Pillars */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-10 items-center bg-black/40 p-8 rounded-[2.5rem] border border-slate-800/50">
          <div className="flex flex-col items-center justify-center text-center">
            <h5 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6">Overall GreenScore</h5>
            <div className="relative w-56 h-56">
              <Doughnut data={{ datasets: [{ data: [result.overall_score, 100-result.overall_score], backgroundColor: ['#10b981','#f1f5f9'], borderWidth: 0, borderRadius: 12 }] }} options={{ cutout: '82%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-6xl font-black text-slate-100">{result.overall_score}</span>
                <span className="text-xs text-slate-500 font-bold mt-2">OUT OF 100</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-8">
            <h5 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] pl-1">Pillar Breakdown</h5>
            {[{ label:'Environmental', score: result.env_score, gradient:'from-emerald to-teal', emoji:'🌿' },
              { label:'Social', score: result.soc_score, gradient:'from-amber to-orange-400', emoji:'👥' },
              { label:'Governance', score: result.gov_score, gradient:'from-sky to-blue-500', emoji:'🏛️' }].map((p,i) => (
              <div key={i}>
                <div className="flex justify-between items-end mb-3 px-1">
                  <span className="font-bold text-slate-300 text-lg flex items-center gap-3">
                    <span className="text-2xl">{p.emoji}</span>{p.label}
                  </span>
                  <span className="font-black text-2xl text-slate-100">{p.score}<span className="text-slate-500 text-base font-bold ml-1">/100</span></span>
                </div>
                <div className="h-4 bg-slate-800/60 rounded-full overflow-hidden shadow-inner">
                  <motion.div initial={{width:0}} animate={{width:`${p.score}%`}} transition={{delay:0.5+i*0.15, duration:1, ease:'easeOut'}} className={`h-full bg-gradient-to-r ${p.gradient} rounded-full`} />
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
</GlassSurface>
      </motion.div>

      {/* Strengths / Weaknesses */}
      {(result.strengths?.length > 0 || result.weaknesses?.length > 0) && (
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.1}} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch w-full z-20">
          {result.strengths?.length > 0 && (
            <GlassSurface className="border-t-8 border-emerald-500 shadow-lg w-full">
<div className="p-10 flex flex-col w-full">
              <h3 className="font-black text-2xl mb-6 text-white flex items-center gap-3"><CheckCircle className="w-8 h-8 text-emerald-500" /> Strengths</h3>
              <ul className="space-y-4 flex-1">{result.strengths.map((s, i) => <li key={i} className="text-base text-slate-500 flex items-start gap-3 leading-relaxed"><span className="text-emerald-500 font-bold mt-0.5 shrink-0 text-lg">✓</span><span>{s}</span></li>)}</ul>
            </div>
</GlassSurface>
          )}
          {result.weaknesses?.length > 0 && (
            <GlassSurface className="border-t-8 border-rose shadow-lg w-full">
<div className="p-10 flex flex-col w-full">
              <h3 className="font-black text-2xl mb-6 text-white flex items-center gap-3"><AlertTriangle className="w-8 h-8 text-rose" /> Key Gaps</h3>
              <ul className="space-y-4 flex-1">{result.weaknesses.map((w, i) => <li key={i} className="text-base text-slate-500 flex items-start gap-3 leading-relaxed"><span className="text-rose font-bold mt-0.5 shrink-0 text-lg">✗</span><span>{w}</span></li>)}</ul>
            </div>
</GlassSurface>
          )}
        </motion.div>
      )}

      {/* Sub-Score Breakdown */}
      {result.sub_scores && (
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.2}} className="w-full relative z-20">
          <GlassSurface className="md:p-14 w-full">
<div className="p-10 w-full">
          <h3 className="text-3xl font-black text-white mb-10 flex items-center justify-center gap-3"><BarChart3 className="w-8 h-8 text-emerald" /> Scoring Matrix</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {[{ key:'e', label:'Environmental', icon:'🌿', gradient:'from-emerald to-teal', cats: E_CATS, scores: result.sub_scores.e },
              { key:'s', label:'Social', icon:'👥', gradient:'from-amber to-orange-400', cats: S_CATS, scores: result.sub_scores.s },
              { key:'g', label:'Governance', icon:'🏛️', gradient:'from-sky to-blue-500', cats: G_CATS, scores: result.sub_scores.g }].map(pillar => {
              const isOpen = openPillar === pillar.key;
              const total = pillar.cats.reduce((sum, c) => sum + (Number((pillar.scores as any)?.[c.key]) || 0), 0);
              return (
                <div key={pillar.key} className="glass rounded-[2rem] overflow-hidden flex flex-col border border-slate-800 shadow-sm">
                  <button onClick={() => setOpenPillar(isOpen ? null : pillar.key)} className="w-full flex items-center justify-between p-6 text-left hover:bg-black/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{pillar.icon}</span>
                      <div>
                        <h4 className="font-black text-lg text-slate-100">{pillar.label}</h4>
                        <p className="text-xs font-bold text-slate-500">5 SUB-CATEGORIES</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-slate-100">{total}</span>
                      <span className="text-sm font-bold text-slate-300">/100</span>
                      {isOpen ? <ChevronUp className="w-5 h-5 text-slate-500 ml-1" /> : <ChevronDown className="w-5 h-5 text-slate-500 ml-1" />}
                    </div>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                        <div className="px-6 pb-8 space-y-4 border-t border-slate-800/50 pt-2 text-slate-500">
                          {pillar.cats.map(cat => {
                            const val = Number((pillar.scores as any)?.[cat.key]) || 0;
                            const pct = Math.min(100, (val / cat.max) * 100);
                            return (
                              <div key={cat.key} className="pt-4">
                                <div className="flex justify-between text-base mb-2 font-semibold">
                                  <span>{cat.label}</span>
                                  <span className="font-mono text-slate-100">{val}/{cat.max}</span>
                                </div>
                                <div className="h-2.5 rounded-full bg-slate-800/60 overflow-hidden">
                                  <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.8}} className={`h-full rounded-full bg-gradient-to-r ${pillar.gradient}`} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
          </div>
</GlassSurface>
        </motion.div>
      )}

      {/* Greenwash Flags */}
      {result.flags?.length > 0 && (
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.3}} className="w-full relative z-20">
          <GlassSurface className="md:p-14 w-full">
<div className="p-10 w-full">
          <h3 className="text-3xl font-black text-white mb-10 flex items-center justify-center gap-3"><AlertTriangle className="w-8 h-8 text-rose" /> Greenwash Detected</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {result.flags.map((f, i) => (
              <motion.div key={i} initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{delay:0.3+i*0.1}} className="bg-slate-900 rounded-[2rem] p-8 border border-slate-800 flex flex-col shadow-sm" style={{borderTopWidth: '8px', borderTopColor: SEV_COLORS[f.severity]}}>
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs px-3 py-1 rounded-full font-black tracking-wider" style={{background:`${SEV_COLORS[f.severity]}15`, color: SEV_COLORS[f.severity]}}>{f.severity}</span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-500 font-bold">{f.type}</span>
                </div>
                <h4 className="font-bold text-lg mb-3 text-slate-100 leading-snug">{f.title}</h4>
                <p className="text-sm text-slate-500 mb-6 flex-1 leading-relaxed">{f.description}</p>
                {f.evidence && <p className="text-xs italic text-slate-500 border-l-2 border-slate-700 pl-3 mt-auto py-1">"{f.evidence}"</p>}
              </motion.div>
            ))}
          </div>
          </div>
</GlassSurface>
        </motion.div>
      )}

      {/* Blockchain Panel Tile */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.4}} className="w-full relative z-20 mb-20">
        <BlockchainPanel hash={pdfHash || result.blockchain_hash} companyName={result.company_name} greenScore={result.overall_score} grade={result.grade} ipfsCid={ipfsCid} onDownload={() => onDownload(result)} />
      </motion.div>
      </div>
    </motion.section>
  );
}

// ==================== BLOCKCHAIN PANEL ====================
function BlockchainPanel({ hash, companyName, greenScore, grade, ipfsCid, onDownload }: { hash: string; companyName: string; greenScore: number; grade: string; ipfsCid?: string | null; onDownload?: () => void }) {
  const [state, setState] = useState<'idle'|'connecting'|'switching'|'minting'|'success'|'error'>('idle');
  const [txResult, setTxResult] = useState<{ txHash: string; txUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDeployed, setIsDeployed] = useState(CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000');
  const copyHash = () => { navigator.clipboard.writeText(hash); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handleMint = async () => {
    setError(null);
    try {
      if (!isMetaMaskInstalled()) throw new Error('MetaMask not found. Please install MetaMask browser extension.');
      setState('connecting');
      await connectWallet();
      setState('switching');
      const chainId = await getCurrentChainId();
      if (chainId !== SEPOLIA_CHAIN_ID) await switchToSepolia();
      setState('minting');
      const res = await storeReportOnChain(hash, companyName, greenScore, grade);
      setTxResult(res); setState('success');
      if (onDownload) onDownload();
    } catch (err: any) { setError(err.message); setState('error'); }
  };
  return (
    <GlassSurface className="rounded-3xl md:p-14 w-full">
<div className="p-10 text-left w-full">
      <h3 className="text-3xl font-black text-white mb-10 flex items-center justify-center gap-3"><Link2 className="w-8 h-8 text-emerald" /> Blockchain & IPFS Verification</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Document SHA-256 Fingerprint</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 font-mono text-sm p-4 rounded-2xl glass text-slate-500">{hash || 'Computing…'}</div>
            <button onClick={copyHash} className="p-4 rounded-2xl glass hover:bg-black/60 text-slate-500 hover:text-emerald-dark transition-all">{copied ? <CheckCircle className="w-5 h-5 text-emerald" /> : <Copy className="w-5 h-5" />}</button>
          </div>
        </div>

        {ipfsCid && (
          <div className="glass rounded-2xl p-6 border-l-4 border-blue-400 flex flex-col justify-center">
            <p className="text-lg font-black text-blue-400 flex items-center gap-2 mb-2"><Database className="w-5 h-5" /> Stored on IPFS</p>
            <code className="text-sm font-mono break-all text-slate-500">{ipfsCid}</code>
            <a href={`https://gateway.pinata.cloud/ipfs/${ipfsCid}`} target="_blank" rel="noreferrer" className="mt-4 block text-center py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-bold hover:bg-blue-500/20 transition-all">View PDF ↗</a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[{l:'Entity',v:companyName},{l:'GreenScore',v:greenScore},{l:'Grade',v:grade},{l:'Network',v:'Ethereum Sepolia'}].map(({l,v}) => (
          <div key={l} className="glass rounded-2xl p-5 text-center">
            <p className="text-xs text-slate-500 mb-1 font-bold uppercase tracking-widest">{l}</p>
            <p className="font-black text-xl text-slate-100 truncate">{String(v)}</p>
          </div>
        ))}
      </div>

      {!isMetaMaskInstalled() && (
        <div className="glass rounded-2xl p-6 mb-6 border-l-4 border-amber">
          <p className="text-lg font-black text-amber mb-1">MetaMask Required</p>
          <p className="text-sm text-slate-500">Install <a href="https://metamask.io" target="_blank" rel="noreferrer" className="underline text-emerald-dark font-bold">MetaMask</a> to store reports on the blockchain permanently.</p>
        </div>
      )}
      {!isDeployed && (
        <div className="glass rounded-2xl p-6 mb-6 border-l-4 border-amber">
          <p className="text-lg font-black text-amber mb-1">Contract Not Configured</p>
          <p className="text-sm text-slate-500">Set VITE_CONTRACT_ADDRESS in .env and restart the dev server to mint reports.</p>
        </div>
      )}

      {state === 'idle' && (
        <div className="flex flex-col sm:flex-row gap-6">
          <button onClick={handleMint} disabled={!isMetaMaskInstalled() || !isDeployed} className="flex-1 bg-white text-slate-900 font-black py-4 px-8 rounded-2xl text-lg flex items-center justify-center gap-3 hover:bg-slate-200 hover:scale-[1.02] shadow-xl shadow-emerald-900/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <Wallet className="w-6 h-6" /> Store on Blockchain
          </button>
          <a href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer" className="sm:w-1/3 text-center py-4 px-8 rounded-2xl text-lg glass text-slate-300 font-bold hover:bg-black/60 transition-all flex items-center justify-center gap-2">
            Etherscan <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      )}

      {(state === 'connecting' || state === 'switching' || state === 'minting') && (
        <div className="text-center p-8 bg-white/50 rounded-[2rem] border border-slate-800/50">
          <div className="w-16 h-16 border-4 border-emerald/20 border-t-emerald rounded-full animate-spin mx-auto mb-6" />
          <p className="text-xl text-emerald-dark font-black">{state === 'connecting' ? 'Connecting to MetaMask…' : state === 'switching' ? 'Switching to Sepolia…' : 'Writing verification to blockchain…'}</p>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 border-l-4 border-rose">
            <p className="text-lg font-black text-rose mb-2">Transaction Failed</p>
            <p className="text-sm text-slate-500 leading-relaxed font-mono bg-white/50 p-4 rounded-xl">{error}</p>
          </div>
          <button onClick={() => setState('idle')} className="w-full py-4 rounded-2xl glass text-slate-300 text-lg font-bold hover:bg-black/60 transition-all">Try Again</button>
        </div>
      )}

      {state === 'success' && txResult && (
        <div className="space-y-6">
          <div className="glass rounded-2xl p-8 border-l-8 border-emerald-500 bg-white/50">
            <p className="text-2xl font-black text-emerald-500 mb-2 flex items-center gap-3"><CheckCircle className="w-8 h-8" /> Immutable Record Created</p>
            <p className="text-sm text-slate-500 font-bold">The hash, company, score, and grade are now permanent and tamperproof on Ethereum Sepolia.</p>
          </div>
          <div className="glass p-6 rounded-2xl text-center">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Transaction Hash</p>
            <code className="text-sm font-mono break-all inline-block p-4 rounded-xl bg-black/80 text-slate-300 font-bold w-full mx-auto">{txResult.txHash}</code>
          </div>
          <a href={txResult.txUrl} target="_blank" rel="noreferrer" className="block text-center bg-emerald-50 text-emerald-900 border-2 border-emerald-500 font-black text-xl py-4 rounded-2xl shadow-xl shadow-emerald/20 hover:scale-[1.02] hover:bg-emerald-100 transition-all">
            Verify on Etherscan ↗
          </a>
        </div>
      )}
    </div>
</GlassSurface>
  );
}

// ==================== VERIFY PAGE ====================
function VerifyPage() {
  const [state, setState] = useState<'idle'|'hashing'|'looking'|'found'|'not_found'|'error'>('idle');
  const [hash, setHash] = useState<string|null>(null);
  const [report, setReport] = useState<any>(null);
  const [ipfsInfo, setIpfsInfo] = useState<any>(null);
  const [error, setError] = useState<string|null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setFileName(file.name); setError(null); setState('hashing'); setIpfsInfo(null); setReport(null);
    try {
      const buffer = await file.arrayBuffer();
      const h = await hashBuffer(buffer); setHash(h); setState('looking');
      // Check both on-chain and IPFS in parallel
      const [onChain, ipfsRes] = await Promise.all([
        getReportFromChain(h),
        fetch(`/api/ipfs/lookup/${h}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (ipfsRes?.found) setIpfsInfo(ipfsRes);
      if (onChain) { setReport(onChain); setState('found'); }
      else if (ipfsRes?.found) { setState('found'); }
      else setState('not_found');
    } catch (err: any) { setError(err.message); setState('error'); }
  };
  const reset = () => { setState('idle'); setHash(null); setReport(null); setIpfsInfo(null); setError(null); setFileName(''); };

  return (
    <section className="w-full pt-32 pb-20 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] relative z-10">
      <div className="w-full max-w-6xl px-6 flex flex-col gap-6 items-center text-center mx-auto">
        
        {/* Tile 1: Verify Header */}
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full relative z-20">
          <GlassSurface className="md:p-14 w-full">
<div className="p-10 flex flex-col items-center w-full">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-4 flex items-center justify-center gap-3">
            <Search className="w-8 h-8 md:w-10 md:h-10 text-emerald" /> Verify ESG Report
          </h1>
          <p className="text-base text-slate-500 max-w-xl">
            Re-upload any PDF to verify its integrity. SHA-256 hash computed locally, checked against blockchain & IPFS.
          </p>
          </div>
</GlassSurface>
        </motion.div>

        <input type="file" ref={fileRef} onChange={handleFile} className="hidden" accept=".pdf" />
        
        <div className="w-full max-w-4xl mx-auto text-left">
          {(state === 'idle' || state === 'error') && (
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.1}}>
              <div onClick={() => fileRef.current?.click()} className="cursor-pointer group">
                <GlassSurface className="w-full hover:border-emerald/30 shadow-lg">
                  <div className="p-16 flex flex-col items-center justify-center text-center transition-all w-full">
                    <Search className="w-16 h-16 text-emerald mb-6 mx-auto group-hover:scale-110 transition-transform" />
                    <div>
                      <p className="font-bold text-slate-100 text-2xl mb-2">Upload PDF to verify</p>
                      <p className="text-base text-slate-500">We'll compute its SHA-256 hash and check against the blockchain + IPFS</p>
                    </div>
                  </div>
                </GlassSurface>
              </div>
              {error && (
                <div className="mt-6 glass rounded-2xl p-4 border-l-4 border-rose">
                  <p className="font-bold text-rose">{error}</p>
                </div>
              )}
            </motion.div>
          )}

          {(state === 'hashing' || state === 'looking') && (
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.1}} className="w-full">
              <GlassSurface className="w-full shadow-lg">
<div className="p-16 text-center w-full">
              <div className="w-16 h-16 border-4 border-emerald/20 border-t-emerald rounded-full animate-spin mx-auto mb-6" />
              <p className="font-bold text-slate-100 text-xl mb-2">
                {state === 'hashing' ? 'Computing SHA-256…' : 'Querying Ethereum Sepolia & IPFS…'}
              </p>
              <p className="text-base text-slate-500">{fileName}</p>
              </div>
</GlassSurface>
            </motion.div>
          )}

          {state === 'not_found' && (
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.1}} className="space-y-6">
              <GlassSurface className="md:p-12 w-full shadow-lg">
<div className="p-8 flex flex-col items-center w-full">
                <div className="mb-6 w-full">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Document Hash (SHA-256)</p>
                  <code className="text-sm font-mono break-all block p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-300">{hash}</code>
                </div>
                <div className="bg-amber-900/20 backdrop-blur-md rounded-2xl p-6 border-l-4 border-amber w-full">
                  <p className="font-bold text-amber text-lg mb-1">⚠ No Record Found</p>
                  <p className="text-base text-slate-500">This document ({fileName}) has no verified on-chain or IPFS presence.</p>
                </div>
              </div>
</GlassSurface>
              <button onClick={reset} className="w-full mt-6 py-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-300 text-base font-bold hover:bg-slate-700/80 hover:text-white transition-all shadow-md">
                Try Another File
              </button>
            </motion.div>
          )}

          {state === 'found' && (report || ipfsInfo) && (
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay: 0.1}} className="space-y-6 w-full">
              <GlassSurface className="md:p-12 shadow-lg w-full w-full">
<div className="p-8 flex flex-col items-start w-full">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-r from-emerald to-teal flex items-center justify-center shadow-lg shadow-emerald/20">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-2xl text-slate-100">Document Verified</h3>
                    <p className="text-sm font-bold text-emerald-dark mt-1">
                      {report ? 'On-chain record confirmed ✓' : 'IPFS record found ✓'}
                      {report && ipfsInfo ? ' · IPFS stored ✓' : ''}
                    </p>
                  </div>
                </div>
                
                <div className="mb-8">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Document Hash (SHA-256)</p>
                  <code className="text-sm font-mono break-all block p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-300">{hash}</code>
                </div>
                
                {report && (
                  <>
                    <h4 className="text-sm font-bold text-slate-100 mb-3 border-b border-slate-800 pb-2">Blockchain Metadata</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      {[
                        { l: 'Entity', v: report.company },
                        { l: 'GreenScore', v: report.greenScore },
                        { l: 'Grade', v: report.grade },
                        { l: 'Stored', v: new Date(report.timestamp * 1000).toLocaleDateString() },
                        { l: 'Network', v: 'Ethereum Sepolia' },
                        { l: 'File', v: fileName }
                      ].map(({ l, v }) => (
                        <div key={l} className="glass rounded-2xl p-4">
                          <p className="text-xs text-slate-500 mb-1 font-bold">{l}</p>
                          <p className="font-black text-base text-slate-100 truncate">{String(v)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mb-8">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Deployer Address</p>
                      <code className="text-xs font-mono break-all block p-4 rounded-2xl glass text-slate-500">{report.submitter}</code>
                    </div>
                  </>
                )}

                {ipfsInfo && (
                  <div className="mb-8 bg-slate-900/60 backdrop-blur-md rounded-2xl p-6 border-l-4 border-blue-500 shadow-lg">
                    <p className="text-lg font-black text-blue-400 flex items-center gap-2 mb-4"><Database className="w-5 h-5" /> IPFS Record</p>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">IPFS CID</p>
                    <code className="text-sm font-mono break-all block p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 font-bold">{ipfsInfo.ipfsCid}</code>
                    <div className="grid grid-cols-2 gap-4 mt-4 mb-4">
                      <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3"><p className="text-xs font-bold text-slate-500 mb-1">File Name</p><p className="text-sm font-bold text-slate-100 truncate">{ipfsInfo.fileName}</p></div>
                      <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3"><p className="text-xs font-bold text-slate-500 mb-1">File Size</p><p className="text-sm font-bold text-slate-100">{(ipfsInfo.fileSize / 1024).toFixed(1)} KB</p></div>
                    </div>
                    <a href={ipfsInfo.gateway} target="_blank" rel="noreferrer" className="block text-center py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-bold hover:bg-blue-500/20 transition-all">View PDF on IPFS Gateway ↗</a>
                  </div>
                )}

                {report && hash && (
                  <a href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" className="block text-center bg-white text-slate-900 font-black text-lg py-4 rounded-2xl shadow-xl shadow-emerald-900/10 hover:scale-[1.02] hover:bg-slate-200 transition-all">
                    View Contract on Etherscan ↗
                  </a>
                )}
                {!report && ipfsInfo && (
                  <div className="bg-amber-900/20 backdrop-blur-md rounded-2xl p-4 border-l-4 border-amber mt-4 w-full">
                    <p className="text-sm font-bold text-amber">⚠ This document is on IPFS but not yet stored on the blockchain. Store it via the results page after analysis.</p>
                  </div>
                )}
              </div>
</GlassSurface>
              <button onClick={reset} className="w-full mt-6 py-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-300 text-base font-bold hover:bg-slate-700/80 hover:text-white transition-all shadow-md">
                Verify Another File
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
