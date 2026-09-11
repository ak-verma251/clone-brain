# Implementation Plan: SecondSelf — Phase-by-Phase Build Guide

> **Source documents:** `architecture.md` · `problem_statement.md`  
> **Stack:** Python 3.11+ · Groq (Llama 3) · sentence-transformers · Streamlit · vis-network  
> **Timeline:** 4 weeks → 10 phases

---

## Phase Map

```
Phase 0  →  Project Scaffold & Configuration
Phase 1  →  Capture Layer          (Week 1 — The Archivist)
Phase 2  →  LLM Classification     (Week 2.1 — The Librarian: Sorting Hat)
Phase 3  →  Embeddings & Linking   (Week 2.2 — The Librarian: Connect the Dots)
Phase 4  →  Graph Builder          (Week 3.1 — The Cartographer: Shape)
Phase 5  →  Graph UI               (Week 3.2 — The Cartographer: Alive)
Phase 6  →  RAG Query Engine       (Week 4.1 — The Oracle: Ask Anything)
Phase 7  →  Streamlit UI Assembly  (Week 4.2 — The Oracle: Give It a Face)
Phase 8  →  Local Integration Test (All layers end-to-end)
Phase 9  →  Deployment & Public URL
```

---

## Phase 0 — Project Scaffold & Configuration

**Goal:** Create a clean, reproducible project environment before writing any functional code.

### 0.1 — Repository Structure

Create the following files and folders from scratch:

```
secondself/
├── raw/                    # (empty, git-tracked via .gitkeep)
├── wiki/
│   ├── Projects/           # (empty, .gitkeep)
│   ├── Areas/              # (empty, .gitkeep)
│   ├── Resources/          # (empty, .gitkeep)
│   └── Archives/           # (empty, .gitkeep)
├── embeddings/             # (empty, .gitkeep)
├── components/             # (empty, .gitkeep)
├── utils/                  # (empty, .gitkeep)
├── capture.py              # placeholder
├── classify.py             # placeholder
├── link.py                 # placeholder
├── build_graph.py          # placeholder
├── ask.py                  # placeholder
├── app.py                  # placeholder
├── config.yaml
├── .env                    # gitignored
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

### 0.2 — `requirements.txt`

```txt
# Core
requests>=2.31.0
python-dotenv>=1.0.0
PyYAML>=6.0.1
click>=8.1.7

# PDF & URL parsing
PyMuPDF>=1.23.0
readability-lxml>=0.8.1

# AI / Embeddings
groq>=0.4.0
sentence-transformers>=2.7.0
numpy>=1.26.0
scikit-learn>=1.4.0

# UI
streamlit>=1.33.0

# Utilities
python-frontmatter>=1.1.0
filelock>=3.13.0
```

### 0.3 — `config.yaml`

```yaml
llm:
  provider: groq
  model: llama-3.3-70b-versatile
  temperature: 0.2
  max_tokens: 512

embeddings:
  model: sentence-transformers/all-MiniLM-L6-v2
  dimensions: 384
  max_content_chars: 8000

linking:
  similarity_threshold: 0.75
  strong_link_threshold: 0.85
  max_links_per_note: 3

retrieval:
  top_k: 5
  min_similarity: 0.50

graph:
  max_display_nodes: 100
  node_colors:
    Projects: "#6C63FF"
    Areas: "#F9A825"
    Resources: "#26C6DA"
    Archives: "#78909C"
  default_edge_color: "#AAAAAA"

capture:
  max_content_chars: 8000
  min_content_chars: 10
  allowed_file_extensions: [.pdf, .txt, .md, .png, .jpg, .jpeg]
  max_file_size_mb: 10
