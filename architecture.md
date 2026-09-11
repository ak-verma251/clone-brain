# Architecture: SecondSelf — Your Personal AI Second Brain

## 1. System Overview

SecondSelf is a **4-layer intelligent knowledge system** that transforms raw, scattered information into a self-organizing, queryable, visual second brain. It is built around a unidirectional data pipeline where each stage enriches the previous one.

```
┌──────────────────────────────────────────────────────────────────┐
│                     SecondSelf System                            │
│                                                                  │
│   [Capture Layer]  →  [Intelligence Layer]  →  [Graph Layer]     │
│                                              →  [Query Layer]    │
│                                              →  [UI / Deploy]    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. High-Level Architecture Diagram

```
╔══════════════════════════════════════════════════════════════════════╗
║                         SECONDSELF PIPELINE                         ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  INPUT                                                               ║
║  ┌────────────────────────────────────────────────────────────┐      ║
║  │  Note (text)  │  URL / Link  │  File (PDF, md, txt, image) │      ║
║  └────────────────────────────────────────────────────────────┘      ║
║                           │                                          ║
║                           ▼                                          ║
║  ┌─────────────────────────────────────────────────────────────┐     ║
║  │  LAYER 1 — CAPTURE (capture.py)                             │     ║
║  │  • Normalize input type                                     │     ║
║  │  • Assign UUID + ISO timestamp                              │     ║
║  │  • Write to raw/ as JSON envelope                           │     ║
║  └─────────────────────────────────────────────────────────────┘     ║
║                           │                                          ║
║                           ▼                                          ║
║  ┌─────────────────────────────────────────────────────────────┐     ║
║  │  LAYER 2 — INTELLIGENCE (classify.py + link.py)             │     ║
║  │  ┌──────────────────────────────────────────────────────┐   │     ║
║  │  │  classify.py — LLM Classification (Groq/Llama3)      │   │     ║
║  │  │  • PARA category (Project/Area/Resource/Archive)     │   │     ║
║  │  │  • Tags (keywords)                                   │   │     ║
║  │  │  • One-line summary                                  │   │     ║
║  │  └──────────────────────────────────────────────────────┘   │     ║
║  │  ┌──────────────────────────────────────────────────────┐   │     ║
║  │  │  link.py — Embedding + Similarity (sentence-xfmrs)   │   │     ║
║  │  │  • Compute vector embedding per note                 │   │     ║
║  │  │  • Cosine similarity against existing wiki/ notes    │   │     ║
║  │  │  • Auto-insert [[wikilinks]] above threshold         │   │     ║
║  │  └──────────────────────────────────────────────────────┘   │     ║
║  │  Output → wiki/ (Markdown files with YAML front-matter)     │     ║
║  └─────────────────────────────────────────────────────────────┘     ║
║                           │                                          ║
║                           ▼                                          ║
║  ┌─────────────────────────────────────────────────────────────┐     ║
║  │  LAYER 3 — GRAPH (build_graph.py → graph.json)              │     ║
║  │  • Parse all wiki/ notes for nodes                          │     ║
║  │  • Parse [[links]] for edges                                │     ║
║  │  • Attach metadata (PARA, tags, summary, timestamp)         │     ║
║  │  • Export structured graph.json                             │     ║
║  └─────────────────────────────────────────────────────────────┘     ║
║                           │                                          ║
║                           ▼                                          ║
║  ┌─────────────────────────────────────────────────────────────┐     ║
║  │  LAYER 4 — QUERY (ask.py)                                   │     ║
║  │  • Embed user question                                      │     ║
║  │  • Retrieve top-K relevant notes (cosine similarity)        │     ║
║  │  • Build context prompt from retrieved notes                │     ║
║  │  • Send to LLM (Groq/Llama3) for answer synthesis           │     ║
║  │  • Return grounded answer with source citations             │     ║
║  └─────────────────────────────────────────────────────────────┘     ║
║                           │                                          ║
║                           ▼                                          ║
║  ┌─────────────────────────────────────────────────────────────┐     ║
║  │  LAYER 5 — UI + DEPLOYMENT (app.py → Streamlit Cloud)       │     ║
║  │  • Tab 1: Interactive force-directed brain graph             │     ║
║  │    (vis-network / Cytoscape.js via streamlit-component)     │     ║
║  │  • Tab 2: Ask-Anything search bar + answer display          │     ║
║  │  • Deployed to public URL (Streamlit Cloud / HF Spaces)     │     ║
║  └─────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 3. Component-by-Component Architecture

### 3.1 Capture Layer — `capture.py`

**Responsibility:** Accept any input type, normalize it, persist it with metadata.

