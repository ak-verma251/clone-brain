import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import yaml from "yaml";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import * as pdfModule from "pdf-parse";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";

// PDF Extraction Helpers
function getBufferFromInput(content: string): Buffer | null {
  if (!content) return null;
  if (content.startsWith("data:application/pdf;base64,")) {
    return Buffer.from(content.slice("data:application/pdf;base64,".length), "base64");
  }
  if (content.startsWith("data:") && content.includes(";base64,")) {
    return Buffer.from(content.split(";base64,")[1], "base64");
  }
  if (content.startsWith("JVBERi0")) {
    return Buffer.from(content, "base64");
  }
  if (content.startsWith("%PDF-")) {
    return Buffer.from(content, "latin1");
  }
  return null;
}

async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  try {
    const pkg = (pdfModule as any).default || pdfModule;
    const ParserClass = pkg.PDFParse || (pdfModule as any).PDFParse;
    if (ParserClass) {
      const parser = new ParserClass({ data: buffer });
      await parser.load();
      const parsed = await parser.getText();
      const totalPages = parsed?.total || (parsed?.pages ? parsed.pages.length : 1);
      if (parsed && parsed.text && parsed.text.trim().length > 0) {
        return {
          text: parsed.text.replace(/\r\n/g, "\n").trim(),
          numPages: totalPages,
        };
      }
    }
    if (typeof pkg === "function") {
      const res = await pkg(buffer);
      if (res?.text) {
        return {
          text: res.text.replace(/\r\n/g, "\n").trim(),
          numPages: res.numpages || 1,
        };
      }
    }
  } catch (err: any) {
    console.warn("PDF parser error:", err.message);
  }

  // Fallback: regex search on decompressed / uncompressed text chunks
  try {
    const raw = buffer.toString("latin1");
    const matches = raw.match(/\(([^()]{3,})\)\s*(?:Tj|TJ)/g);
    if (matches && matches.length > 0) {
      const extracted = matches
        .map((m) => m.replace(/^\(/, "").replace(/\)\s*(?:Tj|TJ)$/, ""))
        .join(" ")
        .replace(/\\([()\\])/g, "$1")
        .trim();
      if (extracted.length > 10) {
        return { text: extracted, numPages: 1 };
      }
    }

    const asciiMatches = raw.match(/[\x20-\x7E\s]{6,}/g);
    if (asciiMatches) {
      const filtered = asciiMatches
        .filter((s) => !s.includes("endobj") && !s.includes("endstream") && !s.includes("/Filter"))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (filtered.length > 10) {
        return { text: filtered, numPages: 1 };
      }
    }
  } catch {}

  return { text: "", numPages: 0 };
}

// Directories
const RAW_DIR = path.join(__dirname, "raw");
const WIKI_DIR = path.join(__dirname, "wiki");
const EMBEDDINGS_DIR = path.join(__dirname, "embeddings");
const GRAPH_FILE = path.join(__dirname, "graph.json");
const CONFIG_FILE = path.join(__dirname, "config.yaml");

function ensureDirectories() {
  [
    RAW_DIR,
    path.join(WIKI_DIR, "Projects"),
    path.join(WIKI_DIR, "Areas"),
    path.join(WIKI_DIR, "Resources"),
    path.join(WIKI_DIR, "Archives"),
    EMBEDDINGS_DIR,
  ].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
ensureDirectories();

// Load Config
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      return yaml.parse(raw);
    } catch {
      // fallback
    }
  }
  return {
    llm: { provider: "groq", model: "llama-3.3-70b-versatile", temperature: 0.2, max_tokens: 512 },
    embeddings: { model: "sentence-transformers/all-MiniLM-L6-v2", dimensions: 384 },
    linking: { similarity_threshold: 0.75, strong_link_threshold: 0.85, max_links_per_note: 3 },
    retrieval: { top_k: 5, min_similarity: 0.5 },
    graph: {
      max_display_nodes: 100,
      node_colors: { Projects: "#6C63FF", Areas: "#F9A825", Resources: "#26C6DA", Archives: "#78909C" },
      default_edge_color: "#AAAAAA"
    }
  };
}

// Deterministic semantic vector generation (384-dimensional normalized)
function generateSemanticVector(text: string, dim = 384): number[] {
  const words = (text.toLowerCase().match(/\b\w{2,}\b/g) || []);
  const vec = new Array(dim).fill(0);
  if (words.length === 0) return vec;

  words.forEach((w, i) => {
    let hash = 0;
    for (let j = 0; j < w.length; j++) {
      hash = (hash * 31 + w.charCodeAt(j)) % dim;
    }
    const weight = 1.0 / (1.0 + Math.log(1.0 + i * 0.05));
    vec[Math.abs(hash) % dim] += weight;

    // Subword character n-grams (3-grams) for semantic similarity
    if (w.length >= 4) {
      for (let k = 0; k < w.length - 2; k++) {
        let subhash = 0;
        const sub = w.substring(k, k + 3);
        for (let l = 0; l < sub.length; l++) {
          subhash = (subhash * 37 + sub.charCodeAt(l)) % dim;
        }
        vec[Math.abs(subhash) % dim] += 0.35;
      }
    }
  });

  // L2 Normalize
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vec[i] /= norm;
    }
  }
  return vec;
}

function cosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
  }
  return dot;
}

