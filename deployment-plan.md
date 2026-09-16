# Deployment Plan: SecondSelf (CLONE BRAIN) → Streamlit Community Cloud

> **Source documents:** `implementation-plan.md` · `app.py` · `src/components/` · `index.html`
> **Target platform:** Streamlit Community Cloud (share.streamlit.io)
> **Entry point:** `app.py`
> **Timeline:** ~1–2 hours to complete

---

## ⚠️ Critical Architecture Note: Dual-Stack Project

This repository contains **two completely separate stacks**:

| Layer | Files | Purpose | Deploy to Streamlit? |
|---|---|---|---|
| **React / Vite Frontend** | `index.html`, `src/`, `src/components/*.tsx`, `package.json`, `vite.config.ts`, `server.ts` | Web UI prototype (TypeScript + React) | ❌ **Not deployed** |
| **Python / Streamlit Backend** | `app.py`, `capture.py`, `classify.py`, `link.py`, `build_graph.py`, `ask.py`, `components/`, `utils/`, `requirements.txt` | The actual deployable Streamlit app | ✅ **This is what we deploy** |

> [!IMPORTANT]
> `index.html` boots the **Vite/React** app (`src/main.tsx`), NOT the Streamlit app.
> Streamlit Community Cloud will **ignore** all Node.js files (`package.json`, `node_modules/`, `src/`, `index.html`, `server.ts`, `bun.lock`). They pose no harm but bloat the repo. See Step 1.3 for cleanup guidance.
>
> The React components in `src/components/` (`AskOracle.tsx`, `BrainGraph.tsx`, `CaptureDrawer.tsx`, etc.) are **not used** by the Streamlit app. The Streamlit app uses Python components in `components/graph_component.py` instead.

---

## Phase 1 — Pre-Deployment Preparation

### 1.1 — Verify Python Environment Locally

Run these checks before pushing to GitHub:

```bash
# Create a clean virtual environment
python -m venv .venv-deploy
.venv-deploy\Scripts\activate   # Windows
# source .venv-deploy/bin/activate  # macOS/Linux

# Install all dependencies
pip install -r requirements.txt

# Smoke-test all core modules
python -c "import streamlit, groq, sentence_transformers, frontmatter, fitz, yaml; print('All imports OK')"

# Run the Streamlit app locally
streamlit run app.py
```

**Acceptance:**
- [ ] All imports succeed without errors
- [ ] `streamlit run app.py` opens in browser at `localhost:8501`
- [ ] Brain Graph tab renders (vis-network graph visible)
- [ ] Ask Oracle tab responds to a test question
- [ ] PARA Wiki tab lists notes correctly

---

### 1.2 — Pin Exact Versions in `requirements.txt`

> [!WARNING]
> Unpinned versions (`>=`) can cause non-reproducible deployments when Streamlit Cloud builds the environment. Pin every package to the exact version that works locally.

Run this to capture exact versions from your working environment:

```bash
pip freeze > requirements-pinned.txt
```

Then cherry-pick only the packages in your current `requirements.txt` from that output and update your file:

```txt
# requirements.txt — PINNED for Streamlit Cloud

# Core
requests==2.32.3
python-dotenv==1.0.1
PyYAML==6.0.2
click==8.1.7

# PDF & URL parsing
PyMuPDF==1.24.11
readability-lxml==0.8.1

# AI / Embeddings
groq==0.9.0
sentence-transformers==3.1.1
numpy==1.26.4
scikit-learn==1.5.2

# UI
streamlit==1.39.0

# Utilities
python-frontmatter==1.1.0
filelock==3.16.1
```

> [!NOTE]
> Adjust versions to match your actual `pip freeze` output. The above are reference versions — your local environment is the source of truth.

---

### 1.3 — Repo Cleanup: Exclude Node.js Artefacts

