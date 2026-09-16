# 📋 COMMANDS — SecondSelf (clone-brain)

> Complete reference for all CLI commands across the Python (Streamlit) stack and the React/Vite frontend stack.

---

## 🐍 Python / Streamlit Stack

### Environment Setup

```bash
# Create a virtual environment
python -m venv .venv

# Activate — Windows (PowerShell)
.venv\Scripts\Activate.ps1

# Activate — Windows (CMD)
.venv\Scripts\activate.bat

# Activate — macOS / Linux
source .venv/bin/activate

# Install all dependencies (pinned)
pip install -r requirements.txt

# Verify all imports are OK
python -c "import streamlit, groq, sentence_transformers, frontmatter, fitz, yaml; print('All imports OK')"

# Export your current working env to a pinned requirements file
pip freeze > requirements-pinned.txt

# Deactivate the virtual environment
deactivate
```

---

### 🚀 Run the App

```bash
# Run Streamlit app locally (opens at http://localhost:8501)
streamlit run app.py

# Run on a specific port
streamlit run app.py --server.port 8502

# Run with browser auto-open disabled
streamlit run app.py --server.headless true
```

---

### 📥 Capture — Ingest Notes, URLs, Files

```bash
# Capture a plain text note
python capture.py note "Your note text here"

# Capture a web URL (scrapes and stores content)
python capture.py url "https://example.com/article"

# Capture a file (PDF, TXT, or Markdown)
python capture.py file ./path/to/document.pdf
python capture.py file ./path/to/notes.txt
python capture.py file ./path/to/notes.md
```

---

### 🗂️ Classify — PARA Auto-Classification via Groq LLM

```bash
# Classify ALL unclassified raw captures
python classify.py --all

# Classify a specific raw JSON file
python classify.py --file raw/20260916_123456_uuid.json

# Force re-classify already classified notes
python classify.py --all --force
python classify.py --file raw/example.json --force
```

---

### 🔗 Link — Semantic Embeddings & Auto-Linking

```bash
# Embed and link ALL wiki notes
python link.py --all

# Embed and link a single wiki note
python link.py --file wiki/Projects/uuid.md
```

---

### 🕸️ Build Graph — Rebuild knowledge graph

```bash
# Parse all wiki notes and export graph.json
python build_graph.py
```

---

### 💬 Ask — RAG Oracle Query Engine

```bash
# Ask a question across your knowledge base
python ask.py "What are my notes about deep work?"
python ask.py "Summarise my project ideas"
python ask.py "What productivity systems have I captured?"
```

---

### 🔁 Full Pipeline — Run Everything in Sequence

```bash
# Option 1: Run each stage manually in order
python capture.py note "Your note here"
python classify.py --all
python link.py --all
python build_graph.py

# Option 2: One-liner pipeline (capture → classify → link → graph)
python -c "
from capture import capture_note
from classify import classify_all
from link import link_all
from build_graph import export_graph
capture_note('Your note text here')
classify_all()
link_all()
export_graph()
print('Pipeline complete!')
"
```

---

### 🧪 Testing — End-to-End Test Suite

```bash
# Run the full E2E integration test (all 6 stages)
python utils/test_e2e.py

# Run with exit code (0 = all passed, 1 = failures)
python utils/test_e2e.py && echo "ALL PASSED" || echo "SOME FAILED"
```

---

### 🔍 Diagnostics & Debugging

```bash
# Check if GROQ_API_KEY is set
python -c "import os; key=os.getenv('GROQ_API_KEY',''); print('Key set ✅' if key else 'Key MISSING ❌')"

# Count wiki notes per PARA category
python -c "
from utils.file_utils import get_all_wiki_files, load_wiki_note
files = get_all_wiki_files()
from collections import Counter
cats = Counter()
for f in files:
    meta, _ = load_wiki_note(f)
    cats[meta.get('category','Unknown')] += 1
for cat, n in cats.items(): print(f'{cat}: {n} notes')
print(f'Total: {sum(cats.values())} notes')
"

# Inspect graph.json summary
python -c "
import json
with open('graph.json') as f: g = json.load(f)
print(f'Nodes: {len(g[\"nodes\"])}')
print(f'Edges: {len(g[\"edges\"])}')
"

# Validate requirements.txt is complete
pip check

# List all raw captured files
python -c "from utils.file_utils import get_all_raw_files; [print(f) for f in get_all_raw_files()]"

# List all wiki notes
python -c "from utils.file_utils import get_all_wiki_files; [print(f) for f in get_all_wiki_files()]"

# Count embeddings
python -c "from pathlib import Path; embs=list(Path('embeddings').glob('*.npy')); print(f'{len(embs)} embeddings found')"
```