```

### 0.4 — `.env.example` + `.gitignore`

`.env.example`:
```
GROQ_API_KEY=your_groq_api_key_here
```

`.gitignore`:
```
.env
__pycache__/
*.pyc
*.pyo
.DS_Store
embeddings/*.npy
.streamlit/secrets.toml
```

### 0.5 — `utils/file_utils.py`

Implement shared helpers used by all phases:
- `load_config()` → reads `config.yaml`, returns dict (falls back to hardcoded defaults)
- `load_raw(path)` → reads a raw JSON capture file
- `save_raw(data, path)` → writes a raw capture dict to JSON
- `load_wiki_note(path)` → reads Markdown + YAML front-matter via `python-frontmatter`
- `save_wiki_note(path, metadata, content)` → writes Markdown + YAML front-matter
- `get_all_raw_files()` → returns sorted list of paths in `raw/`
- `get_all_wiki_files()` → returns sorted list of paths in `wiki/`
- `ensure_dirs()` → creates all required project directories (idempotent)
- `content_hash(content)` → SHA-256 hex digest for duplicate detection
- `check_api_key()` → validates GROQ_API_KEY is set, prints clear error if not

### 0.6 — Verify Setup

```bash
pip install -r requirements.txt
py -3 -c "import yaml, frontmatter, click; print('OK')"
```

**Acceptance:**
- [x] All folders exist with `.gitkeep`
- [x] `requirements.txt` installs without errors
- [x] `config.yaml` loads correctly
- [x] `.env` is gitignored
- [x] `utils/file_utils.py` is importable and all functions pass smoke tests

---

## Phase 1 — Capture Layer

**Goal:** One command saves any note, URL, or file to `raw/` with UUID + timestamp.  
**Badge Target:** 🗂️ The Archivist

### 1.1 — `capture.py`

Implement three input handlers as a CLI using `click`:

```
capture.py note  "your note text here"
capture.py url   "https://example.com"
capture.py file  ./path/to/document.pdf
```

**Internal flow for each handler:**

| Handler | Steps |
|---------|-------|
| `NoteHandler` | Accept raw text from CLI arg or stdin |
| `URLHandler` | `requests.get(url)` → `readability` → extract plain text |
| `FileHandler` | `.pdf` → `PyMuPDF fitz` / `.md` `.txt` → read directly / `.png .jpg` → Pillow OCR note |

**Output written to:** `raw/{YYYYMMDD_HHMMSS}_{uuid4}.json`

```json
{
  "id":        "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-09-01T19:00:00Z",
  "type":      "url",
  "source":    "https://example.com",
  "content":   "plain text extracted content...",
  "filename":  null
}
```

**Edge cases to handle in Phase 1:**
- Empty input → reject with clear message
- URL fetch fails (404/timeout) → save URL as source, set `type: "url_failed"`
- Unsupported file type → reject with allowlist message
- Duplicate content (SHA-256 hash match) → warn and skip
- Content > `max_content_chars` → truncate and log warning

### 1.2 — Validation

- Capture 10+ real personal notes, links, and files
- Verify each `.json` file has all required fields
- Verify filenames follow `{timestamp}_{uuid}.json` pattern

**Acceptance:**
- [ ] `capture.py note "..."` works
- [ ] `capture.py url "https://..."` works and extracts readable text
- [ ] `capture.py file ./doc.pdf` works and extracts text
- [ ] Every capture has `id`, `timestamp`, `type`, `source`, `content`
- [ ] 10+ real items in `raw/`

---

## Phase 2 — LLM Classification (PARA)

**Goal:** Auto-classify every raw capture using Groq → Llama 3 and write to `wiki/`.  
**Badge Target:** 📚 The Librarian (Part 1)

### 2.1 — `classify.py`

Implement the following functions:

```python
load_raw(path: str) -> dict
build_prompt(content: str) -> str          # PARA classification prompt
call_llm(prompt: str) -> dict              # Groq API call, returns {category, tags, summary}
parse_response(raw_response: str) -> dict  # JSON extract + validation
write_wiki_note(raw: dict, meta: dict)     # saves to wiki/{category}/{id}.md
classify_all()                             # batch: process all unclassified raw/ files
```

**PARA Prompt (exact template):**
```
You are a personal knowledge manager. Given the following note content,
respond ONLY with a valid JSON object and nothing else:
{
  "category": "one of: Projects | Areas | Resources | Archives",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "one concise sentence summarizing this note"
}

Note content:
{content}
```

**Groq API call:**
- Model: `llama-3.3-70b-versatile`
- Temperature: `0.2` (from config)
- Add retry with exponential backoff (3 retries, 2s base) for rate-limit errors

**Wiki note written to:** `wiki/{category}/{id}.md`

```markdown
---
id: {uuid}
timestamp: {iso_timestamp}
type: {note|url|file}
source: {source}
category: {Projects|Areas|Resources|Archives}
tags: [tag1, tag2, tag3]
summary: "AI-generated one-line summary"
links: []
embedding_file: embeddings/{uuid}.npy
---

# {summary}

{full content}
```

**Edge cases to handle in Phase 2:**
- Groq rate limit (429) → exponential backoff, 3 retries
- Malformed LLM JSON → regex-extract `{...}`, fallback to defaults
- Invalid PARA category in response → default to `"Resources"`
- Already-classified note → skip unless `--force` flag
- Missing API key → `check_api_key()` on startup, exit cleanly

### 2.2 — Validation

```bash
python classify.py --all          # classify all raw/ files
python classify.py --file raw/X   # classify a single file
```

**Acceptance:**
- [ ] Every raw capture gets a PARA category
- [ ] Tags and summary are populated
- [ ] Wiki notes appear in the correct `wiki/{category}/` subfolder
- [ ] YAML front-matter is valid (parseable by `python-frontmatter`)
- [ ] Groq rate-limit errors are retried gracefully
- [ ] 15+ notes classified and in `wiki/`

---

## Phase 3 — Embeddings & Auto-Linking

**Goal:** Compute semantic vectors per note and automatically insert links between related notes.  
**Badge Target:** 📚 The Librarian (Part 2)

### 3.1 — `link.py`

Implement the following:

```python
load_model() -> SentenceTransformer           # loads all-MiniLM-L6-v2 once
embed(text: str) -> np.ndarray                # returns 384-dim float32 vector
save_embedding(uuid: str, vec: np.ndarray)    # saves to embeddings/{uuid}.npy
load_all_embeddings() -> dict[str, np.ndarray] # loads all .npy files
cosine_similarity_scores(query_vec, all_vecs) -> list[(uuid, score)]
find_related(uuid: str, top_k: int) -> list[(uuid, score)]
insert_links(wiki_path: str, related: list[(uuid, score)])  # updates front-matter links:
run_link_pipeline(wiki_path: str)             # embed + find_related + insert_links
link_all()                                    # batch: process all wiki/ notes
```

**Similarity threshold logic (from config):**
```python
if score >= 0.85:   link_type = "strong"   # thick edge in graph
elif score >= 0.75: link_type = "weak"     # thin edge in graph
else:               continue               # no link
```

**Link format injected into YAML front-matter:**
```yaml
links:
  - id: "target-uuid"
    score: 0.87
    type: "strong"
```

**Edge cases to handle in Phase 3:**
- First note (empty embeddings dir) → skip linking, save embedding only
- Self-link (uuid == target_uuid) → always skip
- Corrupted `.npy` file → catch error, skip, log warning
- Embedding model not downloaded → clear error message, exit
- Orphaned `.npy` files (wiki note deleted) → reconcile and remove

### 3.2 — Orchestration in `utils/pipeline.py`

```python
def run_full_pipeline(raw_path: str):
    """Runs classify → embed → link for a single raw capture."""
    classify_one(raw_path)
    wiki_path = find_wiki_note(raw_path)
    run_link_pipeline(wiki_path)
```

### 3.3 — Validation

```bash
python link.py --all          # embed + link all wiki/ notes
python link.py --file wiki/X  # process a single note
```

**Acceptance:**
- [ ] `embeddings/{uuid}.npy` exists for every wiki note
- [ ] Related notes auto-linked (no manual tagging)
- [ ] `links:` field in front-matter is a valid list
- [ ] Notes do not link to themselves
- [ ] Threshold logic correctly produces strong/weak/no link
- [ ] 15+ notes processed with visible links

---

## Phase 4 — Graph Builder

**Goal:** Parse all wiki notes and their links, build a nodes-and-edges structure, export as `graph.json`.  
**Badge Target:** 🗺️ The Cartographer (Part 1)

### 4.1 — `build_graph.py`

Implement:

```python
parse_notes() -> list[dict]            # reads all wiki/**/*.md, returns node dicts
parse_edges(notes: list) -> list[dict] # reads `links:` from each note's front-matter
build_graph(notes, edges) -> dict      # assembles {nodes: [...], edges: [...]}
export_graph(graph: dict)              # writes graph.json
```

**Node schema:**
```python
{
  "id":        note["id"],
  "label":     note["summary"][:50],      # truncated for display
  "category":  note["category"],
  "tags":      note["tags"],
  "summary":   note["summary"],
  "timestamp": note["timestamp"],
  "content":   full_note_content          # for hover popup in UI
}
```

**Edge schema:**
```python
{
  "source":  source_uuid,
  "target":  target_uuid,
  "weight":  link["score"],
  "type":    link["type"]                 # "strong" | "weak"
}
```

**Edge cases to handle in Phase 4:**
- Missing front-matter fields → use `.get()` with defaults, skip malformed notes
- Dangling edges (target UUID not in nodes) → remove and log
- Duplicate edges (A→B and B→A) → keep one with higher weight
- Empty wiki → write `graph.json` with empty nodes/edges, show warning in UI

### 4.2 — Validation

```bash
python build_graph.py
python -c "import json; d=json.load(open('graph.json')); print(len(d['nodes']), 'nodes,', len(d['edges']), 'edges')"
```

**Acceptance:**
- [ ] `graph.json` is valid JSON
- [ ] Every wiki note appears as a node
- [ ] Every `links:` entry appears as an edge
- [ ] No duplicate edges
- [ ] Nodes contain `content` field for hover popup
- [ ] `graph.json` has >= 15 nodes

---

## Phase 5 — Interactive Graph UI

**Goal:** Render `graph.json` as a live, interactive, force-directed brain graph inside Streamlit.  
**Badge Target:** 🗺️ The Cartographer (Part 2)

### 5.1 — `components/graph_component.py`

Build an HTML/JS vis-network graph injected via `st.components.v1.html()`:

**Features to implement:**

| Feature | Implementation |
|---------|----------------|
| Force-directed layout | `vis-network` physics: `forceAtlas2Based` |
| Node color by PARA | `#6C63FF` Projects / `#F9A825` Areas / `#26C6DA` Resources / `#78909C` Archives |
| Edge thickness | `strong` → width 3 / `weak` → width 1 |
| Hover popup | `title:` field on node = summary + tags |
| Drag + zoom | enabled by default in vis-network |
| Click node | `network.on("click")` → posts selected node ID to Streamlit via query param |
| Legend | HTML color legend rendered below graph |