```
capture.py
│
├── Input Handlers
│   ├── NoteHandler     → accepts plain text from CLI / stdin
│   ├── URLHandler      → fetches URL, extracts readable text (readability / requests)
│   └── FileHandler     → reads PDF / txt / md / image (PyMuPDF / Pillow)
│
├── Normalizer
│   └── strips HTML, converts to plain UTF-8 text
│
├── Metadata Builder
│   ├── uuid4()         → unique capture ID
│   ├── datetime.now()  → ISO-8601 timestamp
│   └── input_type      → "note" | "url" | "file"
│
└── Writer
    └── dumps JSON envelope → raw/{timestamp}_{uuid}.json
```

**Raw Capture Envelope (JSON Schema):**
```json
{
  "id":         "uuid-v4",
  "timestamp":  "2026-09-01T19:00:00Z",
  "type":       "note | url | file",
  "source":     "original input (URL / filename / first 80 chars of note)",
  "content":    "normalized plain text content",
  "filename":   "optional: original filename if file upload"
}
```

---

### 3.2 Intelligence Layer — `classify.py` + `link.py`

#### 3.2.1 `classify.py` — LLM Classification

**Responsibility:** Call a free LLM API (Groq → Llama 3) to classify each raw capture.

```
classify.py
│
├── load_raw()          → reads a raw JSON capture
├── build_prompt()      → constructs PARA classification prompt
├── call_llm()          → POST to Groq API (llama-3.3-70b-versatile)
├── parse_response()    → extracts category, tags[], summary
└── write_wiki_note()   → saves to wiki/{para_category}/{id}.md
```

**Wiki Note Schema (Markdown + YAML front-matter):**
```markdown
---
id: uuid-v4
timestamp: 2026-09-01T19:00:00Z
type: note
source: "https://example.com"
category: Resources          # PARA: Projects | Areas | Resources | Archives
tags: [ai, productivity, pkm]
summary: "One-line AI-generated summary of the note"
links: []                    # populated by link.py
embedding_file: embeddings/{id}.npy   # pointer to stored vector
---

# Note Title (derived from summary)

{full content of the note}
```

**PARA Prompt Template:**
```
You are a personal knowledge manager. Given the following note content, respond ONLY with valid JSON:
{
  "category": "one of: Projects | Areas | Resources | Archives",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "one concise sentence summarizing this note"
}

Note content:
{content}
```

---

#### 3.2.2 `link.py` — Embedding + Auto-Linking

**Responsibility:** Compute semantic embeddings and auto-link related notes.

```
link.py
│
├── EmbeddingEngine
│   ├── model: sentence-transformers/all-MiniLM-L6-v2 (local, free)
│   ├── embed(text) → 384-dim float32 numpy array
│   └── save to embeddings/{id}.npy
│
├── SimilarityIndex
│   ├── load all .npy vectors from embeddings/
│   ├── cosine_similarity(new_vec, all_existing_vecs)
│   └── returns [(note_id, score), ...] sorted descending
│
├── LinkInserter
│   ├── threshold: 0.75 (configurable in config.yaml)
│   ├── top_k: 3 related notes per capture
│   └── injects [[note_id]] wikilinks into front-matter `links:` field
│
└── Orchestrator
    └── run_pipeline(raw_path) → classify → embed → link → wiki note
```

**Similarity Threshold Logic:**
```
score >= 0.85 → Strong link  (auto-linked, shown as thick edge)
score >= 0.75 → Weak link    (auto-linked, shown as thin edge)
score < 0.75  → No link
```

---

### 3.3 Graph Layer — `build_graph.py` + `graph.json`

**Responsibility:** Convert all wiki notes + links into a graph data structure.

```
build_graph.py
│
├── NoteParser
│   └── reads every wiki/**/*.md, extracts front-matter + [[links]]
│
├── GraphBuilder
│   ├── nodes: [ { id, label, category, tags, summary, timestamp } ]
│   └── edges: [ { source, target, weight } ]
│
└── Exporter
    └── writes graph.json
```

**graph.json Schema:**
```json
{
  "nodes": [
    {
      "id":        "uuid-v4",
      "label":     "Note Title",
      "category":  "Resources",
      "tags":      ["ai", "pkm"],
      "summary":   "One-line summary",
      "timestamp": "2026-09-01T19:00:00Z",
      "content":   "Full note text (for hover popup)"
    }
  ],
  "edges": [
    {
      "source":  "uuid-source",
      "target":  "uuid-target",
      "weight":  0.82
    }
  ]
}
```

**Node Color Mapping (by PARA category):**
```
Projects  → #6C63FF  (purple)
Areas     → #F9A825  (amber)
Resources → #26C6DA  (cyan)
Archives  → #78909C  (grey)
```

