/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import {
  Upload, Brain, Shield, AlertTriangle, CheckCircle,
  Download, BarChart3, Globe, Zap, Database,
  ChevronDown, ChevronUp, History, Info, ExternalLink,
  Search, Wallet, Link2, Copy, ArrowLeft, Leaf, X, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  isMetaMaskInstalled, connectWallet, switchToAmoy,
  storeReportOnChain, getReportFromChain, hashBuffer,
  getCurrentChainId, AMOY_CHAIN_ID, CONTRACT_ADDRESS
} from './blockchain';

interface jsPDFWithAutoTable extends jsPDF { autoTable: (options: any) => jsPDF; }
ChartJS.register(ArcElement, Tooltip, Legend);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
  const [page, setPage] = useState<'home' | 'results' | 'verify'>('home');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ESGResult | null>(null);
  const [history, setHistory] = useState<ESGResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pdfHash, setPdfHash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchHistory(); }, []);
  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      setHistory(data.map((r: any) => ({ ...r, red_flags: typeof r.red_flags === 'string' ? JSON.parse(r.red_flags) : r.red_flags, sub_scores: r.sub_scores || { e: {}, s: {}, g: {} }, flags: r.flags || [], strengths: r.strengths || [], weaknesses: r.weaknesses || [] })));
    } catch (err) { console.error("Failed to fetch history", err); }
  };

  const deleteReport = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this analysis?")) return;
    try { const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' }); if (res.ok) fetchHistory(); } catch (err) { console.error(err); }
  };

  const generatePDF = (data: ESGResult) => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    doc.setFillColor(0, 200, 150); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.text('GreenLedger ESG Scorecard', 15, 25);
    doc.setFontSize(10); doc.text(`Generated ${new Date().toLocaleDateString()}`, 150, 25);
    doc.setTextColor(30, 41, 59); doc.setFontSize(18); doc.text(data.company_name, 15, 55);
    doc.setFontSize(12); doc.text(`Report Year: ${data.report_year}`, 15, 62);
    doc.autoTable({ startY: 70, head: [['Metric', 'Score', 'Grade']], body: [
      ['Overall GreenScore', data.overall_score, data.grade],
      ['Environmental (E)', data.env_score, ''], ['Social (S)', data.soc_score, ''], ['Governance (G)', data.gov_score, ''],
    ], theme: 'grid', headStyles: { fillColor: [0, 200, 150] } });
    const finalY = (doc as any).lastAutoTable.finalY || 120;
    if (data.flags?.length) {
      doc.setFontSize(14); doc.text('Greenwash Flags', 15, finalY + 15); doc.setFontSize(10);
      data.flags.forEach((f, i) => { doc.text(`• [${f.severity}] ${f.title}: ${f.description}`, 15, finalY + 25 + (i * 10)); });
    }
    doc.save(`${data.company_name}_ESG.pdf`);
  };

  const analyzeWithAI = async (pdfBuffer: ArrayBuffer): Promise<ESGResult> => {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    // @ts-ignore
    const workerUrl = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    GlobalWorkerOptions.workerSrc = workerUrl.default;
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

    const prompt = `
      Analyze the following ESG/Annual Report text and provide a detailed ESG Due Diligence score.
      IMPORTANT: You MUST score ALL THREE pillars (Environmental, Social, AND Governance). Do NOT return 0 for any pillar unless the document truly contains zero information about it.
      Score each pillar 0-100 based on DISCLOSURE QUALITY. Each pillar score should equal the sum of its sub-category scores.
      ENVIRONMENTAL (E): emissions_data(max 25), improvement(max 20), renewable_targets(max 15), third_party_audit(max 25), water_waste_bio(max 15).
      SOCIAL (S): worker_safety(max 25), diversity(max 25), fair_wage(max 20), community(max 15), supply_chain(max 15).
      GOVERNANCE (G): board_independence(max 25), anti_corruption(max 25), exec_pay(max 20), audit_committee(max 20), whistleblower(max 10).
      For GOVERNANCE specifically, look for: board composition, independent directors, corporate ethics, anti-bribery, executive salaries, external auditors, compliance, whistleblower hotlines, code of conduct.
      Return exactly 3 greenwash flags with type(VAGUENESS|MISSING_DATA|CONTRADICTION|NO_THIRD_PARTY|BENCHMARK_GAP), severity(HIGH|MEDIUM|LOW).
      Return exactly 3 strengths and 3 weaknesses. Keep all strings short (<100 chars). Summary <200 chars.
      Text:\n${text}
    `;
    setProgress(60);
    const MAX_RETRIES = 3;
    const DELAYS = [10000, 30000, 60000];
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                company_name: { type: Type.STRING }, report_year: { type: Type.STRING },
                overall_score: { type: Type.NUMBER }, grade: { type: Type.STRING },
                env_score: { type: Type.NUMBER }, soc_score: { type: Type.NUMBER }, gov_score: { type: Type.NUMBER },
                sub_scores: { type: Type.OBJECT, properties: {
                  e: { type: Type.OBJECT, properties: { emissions_data: {type:Type.NUMBER}, improvement: {type:Type.NUMBER}, renewable_targets: {type:Type.NUMBER}, third_party_audit: {type:Type.NUMBER}, water_waste_bio: {type:Type.NUMBER} } },
                  s: { type: Type.OBJECT, properties: { worker_safety: {type:Type.NUMBER}, diversity: {type:Type.NUMBER}, fair_wage: {type:Type.NUMBER}, community: {type:Type.NUMBER}, supply_chain: {type:Type.NUMBER} } },
                  g: { type: Type.OBJECT, properties: { board_independence: {type:Type.NUMBER}, anti_corruption: {type:Type.NUMBER}, exec_pay: {type:Type.NUMBER}, audit_committee: {type:Type.NUMBER}, whistleblower: {type:Type.NUMBER} } }
                }},
                flags: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: {type:Type.STRING}, severity: {type:Type.STRING}, title: {type:Type.STRING}, description: {type:Type.STRING}, evidence: {type:Type.STRING} } } },
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                summary: { type: Type.STRING }
              },
              required: ["company_name","report_year","overall_score","grade","env_score","soc_score","gov_score","sub_scores","flags","strengths","weaknesses","summary"]
            }
          }
        });
        setProgress(90);
        const parsed = JSON.parse(response.text || '{}');
        if (!parsed.sub_scores) parsed.sub_scores = { e: {}, s: {}, g: {} };
        if (!parsed.sub_scores.e) parsed.sub_scores.e = {};
        if (!parsed.sub_scores.s) parsed.sub_scores.s = {};
        if (!parsed.sub_scores.g) parsed.sub_scores.g = {};
        const eFromSubs = (Number(parsed.sub_scores.e.emissions_data)||0)+(Number(parsed.sub_scores.e.improvement)||0)+(Number(parsed.sub_scores.e.renewable_targets)||0)+(Number(parsed.sub_scores.e.third_party_audit)||0)+(Number(parsed.sub_scores.e.water_waste_bio)||0);
        const sFromSubs = (Number(parsed.sub_scores.s.worker_safety)||0)+(Number(parsed.sub_scores.s.diversity)||0)+(Number(parsed.sub_scores.s.fair_wage)||0)+(Number(parsed.sub_scores.s.community)||0)+(Number(parsed.sub_scores.s.supply_chain)||0);
        const gFromSubs = (Number(parsed.sub_scores.g.board_independence)||0)+(Number(parsed.sub_scores.g.anti_corruption)||0)+(Number(parsed.sub_scores.g.exec_pay)||0)+(Number(parsed.sub_scores.g.audit_committee)||0)+(Number(parsed.sub_scores.g.whistleblower)||0);
        const e = Math.min(100, Math.max(0, eFromSubs > 0 ? eFromSubs : Number(parsed.env_score)||0));
        const s = Math.min(100, Math.max(0, sFromSubs > 0 ? sFromSubs : Number(parsed.soc_score)||0));
        const g = Math.min(100, Math.max(0, gFromSubs > 0 ? gFromSubs : Number(parsed.gov_score)||0));
        const distributeScore = (score: number, cats: {key:string;max:number}[], subObj: any) => {
          const total = cats.reduce((sum, c) => sum + (Number(subObj[c.key])||0), 0);
          if (total === 0 && score > 0) { const maxT = cats.reduce((s2, c) => s2+c.max, 0); cats.forEach(c => { subObj[c.key] = Math.round((c.max/maxT)*score); }); }
        };
        distributeScore(e,[{key:'emissions_data',max:25},{key:'improvement',max:20},{key:'renewable_targets',max:15},{key:'third_party_audit',max:25},{key:'water_waste_bio',max:15}],parsed.sub_scores.e);
        distributeScore(s,[{key:'worker_safety',max:25},{key:'diversity',max:25},{key:'fair_wage',max:20},{key:'community',max:15},{key:'supply_chain',max:15}],parsed.sub_scores.s);
        distributeScore(g,[{key:'board_independence',max:25},{key:'anti_corruption',max:25},{key:'exec_pay',max:20},{key:'audit_committee',max:20},{key:'whistleblower',max:10}],parsed.sub_scores.g);
        parsed.overall_score = Math.round((e*0.35+s*0.30+g*0.35)*10)/10;
        parsed.env_score = e; parsed.soc_score = s; parsed.gov_score = g;
        if (parsed.overall_score >= 85) parsed.grade = 'A'; else if (parsed.overall_score >= 70) parsed.grade = 'B'; else if (parsed.overall_score >= 50) parsed.grade = 'C'; else if (parsed.overall_score >= 30) parsed.grade = 'D'; else parsed.grade = 'F';
        return parsed;
      } catch (err: any) {
        const isQuota = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Resource has been exhausted');
        if (isQuota && attempt < MAX_RETRIES) {
          setError(`Rate limited. Retrying in ${DELAYS[attempt]/1000}s... (${attempt+2}/${MAX_RETRIES+1})`);
          await new Promise(r => setTimeout(r, DELAYS[attempt])); setError(null); continue;
        }
        throw err;
      }
    }
    throw new Error('Analysis failed after retries');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') { setError("Please upload a valid PDF."); return; }
    setIsAnalyzing(true); setError(null); setProgress(0); setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      setProgress(10);
      const hash = await hashBuffer(buffer);
      setPdfHash(hash); setProgress(30);
      const analysis = await analyzeWithAI(buffer);
      analysis.blockchain_hash = hash;
      const saveRes = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(analysis) });
      if (saveRes.ok) fetchHistory();
      setResult(analysis); setProgress(100); setPage('results');
    } catch (err: any) { setError("Analysis failed: " + (err.message || "Unknown error")); }
    finally { setIsAnalyzing(false); }
  };

  const handleReset = () => { setPage('home'); setResult(null); setPdfHash(null); setError(null); setProgress(0); };

  return (
    <div className="min-h-screen relative">
      {/* Floating gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-br from-emerald/15 to-teal/10 blur-3xl top-[-100px] right-[-100px] animate-pulse" style={{animationDuration:'8s'}} />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-gradient-to-br from-sky/10 to-violet/10 blur-3xl bottom-[-50px] left-[-50px] animate-pulse" style={{animationDuration:'12s'}} />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-gradient-to-br from-amber/8 to-rose/8 blur-3xl top-[40%] left-[50%] animate-pulse" style={{animationDuration:'10s'}} />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-nav flex justify-center">
        <div className="w-full max-w-7xl px-6 py-3 flex items-center justify-between">
          <button onClick={handleReset} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald to-teal flex items-center justify-center shadow-lg shadow-emerald/20 group-hover:shadow-emerald/40 transition-shadow">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold text-slate-800 tracking-tight">Green<span className="gradient-text">Ledger</span></span>
          </button>
          <div className="flex items-center gap-2">
            {page !== 'home' && <button onClick={handleReset} className="px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-800 hover:bg-white/50 transition-all flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Home</button>}
            <button onClick={() => setShowHistory(!showHistory)} className="px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-800 hover:bg-white/50 transition-all flex items-center gap-1.5"><History className="w-4 h-4" /> History</button>
            <button onClick={() => setPage('verify')} className="px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-800 hover:bg-white/50 transition-all flex items-center gap-1.5"><Search className="w-4 h-4" /> Verify</button>
            <button onClick={() => { handleReset(); fileInputRef.current?.click(); }} className="px-5 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald to-teal text-white shadow-lg shadow-emerald/25 hover:shadow-emerald/40 hover:scale-[1.02] transition-all flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> New Analysis</button>
          </div>
        </div>
      </nav>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf" />

      {/* HOME PAGE */}
      {page === 'home' && (
        <section className="relative pt-28 pb-20 z-10 min-h-[calc(100vh-80px)] flex flex-col items-center justify-center">
          <div className="w-full max-w-7xl mx-auto px-6 flex flex-col items-center text-center">
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs font-bold text-emerald-dark mb-8">
              <span className="w-2 h-2 bg-emerald rounded-full animate-pulse" /><span>AI + BLOCKCHAIN POWERED</span>
            </motion.div>
            <motion.h1 initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="text-5xl md:text-7xl font-black mb-6 tracking-tight text-slate-900">
              Green<span className="gradient-text">Ledger</span><span className="text-slate-300">.AI</span>
            </motion.h1>
            <motion.p initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}} className="text-xl text-slate-500 mb-3 font-medium">AI-Powered ESG Due Diligence for Investors</motion.p>
            <motion.p initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.3}} className="text-base text-slate-400 mb-12 max-w-2xl mx-auto text-center">Upload any sustainability report · Gemini AI scores 15 sub-categories · Immutable blockchain verification on Polygon Amoy</motion.p>

            <div className="w-full max-w-3xl mx-auto flex justify-center">
              {!isAnalyzing && (
                <motion.div whileHover={{scale:1.01}} onClick={() => fileInputRef.current?.click()} className="glass-strong rounded-3xl p-14 text-center hover:border-emerald/30 transition-all cursor-pointer group relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald/3 to-teal/3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald/10 to-teal/10 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                      <Upload className="w-10 h-10 text-emerald" />
                    </div>
                    <h4 className="text-2xl font-bold text-slate-800 mb-2">Drop your ESG report here</h4>
                    <p className="text-slate-400 text-sm">PDF format · Analyzed by Gemini AI · Results in seconds</p>
                    {error && <p className="mt-4 text-rose text-sm font-medium glass rounded-xl px-4 py-2 inline-block">{error}</p>}
                  </div>
                </motion.div>
              )}
              {isAnalyzing && (
                <div className="glass-strong rounded-3xl p-14 text-center">
                  <div className="w-16 h-16 border-4 border-emerald/20 border-t-emerald rounded-full animate-spin mx-auto mb-6" />
                  <h4 className="text-xl font-bold text-slate-800 mb-2">Analyzing your report</h4>
                  <p className="text-slate-400 text-sm">{progress < 50 ? "Extracting text from PDF..." : progress < 90 ? "Gemini AI scoring 15 sub-categories..." : "Finalizing scores..."}</p>
                  {error && <p className="mt-3 text-amber text-sm font-medium">{error}</p>}
                  <div className="mt-8 h-2 bg-slate-100 rounded-full overflow-hidden"><motion.div initial={{width:0}} animate={{width:`${progress}%`}} className="h-full bg-gradient-to-r from-emerald to-teal rounded-full" /></div>
                </div>
              )}
            </div>
          </div>

          {/* Feature Cards */}
          <div className="w-full max-w-7xl mx-auto px-6 mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 place-items-center">
            {[
              { icon: Brain, title: "Gemini AI Engine", desc: "Advanced PDF analysis with 15 ESG sub-category scoring and greenwash detection.", gradient: "from-emerald/10 to-teal/10" },
              { icon: Zap, title: "Instant GreenScore™", desc: "Real-time weighted E/S/G breakdown with letter grades and confidence scoring.", gradient: "from-sky/10 to-violet/10" },
              { icon: Shield, title: "Polygon Amoy Chain", desc: "Immutable report hashing with MetaMask. SHA-256 fingerprint stored on-chain.", gradient: "from-violet/10 to-rose/10" },
              { icon: Database, title: "Persistent Storage", desc: "SQLite backend stores all analyses. Export professional PDF scorecards.", gradient: "from-amber/10 to-rose/10" },
            ].map((f, i) => (
              <motion.div key={i} initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{delay:0.4+i*0.1}} className="glass glass-card rounded-2xl p-7 transition-all duration-300 cursor-default group">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-6 h-6 text-slate-600" />
                </div>
                <h4 className="text-lg font-bold text-slate-800 mb-2">{f.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* RESULTS PAGE */}
      {page === 'results' && result && <ResultsPage result={result} pdfHash={pdfHash} onDownload={generatePDF} />}

      {/* VERIFY PAGE */}
      {page === 'verify' && <VerifyPage />}

      {/* HISTORY PANEL */}
      <AnimatePresence>
        {showHistory && (
          <motion.section initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} className="fixed inset-0 z-[60] bg-black/10 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto mt-20 p-6">
              <div className="glass-strong rounded-3xl p-8 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-emerald" /> Analysis History</h2>
                  <button onClick={() => setShowHistory(false)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.length === 0 ? <p className="text-slate-400 italic col-span-2">No previous analyses yet.</p> : history.map((item, idx) => (
                    <div key={idx} className="glass rounded-xl p-5 hover:border-emerald/30 transition-all cursor-pointer group" onClick={() => { setResult(item); setPage('results'); setShowHistory(false); }}>
                      <div className="flex justify-between items-start mb-3">
                        <div><h4 className="font-bold text-slate-800 group-hover:text-emerald-dark transition-colors">{item.company_name}</h4><p className="text-xs text-slate-400">{item.report_year}</p></div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-lg bg-gradient-to-r from-emerald/10 to-teal/10 text-emerald-dark font-bold text-sm">{item.overall_score}</span>
                          <button onClick={(e) => deleteReport((item as any).id, e)} className="p-1 rounded-lg text-slate-300 hover:text-rose hover:bg-rose/10 transition-all"><X className="w-3 h-3" /></button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {[{l:'E',v:item.env_score,c:'emerald'},{l:'S',v:item.soc_score,c:'amber'},{l:'G',v:item.gov_score,c:'sky'}].map(p => (
                          <span key={p.l} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 font-medium">{p.l}: {p.v}</span>
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
        <footer className="py-16 relative z-10">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-emerald to-teal rounded-lg flex items-center justify-center"><Leaf className="w-4 h-4 text-white" /></div>
              <span className="font-bold text-slate-700">GreenLedger</span>
            </div>
            <p className="text-slate-300 text-xs">© 2025 GreenLedger · Team OnlyVibecoders · Hackathon 2025 · Sustainable Finance</p>
          </div>
        </footer>
      )}
    </div>
  );
}

// ==================== RESULTS PAGE ====================
function ResultsPage({ result, pdfHash, onDownload }: { result: ESGResult; pdfHash: string | null; onDownload: (d: ESGResult) => void }) {
  const [openPillar, setOpenPillar] = useState<string | null>('e');
  const gradeColors: Record<string,string> = { A: 'from-emerald to-teal', B: 'from-sky to-emerald', C: 'from-amber to-sky', D: 'from-rose to-amber', F: 'from-rose to-red-600' };
  return (
    <motion.section initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} className="py-12 pt-24 max-w-7xl mx-auto px-6 space-y-6 relative z-10">
      {/* Header Card */}
      <div className="glass-strong rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-emerald/5 to-transparent rounded-bl-full" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 relative z-10">
          <div>
            <h2 className="text-3xl font-black text-slate-900">{result.company_name}</h2>
            <p className="text-emerald-dark font-bold tracking-widest uppercase text-sm mt-1">{result.report_year} ESG ANALYSIS</p>
            {result.summary && <p className="text-sm text-slate-400 mt-2 max-w-2xl">{result.summary}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-6 py-2.5 rounded-2xl bg-gradient-to-r ${gradeColors[result.grade] || gradeColors.C} text-white font-black text-xl shadow-lg`}>GRADE {result.grade}</div>
            <button onClick={() => onDownload(result)} className="p-3 rounded-xl glass hover:bg-white/60 text-slate-500 hover:text-emerald-dark transition-all" title="Download PDF"><Download className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Chart + Pillars */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="flex flex-col items-center justify-center text-center p-8 glass rounded-2xl">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-6">Overall GreenScore</h5>
            <div className="relative w-52 h-52">
              <Doughnut data={{ datasets: [{ data: [result.overall_score, 100-result.overall_score], backgroundColor: ['#00C896','#f1f5f9'], borderWidth: 0, borderRadius: 10 }] }} options={{ cutout: '82%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-5xl font-black gradient-text">{result.overall_score}</span><span className="text-[10px] text-slate-400 font-bold mt-1">OUT OF 100</span></div>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-8">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Pillar Breakdown</h5>
            {[{ label:'Environmental', score: result.env_score, gradient:'from-emerald to-teal', emoji:'🌿' },
              { label:'Social', score: result.soc_score, gradient:'from-amber to-orange-400', emoji:'👥' },
              { label:'Governance', score: result.gov_score, gradient:'from-sky to-violet', emoji:'🏛️' }].map((p,i) => (
              <div key={i}>
                <div className="flex justify-between items-end mb-2"><span className="font-bold text-slate-700 flex items-center gap-2"><span>{p.emoji}</span>{p.label}</span><span className="font-black text-lg gradient-text">{p.score}<span className="text-slate-300 text-sm">/100</span></span></div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden"><motion.div initial={{width:0}} animate={{width:`${p.score}%`}} transition={{delay:0.5+i*0.15, duration:1, ease:'easeOut'}} className={`h-full bg-gradient-to-r ${p.gradient} rounded-full`} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strengths / Weaknesses */}
      {(result.strengths?.length > 0 || result.weaknesses?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {result.strengths?.length > 0 && (
            <div className="glass rounded-2xl p-6 border-l-4 border-emerald">
              <h3 className="font-bold text-sm mb-3 text-emerald-dark flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Strengths</h3>
              <ul className="space-y-2">{result.strengths.map((s, i) => <li key={i} className="text-sm text-slate-600 flex items-start gap-2"><span className="text-emerald mt-0.5">✓</span>{s}</li>)}</ul>
            </div>
          )}
          {result.weaknesses?.length > 0 && (
            <div className="glass rounded-2xl p-6 border-l-4 border-rose">
              <h3 className="font-bold text-sm mb-3 text-rose flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Key Gaps</h3>
              <ul className="space-y-2">{result.weaknesses.map((w, i) => <li key={i} className="text-sm text-slate-600 flex items-start gap-2"><span className="text-rose mt-0.5">✗</span>{w}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* Sub-Score Breakdown */}
      {result.sub_scores && (
        <div className="glass-strong rounded-3xl p-8">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald" /> 15 Sub-Category Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[{ key:'e', label:'Environmental', icon:'🌿', gradient:'from-emerald to-teal', cats: E_CATS, scores: result.sub_scores.e },
              { key:'s', label:'Social', icon:'👥', gradient:'from-amber to-orange-400', cats: S_CATS, scores: result.sub_scores.s },
              { key:'g', label:'Governance', icon:'🏛️', gradient:'from-sky to-violet', cats: G_CATS, scores: result.sub_scores.g }].map(pillar => {
              const isOpen = openPillar === pillar.key;
              const total = pillar.cats.reduce((sum, c) => sum + (Number((pillar.scores as any)?.[c.key]) || 0), 0);
              return (
                <div key={pillar.key} className="glass rounded-2xl overflow-hidden">
                  <button onClick={() => setOpenPillar(isOpen ? null : pillar.key)} className="w-full flex items-center justify-between p-5 text-left hover:bg-white/30 transition-colors">
                    <div className="flex items-center gap-3"><span className="text-2xl">{pillar.icon}</span><div><h4 className="font-bold text-slate-800">{pillar.label}</h4><p className="text-[10px] text-slate-400">5 sub-categories</p></div></div>
                    <div className="flex items-center gap-2"><span className="text-xl font-black gradient-text">{total}</span><span className="text-xs text-slate-300">/100</span>{isOpen ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}</div>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                        <div className="px-5 pb-5 space-y-3 border-t border-slate-100">
                          {pillar.cats.map(cat => {
                            const val = Number((pillar.scores as any)?.[cat.key]) || 0;
                            const pct = Math.min(100, (val / cat.max) * 100);
                            return (
                              <div key={cat.key} className="pt-3">
                                <div className="flex justify-between text-sm mb-1.5"><span className="text-slate-500 text-xs">{cat.label}</span><span className="font-mono text-xs font-bold text-slate-600">{val}/{cat.max}</span></div>
                                <div className="h-1.5 rounded-full bg-slate-100"><motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.8}} className={`h-1.5 rounded-full bg-gradient-to-r ${pillar.gradient}`} /></div>
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
      )}

      {/* Greenwash Flags */}
      {result.flags?.length > 0 && (
        <div className="glass-strong rounded-3xl p-8">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose" /> Greenwash Flags</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {result.flags.map((f, i) => (
              <motion.div key={i} initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{delay:0.3+i*0.1}} className="glass rounded-xl p-5 border-l-4" style={{borderLeftColor: SEV_COLORS[f.severity]}}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold" style={{background:`${SEV_COLORS[f.severity]}15`, color: SEV_COLORS[f.severity]}}>{f.severity}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-50 text-slate-400 font-medium">{f.type}</span>
                </div>
                <h4 className="font-bold text-sm mb-2 text-slate-800">{f.title}</h4>
                <p className="text-xs text-slate-500 mb-3">{f.description}</p>
                {f.evidence && <p className="text-[10px] italic text-slate-400 border-l-2 border-slate-200 pl-2">"{f.evidence}"</p>}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Blockchain Panel */}
      <BlockchainPanel hash={pdfHash || result.blockchain_hash} companyName={result.company_name} greenScore={result.overall_score} grade={result.grade} />
    </motion.section>
  );
}

// ==================== BLOCKCHAIN PANEL ====================
function BlockchainPanel({ hash, companyName, greenScore, grade }: { hash: string; companyName: string; greenScore: number; grade: string }) {
  const [state, setState] = useState<'idle'|'connecting'|'switching'|'minting'|'success'|'error'>('idle');
  const [txResult, setTxResult] = useState<{ txHash: string; txUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isDeployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const copyHash = () => { navigator.clipboard.writeText(hash); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handleMint = async () => {
    setError(null);
    try {
      setState('connecting'); await connectWallet();
      setState('switching'); const chain = await getCurrentChainId(); if (chain !== AMOY_CHAIN_ID) await switchToAmoy();
      setState('minting'); const res = await storeReportOnChain(hash, companyName, greenScore, grade);
      setTxResult(res); setState('success');
    } catch (err: any) { setError(err.message); setState('error'); }
  };

  return (
    <div className="glass-strong rounded-3xl p-8">
      <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><Link2 className="w-5 h-5 text-emerald" /> Blockchain Verification</h3>
      <div className="mb-6">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Document SHA-256 Fingerprint</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 font-mono text-xs p-3 rounded-xl break-all glass text-slate-500">{hash || 'Computing…'}</div>
          <button onClick={copyHash} className="p-2.5 rounded-xl glass hover:bg-white/60 text-slate-400 hover:text-emerald-dark transition-all">{copied ? <CheckCircle className="w-4 h-4 text-emerald" /> : <Copy className="w-4 h-4" />}</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[{l:'Company',v:companyName},{l:'GreenScore',v:greenScore},{l:'Grade',v:grade},{l:'Network',v:'Polygon Amoy'}].map(({l,v}) => (
          <div key={l} className="glass rounded-xl p-3 text-center"><p className="text-[10px] text-slate-400 mb-1">{l}</p><p className="font-bold text-sm text-slate-700 truncate">{String(v)}</p></div>
        ))}
      </div>
      {!isDeployed && (
        <div className="glass rounded-xl p-4 mb-4 border-l-4 border-amber">
          <p className="text-sm font-bold text-amber">⚠ Contract Not Deployed</p>
          <p className="text-xs text-slate-500 mt-1">Deploy GreenLedger.sol on Remix IDE → Polygon Amoy, then add <code className="bg-slate-100 px-1 rounded text-xs">VITE_CONTRACT_ADDRESS</code> to .env</p>
        </div>
      )}
      {state === 'idle' && (
        <div className="flex gap-3">
          {!isMetaMaskInstalled() ? (
            <a href="https://metamask.io/download/" target="_blank" className="flex-1 text-center bg-gradient-to-r from-emerald to-teal text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-emerald/20">🦊 Install MetaMask</a>
          ) : (
            <button onClick={handleMint} disabled={!isDeployed} className="flex-1 bg-gradient-to-r from-emerald to-teal hover:shadow-lg hover:shadow-emerald/30 disabled:opacity-40 text-white font-bold py-3 px-6 rounded-xl text-sm flex items-center justify-center gap-2 transition-all"><Wallet className="w-4 h-4" /> Store on Polygon Amoy</button>
          )}
          <a href="https://amoy.polygonscan.com" target="_blank" className="flex-1 text-center py-3 px-6 rounded-xl text-sm glass text-slate-600 hover:bg-white/60 font-medium transition-all">PolygonScan ↗</a>
        </div>
      )}
      {(state === 'connecting' || state === 'switching' || state === 'minting') && (
        <div className="text-center p-6"><div className="w-12 h-12 border-4 border-emerald/20 border-t-emerald rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-emerald-dark font-medium">{state === 'connecting' ? 'Connecting MetaMask…' : state === 'switching' ? 'Switching to Amoy…' : 'Writing to blockchain…'}</p></div>
      )}
      {state === 'error' && (
        <div><div className="glass rounded-xl p-4 mb-3 border-l-4 border-rose"><p className="text-sm font-bold text-rose">Transaction Failed</p><p className="text-xs text-slate-500 mt-1">{error}</p></div>
          <button onClick={() => setState('idle')} className="w-full py-2 rounded-xl glass text-slate-600 text-sm font-medium hover:bg-white/60">Try Again</button></div>
      )}
      {state === 'success' && txResult && (
        <div>
          <div className="glass rounded-xl p-4 mb-4 border-l-4 border-emerald"><p className="text-sm font-bold text-emerald-dark">✅ Stored on Polygon Amoy!</p><p className="text-xs text-slate-500 mt-1">Permanent · Tamperproof · Publicly verifiable</p></div>
          <div className="mb-3"><p className="text-[10px] text-slate-400 mb-1">Transaction Hash</p><code className="text-xs font-mono break-all block p-3 rounded-xl glass text-slate-500">{txResult.txHash}</code></div>
          <a href={txResult.txUrl} target="_blank" className="block text-center bg-gradient-to-r from-emerald to-teal text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald/20">View on PolygonScan ↗</a>
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-slate-100"><p className="text-[10px] text-slate-300">🔒 Only hash, company, score & grade stored on-chain. PDF never leaves your device. Free test MATIC from <a href="https://faucet.polygon.technology" target="_blank" className="text-emerald underline">faucet.polygon.technology</a>.</p></div>
    </div>
  );
}

// ==================== VERIFY PAGE ====================
function VerifyPage() {
  const [state, setState] = useState<'idle'|'hashing'|'looking'|'found'|'not_found'|'error'>('idle');
  const [hash, setHash] = useState<string|null>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string|null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setFileName(file.name); setError(null); setState('hashing');
    try {
      const buffer = await file.arrayBuffer();
      const h = await hashBuffer(buffer); setHash(h); setState('looking');
      const onChain = await getReportFromChain(h);
      if (onChain) { setReport(onChain); setState('found'); } else setState('not_found');
    } catch (err: any) { setError(err.message); setState('error'); }
  };
  const reset = () => { setState('idle'); setHash(null); setReport(null); setError(null); setFileName(''); };

  return (
    <section className="w-full pt-32 pb-20 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] relative z-10">
      <div className="w-full max-w-2xl px-6 flex flex-col items-center text-center mx-auto">
        <h1 className="text-3xl font-black text-slate-900 mb-2 flex items-center justify-center gap-3">
          <Search className="w-8 h-8 text-emerald" /> Verify ESG Report
        </h1>
        <p className="text-sm text-slate-400 mb-8 max-w-md">
          Re-upload any PDF to check its blockchain record. SHA-256 hash computed locally, looked up on Polygon Amoy.
        </p>
        <input type="file" ref={fileRef} onChange={handleFile} className="hidden" accept=".pdf" />
        
        <div className="w-full max-w-xl mx-auto text-left">
          {(state === 'idle' || state === 'error') && (
            <div>
              <div onClick={() => fileRef.current?.click()} className="glass-strong rounded-3xl p-12 text-center hover:border-emerald/30 transition-all cursor-pointer group">
                <Search className="w-14 h-14 text-emerald mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <p className="font-bold text-slate-800 text-lg">Upload PDF to verify</p>
                <p className="text-sm text-slate-400 mt-1">We'll compute its SHA-256 hash and check the blockchain</p>
              </div>
              {error && (
                <div className="mt-4 glass rounded-xl p-3 border-l-4 border-rose">
                  <p className="text-sm text-rose">{error}</p>
                </div>
              )}
            </div>
          )}

          {(state === 'hashing' || state === 'looking') && (
            <div className="glass-strong rounded-3xl p-12 text-center">
              <div className="w-12 h-12 border-4 border-emerald/20 border-t-emerald rounded-full animate-spin mx-auto mb-4" />
              <p className="font-bold text-slate-800">
                {state === 'hashing' ? 'Computing SHA-256…' : 'Querying Polygon Amoy…'}
              </p>
              <p className="text-sm text-slate-400 mt-1">{fileName}</p>
            </div>
          )}

          {state === 'not_found' && (
            <div className="space-y-4">
              <div className="glass-strong rounded-3xl p-6">
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Document Hash</p>
                  <code className="text-xs font-mono break-all block p-3 rounded-xl glass text-slate-500">{hash}</code>
                </div>
                <div className="glass rounded-xl p-4 border-l-4 border-amber">
                  <p className="font-bold text-amber">⚠ Not Found on Blockchain</p>
                  <p className="text-sm text-slate-500 mt-2">This document ({fileName}) has no on-chain record.</p>
                </div>
              </div>
              <button onClick={reset} className="w-full py-3 rounded-xl glass text-slate-600 text-sm font-medium hover:bg-white/60">
                Try Another File
              </button>
            </div>
          )}

          {state === 'found' && report && (
            <div className="space-y-4">
              <div className="glass-strong rounded-3xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald to-teal flex items-center justify-center shadow-lg shadow-emerald/20">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Verified on Polygon Amoy</p>
                    <p className="text-xs text-emerald-dark">Document integrity confirmed ✓</p>
                  </div>
                </div>
                
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Document Hash</p>
                  <code className="text-xs font-mono break-all block p-3 rounded-xl glass text-slate-500">{hash}</code>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    { l: 'Company', v: report.company },
                    { l: 'GreenScore', v: report.greenScore },
                    { l: 'Grade', v: report.grade },
                    { l: 'Stored', v: new Date(report.timestamp * 1000).toLocaleDateString() },
                    { l: 'Network', v: 'Polygon Amoy' },
                    { l: 'File', v: fileName }
                  ].map(({ l, v }) => (
                    <div key={l} className="glass rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 mb-0.5">{l}</p>
                      <p className="font-bold text-sm text-slate-700 truncate">{String(v)}</p>
                    </div>
                  ))}
                </div>
                
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">Submitter</p>
                  <code className="text-xs font-mono break-all block p-3 rounded-xl glass text-slate-400">{report.submitter}</code>
                </div>
                
                <a href={`https://amoy.polygonscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" className="block text-center bg-gradient-to-r from-emerald to-teal text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald/20">
                  View on PolygonScan ↗
                </a>
              </div>
              <button onClick={reset} className="w-full py-3 rounded-xl glass text-slate-600 text-sm font-medium hover:bg-white/60">
                Verify Another File
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