---

## 🔵 React / Vite Frontend Stack

> ⚠️ The React stack is **NOT deployed to Streamlit Cloud**. Use these commands only for local frontend development.

### Setup

```bash
# Install Node.js dependencies (npm)
npm install

# Install with Bun (faster)
bun install
```

### Development

```bash
# Start the Vite + Express dev server (hot reload)
npm run dev
# or
bun run dev

# Preview the production build locally
npm run preview
```

### Build

```bash
# Build frontend (Vite) + bundle server (esbuild)
npm run build

# Start the production server (after build)
npm run start

# TypeScript type-check (no emit)
npm run lint
# or
npx tsc --noEmit

# Clean build artefacts
npm run clean
```

---

## 🐙 Git Commands

```bash
# Check current status
git status

# Stage all deployment files
git add .

# Commit with deployment message
git commit -m "feat: your change description"

# Push to GitHub (triggers Streamlit Cloud auto-redeploy)
git push origin main

# Check remote URL
git remote -v

# View recent commits
git log --oneline -10

# Undo last commit (keep changes staged)
git reset --soft HEAD~1

# Pull latest from GitHub
git pull origin main
```

---

## ☁️ Streamlit Community Cloud

```bash
# Local smoke test before deploying
streamlit run app.py

# Check Streamlit version
streamlit --version
python -m streamlit --version

# Validate config.toml syntax
python -c "import tomllib; tomllib.load(open('.streamlit/config.toml','rb')); print('config.toml OK')"
```

**Manual Deploy Steps:**
1. Push to `main` → `git push origin main`
2. Go to [share.streamlit.io](https://share.streamlit.io)
3. New app → `ak-verma251/clone-brain` → branch `main` → file `app.py`
4. Add secret: `GROQ_API_KEY = "gsk_..."`
5. Click **Deploy!**

**Redeploy:** Any `git push origin main` auto-triggers a rebuild (~2–3 min).

---

## 🔑 Environment Variables

```bash
# Copy example env file
copy .env.example .env          # Windows
cp .env.example .env            # macOS / Linux

# Edit .env and set your key
# GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx

# Verify the key is loaded
python -c "from utils.file_utils import check_api_key; print('API key OK:', check_api_key()[:8] + '...')"
```

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | ✅ Yes | Groq API key for Llama 3 — get free at [console.groq.com](https://console.groq.com) |

---

## 📁 Key Files Reference

| File | Purpose |
|---|---|
| `app.py` | Streamlit entry point — run this |
| `capture.py` | Ingest notes / URLs / files |
| `classify.py` | PARA classification via Groq LLM |
| `link.py` | Semantic embeddings & note linking |
| `build_graph.py` | Build `graph.json` from wiki notes |
| `ask.py` | RAG oracle query engine |
| `utils/file_utils.py` | Shared helpers (config, paths, YAML) |
| `utils/pipeline.py` | Single-note full pipeline runner |
| `utils/test_e2e.py` | End-to-end integration test suite |
| `components/graph_component.py` | vis-network HTML graph renderer |
| `config.yaml` | Model & retrieval settings |
| `requirements.txt` | Pinned Python dependencies |
| `.streamlit/config.toml` | Dark theme + server config |
| `.env` | Local secrets (never committed) |
| `graph.json` | Pre-built knowledge graph (seed) |
| `wiki/` | PARA markdown knowledge base |
| `embeddings/` | Semantic vector files (`.npy`) |
| `raw/` | Raw captured JSON files |