---

### 3.4 Query Layer — `ask.py`

**Responsibility:** Retrieval-Augmented Generation (RAG) over personal notes.

```
ask.py
│
├── QuestionEmbedder
│   └── embed(question) → query vector (same model as link.py)
│
├── Retriever
│   ├── load all embeddings/
│   ├── cosine_similarity(query_vec, all_note_vecs)
│   └── return top_k=5 most similar notes
│
├── ContextBuilder
│   ├── load full content of top-k notes from wiki/
│   └── format as numbered context blocks
│
├── LLMSynthesizer
│   ├── build RAG prompt (context + question)
│   ├── call Groq API (llama-3.3-70b-versatile)
│   └── return answer string
│
└── CitationAttacher
    └── append source note IDs / titles to answer
```

**RAG Prompt Template:**
```
You are a personal assistant with access to the user's private knowledge base.
Answer the question using ONLY the notes provided below.
If the answer is not in the notes, say "I don't have information about this."

NOTES:
[1] {title_1}: {content_1}
[2] {title_2}: {content_2}
...

QUESTION: {user_question}

Answer concisely, citing relevant note numbers (e.g. [1], [3]).
```

---

### 3.5 UI + Deployment — `app.py`

**Responsibility:** Assemble all layers into a single Streamlit app with two views.

```
app.py
│
├── Sidebar
│   ├── Capture form (text input + URL input + file upload)
│   └── "Add to Brain" button → triggers full pipeline
│
├── Tab 1: Brain Graph
│   ├── loads graph.json
│   ├── renders vis-network graph via streamlit HTML component
│   │   ├── Force-directed layout
│   │   ├── Node color by PARA category
│   │   ├── Edge thickness by similarity weight
│   │   ├── Hover popup → note summary + tags
│   │   └── Click node → full note content in sidebar
│   └── Legend (PARA category colors)
│
└── Tab 2: Ask Your Brain
    ├── Text input: "Ask your brain anything..."
    ├── Calls ask.py ask() function
    ├── Displays synthesized answer
    └── Displays source note cards (collapsible)
```

---

## 4. Data Flow Diagram

```
User Input (CLI or Streamlit)
        │
        ▼
capture.py ──────────────────────────────► raw/{ts}_{uuid}.json
        │
        ▼
classify.py ─── Groq API (Llama 3) ──────► wiki/{PARA}/{uuid}.md
        │                                   (+ YAML front-matter)
        ▼
link.py ──── sentence-transformers ──────► embeddings/{uuid}.npy
        │    + cosine similarity           + updated [[links]] in wiki note
        ▼
build_graph.py ──────────────────────────► graph.json
        │
        ├──► app.py Tab 1 (vis-network graph render)
        │
ask.py ─── Groq API (RAG) ───────────────► app.py Tab 2 (answer)
        │
        ▼
Streamlit Cloud ─────────────────────────► Public URL
```

---

## 5. Technology Stack

| Layer         | Technology                              | Reason                          |
|---------------|-----------------------------------------|---------------------------------|
| Language      | Python 3.11+                            | Ecosystem, AI libraries         |
| Capture CLI   | `argparse` / `click`                    | Simple CLI interface            |
| URL Fetching  | `requests` + `readability-lxml`         | Clean text extraction from URLs |
| PDF Parsing   | `PyMuPDF` (fitz)                        | Fast, reliable PDF text         |
| LLM API       | Groq Cloud (llama-3.3-70b-versatile)    | Free tier, fast inference       |
| Embeddings    | `sentence-transformers` (MiniLM-L6-v2)  | Local, free, 384-dim vectors    |
| Vector Math   | `numpy` + `scikit-learn`                | Cosine similarity               |
| Storage       | Flat files (JSON + Markdown + .npy)     | Zero-config, Git-friendly       |
| Graph Build   | Pure Python (dict/list)                 | No DB dependency                |
| Graph Render  | `vis-network` (JS, via st.components)   | Force-directed, interactive     |
| UI Framework  | `Streamlit`                             | Rapid, Python-native UI         |
| Deployment    | Streamlit Community Cloud               | Free, GitHub-connected          |
| Config        | `config.yaml` + `python-dotenv`         | Environment-safe API keys       |

---

## 6. Directory Structure (Full)