The React/Vite stack (`index.html`, `src/`, `package.json`, `server.ts`, `node_modules/`, `bun.lock`) is irrelevant to Streamlit Cloud. Add these to `.gitignore` to keep the repo clean:

```gitignore
# Existing .gitignore entries (keep these)
.env
__pycache__/
*.pyc
*.pyo
.DS_Store
embeddings/*.npy
.streamlit/secrets.toml

# Add: Node.js / Vite frontend (not part of Streamlit deployment)
node_modules/
dist/
bun.lock
package-lock.json
```

> [!NOTE]
> Do **not** delete `index.html`, `src/`, or `package.json` from the repo if the React frontend is still being actively developed. Just make sure Streamlit Cloud ignores them — it will, because it only reads `requirements.txt` and runs `app.py`.

---

### 1.4 — Prepare Data Files for Deployment

Streamlit Community Cloud uses an **ephemeral filesystem** — all files written at runtime (notes, embeddings, graph) are lost on restart. Choose one of these strategies:

#### Option A: Commit Static Seed Data (Recommended for Demo)

Commit a pre-built snapshot of `wiki/`, `embeddings/`, and `graph.json` so the app starts with real data:

```bash
git add wiki/
git add embeddings/
git add graph.json
git add raw/
git commit -m "chore: add seed knowledge base data for deployment"
```

Add startup auto-rebuild to `app.py` (already present, keep it):
```python
if not Path("graph.json").exists():
    export_graph()
```

#### Option B: Empty Seed (Fresh Start)

If you want users to build their own brain from scratch:
- Commit only `.gitkeep` files in `wiki/`, `raw/`, `embeddings/`
- The app handles an empty graph gracefully (already implemented)

> [!CAUTION]
> Any notes captured via the sidebar **will be lost** when the Streamlit Cloud app restarts (typically every few days or on re-deployment). This is a known limitation of the ephemeral filesystem. Document this in your README.

---

### 1.5 — Add `.streamlit/config.toml`

Create this file for optimal Streamlit Cloud rendering:

```toml
# .streamlit/config.toml
[server]
headless = true
enableCORS = false
enableXsrfProtection = false

[browser]
gatherUsageStats = false

[theme]
base = "dark"
primaryColor = "#6C63FF"
backgroundColor = "#0E1117"
secondaryBackgroundColor = "#1A1D27"
textColor = "#FAFAFA"
font = "sans serif"
```

---

### 1.6 — Add Startup Guard in `app.py`

Wrap the embedding model load with `@st.cache_resource` to avoid re-downloading on every session (the model is ~90 MB):

```python
# Add to app.py or utils/file_utils.py

@st.cache_resource(show_spinner="Loading AI models...")
def load_embedding_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
```

Also add a graceful API key check at startup:

```python
# At the top of app.py, after imports
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
if not GROQ_API_KEY:
    st.error("⚠️ GROQ_API_KEY is not configured. Set it in Streamlit Cloud Secrets (Settings → Secrets).")
    st.stop()
```

---

## Phase 2 — GitHub Repository Setup

### 2.1 — Repository Checklist

Ensure the following before connecting to Streamlit Cloud:

```
clone-brain/
├── app.py                  ✅ Streamlit entry point
├── capture.py              ✅ committed
├── classify.py             ✅ committed
├── link.py                 ✅ committed
├── build_graph.py          ✅ committed
├── ask.py                  ✅ committed
├── requirements.txt        ✅ pinned versions
├── config.yaml             ✅ committed
├── .env.example            ✅ committed (NOT .env)
├── .gitignore              ✅ includes .env, embeddings/*.npy
├── .streamlit/
│   └── config.toml         ✅ NEW — add this
├── components/
│   └── graph_component.py  ✅ Python component (Streamlit uses this)
├── utils/
│   ├── file_utils.py       ✅ committed
│   └── pipeline.py         ✅ committed
├── wiki/                   ✅ seed data committed (or .gitkeep)
├── embeddings/             ✅ seed data committed (or .gitkeep)
├── graph.json              ✅ pre-built (or auto-generated on startup)
│
│ ── React/Vite stack (NOT part of Streamlit deploy) ──
├── index.html              ⚠️  Ignored by Streamlit Cloud
├── src/                    ⚠️  Ignored by Streamlit Cloud
│   ├── App.tsx
│   ├── components/
│   │   ├── AskOracle.tsx
│   │   ├── BrainGraph.tsx
│   │   ├── CaptureDrawer.tsx
│   │   ├── NoteModal.tsx
│   │   ├── TestingSuite.tsx
│   │   └── WikiExplorer.tsx
│   ├── main.tsx
│   ├── types.ts
│   └── index.css
├── package.json            ⚠️  Ignored by Streamlit Cloud
├── vite.config.ts          ⚠️  Ignored by Streamlit Cloud
└── server.ts               ⚠️  Ignored by Streamlit Cloud
```

### 2.2 — Final Git Push

```bash
git add .
git commit -m "feat: prepare SecondSelf for Streamlit Cloud deployment

- Pin requirements.txt versions
- Add .streamlit/config.toml
- Add startup API key guard
- Cache embedding model with st.cache_resource
- Seed wiki/ and graph.json for demo"

git push origin main
```

---

## Phase 3 — Streamlit Community Cloud Deployment

### 3.1 — Deploy Steps