**vis-network CDN:** `https://unpkg.com/vis-network/standalone/umd/vis-network.min.js`

```python
def render_graph(graph_json: dict, height: int = 700) -> None:
    """Renders the vis-network graph as a Streamlit HTML component."""
    nodes_js = json.dumps(graph_json["nodes"])
    edges_js  = json.dumps(graph_json["edges"])
    html = build_vis_html(nodes_js, edges_js)
    st.components.v1.html(html, height=height, scrolling=False)
```

**Edge cases to handle in Phase 5:**
- Node content with backticks/quotes/`</script>` → always `html.escape()` before JS injection
- 100+ nodes → apply `max_display_nodes` cap, add filter by PARA category
- Hover content too long → truncate to summary + first 200 chars
- vis-network CDN unavailable → bundle locally as fallback

### 5.2 — Validation (manual)

Open `app.py` Tab 1 locally and verify:

**Acceptance:**
- [ ] Graph renders without errors
- [ ] Nodes are colored by PARA category
- [ ] Hovering a node shows summary + tags
- [ ] Dragging nodes works
- [ ] Zoom in/out works
- [ ] Legend is visible and correct
- [ ] Built from real notes (not dummy data)

---

## Phase 6 — RAG Query Engine

**Goal:** Implement `ask()` — embed a question, retrieve top-K notes, synthesize an answer via LLM.  
**Badge Target:** 🔮 The Oracle (Part 1)