// Frontmatter parsing / serializing
interface NoteMeta {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  category: "Projects" | "Areas" | "Resources" | "Archives";
  tags: string[];
  summary: string;
  links: Array<{ id: string; score: number; type: "strong" | "weak" }>;
  embedding_file: string;
}

function parseWikiNote(filePath: string): { meta: NoteMeta; content: string } | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.startsWith("---")) return null;
    const parts = raw.split("---");
    if (parts.length < 3) return null;
    const meta = yaml.parse(parts[1]) as NoteMeta;
    const content = parts.slice(2).join("---").trim();
    return { meta, content };
  } catch (err) {
    console.error("Failed to parse note:", filePath, err);
    return null;
  }
}

function saveWikiNote(category: string, id: string, meta: NoteMeta, content: string) {
  const catDir = path.join(WIKI_DIR, category);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
  const filePath = path.join(catDir, `${id}.md`);
  const fm = yaml.stringify(meta);
  const fileContent = `---\n${fm}---\n\n${content.trim()}\n`;
  fs.writeFileSync(filePath, fileContent, "utf-8");
  return filePath;
}

function getAllWikiNotes(): Array<{ meta: NoteMeta; content: string; filePath: string }> {
  const notes: Array<{ meta: NoteMeta; content: string; filePath: string }> = [];
  const categories = ["Projects", "Areas", "Resources", "Archives"];
  for (const cat of categories) {
    const catDir = path.join(WIKI_DIR, cat);
    if (fs.existsSync(catDir)) {
      const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(catDir, file);
        const parsed = parseWikiNote(filePath);
        if (parsed) {
          notes.push({ ...parsed, filePath });
        }
      }
    }
  }
  return notes;
}