1. **Open** [share.streamlit.io](https://share.streamlit.io) and sign in with GitHub.

2. **Click** "New app" → "From existing repo".

3. **Configure:**

   | Field | Value |
   |---|---|
   | Repository | `your-github-username/clone-brain` |
   | Branch | `main` |
   | Main file path | `app.py` |
   | App URL (optional) | `secondself` or `clone-brain` |

4. **Click** "Advanced settings" → **Secrets** tab.

5. **Add secrets** (replaces `.env` for Streamlit Cloud):

   ```toml
   # Streamlit Cloud Secrets — paste this in the Secrets text box
   GROQ_API_KEY = "gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
   ```

6. **Click** "Deploy!" — Build takes ~3–7 minutes on first run (model download included).

7. **Get your public URL:**
   ```
   https://your-username-clone-brain-app-XXXXXXXX.streamlit.app
   ```

---

### 3.2 — What Happens During Build

```
Streamlit Cloud Build Pipeline:
────────────────────────────────
[1] Clone GitHub repo (main branch)
[2] Detect requirements.txt → pip install -r requirements.txt
    ├── Installs groq, sentence-transformers, streamlit, PyMuPDF...
    └── sentence-transformers downloads all-MiniLM-L6-v2 (~90 MB) on first run
[3] Read .streamlit/secrets.toml (from Secrets UI)
[4] Run: streamlit run app.py
    ├── ensure_dirs() — creates wiki/, raw/, embeddings/ if missing
    ├── if not graph.json → export_graph()
    ├── GROQ_API_KEY guard check
    └── App serves on HTTPS public URL
```

> [!NOTE]
> Node.js files (`package.json`, `index.html`, `src/`) are present in the repo but Streamlit Cloud ignores them completely — it only processes `requirements.txt` and runs `app.py`. No `npm install` or Vite build will happen.

---

## Phase 4 — Post-Deployment Verification

### 4.1 — Verification Checklist

Run through these checks immediately after deployment:

| Check | How to Verify | Expected Result |
|---|---|---|
| **App loads** | Open the public URL | No red error banners |
| **API key works** | Check sidebar — no GROQ warning | Groq API connected |
| **Brain Graph** | Click "🧠 Brain Graph" tab | vis-network renders with nodes |
| **Node hover** | Hover over a graph node | Summary + tags popup appears |
| **Drag/zoom** | Drag nodes, scroll to zoom | Smooth interaction |
| **Ask Oracle** | Type a question → "Ask Oracle" | Answer with cited sources returned |
| **Capture note** | Add a note via sidebar | Pipeline runs, graph refreshes |
| **Capture URL** | Paste a URL → "Add URL" | Content extracted, node appears |
| **PARA Wiki** | Click "📂 PARA Wiki" tab | Notes visible under all 4 categories |
| **Cold start** | Wait 1 min, reload | App wakes up in < 10 seconds |

### 4.2 — Common Issues & Fixes

| Symptom | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: groq` | requirements.txt not pinned properly | Re-check pinned versions, redeploy |
| `GROQ_API_KEY not set` error banner | Secret not configured | Go to App Settings → Secrets, add key |
| Blank white graph area | vis-network CDN blocked | Bundle vis-network locally (see below) |
| `graph.json not found` | Startup guard missing | Add `if not Path("graph.json").exists(): export_graph()` |
| `No module named 'frontmatter'` | Package name mismatch | Verify package name is `python-frontmatter` in requirements.txt |
| App resets all notes on restart | Ephemeral filesystem | Commit seed data to Git (Phase 1.4) |
| Model download timeout | First cold start | Add `@st.cache_resource` to model load |

#### Fix: Bundle vis-network Locally (CDN Fallback)

If the CDN is blocked on Streamlit Cloud, download vis-network locally:

```bash
# Download the minified bundle
curl -o components/vis-network.min.js \
  https://unpkg.com/vis-network/standalone/umd/vis-network.min.js
```

Then update `components/graph_component.py` to inline the JS instead of using a CDN `<script src="...">` tag.

---

## Phase 5 — Maintenance & Future Considerations

### 5.1 — Ephemeral Filesystem Strategy

Streamlit Community Cloud restarts apps after periods of inactivity. All runtime-written files are lost. Options:

| Strategy | Complexity | Best For |
|---|---|---|
| **Commit seed data to Git** (current approach) | Low | Public demo with static knowledge base |
| **GitHub API integration** | Medium | Auto-commit new notes back to the repo |
| **External DB (Supabase, Firebase)** | High | Multi-user, persistent, production use |

### 5.2 — Environment Variables Reference

| Variable | Where Set | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Streamlit Cloud Secrets | Groq Llama 3 API access |

### 5.3 — Re-deployment Workflow

Any push to `main` will **auto-redeploy** the Streamlit app:

```bash
# After making changes:
git add .
git commit -m "fix: update knowledge base / fix bug"
git push origin main
# → Streamlit Cloud auto-detects push and rebuilds (~2-3 min)
```

### 5.4 — Final Deliverables Checklist

- [ ] `requirements.txt` pinned and verified in fresh venv
- [ ] `.streamlit/config.toml` committed with dark theme config
- [ ] `GROQ_API_KEY` set in Streamlit Cloud Secrets
- [ ] Seed `wiki/`, `embeddings/`, `graph.json` committed (or startup rebuild confirmed)
- [ ] `@st.cache_resource` on embedding model load
- [ ] Public URL live and all 3 tabs functional
- [ ] Capture → Classify → Link → Graph refresh pipeline verified on deployed URL
- [ ] README updated with public URL and setup instructions

---

## Quick Reference

```
Streamlit Cloud Deployment Summary
════════════════════════════════════════════════
Entry point:    app.py
Requirements:   requirements.txt  (Python only)
Secrets:        GROQ_API_KEY = "gsk_..."
Config:         .streamlit/config.toml

What IS deployed:
  app.py, capture.py, classify.py, link.py,
  build_graph.py, ask.py, components/*.py,
  utils/*.py, wiki/, embeddings/, graph.json

What is NOT deployed (React/Vite stack):
  index.html, src/, src/components/*.tsx,
  package.json, vite.config.ts, server.ts,
  node_modules/, bun.lock

Deploy URL:
  https://<username>-clone-brain-app-XXXXX.streamlit.app
════════════════════════════════════════════════
```