### 6.1 — `ask.py`

```python
def embed_question(question: str) -> np.ndarray
def retrieve_top_k(query_vec: np.ndarray, k: int = 5) -> list[dict]
    # returns list of: {id, content, summary, score}
def build_rag_prompt(question: str, retrieved: list[dict]) -> str
def synthesize_answer(prompt: str) -> str          # Groq API call
def attach_citations(answer: str, retrieved: list[dict]) -> dict
    # returns {answer: str, sources: list[{id, title, score}]}

def ask(question: str) -> dict:
    """Main entry point. Returns {answer, sources}."""
    vec = embed_question(question)
    top_k = retrieve_top_k(vec)
    prompt = build_rag_prompt(question, top_k)
    answer = synthesize_answer(prompt)
    return attach_citations(answer, top_k)
```

**RAG Prompt (exact template):**
```
You are a personal assistant with access to the user's private knowledge base.
Answer the question using ONLY the notes provided below.
If the answer is not in the notes, say "I don't have information about this."

NOTES:
[1] {title_1}:
{content_1}

[2] {title_2}:
{content_2}

[3] {title_3}:
{content_3}

QUESTION: {user_question}

Answer concisely and accurately. Cite relevant notes by their number (e.g., [1], [2]).
```

**Edge cases to handle in Phase 6:**
- Empty knowledge base → return friendly message without calling LLM
- No notes above `min_similarity` → return fallback, do NOT pass irrelevant context to LLM
- LLM unavailable → return retrieved notes with error message
- Very long question → truncate to 512 chars before embedding
- Retrieved notes exceed context window → truncate each note to 500 chars in prompt