```
secondself/
│
├── raw/                          # Week 1: raw captures
│   └── {timestamp}_{uuid}.json
│
├── wiki/                         # Week 2: classified + linked notes
│   ├── Projects/
│   │   └── {uuid}.md
│   ├── Areas/
│   │   └── {uuid}.md
│   ├── Resources/
│   │   └── {uuid}.md
│   └── Archives/
│       └── {uuid}.md
│
├── embeddings/                   # Week 2: note vector files
│   └── {uuid}.npy
│
├── capture.py                    # Week 1: capture CLI
├── classify.py                   # Week 2: PARA LLM classification
├── link.py                       # Week 2: embedding + auto-linking
├── build_graph.py                # Week 3: graph builder
├── graph.json                    # Week 3: exported graph data
├── ask.py                        # Week 4: RAG Q&A engine
├── app.py                        # Week 4: Streamlit UI
│
├── components/                   # Streamlit sub-components
│   ├── capture_sidebar.py
│   ├── graph_component.py
│   └── answer_display.py
│
├── utils/                        # Shared utilities
│   ├── pipeline.py               # End-to-end orchestration
│   ├── state.py                  # Streamlit session state
│   └── file_utils.py             # Path helpers, YAML parsers
│
├── config.yaml                   # Thresholds, model names, top_k, etc.
├── .env                          # API keys (Groq) — gitignored
├── .env.example                  # Template for .env
├── requirements.txt
├── README.md
├── problem_statement.md
├── architecture.md
├── implementation-plan.md
└── edge-case.md
```

---

## 7. Configuration (`config.yaml`)

```yaml
llm:
  provider: groq
  model: llama-3.3-70b-versatile
  temperature: 0.2
  max_tokens: 512

embeddings:
  model: sentence-transformers/all-MiniLM-L6-v2
  dimensions: 384

linking:
  similarity_threshold: 0.75
  strong_link_threshold: 0.85
  max_links_per_note: 3

retrieval:
  top_k: 5
  min_similarity: 0.50

graph:
  node_colors:
    Projects: "#6C63FF"
    Areas: "#F9A825"
    Resources: "#26C6DA"
    Archives: "#78909C"
  default_edge_color: "#AAAAAA"
```

---

## 8. External API Contracts

### 8.1 Groq API (Classification + RAG)
- **Endpoint:** `https://api.groq.com/openai/v1/chat/completions`
- **Auth:** `Authorization: Bearer $GROQ_API_KEY`
- **Model:** `llama-3.3-70b-versatile`
- **Rate limit (free tier):** 6000 tokens/min → batch with retry + exponential backoff

### 8.2 sentence-transformers (Local)
- **Model:** `all-MiniLM-L6-v2` (~90 MB, downloaded once on first run)
- **Runs entirely offline** — no API key needed
- **Output:** 384-dimensional float32 numpy array per note

---

## 9. Security & Privacy

| Concern           | Mitigation                                                      |
|-------------------|-----------------------------------------------------------------|
| API key exposure  | `.env` file + `.gitignore` entry; `.env.example` shared        |
| Note privacy      | All notes stored locally; only content sent to Groq API        |
| Public deployment | Streamlit app is read-only; no inbound write from public URL   |
| File uploads      | Sanitize filename, limit size (< 10 MB), validate extension    |

---

## 10. Week-by-Week Architecture Mapping

| Week | Badge              | Files Built                           | Output Artifact           |
|------|--------------------|---------------------------------------|---------------------------|
| 1    | The Archivist      | `capture.py`                          | `raw/` populated          |
| 2    | The Librarian      | `classify.py`, `link.py`              | `wiki/` + `embeddings/`   |
| 3    | The Cartographer   | `build_graph.py`, graph UI in `app.py`| `graph.json` + live graph |
| 4    | The Oracle         | `ask.py`, full `app.py`, deploy       | Public URL                |

---

## 11. Key Architectural Decisions

1. **Flat-file storage over a database** — Notes are Markdown + JSON files. Zero setup, human-readable, Git-friendly, and sufficient for personal scale (< 10,000 notes).

2. **Local embeddings, remote LLM** — `sentence-transformers` runs locally (no cost, no latency for bulk embedding). Groq is used only for LLM tasks (classification, RAG synthesis) where quality matters and data volume is small.

3. **Wikilink format (`[[id]]`)** — Using note IDs (UUIDs) as link targets avoids title-collision issues and makes graph parsing unambiguous.

4. **Streamlit over a custom web server** — Streamlit handles state, routing, and component rendering without requiring a separate frontend build step. The JS graph component is injected via `st.components.v1.html()`.

5. **PARA as the classification framework** — Four rigid categories make auto-classification prompts deterministic and the graph's visual legend simple and meaningful.

6. **Pipeline is stateless and re-runnable** — Each script can be run independently. Running `classify.py` on an already-classified note is idempotent (it overwrites front-matter). This makes debugging each layer easy.
