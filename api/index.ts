import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.VERCEL ? '/tmp/greenledger.db' : 'greenledger.db';
const db = new Database(dbPath);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PINATA_JWT = process.env.PINATA_JWT || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT,
    report_year TEXT,
    overall_score INTEGER,
    grade TEXT,
    env_score INTEGER,
    soc_score INTEGER,
    gov_score INTEGER,
    red_flags TEXT,
    blockchain_hash TEXT,
    full_result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration for existing databases
try { db.exec(`ALTER TABLE reports ADD COLUMN full_result TEXT`); } catch {}

// IPFS records table
db.exec(`
  CREATE TABLE IF NOT EXISTS ipfs_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_hash TEXT UNIQUE NOT NULL,
    ipfs_cid TEXT NOT NULL,
    file_name TEXT,
    file_size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Blockchain simulation table
db.exec(`
  CREATE TABLE IF NOT EXISTS blockchain_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_hash TEXT UNIQUE NOT NULL,
    company TEXT NOT NULL,
    green_score INTEGER NOT NULL,
    grade TEXT NOT NULL,
    submitter_address TEXT NOT NULL,
    tx_hash TEXT UNIQUE NOT NULL,
    block_number INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Backfill: auto-store existing reports that have a blockchain_hash but no blockchain_record
{
  const orphans = db.prepare(`
    SELECT r.blockchain_hash, r.company_name, r.overall_score, r.grade
    FROM reports r
    LEFT JOIN blockchain_records b ON r.blockchain_hash = b.doc_hash
    WHERE r.blockchain_hash IS NOT NULL AND r.blockchain_hash != '' AND b.id IS NULL
  `).all() as any[];
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO blockchain_records (doc_hash, company, green_score, grade, submitter_address, tx_hash, block_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of orphans) {
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const submitter = '0x' + crypto.randomBytes(20).toString('hex');
    const blockNumber = 50000000 + Math.floor(Math.random() * 1000000);
    insertStmt.run(r.blockchain_hash, r.company_name, Math.round(Number(r.overall_score) || 0), r.grade || 'N/A', submitter, txHash, blockNumber);
  }
  if (orphans.length > 0) console.log(`Backfilled ${orphans.length} report(s) into blockchain_records`);
}

const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/reports", (req, res) => {
    try {
      const reports = db.prepare("SELECT * FROM reports ORDER BY created_at DESC").all();
      res.json(reports);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reports", (req, res) => {
    try {
      const { 
        company_name, report_year, overall_score, grade, 
        env_score, soc_score, gov_score, red_flags, blockchain_hash 
      } = req.body;

      if (!company_name || report_year == null) {
        return res.status(400).json({ error: "company_name and report_year are required" });
      }

      const fullResult = JSON.stringify(req.body);
      const stmt = db.prepare(`
        INSERT INTO reports (
          company_name, report_year, overall_score, grade, 
          env_score, soc_score, gov_score, red_flags, blockchain_hash, full_result
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        company_name, report_year, overall_score, grade, 
        env_score, soc_score, gov_score, JSON.stringify(red_flags), blockchain_hash, fullResult
      );

      res.json({ id: result.lastInsertRowid });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/reports/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      db.prepare("DELETE FROM reports WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // AI Analysis endpoint — Gemini runs server-side to protect API key
  app.post("/api/analyze", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || text.trim().length < 50) {
        return res.status(400).json({ error: "Insufficient text for analysis" });
      }
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY not configured on server" });
      }

      const truncated = text.substring(0, 30000);
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
      Text:\n${truncated}
      `;

      // Try multiple models — each has its own separate quota
      const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
      const responseSchema = {
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
      };

      let lastError: any = null;
      for (const model of MODELS) {
        // Each model gets 2 attempts (initial + 1 retry)
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            console.log(`Trying model: ${model} (attempt ${attempt + 1})`);
            const response = await ai.models.generateContent({
              model,
              contents: [{ parts: [{ text: prompt }] }],
              config: { responseMimeType: "application/json", responseSchema }
            });

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
            if (parsed.overall_score >= 85) parsed.grade = 'A';
            else if (parsed.overall_score >= 70) parsed.grade = 'B';
            else if (parsed.overall_score >= 50) parsed.grade = 'C';
            else if (parsed.overall_score >= 30) parsed.grade = 'D';
            else parsed.grade = 'F';

            console.log(`Success with model: ${model}`);
            return res.json(parsed);
          } catch (err: any) {
            lastError = err;
            const msg = err.message || JSON.stringify(err);
            const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
            if (isQuota && attempt === 0) {
              console.log(`${model} rate-limited, retrying in 10s...`);
              await new Promise(r => setTimeout(r, 10000));
              continue;
            }
            if (isQuota) {
              console.log(`${model} quota exhausted, trying next model...`);
              break; // move to next model
            }
            throw err; // non-quota error, don't retry
          }
        }
      }
      // All models exhausted
      const errMsg = lastError?.message || "All models quota exhausted";
      return res.status(429).json({ error: `Rate limit: ${errMsg}. Please wait a few minutes and try again.` });
    } catch (err: any) {
      console.error("Analysis error:", err);
      res.status(500).json({ error: err.message || "Analysis failed" });
    }
  });

  // ==================== IPFS / PINATA ====================
  app.post("/api/ipfs/upload", async (req, res) => {
    try {
      const { fileBase64, fileName, docHash } = req.body;
      if (!fileBase64 || !docHash) {
        return res.status(400).json({ error: "fileBase64 and docHash are required" });
      }
      // Check if already uploaded
      const existing = db.prepare("SELECT ipfs_cid FROM ipfs_records WHERE doc_hash = ?").get(docHash) as any;
      if (existing) {
        return res.json({ ipfsCid: existing.ipfs_cid, gateway: `https://gateway.pinata.cloud/ipfs/${existing.ipfs_cid}`, alreadyUploaded: true });
      }
      if (!PINATA_JWT) {
        return res.status(500).json({ error: "PINATA_JWT not configured on server" });
      }
      const buffer = Buffer.from(fileBase64, 'base64');
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', blob, fileName || 'report.pdf');
      formData.append('pinataMetadata', JSON.stringify({ name: fileName || 'ESG Report', keyvalues: { docHash } }));

      const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PINATA_JWT}` },
        body: formData,
      });
      if (!pinataRes.ok) {
        const errBody = await pinataRes.text();
        console.error('Pinata error:', pinataRes.status, errBody);
        return res.status(502).json({ error: `Pinata upload failed: ${pinataRes.status}` });
      }
      const pinataData = await pinataRes.json() as any;
      const ipfsCid = pinataData.IpfsHash;

      db.prepare("INSERT OR IGNORE INTO ipfs_records (doc_hash, ipfs_cid, file_name, file_size) VALUES (?, ?, ?, ?)")
        .run(docHash, ipfsCid, fileName || 'report.pdf', buffer.length);

      console.log(`IPFS upload success: ${ipfsCid}`);
      res.json({ ipfsCid, gateway: `https://gateway.pinata.cloud/ipfs/${ipfsCid}` });
    } catch (err: any) {
      console.error('IPFS upload error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/ipfs/lookup/:hash", (req, res) => {
    try {
      const docHash = req.params.hash;
      if (!docHash || typeof docHash !== 'string') {
        return res.status(400).json({ error: "Invalid hash" });
      }
      const record = db.prepare("SELECT * FROM ipfs_records WHERE doc_hash = ?").get(docHash) as any;
      if (!record) return res.json({ found: false });
      res.json({
        found: true,
        ipfsCid: record.ipfs_cid,
        fileName: record.file_name,
        fileSize: record.file_size,
        gateway: `https://gateway.pinata.cloud/ipfs/${record.ipfs_cid}`,
        uploadedAt: record.created_at,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== BLOCKCHAIN SIMULATION ====================
  app.post("/api/blockchain/store", (req, res) => {
    try {
      const { docHash, company, greenScore, grade } = req.body;
      if (!docHash || !company || greenScore == null || !grade) {
        return res.status(400).json({ error: "docHash, company, greenScore, and grade are required" });
      }
      // Check if already stored
      const existing = db.prepare("SELECT tx_hash FROM blockchain_records WHERE doc_hash = ?").get(docHash) as any;
      if (existing) {
        return res.json({ txHash: existing.tx_hash, txUrl: `https://amoy.polygonscan.com/tx/${existing.tx_hash}`, alreadyStored: true });
      }
      // Generate simulated blockchain data
      const txHash = '0x' + crypto.randomBytes(32).toString('hex');
      const submitter = '0x' + crypto.randomBytes(20).toString('hex');
      const blockNumber = 50000000 + Math.floor(Math.random() * 1000000);

      db.prepare(`
        INSERT INTO blockchain_records (doc_hash, company, green_score, grade, submitter_address, tx_hash, block_number)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(docHash, company, Math.round(Number(greenScore)), grade, submitter, txHash, blockNumber);

      res.json({ txHash, txUrl: `https://amoy.polygonscan.com/tx/${txHash}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/blockchain/verify", (req, res) => {
    try {
      const { docHash } = req.body;
      if (!docHash || typeof docHash !== 'string') {
        return res.status(400).json({ error: "docHash is required" });
      }
      const record = db.prepare("SELECT * FROM blockchain_records WHERE doc_hash = ?").get(docHash) as any;
      if (!record) return res.json({ found: false });
      res.json({
        found: true,
        company: record.company,
        greenScore: record.green_score,
        grade: record.grade,
        timestamp: Math.floor(new Date(record.created_at).getTime() / 1000),
        submitter: record.submitter_address,
        txHash: record.tx_hash,
        blockNumber: record.block_number,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  export default app;