**Fallback:** If no notes exceed `min_similarity` (0.50), return:  
`"I don't have enough relevant notes to answer this."`

### 6.2 — Validation

```bash
python ask.py "What are my notes about productivity?"
python ask.py "What was the last URL I captured?"
```

**Acceptance:**
- [ ] `ask()` returns a dict with `answer` and `sources`
- [ ] Answer is grounded in retrieved notes (not hallucinated)
- [ ] Source note titles/IDs are listed
- [ ] "No information" fallback works when similarity is too low
- [ ] Tested against 5+ real questions about personal notes

---

## Phase 7 — Streamlit UI Assembly

**Goal:** Wire all layers into a single polished Streamlit app.  
**Badge Target:** 🔮 The Oracle (Part 2)

### 7.1 — `app.py` Structure

```python
st.set_page_config(page_title="SecondSelf", page_icon="🧠", layout="wide")

# Sidebar: Capture
with st.sidebar:
    render_capture_sidebar()   # components/capture_sidebar.py

# Main area: tabs
tab1, tab2 = st.tabs(["🧠 Brain Graph", "💬 Ask Your Brain"])

with tab1:
    graph = load_graph_json()
    render_graph(graph)        # components/graph_component.py

with tab2:
    render_ask_interface()     # components/answer_display.py
```

### 7.2 — `components/capture_sidebar.py`