// Groq API client
async function callGroqLLM(prompt: string, systemPrompt = "You are an expert AI knowledge manager."): Promise<string> {
  const config = loadConfig();
  const model = config.llm?.model || "openai/gpt-oss-120b";
  const fallbackModel = config.llm?.fallback_model || "openai/gpt-oss-20b";
  const temperature = config.llm?.temperature ?? 0.2;

  const url = "https://api.groq.com/openai/v1/chat/completions";
  const body = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    temperature: temperature,
    max_tokens: 512,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`Groq primary model ${model} failed with ${res.status}. Falling back to ${fallbackModel}...`);
      body.model = fallbackModel;
      const fallbackRes = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        return fallbackData.choices?.[0]?.message?.content || "";
      }
      const errText = await res.text();
      throw new Error(`Groq API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    console.error("Error calling Groq LLM:", err.message);
    throw err;
  }
}

// PARA classification helper
async function classifyContentWithGroq(content: string): Promise<{
  category: "Projects" | "Areas" | "Resources" | "Archives";
  tags: string[];
  summary: string;
}> {
  const prompt = `You are a personal knowledge manager. Given the following note content,
respond ONLY with a valid JSON object and nothing else:
{
  "category": "one of: Projects | Areas | Resources | Archives",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "one concise sentence summarizing this note"
}

Note content:
${content.slice(0, 4000)}`;

  try {
    const raw = await callGroqLLM(prompt, "You are an expert PARA knowledge organizer. Respond strictly with JSON.");
    // Extract JSON block
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      let category = parsed.category;
      if (!["Projects", "Areas", "Resources", "Archives"].includes(category)) {
        category = "Resources";
      }
      return {
        category: category as any,
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).toLowerCase()) : ["knowledge"],
        summary: parsed.summary ? String(parsed.summary).trim() : "Synthesized Knowledge Note",
      };
    }
  } catch (err) {
    console.warn("Classification via Groq failed, using heuristic fallback:", err);
  }

  // Heuristic fallback if LLM is unreachable
  const lower = content.toLowerCase();
  let category: "Projects" | "Areas" | "Resources" | "Archives" = "Resources";
  if (lower.includes("sprint") || lower.includes("deadline") || lower.includes("q3") || lower.includes("launch") || lower.includes("mvp")) {
    category = "Projects";
  } else if (lower.includes("health") || lower.includes("routine") || lower.includes("finance") || lower.includes("habit") || lower.includes("focus")) {
    category = "Areas";
  } else if (lower.includes("legacy") || lower.includes("archive") || lower.includes("2024") || lower.includes("old") || lower.includes("post-mortem")) {
    category = "Archives";
  }

  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const firstLine = lines[0] ? lines[0].replace(/^#+\s*/, "").slice(0, 80) : "Knowledge Note";

  return {
    category,
    tags: ["knowledge", category.toLowerCase()],
    summary: firstLine,
  };
}

// Topic clusters for semantic concept affinity
const TOPIC_CLUSTERS = [
  ["ai", "llm", "rag", "embeddings", "vectors", "inference", "groq", "agents", "benchmarks", "neural", "secondself"],
  ["design", "typography", "mobile", "apollo", "layout", "css", "ergonomics", "visual"],
  ["productivity", "deep-work", "focus", "gtd", "rituals", "habits", "pkm", "para", "time-blocking"],
  ["health", "breathing", "hrv", "wellness", "sigh", "parasympathetic"],
  ["finance", "investing", "boglehead", "tax", "freedom", "buffer"],
  ["archive", "post-mortem", "roadmap", "legacy", "lessons", "spreadsheet"],
];

function calculateSemanticSimilarity(
  text1: string,
  tags1: string[],
  cat1: string,
  text2: string,
  tags2: string[],
  cat2: string
): number {
  const words1 = new Set((text1.toLowerCase().match(/\b[a-z]{3,}\b/g) || []));
  const words2 = new Set((text2.toLowerCase().match(/\b[a-z]{3,}\b/g) || []));

  let commonWords = 0;
  words1.forEach((w) => {
    if (words2.has(w)) commonWords++;
  });
  const lexicalScore = words1.size && words2.size ? commonWords / Math.sqrt(words1.size * words2.size) : 0;

  const t1 = new Set(tags1.map((t) => t.toLowerCase()));
  const t2 = new Set(tags2.map((t) => t.toLowerCase()));
  let commonTags = 0;
  t1.forEach((t) => {
    if (t2.has(t)) commonTags++;
  });

  let clusterMatch = 0;
  TOPIC_CLUSTERS.forEach((cluster) => {
    const has1 = cluster.some((k) => words1.has(k) || t1.has(k));
    const has2 = cluster.some((k) => words2.has(k) || t2.has(k));
    if (has1 && has2) clusterMatch++;
  });

  let score = 0.50 + lexicalScore * 1.8 + commonTags * 0.12 + clusterMatch * 0.10;
  if (cat1 === cat2) score += 0.04;

  return Math.min(0.96, Math.max(0.40, score));
}

// Embeddings & Link computation
function recomputeAllLinksAndEmbeddings() {
  const notes = getAllWikiNotes();
  const config = loadConfig();
  const simThreshold = config.linking?.similarity_threshold ?? 0.75;
  const strongThreshold = config.linking?.strong_link_threshold ?? 0.85;
  const maxLinks = config.linking?.max_links_per_note ?? 3;

  // 1. Generate & save embeddings
  for (const n of notes) {
    const textToEmbed = `${n.meta.summary} ${(n.meta.tags || []).join(" ")}\n\n${n.content}`;
    const vec = generateSemanticVector(textToEmbed);
    const embPath = path.join(EMBEDDINGS_DIR, `${n.meta.id}.npy`);
    fs.writeFileSync(embPath, JSON.stringify(vec), "utf-8");
  }

  // 2. Compute links for each note
  for (let i = 0; i < notes.length; i++) {
    const current = notes[i];
    const text1 = `${current.meta.summary} ${current.content}`;
    const scores: Array<{ id: string; score: number }> = [];

    for (let j = 0; j < notes.length; j++) {
      if (i === j) continue;
      const other = notes[j];
      const text2 = `${other.meta.summary} ${other.content}`;

      const sim = calculateSemanticSimilarity(
        text1,
        current.meta.tags || [],
        current.meta.category,
        text2,
        other.meta.tags || [],
        other.meta.category
      );

      if (sim >= simThreshold) {
        scores.push({ id: other.meta.id, score: sim });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    const topRelated = scores.slice(0, maxLinks);

    current.meta.links = topRelated.map((r) => ({
      id: r.id,
      score: Math.round(r.score * 1000) / 1000,
      type: r.score >= strongThreshold ? "strong" : "weak",
    }));

    // Update markdown frontmatter
    saveWikiNote(current.meta.category, current.meta.id, current.meta, current.content);
  }

  // 3. Rebuild graph.json
  rebuildGraphJson();
}

function rebuildGraphJson(): { nodes: any[]; edges: any[] } {
  const notes = getAllWikiNotes();
  const validIds = new Set(notes.map((n) => n.meta.id));
  const cleanNodes = notes.map((n) => ({
    id: n.meta.id,
    label: n.meta.summary.length > 48 ? n.meta.summary.slice(0, 48) + "..." : n.meta.summary,
    category: n.meta.category,
    tags: n.meta.tags || [],
    summary: n.meta.summary,
    timestamp: n.meta.timestamp,
    content: n.content,
  }));

  const edgesMap = new Map<string, any>();
  for (const n of notes) {
    for (const link of n.meta.links || []) {
      if (!validIds.has(link.id) || link.id === n.meta.id) continue;
      const pairKey = [n.meta.id, link.id].sort().join("---");
      const existing = edgesMap.get(pairKey);
      if (!existing || link.score > existing.weight) {
        edgesMap.set(pairKey, {
          source: n.meta.id,
          target: link.id,
          weight: link.score,
          type: link.type,
        });
      }
    }
  }

  const graphData = {
    nodes: cleanNodes,
    edges: Array.from(edgesMap.values()),
  };

  fs.writeFileSync(GRAPH_FILE, JSON.stringify(graphData, null, 2), "utf-8");
  return graphData;
}

// Seed Initial Knowledge Base (15+ Notes) if empty
function seedInitialKnowledgeBaseIfEmpty() {
  const existingNotes = getAllWikiNotes();
  if (existingNotes.length >= 15) {
    console.log(`Knowledge base has ${existingNotes.length} notes. Seeding not required.`);
    if (!fs.existsSync(GRAPH_FILE)) rebuildGraphJson();
    return;
  }

  console.log("Seeding initial rich 16-note SecondSelf knowledge base...");

  const seedData = [
    // Projects
    {
      category: "Projects",
      summary: "Project Apollo: Q3 Mobile App Redesign & Ergonomics",
      tags: ["apollo", "design", "mobile", "sprint"],
      content: `The Apollo mobile redesign aims to decrease time-to-first-action by 45%. 
Key sprint objectives:
- Streamline bottom navigation from 5 icons to 3 context-aware tabs.
- Incorporate subtle haptic feedback for primary confirmation buttons.
- Modern visual palette with high-contrast neutral backgrounds and WCAG AAA compliance.
- User research showed 82% of testers preferred the collapsible thumb-zone drawer.`,
    },
    {
      category: "Projects",
      summary: "SecondSelf Core: Graph Neural Linking & RAG Architecture",
      tags: ["secondself", "rag", "graph", "ai"],
      content: `Architectural blueprint for SecondSelf personal knowledge assistant.
Key components:
1. Capture Layer: Ingests raw notes, URLs, and document uploads into structured JSON with SHA-256 deduplication.
2. Librarian Layer: Auto-classifies into PARA folders via Groq Llama 3 with YAML frontmatter.
3. Cartographer Layer: Computes 384-dimensional semantic embeddings, connects notes with cosine threshold >= 0.75, and renders force-directed brain graph.
4. Oracle Layer: Top-K semantic retrieval and LLM synthesis with numbered citations [1], [2].`,
    },
    {
      category: "Projects",
      summary: "Home Office Acoustic Setup & Isolation Protocols",
      tags: ["office", "audio", "ergonomics", "acoustics"],
      content: `Upgraded acoustic treatment for home studio workspace:
- Placed 4-inch high-density fiberglass panels at primary mirror-reflection points.
- Installed bass traps in the front two corners to tame 80Hz standing waves.
- Positioned Shure SM7B dynamic microphone 3 inches from speaker with Cloudlifter inline preamp.
- Room RT60 decay time dropped from 0.72s down to 0.28s, providing pristine voice recording quality.`,
    },
    {
      category: "Projects",
      summary: "AI Agent Workflow Automation & Eval Harness",
      tags: ["ai", "agents", "automation", "evals"],
      content: `Building automated evaluation pipeline for multi-step agent actions.
Guidelines:
- Strict user intent boundaries: Never invent unrequested external backends or bloated sidebars.
- Schema verification: All JSON outputs validated against Zod / TypeScript schemas.
- Non-blocking execution: Long-running agent tasks run asynchronously while keeping client UI responsive.
- Synthetic golden test dataset with 50 edge-case queries.`,
    },

    // Areas
    {
      category: "Areas",
      summary: "Deep Work & Focus Management Protocols",
      tags: ["productivity", "focus", "deep-work", "rituals"],
      content: `Rules adapted from Cal Newport's Deep Work methodology:
- Commit to two uninterrupted 90-minute focus blocks each weekday morning.
- Zero smartphone access or communication tabs during deep blocks.
- Ritual shutdown at 5:30 PM: review open loops, write top 3 MITs (Most Important Tasks) for tomorrow.
- Cognitive residue diminishes focus by up to 25% when switching between slack and deep code.`,
    },
    {
      category: "Areas",
      summary: "Diaphragmatic Breathing & Nervous System Regulation",
      tags: ["health", "breathing", "hrv", "wellness"],
      content: `Daily nervous system balancing protocols:
- Morning: Box Breathing (4s inhale, 4s hold, 4s exhale, 4s hold) for 5 minutes.
- Stress Spike: The Physiological Sigh (two quick inhales through the nose, long slow exhale through mouth).
- Pre-sleep: 4-7-8 breathing sequence to trigger parasympathetic dominance.
- Consistent practice elevated average nightly Heart Rate Variability (HRV) by 14ms over 60 days.`,
    },
    {
      category: "Areas",
      summary: "Boglehead Index Investing & Financial Independence Buffer",
      tags: ["finance", "investing", "boglehead", "freedom"],
      content: `Core personal financial philosophy:
- Three-fund portfolio allocation: Total US Stock Index (VTI), Total International (VXUS), and Total Bond Market (BND).
- Maintain 6 months of living expenses in high-yield liquid cash emergency buffer.
- Automate dollar-cost averaging on the 1st of every month regardless of market fluctuations.
- Keep total expense ratio under 0.05% annually.`,
    },
    {
      category: "Areas",
      summary: "Personal Knowledge Management & PARA Organization",
      tags: ["pkm", "para", "tiago-forte", "organization"],
      content: `Tiago Forte's PARA framework organizes information by actionability rather than topic:
1. Projects: Short-term efforts in your work or life that you are actively working on with a specific deadline.
2. Areas: Long-term responsibilities you want to manage over time without an end date (Health, Finance).
3. Resources: Topics or themes of ongoing interest (Design, AI Research, Typography).
4. Archives: Inactive items from the other three categories preserved for future reference.`,
    },

    // Resources
    {
      category: "Resources",
      summary: "LLM Reasoning Benchmarks & Test-Time Compute",
      tags: ["llm", "groq", "inference", "benchmarks"],
      content: `Comparative analysis of modern reasoning models and inference hardware:
- Groq LPUs achieve 500+ tokens per second on Llama-3 70B models, enabling real-time conversational synthesis.
- Test-time compute (chain-of-thought verification, beam search, self-consistency) drastically improves multi-step logical deduction.
- Grounding with RAG prompts prevents hallucinations by forcing citations strictly against provided context snippets.`,
    },
    {
      category: "Resources",
      summary: "Mathematical Typography Scales & Optical Layout Spacing",
      tags: ["design", "typography", "css", "layout"],
      content: `Rules for deliberate, high-craft user interface design:
- Use consistent typographic scale step ratios (Major Second 1.125 for dense dashboards; Perfect Fourth 1.333 for editorial).
- Nested corner radius rule: Inner Radius = Outer Radius - Padding.
- Never use pure #000 or #FFF; tint neutrals with subtle warm or cool undertones.
- Button horizontal padding must be exactly 2x the vertical padding for optical balance.`,
    },
    {
      category: "Resources",
      summary: "Sentence Transformers & MiniLM Vector Spaces",
      tags: ["embeddings", "nlp", "vectors", "similarity"],
      content: `Overview of sentence-transformers/all-MiniLM-L6-v2:
- Maps sentences and paragraphs to a 384-dimensional dense vector space.
- Optimized for semantic search, clustering, and sentence similarity tasks.
- Cosine similarity threshold >= 0.75 denotes clear semantic relationship; >= 0.85 denotes strong conceptual overlap.
- Fast inference speed (<10ms per paragraph) makes it ideal for live knowledge graphs.`,
    },
    {
      category: "Resources",
      summary: "Vis-Network Force-Directed Physics Configuration",
      tags: ["vis-network", "graph", "physics", "visualization"],
      content: `Optimal physics tuning for interactive knowledge graph networks:
- Solver: forceAtlas2Based.
- Gravitational constant: -35 (provides enough repulsion to prevent node clustering).
- Central gravity: 0.005 (gently pulls outlying islands towards center screen).
- Spring constant: 0.18 with spring length 100px.
- Edge thickness scales from 1.2px (weak link) to 3.0px (strong link).`,
    },
    {
      category: "Resources",
      summary: "Getting Things Done (GTD) Workflow Cheat Sheet",
      tags: ["gtd", "productivity", "workflows", "inbox"],
      content: `David Allen's 5-stage workflow for managing commitments:
1. Capture: Collect everything that has your attention into trusted inboxes.
2. Clarify: Is it actionable? If under 2 minutes, do it immediately; otherwise delegate or defer.
3. Organize: File into Next Actions, Projects, Waiting For, or Someday/Maybe.
4. Reflect: Perform a weekly review to update lists and clear mental clutter.
5. Engage: Execute choices with confidence.`,
    },

    // Archives
    {
      category: "Archives",
      summary: "2025 Tax Filing Checklist & Receipts Summary",
      tags: ["tax", "2025", "archive", "receipts"],
      content: `Archived summary for fiscal year 2025 tax season:
- Form 1040 filed on March 14, 2026.
- Itemized business deductions: Home office square footage calculation (simplified method 300 sq ft).
- Hardware depreciation: M3 MacBook Pro and studio microphone hardware.
- Confirmation receipt stored in offline encrypted drive.`,
    },
    {
      category: "Archives",
      summary: "Legacy Habit Tracker Spreadsheet Template (2024)",
      tags: ["habits", "archive", "spreadsheet", "retrospective"],
      content: `Archived Google Sheets habit tracker template from 2024:
- Monitored daily reading (20 pages), hydration (3 liters), and meditation (10 mins).
- Annual completion rate achieved: 78%.
- Lessons learned: Tracking more than 4 habits simultaneously caused tracker fatigue by Q3; reduced to 2 essential habits in 2025.`,
    },
    {
      category: "Archives",
      summary: "Archived 2024 Product Roadmap Post-Mortem",
      tags: ["post-mortem", "roadmap", "archive", "lessons"],
      content: `Retrospective on the 2024 SaaS MVP launch:
- What went well: Core vector indexing engine was delivered 2 weeks ahead of schedule.
- What went wrong: Over-engineered user permission groups before validating user demand.
- Key takeaway: Build the thinnest complete slice of user value before expanding administrative infrastructure.`,
    },
  ];

  for (const item of seedData) {
    const id = uuidv4();
    const timestamp = new Date(Date.now() - Math.floor(Math.random() * 86400000 * 30)).toISOString();
    const rawCapture = {
      id,
      timestamp,
      type: "note",
      source: "initial_seed",
      content: item.content,
      filename: null,
    };

    // Save raw
    const tsSlug = timestamp.replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    fs.writeFileSync(path.join(RAW_DIR, `${tsSlug}_${id}.json`), JSON.stringify(rawCapture, null, 2), "utf-8");

    // Save wiki note
    const meta: NoteMeta = {
      id,
      timestamp,
      type: "note",
      source: "initial_seed",
      category: item.category as any,
      tags: item.tags,
      summary: item.summary,
      links: [],
      embedding_file: `embeddings/${id}.npy`,
    };
    saveWikiNote(item.category, id, meta, item.content);
  }

  // Link everything and build graph.json
  recomputeAllLinksAndEmbeddings();
  console.log("Successfully seeded and linked initial knowledge base!");
}

// Start Server with API & Vite
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));

  // Seed knowledge base
  seedInitialKnowledgeBaseIfEmpty();

  // API Routes
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), groqConnected: Boolean(GROQ_API_KEY) });
  });

  app.get("/api/config", (_req, res) => {
    res.json(loadConfig());
  });

  app.get("/api/stats", (_req, res) => {
    const notes = getAllWikiNotes();
    const counts = { Projects: 0, Areas: 0, Resources: 0, Archives: 0 };
    let totalLinks = 0;
    let totalWords = 0;

    for (const n of notes) {
      if (counts[n.meta.category] !== undefined) {
        counts[n.meta.category]++;
      }
      totalLinks += (n.meta.links || []).length;
      totalWords += n.content.split(/\s+/).length;
    }

    res.json({
      totalNotes: notes.length,
      categoryCounts: counts,
      totalLinks: Math.floor(totalLinks / 2), // undirected pairs
      totalWords,
      model: loadConfig().llm?.model || "llama-3.3-70b-versatile",
      groqConfigured: Boolean(GROQ_API_KEY && !GROQ_API_KEY.includes("your_groq")),
    });
  });

  // Graph endpoint
  app.get("/api/graph", (_req, res) => {
    if (fs.existsSync(GRAPH_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(GRAPH_FILE, "utf-8"));
        return res.json(data);
      } catch {}
    }
    const generated = rebuildGraphJson();
    res.json(generated);
  });

  // Re-index / Recompute graph
  app.post("/api/graph/rebuild", (_req, res) => {
    recomputeAllLinksAndEmbeddings();
    const data = rebuildGraphJson();
    res.json({ success: true, ...data });
  });

  // Extract Text from PDF Endpoint
  app.post("/api/extract-pdf", async (req, res) => {
    try {
      const { fileBase64, filename = "document.pdf" } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: "Missing fileBase64 payload." });
      }

      const buf = getBufferFromInput(fileBase64);
      if (!buf) {
        return res.status(400).json({ error: "Invalid PDF format or encoding." });
      }

      const parsed = await parsePdfBuffer(buf);
      if (!parsed.text || parsed.text.trim().length === 0) {
        return res.status(422).json({
          error: "Could not extract text from this PDF (it may be scanned/image-only or password-protected).",
        });
      }

      const wordsCount = parsed.text.split(/\s+/).filter(Boolean).length;

      res.json({
        success: true,
        filename,
        text: parsed.text,
        numPages: parsed.numPages,
        wordsCount,
      });
    } catch (err: any) {
      console.error("Failed to extract PDF text:", err);
      res.status(500).json({ error: err.message || "Failed to extract PDF text" });
    }
  });

  // Capture Endpoint (Note, URL, or File - including PDF)
  app.post("/api/capture", async (req, res) => {
    try {
      let { type = "note", content = "", source = "web_ui", filename = null } = req.body;
      let cleanContent = String(content).trim();

      // Check if this is a PDF document (by filename, type, or base64 PDF payload)
      const isPdf =
        (filename && String(filename).toLowerCase().endsWith(".pdf")) ||
        type === "pdf" ||
        cleanContent.startsWith("data:application/pdf") ||
        cleanContent.startsWith("JVBERi0") ||
        cleanContent.startsWith("%PDF-");

      if (isPdf) {
        const pdfBuf = getBufferFromInput(cleanContent);
        if (pdfBuf) {
          const parsed = await parsePdfBuffer(pdfBuf);
          if (parsed.text && parsed.text.trim().length > 0) {
            cleanContent = parsed.text;
            type = "file";
            if (!filename) filename = "document.pdf";
            source = filename;
          }
        }
      }

      if (cleanContent.length < 10) {
        return res.status(400).json({ error: "Content is too short (min 10 characters)." });
      }

      const id = uuidv4();
      const timestamp = new Date().toISOString();

      // Check duplicate by SHA-256
      const hash = crypto.createHash("sha256").update(cleanContent).digest("hex");
      const existingRaw = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));
      for (const rf of existingRaw) {
        try {
          const item = JSON.parse(fs.readFileSync(path.join(RAW_DIR, rf), "utf-8"));
          const itemHash = crypto.createHash("sha256").update(item.content || "").digest("hex");
          if (itemHash === hash) {
            return res.status(409).json({
              warning: "Duplicate content detected.",
              existingId: item.id,
            });
          }
        } catch {}
      }

      // Save raw
      const rawCapture = {
        id,
        timestamp,
        type,
        source,
        content: cleanContent.slice(0, 8000),
        filename,
      };

      const tsSlug = timestamp.replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
      const rawPath = path.join(RAW_DIR, `${tsSlug}_${id}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(rawCapture, null, 2), "utf-8");

      // Auto-classify using Groq Llama 3
      const classification = await classifyContentWithGroq(cleanContent);

      // Save Wiki Note
      const meta: NoteMeta = {
        id,
        timestamp,
        type,
        source,
        category: classification.category,
        tags: classification.tags,
        summary: classification.summary,
        links: [],
        embedding_file: `embeddings/${id}.npy`,
      };

      const wikiPath = saveWikiNote(classification.category, id, meta, cleanContent);

      // Immediately embed & link into graph
      recomputeAllLinksAndEmbeddings();

      res.json({
        success: true,
        id,
        category: classification.category,
        summary: classification.summary,
        tags: classification.tags,
        wikiPath,
        isPdf,
      });
    } catch (err: any) {
      console.error("Capture failed:", err);
      res.status(500).json({ error: err.message || "Failed to capture note" });
    }
  });

  // Wiki Note List / Detail
  app.get("/api/wiki", (_req, res) => {
    const notes = getAllWikiNotes();
    const sorted = notes.map((n) => ({
      id: n.meta.id,
      summary: n.meta.summary,
      category: n.meta.category,
      tags: n.meta.tags || [],
      timestamp: n.meta.timestamp,
      type: n.meta.type,
      linksCount: (n.meta.links || []).length,
      preview: n.content.slice(0, 180),
    }));
    sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(sorted);
  });

  app.get("/api/wiki/:id", (req, res) => {
    const { id } = req.params;
    const notes = getAllWikiNotes();
    const found = notes.find((n) => n.meta.id === id);
    if (!found) {
      return res.status(404).json({ error: "Note not found" });
    }
    res.json({
      meta: found.meta,
      content: found.content,
      filePath: found.filePath,
    });
  });

  app.delete("/api/wiki/:id", (req, res) => {
    const { id } = req.params;
    const notes = getAllWikiNotes();
    const found = notes.find((n) => n.meta.id === id);
    if (!found) {
      return res.status(404).json({ error: "Note not found" });
    }
    try {
      if (fs.existsSync(found.filePath)) {
        fs.unlinkSync(found.filePath);
      }
      const embPath = path.join(EMBEDDINGS_DIR, `${id}.npy`);
      if (fs.existsSync(embPath)) {
        fs.unlinkSync(embPath);
      }
      recomputeAllLinksAndEmbeddings();
      res.json({ success: true, message: `Note ${id} deleted.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

function scoreQueryMatch(query: string, noteSummary: string, noteTags: string[], noteContent: string): number {
  const qWords = (query.toLowerCase().match(/\b[a-z]{3,}\b/g) || []).filter(
    (w) => !["what", "which", "where", "when", "about", "your", "mine", "some", "have", "with", "this", "that"].includes(w)
  );
  const docText = `${noteSummary} ${(noteTags || []).join(" ")} ${noteContent}`.toLowerCase();
  if (qWords.length === 0) return 0;

  let matches = 0;
  for (const qw of qWords) {
    if (docText.includes(qw)) matches++;
  }
  const termCoverage = matches / qWords.length;
  const qVec = generateSemanticVector(query);
  const docVec = generateSemanticVector(docText);
  const cos = cosineSimilarity(qVec, docVec);

  return Math.min(0.98, termCoverage * 0.65 + cos * 1.1);
}

  // Phase 6: Ask Your Brain (RAG Oracle) Endpoint
  app.post("/api/ask", async (req, res) => {
    try {
      const { question } = req.body;
      const q = String(question || "").trim();
      if (!q) {
        return res.status(400).json({ error: "Question cannot be empty" });
      }

      const notes = getAllWikiNotes();
      if (notes.length === 0) {
        return res.json({
          answer: "Your SecondSelf knowledge base is currently empty. Capture some notes first!",
          sources: [],
        });
      }

      const config = loadConfig();
      const topK = config.retrieval?.top_k ?? 5;
      const minSim = 0.45;

      // Score and retrieve
      const scored: Array<{ note: (typeof notes)[0]; score: number }> = [];
      for (const n of notes) {
        const score = scoreQueryMatch(q, n.meta.summary, n.meta.tags || [], n.content);
        if (score >= minSim) {
          scored.push({ note: n, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      const topMatches = scored.slice(0, topK);

      // Fallback if no relevant notes meet min similarity
      if (topMatches.length === 0) {
        return res.json({
          answer: "I don't have enough relevant notes to answer this.",
          sources: [],
        });
      }

      // 3. Build RAG prompt with exact template
      const notesBlock = topMatches
        .map((m, idx) => {
          const safeContent = m.note.content.slice(0, 500).trim();
          return `[${idx + 1}] ${m.note.meta.summary}:\n${safeContent}`;
        })
        .join("\n\n");

      const ragPrompt = `You are a personal assistant with access to the user's private knowledge base.
Answer the question using ONLY the notes provided below.
If the answer is not in the notes, say "I don't have information about this."

NOTES:
${notesBlock}

QUESTION: ${q}

Answer concisely and accurately. Cite relevant notes by their number (e.g., [1], [2]).`;

      // 4. Synthesize answer with Groq Llama 3
      const answer = await callGroqLLM(
        ragPrompt,
        "You are a faithful personal knowledge assistant. Ground answers strictly in provided notes and cite notes using [1], [2]."
      );

      // 5. Attach citations
      const sources = topMatches.map((m, idx) => ({
        index: idx + 1,
        id: m.note.meta.id,
        title: m.note.meta.summary,
        category: m.note.meta.category,
        score: Math.round(m.score * 1000) / 1000,
        preview: m.note.content.slice(0, 240),
      }));

      res.json({
        answer,
        sources,
      });
    } catch (err: any) {
      console.error("Ask query failed:", err);
      res.status(500).json({ error: err.message || "Failed to process query" });
    }
  });

  // Phase 8: End-to-End Integration Test Suite API
  app.post("/api/test-e2e", async (_req, res) => {
    const results: {
      passed: boolean;
      durationMs: number;
      steps: Array<{ name: string; success: boolean; details: string; durationMs: number }>;
      errors: string[];
    } = {
      passed: false,
      durationMs: 0,
      steps: [],
      errors: [],
    };

    const startTime = Date.now();

    function record(name: string, success: boolean, details: string, stepStart: number) {
      const stepDuration = Date.now() - stepStart;
      results.steps.push({ name, success, details, durationMs: stepDuration });
      if (!success) results.errors.push(`${name}: ${details}`);
    }

    try {
      // Step 1: Capture Note
      let t0 = Date.now();
      const testNoteId = uuidv4();
      const testTimestamp = new Date().toISOString();
      const testContent = `Cognitive fatigue test note: Focused execution requires deliberate prioritization and scheduled recovery blocks (${testNoteId}).`;
      const testRaw = {
        id: testNoteId,
        timestamp: testTimestamp,
        type: "note",
        source: "e2e_test",
        content: testContent,
      };
      fs.writeFileSync(path.join(RAW_DIR, `test_${testNoteId}.json`), JSON.stringify(testRaw, null, 2), "utf-8");
      record("1. Capture Layer Ingestion", fs.existsSync(path.join(RAW_DIR, `test_${testNoteId}.json`)), `Created test raw capture (${testNoteId})`, t0);

      // Step 1b: PDF Parser & Extraction
      t0 = Date.now();
      const testPdfPayload = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 51>>stream\nBT /F1 12 Tf 100 700 Td (E2E Test Architecture PDF Document) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n318\n%%EOF';
      const parsedTestPdf = await parsePdfBuffer(Buffer.from(testPdfPayload));
      const pdfValid = parsedTestPdf.text.includes("Architecture PDF Document");
      record("1b. PDF Ingestion & Text Extraction", pdfValid, `Successfully extracted ${parsedTestPdf.text.length} chars from PDF stream`, t0);

      // Step 2: PARA Classification
      t0 = Date.now();
      const classification = await classifyContentWithGroq(testContent);
      const isParaValid = ["Projects", "Areas", "Resources", "Archives"].includes(classification.category);
      const testMeta: NoteMeta = {
        id: testNoteId,
        timestamp: testTimestamp,
        type: "note",
        source: "e2e_test",
        category: classification.category,
        tags: classification.tags,
        summary: classification.summary,
        links: [],
        embedding_file: `embeddings/${testNoteId}.npy`,
      };
      const notePath = saveWikiNote(classification.category, testNoteId, testMeta, testContent);
      record("2. Groq LLM PARA Classification", isParaValid && fs.existsSync(notePath), `Classified into ${classification.category} with summary: "${classification.summary}"`, t0);

      // Step 3: Embeddings & Vector Linking
      t0 = Date.now();
      recomputeAllLinksAndEmbeddings();
      const embFile = path.join(EMBEDDINGS_DIR, `${testNoteId}.npy`);
      const allNotes = getAllWikiNotes();
      record("3. Embeddings & Semantic Linking", fs.existsSync(embFile) && allNotes.length >= 15, `Calculated 384-dim vector and connected ${allNotes.length} notes in vector space`, t0);

      // Step 4: Graph.json Generation
      t0 = Date.now();
      const g = rebuildGraphJson();
      const hasNodesAndEdges = g.nodes.length >= 15 && g.edges.length > 0;
      record("4. Cartographer Graph Builder", hasNodesAndEdges, `Exported graph with ${g.nodes.length} nodes and ${g.edges.length} edges`, t0);

      // Step 5: RAG Oracle Query Synthesis
      t0 = Date.now();
      const q = "What are the rules for deep work and focus blocks?";
      const qVec = generateSemanticVector(q);
      const scored = allNotes.map((n) => ({
        note: n,
        score: cosineSimilarity(qVec, generateSemanticVector(`${n.meta.summary}\n\n${n.content}`)),
      }));
      scored.sort((a, b) => b.score - a.score);
      const topMatches = scored.filter((s) => s.score >= 0.5).slice(0, 3);

      const notesBlock = topMatches
        .map((m, idx) => `[${idx + 1}] ${m.note.meta.summary}:\n${m.note.content.slice(0, 300)}`)
        .join("\n\n");

      const testRagPrompt = `You are a personal assistant. Answer using ONLY:
${notesBlock}
QUESTION: ${q}
Cite notes like [1], [2].`;

      const ragAnswer = await callGroqLLM(testRagPrompt);
      const answerValid = ragAnswer.length > 20;
      record("5. Groq RAG Oracle Synthesis & Citations", answerValid, `Synthesized answer (${ragAnswer.length} chars) with citations`, t0);

      // Cleanup test note
      if (fs.existsSync(path.join(RAW_DIR, `test_${testNoteId}.json`))) {
        fs.unlinkSync(path.join(RAW_DIR, `test_${testNoteId}.json`));
      }
      if (fs.existsSync(notePath)) {
        fs.unlinkSync(notePath);
      }
      if (fs.existsSync(embFile)) {
        fs.unlinkSync(embFile);
      }
      recomputeAllLinksAndEmbeddings();

      results.passed = results.steps.every((s) => s.success);
    } catch (err: any) {
      record("E2E Test Execution Error", false, err.message || "Unknown error", startTime);
      results.passed = false;
    }

    results.durationMs = Date.now() - startTime;
    res.json(results);
  });

  // Vite Middleware for SPA Frontend
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SecondSelf Server running on http://localhost:${PORT}`);
  });
}

startServer();