```
┌─────────────────────────────────┐
│  🧠 SecondSelf                  │
│  Add to Your Brain              │
│                                 │
│  [○] Note  [○] URL  [○] File   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ Type your note here...  │   │
│  └─────────────────────────┘   │
│                                 │
│  [  Add to Brain  ]            │
│                                 │
│  ─────────────────────────────  │
│  📊 15 notes · 23 links        │
└─────────────────────────────────┘
```

On "Add to Brain" click:
1. Run `capture.py` handler
2. Run `classify.py` on new raw file
3. Run `link.py` on new wiki note
4. Run `build_graph.py` to refresh `graph.json`
5. `st.rerun()` to refresh the graph

### 7.3 — `components/answer_display.py`

```
┌─────────────────────────────────────────────┐
│  💬 Ask Your Brain                           │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ What do I know about productivity? │   │
│  └─────────────────────────────────────┘   │
│                     [Ask]                   │
│                                             │
│  ──────────────────────────────────────     │
│  Answer:                                    │
│  Based on your notes [1][3], you focus on   │
│  deep work and time-blocking...             │
│                                             │
│  Sources:                                   │
│  ▸ [1] Deep Work Notes (score: 0.91)       │
│  ▸ [3] Time Blocking Guide (score: 0.83)   │
└─────────────────────────────────────────────┘
```

### 7.4 — `utils/state.py`

Manage `st.session_state` keys:
- `selected_node_id` — node clicked in graph
- `last_question` — last asked question
- `last_answer` — cached answer
- `pipeline_running` — prevent double-submit

### 7.5 — `utils/pipeline.py` (full implementation)

Wire all stages into one callable for the Streamlit sidebar:

```python
def run_full_pipeline(raw_path: str) -> str:
    """capture → classify → embed → link → build_graph. Returns wiki_path."""
```

**Edge cases to handle in Phase 7:**
- Double-click "Add to Brain" → `pipeline_running` flag prevents re-entry
- `graph.json` missing on startup → auto-call `build_graph()` before rendering
- File upload > 10 MB → reject with clear size limit message
- Pipeline error mid-way → show error toast, do not crash the app

### 7.6 — Validation (local)

```bash
streamlit run app.py
```

**Acceptance:**
- [ ] Sidebar capture form works for all 3 types
- [ ] After capture, graph refreshes with new node
- [ ] Tab 1: graph renders correctly (Phase 5 checks)
- [ ] Tab 2: question → answer with sources works
- [ ] No unhandled exceptions on normal use
- [ ] App loads in < 5 seconds on first run

---

## Phase 8 — Local Integration Test

**Goal:** Run the complete pipeline end-to-end on real data, verify every layer connects correctly.

### 8.1 — End-to-End Test Script

Create `utils/test_e2e.py`:

```python
def test_pipeline():
    # 1. Capture a note
    # 2. Capture a URL
    # 3. Capture a PDF
    # 4. Run classify on all three
    # 5. Run link on all wiki notes
    # 6. Run build_graph
    # 7. Call ask() with a known question
    # 8. Assert: graph has >= 3 nodes, answer is non-empty
```

### 8.2 — Manual Test Checklist

| Test | Expected Result |
|------|----------------|
| Capture text note | `raw/*.json` created with correct fields |
| Capture URL | Content extracted (not raw HTML) |
| Capture PDF | Text extracted from all pages |
| Classify | Note in correct `wiki/{PARA}/` folder |
| Link | Related notes linked; embeddings saved |
| Build graph | `graph.json` has all nodes + edges |
| Graph render | All nodes visible, hover works |
| Ask question | Relevant answer with cited sources |
| Add via UI | Full pipeline runs, graph refreshes |

### 8.3 — Acceptance

- [ ] Full pipeline completes without errors on 15+ real notes
- [ ] `graph.json` accurately reflects all wiki notes
- [ ] `ask()` returns relevant answers on 5 test questions
- [ ] No orphaned embeddings (every `.npy` has a matching wiki note)

---

## Phase 9 — Deployment & Public URL

**Goal:** Deploy the complete SecondSelf to a public URL using Streamlit Community Cloud.

### 9.1 — Pre-Deployment Checklist

- [ ] Push repo to GitHub (public or private)
- [ ] `requirements.txt` is complete and pinned
- [ ] `.env` is in `.gitignore`
- [ ] `graph.json` and `wiki/` are committed (or rebuilt on startup)
- [ ] `embeddings/*.npy` are committed or rebuilt on startup
- [ ] Add startup logic in `app.py`:
  ```python
  if not Path("graph.json").exists():
      build_graph()
  ```

### 9.2 — Streamlit Cloud Deployment

1. Go to [share.streamlit.io](https://share.streamlit.io)
2. Connect GitHub repo
3. Set **Main file path:** `app.py`
4. Set **Secrets** (replaces `.env`):
   ```toml
   GROQ_API_KEY = "your_key_here"
   ```
5. Deploy → wait for build (~3–5 min)
6. Get public URL: `https://{username}-secondself-app.streamlit.app`

### 9.3 — Post-Deployment Verification

| Check | Verify |
|-------|--------|
| Page loads | No import errors in Streamlit Cloud logs |
| Graph renders | vis-network CDN loads, nodes visible |
| Ask works | Groq API reachable, answer returned |
| Capture works | New note added → graph refreshes |
| Public URL | URL opens without login |

**Edge cases to handle in Phase 9:**
- Secrets not configured → startup banner warns user gracefully
- Cold start model download → `@st.cache_resource` wrapper + spinner
- Ephemeral filesystem → document in README: notes reset on restart; commit wiki/ to Git
- `requirements.txt` conflict → pin exact versions, test in fresh venv first
- `graph.json` > 100 MB → add to `.gitignore`, regenerate on startup

### 9.4 — Final Deliverables Checklist

- [ ] GitHub repo with clean README + setup instructions
- [ ] `requirements.txt` pinned and working
- [ ] Live deployed URL (interactive graph + ask-your-brain, both working)
- [ ] End-to-end flow verified on deployed URL: capture → classify → link → graph → ask
- [ ] All 4 weekly milestones achieved:
  - [ ] 🗂️ The Archivist — Capture Pipeline
  - [ ] 📚 The Librarian — Self-Organizing Wiki
  - [ ] 🗺️ The Cartographer — Living Brain
  - [ ] 🔮 The Oracle — SecondSelf deployed

---

## Dependency Graph (phases)

```
Phase 0  (scaffold)
    │
    ▼
Phase 1  (capture.py)          <- produces: raw/
    │
    ▼
Phase 2  (classify.py)         <- consumes: raw/   produces: wiki/
    │
    ▼
Phase 3  (link.py)             <- consumes: wiki/  produces: embeddings/ + updated links
    │
    ▼
Phase 4  (build_graph.py)      <- consumes: wiki/  produces: graph.json
    │
    ├──► Phase 5  (graph UI)   <- consumes: graph.json
    │
    └──► Phase 6  (ask.py)     <- consumes: embeddings/ + wiki/
              │
              ▼
          Phase 7  (app.py)    <- consumes: all of the above
              │
              ▼
          Phase 8  (local test)
              │
              ▼
          Phase 9  (deploy)
```

---

## Quick Reference: Commands per Phase

| Phase | Key Command |
|-------|-------------|
| 0 | `pip install -r requirements.txt` |
| 1 | `python capture.py note "..."` / `url "..."` / `file ./doc.pdf` |
| 2 | `python classify.py --all` |
| 3 | `python link.py --all` |
| 4 | `python build_graph.py` |
| 5 | `streamlit run app.py` (Tab 1) |
| 6 | `python ask.py "your question"` |
| 7 | `streamlit run app.py` (full) |
| 8 | `python utils/test_e2e.py` |
| 9 | Deploy via Streamlit Cloud |
