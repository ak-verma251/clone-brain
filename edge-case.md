# Edge Cases & Corner Scenarios: SecondSelf

> **Source documents:** `architecture.md` · `implementation-plan.md`  
> **Purpose:** Catalog every known edge case, failure mode, and corner scenario — layer by layer — with expected behavior and recommended handling strategy.

---

## How to Use This Document

Each section maps to a layer/phase from `implementation-plan.md`. For every edge case:
- **Trigger:** What causes this scenario
- **Risk:** What breaks if unhandled
- **Handling:** Recommended strategy

---

## Table of Contents

1. [Capture Layer (Phase 1)](#1-capture-layer)
2. [LLM Classification (Phase 2)](#2-llm-classification)
3. [Embeddings & Linking (Phase 3)](#3-embeddings--linking)
4. [Graph Builder (Phase 4)](#4-graph-builder)
5. [Graph UI (Phase 5)](#5-graph-ui)
6. [RAG Query Engine (Phase 6)](#6-rag-query-engine)
7. [Streamlit UI (Phase 7)](#7-streamlit-ui)
8. [Data Integrity (Cross-Phase)](#8-data-integrity-cross-phase)
9. [Deployment (Phase 9)](#9-deployment)
10. [Security & Privacy](#10-security--privacy)

---

## 1. Capture Layer

### 1.1 Empty Input

| Field | Detail |
|-------|--------|
| **Trigger** | User runs `capture.py note ""` or submits an empty form in UI |
| **Risk** | JSON file created with `content: ""` — pollutes `raw/` with useless captures |
| **Handling** | Validate content length > 10 characters before writing. Raise `ValueError("Capture content cannot be empty.")` and exit cleanly. |

---

### 1.2 Extremely Large Content

| Field | Detail |
|-------|--------|
| **Trigger** | User captures a 500-page PDF, a 10 MB text file, or a URL with a massive article |
| **Risk** | LLM classification fails (token limit exceeded). Embedding is slow. Disk fills up. |
| **Handling** | Truncate content to first `MAX_CONTENT_CHARS = 8000` characters before saving to `raw/`. Store full file separately in `raw/files/{uuid}_original.pdf`. Log a warning that content was truncated. |

---

### 1.3 URL Fetch Failure

| Field | Detail |
|-------|--------|
| **Trigger** | URL returns 404, 403, 500, times out, or requires authentication/JavaScript |
| **Risk** | `requests.get()` raises exception → program crashes, nothing saved |
| **Handling** | Wrap in try/except. On failure: save the URL itself as content with `type: "url_failed"`. Log the HTTP error code. Never crash silently — always write something to `raw/`. |

---

### 1.4 URL Returns Non-Text Content

| Field | Detail |
|-------|--------|
| **Trigger** | URL points to an image (`.png`), binary file, or download link |
| **Risk** | `readability` returns garbage or crashes on non-HTML content |
| **Handling** | Check `Content-Type` header before parsing. If not `text/html` or `text/plain`, save the URL as a file capture instead. |

---

### 1.5 Unsupported File Type

| Field | Detail |
|-------|--------|
| **Trigger** | User tries to capture a `.docx`, `.xlsx`, `.mp3`, `.zip`, or `.exe` file |
| **Risk** | `PyMuPDF` or file reader throws exception |
| **Handling** | Maintain an allowlist: `[.pdf, .txt, .md, .png, .jpg, .jpeg]`. Reject others with a clear message: `"Unsupported file type: .docx. Supported: pdf, txt, md, png, jpg."` |

---

### 1.6 Duplicate Capture

| Field | Detail |
|-------|--------|
| **Trigger** | User captures the same URL or note text twice |
| **Risk** | Two wiki notes with nearly identical content inflate the graph with spurious nodes |
| **Handling** | On capture, compute a SHA-256 hash of the normalized content. Check against a `raw/index.json` manifest. If hash exists, warn the user and skip (or prompt to confirm re-capture). |

---

### 1.7 Unicode / Special Characters

| Field | Detail |
|-------|--------|
| **Trigger** | Note contains emoji, Arabic/Chinese/Hindi text, or special symbols |
| **Risk** | JSON encoding failure, YAML front-matter breaks, file system path issues |
| **Handling** | Always write JSON with `ensure_ascii=False, encoding="utf-8"`. Use UUID (not derived from content) as the filename — never use note text in filenames. |

---

### 1.8 PDF with No Extractable Text

| Field | Detail |
|-------|--------|
| **Trigger** | Scanned PDF (image-only) where `PyMuPDF` returns empty string |
| **Risk** | Empty content written to `raw/` → classified as garbage → meaningless node in graph |
| **Handling** | If `PyMuPDF` returns < 50 characters, log: `"Warning: PDF appears to be image-only. Text extraction returned minimal content."` Save what was found; do not crash. Optionally flag for manual review with `type: "pdf_scanned"`. |

---

### 1.9 Filesystem Permission Error

| Field | Detail |
|-------|--------|
| **Trigger** | `raw/` or `wiki/` folder is read-only or doesn't exist |
| **Risk** | `FileNotFoundError` or `PermissionError` on write |
| **Handling** | On startup, call `ensure_dirs()` which creates all required folders with `mkdir(parents=True, exist_ok=True)`. Catch write errors and surface a clear message. |

---

## 2. LLM Classification

### 2.1 Groq API Rate Limit (429)

| Field | Detail |
|-------|--------|
| **Trigger** | Batch classification of 20+ notes at once hits the 6000 token/min free tier limit |
| **Risk** | All classifications fail mid-batch; some notes get wiki files, others don't |
| **Handling** | Implement exponential backoff: retry 3 times at 2s, 4s, 8s delays. Process notes sequentially with a 1-second sleep between calls during batch mode. Log which notes succeeded vs. failed. |

---

### 2.2 LLM Returns Malformed JSON

| Field | Detail |
|-------|--------|
| **Trigger** | Llama 3 returns text before/after the JSON, or returns invalid JSON (trailing comma, unquoted key) |
| **Risk** | `json.loads()` raises `JSONDecodeError` → classification fails |
| **Handling** | Use regex to extract the first `{...}` block from the response. If parsing still fails after 1 retry with a stricter prompt, fall back to defaults: `category: "Resources"`, `tags: []`, `summary: content[:100]`. Never leave a note unclassified. |

---

### 2.3 LLM Hallucinate an Invalid Category

| Field | Detail |
|-------|--------|
| **Trigger** | Llama 3 returns `"category": "Inbox"` or `"category": "Notes"` instead of valid PARA |
| **Risk** | `wiki/{invalid_category}/` folder is created, breaking graph builder expectations |
| **Handling** | After parsing, validate `category in {"Projects", "Areas", "Resources", "Archives"}`. If not, default to `"Resources"`. Log the invalid category for debugging. |

---

### 2.4 Empty or Minimal Content

| Field | Detail |
|-------|--------|
| **Trigger** | Note content is very short (e.g., `"Buy milk"` — 8 words) |
| **Risk** | LLM produces low-quality or nonsensical tags/summary |
| **Handling** | If content < 20 words, skip LLM call. Assign defaults: `category: "Archives"`, `tags: []`, `summary: content`. Add a `"short_note": true` flag in front-matter. |

---

### 2.5 Groq API Key Missing or Invalid

| Field | Detail |
|-------|--------|
| **Trigger** | `.env` missing, `GROQ_API_KEY` not set, or key has been revoked |
| **Risk** | Authentication error crashes classification for all notes |
| **Handling** | On startup, check `os.environ.get("GROQ_API_KEY")`. If absent, print a clear setup message and exit with code 1. Do not silently proceed with a `None` key. |

---

### 2.6 Network Unavailable During Classification

| Field | Detail |
|-------|--------|
| **Trigger** | Machine is offline when `classify.py` runs |
| **Risk** | All API calls fail; notes stranded in `raw/` |
| **Handling** | Catch `requests.exceptions.ConnectionError`. Mark the raw file with `"classified": false` in a `raw/index.json` manifest. Re-running `classify.py` later will retry only unclassified files. |

---

### 2.7 Already-Classified Note Re-Processed

| Field | Detail |
|-------|--------|
| **Trigger** | User runs `classify.py --all` again after notes are already in `wiki/` |
| **Risk** | Duplicate wiki notes; front-matter overwritten with different values |
| **Handling** | Before classifying, check if `wiki/**/{id}.md` already exists. If it does, skip unless `--force` flag is passed. |

---

## 3. Embeddings & Linking

### 3.1 First Note — No Existing Embeddings to Compare

| Field | Detail |
|-------|--------|
| **Trigger** | `link.py` runs when `embeddings/` is empty (very first note) |
| **Risk** | `cosine_similarity()` is called on an empty matrix → crash or division by zero |
| **Handling** | Check `len(existing_embeddings) == 0` before running similarity. If so, skip linking, save embedding only, and set `links: []`. |

---

### 3.2 Two Identical or Near-Identical Notes

| Field | Detail |
|-------|--------|
| **Trigger** | User captures the same article twice (duplicate not caught at capture stage) |
| **Risk** | Cosine similarity = 1.0 → both notes link to each other as "strong", creating a meaningless tight cluster in the graph |
| **Handling** | Skip self-links (`uuid != target_uuid`). Optionally deduplicate in a post-link pass: if similarity > 0.98, flag one as a duplicate with `"duplicate_of": target_uuid` in front-matter. |

---

### 3.3 Embedding Model Download Fails

| Field | Detail |
|-------|--------|
| **Trigger** | First run on a machine with no internet, or `sentence-transformers` cache is corrupted |
| **Risk** | `SentenceTransformer()` raises an exception → all embedding/linking/RAG fails |
| **Handling** | Wrap model load in try/except. Print: `"Embedding model not found. Please run with internet access once to download all-MiniLM-L6-v2 (~90 MB)."` Exit cleanly. |

---

### 3.4 Corrupted `.npy` Embedding File

| Field | Detail |
|-------|--------|
| **Trigger** | `.npy` file is partially written (crash during save) or manually edited |
| **Risk** | `np.load()` raises `ValueError` → whole similarity index fails to load |
| **Handling** | Wrap each `np.load()` in try/except. On failure, skip that embedding, log a warning, and flag the note for re-embedding with `--force`. |

---

### 3.5 Note with No Meaningful Text for Embedding

| Field | Detail |
|-------|--------|
| **Trigger** | A wiki note has content like `"TODO"` or is entirely metadata with no body |
| **Risk** | Embedding is a nearly-zero or random vector → meaningless similarity scores |
| **Handling** | Use `summary + tags + content` concatenated as the embedding input. Minimum embedding input: always use at least the summary. |

---

### 3.6 Embedding Dimension Mismatch

| Field | Detail |
|-------|--------|
| **Trigger** | User switches embedding model mid-project (e.g., from MiniLM to a 768-dim model); old `.npy` files are 384-dim |
| **Risk** | `cosine_similarity()` crashes with dimension mismatch error |
| **Handling** | Store `model_name` and `dimensions` in a `embeddings/meta.json` manifest. On load, verify all vectors match the configured dimension. If mismatch, warn user to run `link.py --reembed-all`. |

---

### 3.7 Link Graph Becomes Too Dense

| Field | Detail |
|-------|--------|
| **Trigger** | 100+ notes all from the same topic (e.g., all productivity) — everything links to everything |
| **Risk** | Graph is unreadable; edge count explodes quadratically |
| **Handling** | Enforce `max_links_per_note: 3` (from `config.yaml`) strictly. Even if 20 notes exceed threshold, only keep top-3 by score. |

---

## 4. Graph Builder

### 4.1 Wiki Note with Missing Front-Matter Fields

| Field | Detail |
|-------|--------|
| **Trigger** | A wiki note was manually edited and a required field (`id`, `category`) was deleted |
| **Risk** | `KeyError` when building node dict → `build_graph.py` crashes |
| **Handling** | Use `.get()` with defaults for all front-matter fields. Log a warning for each note missing required fields. Skip malformed notes rather than crashing. |

---

### 4.2 Broken Wikilinks (`[[nonexistent-uuid]]`)

| Field | Detail |
|-------|--------|
| **Trigger** | A note links to a UUID that no longer has a wiki file (e.g., note was deleted manually) |
| **Risk** | Edge references a non-existent node → graph library throws rendering error |
| **Handling** | After building node list, validate all edge `source` and `target` IDs exist in node list. Remove dangling edges and log warnings. |

---

### 4.3 Circular Links (A → B → A)

| Field | Detail |
|-------|--------|
| **Trigger** | Two notes are highly similar → A links to B, B links to A |
| **Risk** | Not a crash risk, but graph has redundant bidirectional edges, inflating visual complexity |
| **Handling** | During edge deduplication, treat `(A→B)` and `(B→A)` as the same edge. Keep only one with the higher weight. |

---

### 4.4 Empty Wiki (No Notes)

| Field | Detail |
|-------|--------|
| **Trigger** | `build_graph.py` runs before any notes are classified |
| **Risk** | `graph.json` written as `{"nodes": [], "edges": []}` → UI renders empty graph without error message |
| **Handling** | Check `len(nodes) == 0` and write a clear `graph.json` with a `"warning": "No notes found in wiki/"` field. UI displays: `"Your brain is empty — add your first note using the sidebar."` |

---

### 4.5 Note Filename Contains Non-UUID Characters

| Field | Detail |
|-------|--------|
| **Trigger** | A file was manually placed in `wiki/` that doesn't follow the `{uuid}.md` naming convention |
| **Risk** | ID field may be missing or wrong; graph node has a bad ID |
| **Handling** | Use front-matter `id:` field as the canonical ID, not the filename. If front-matter `id` is missing, use `uuid4()` to assign a new one and rewrite the file. |

---

## 5. Graph UI

### 5.1 Very Large Graph (100+ Nodes)

| Field | Detail |
|-------|--------|
| **Trigger** | User has been using SecondSelf for months and has 200+ notes |
| **Risk** | vis-network becomes sluggish; browser tab may crash on mobile |
| **Handling** | Implement a `max_nodes` display cap (default: 100). Show the 100 most recently added or most-connected nodes. Add a filter sidebar: filter by PARA category or tag to reduce visible nodes. |

---

### 5.2 Note Content Too Long for Hover Popup

| Field | Detail |
|-------|--------|
| **Trigger** | A note has 2000 words of content; the hover popup renders a wall of text |
| **Risk** | Hover popup is unusable and blocks the graph |
| **Handling** | Truncate `content` in hover popup to `summary + first 200 chars of body + "..."`. Full content is shown only on node click (in sidebar). |

---

### 5.3 vis-network CDN Unavailable (Offline)

| Field | Detail |
|-------|--------|
| **Trigger** | App is running locally or deployed without internet; CDN for vis-network is unreachable |
| **Risk** | Graph renders as a blank panel with no error message |
| **Handling** | Bundle vis-network locally in `static/vis-network.min.js`. Use local path in the HTML component, falling back to CDN only if local file doesn't exist. |

---

### 5.4 Node Labels Overlap (Dense Cluster)

| Field | Detail |
|-------|--------|
| **Trigger** | Many related notes form a dense cluster; labels collide visually |
| **Risk** | Graph becomes unreadable in tight regions |
| **Handling** | Set `font.size: 11` on nodes and disable label rendering below a zoom threshold. Labels appear only on hover, not by default when zoom < 0.5. |

---

### 5.5 Graph JSON Fails to Parse in Browser

| Field | Detail |
|-------|--------|
| **Trigger** | Note content contains backticks, single quotes, or `</script>` tags that break inline JS |
| **Risk** | The entire graph component fails to render; JS error in console |
| **Handling** | Always JSON-encode node data via `json.dumps()` in Python before injecting into HTML. Never do string interpolation of raw content into JS. |

---

## 6. RAG Query Engine

### 6.1 Empty Knowledge Base (No Embeddings)

| Field | Detail |
|-------|--------|
| **Trigger** | User asks a question before adding any notes |
| **Risk** | `retrieve_top_k()` operates on empty matrix → crash or empty result |
| **Handling** | Check `len(embeddings) == 0` before retrieval. Return: `{"answer": "Your brain is empty. Add some notes first!", "sources": []}` |

---

### 6.2 No Notes Above Similarity Threshold

| Field | Detail |
|-------|--------|
| **Trigger** | User asks about a topic completely absent from their notes (e.g., asking about quantum physics when all notes are about cooking) |
| **Risk** | Top-K notes retrieved are irrelevant; LLM hallucinates an answer from garbage context |
| **Handling** | Before calling LLM, check if `max(similarity_scores) < min_similarity (0.50)`. If so, return: `"I don't have enough relevant notes to answer this."` Do NOT pass irrelevant context to the LLM. |

---

### 6.3 LLM Ignores Context and Hallucinates

| Field | Detail |
|-------|--------|
| **Trigger** | Llama 3 answers from its training data instead of the retrieved notes |
| **Risk** | User receives factually wrong answer attributed to their own knowledge |
| **Handling** | Enforce in the prompt: `"Answer ONLY from the notes provided. Do not use any external knowledge."` Post-process: verify answer contains at least one citation `[N]`. If none found, prepend: `"Note: This answer may not be fully grounded in your notes."` |

---

### 6.4 Very Long Question

| Field | Detail |
|-------|--------|
| **Trigger** | User pastes a 500-word question or a full article into the search bar |
| **Risk** | Token limit exceeded on either embedding or Groq API call |
| **Handling** | Truncate question to 512 characters before embedding. Display a warning: `"Question truncated to 512 characters for processing."` |

---

### 6.5 Question in Non-English Language

| Field | Detail |
|-------|--------|
| **Trigger** | User asks in Hindi, French, or another language; notes may be in English |
| **Risk** | MiniLM embedding is multilingual but cross-lingual similarity degrades |
| **Handling** | No special handling required — MiniLM-L6-v2 supports 100+ languages. Document this behavior in README. If user has all-English notes, cross-lingual queries will return lower similarity scores (handled by `min_similarity` threshold). |

---

### 6.6 Groq API Unavailable During `ask()`

| Field | Detail |
|-------|--------|
| **Trigger** | Groq is down or rate-limited when user submits a question |
| **Risk** | Unhandled exception surfaces in Streamlit UI as a red error block |
| **Handling** | Wrap Groq call in try/except. On failure, return: `{"answer": "Answer generation temporarily unavailable. Please try again shortly.", "sources": top_k_notes_found}`. Show retrieved notes even without synthesized answer. |

---

### 6.7 Retrieved Notes Exceed LLM Context Window

| Field | Detail |
|-------|--------|
| **Trigger** | Top-5 retrieved notes are each 2000 words → ~10,000 words of context |
| **Risk** | Groq API returns a context-length error (Llama 3 has an 8192 token limit) |
| **Handling** | Truncate each retrieved note's content to `MAX_NOTE_CONTEXT = 500` characters in the RAG prompt. Always include: `id`, `summary`, and first 500 chars of content. |

---

## 7. Streamlit UI

### 7.1 Concurrent Users on Deployed App

| Field | Detail |
|-------|--------|
| **Trigger** | Two users open the public URL simultaneously and both add notes |
| **Risk** | Race condition: both write to `raw/` at the same time; `graph.json` gets overwritten mid-build |
| **Handling** | Since Streamlit Cloud creates a separate Python process per user session, file writes are serialized at the OS level for the same file. Add a `filelock` on `graph.json` during `build_graph.py` writes. Warn in README: "This app is designed for personal use. Multi-user simultaneous write is not supported." |

---

### 7.2 Session State Reset on Page Refresh

| Field | Detail |
|-------|--------|
| **Trigger** | User refreshes the browser tab while a question answer is displayed |
| **Risk** | `st.session_state` clears → answer, selected node, and form data are lost |
| **Handling** | This is expected Streamlit behavior. Cache heavy objects with `@st.cache_resource` (embedding model, graph JSON). Do not cache user-specific ephemeral state. |

---

### 7.3 File Upload in Sidebar Exceeds Streamlit Limit

| Field | Detail |
|-------|--------|
| **Trigger** | User uploads a file > 200 MB (Streamlit's default `maxUploadSize`) |
| **Risk** | Upload silently fails or shows a generic Streamlit error |
| **Handling** | Set `[server] maxUploadSize = 10` in `.streamlit/config.toml` (10 MB limit). Display file size limit clearly in the UI label. |

---

### 7.4 Pipeline Triggered Twice (Double-Click)

| Field | Detail |
|-------|--------|
| **Trigger** | User double-clicks "Add to Brain" button quickly |
| **Risk** | Two identical captures are processed simultaneously |
| **Handling** | Use `st.session_state["pipeline_running"]` flag. Disable the button while pipeline is running. Reset flag after `st.rerun()`. |

---

### 7.5 `graph.json` Missing on App Start

| Field | Detail |
|-------|--------|
| **Trigger** | App deployed to Streamlit Cloud but `graph.json` was gitignored |
| **Risk** | `json.load(open("graph.json"))` raises `FileNotFoundError` on first load |
| **Handling** | Add startup guard in `app.py`: `if not Path("graph.json").exists(): build_graph()`. If `wiki/` is also empty, render the empty state UI instead of crashing. |

---

## 8. Data Integrity (Cross-Phase)

### 8.1 UUID Collision

| Field | Detail |
|-------|--------|
| **Trigger** | `uuid4()` generates the same UUID twice (astronomically unlikely but theoretically possible) |
| **Risk** | New capture overwrites existing raw file |
| **Handling** | After generating UUID, check if `raw/{timestamp}_{uuid}.json` already exists. Regenerate if collision detected (loop until unique). |

---

### 8.2 Front-Matter Corruption

| Field | Detail |
|-------|--------|
| **Trigger** | A wiki note's YAML front-matter is manually edited with a syntax error (missing `:`), or `link.py` writes malformed YAML |
| **Risk** | `python-frontmatter` raises `yaml.YAMLError` → all downstream processing fails for that note |
| **Handling** | Wrap all `frontmatter.load()` calls in try/except. On error, skip the file and log: `"Skipped {path}: invalid YAML front-matter."` Provide a `utils/repair.py` script that re-generates front-matter from `raw/` if needed. |

---

### 8.3 Embedding File Exists But Wiki Note Deleted

| Field | Detail |
|-------|--------|
| **Trigger** | User manually deletes a wiki note but the `.npy` file remains in `embeddings/` |
| **Risk** | Orphaned embedding is included in similarity index → ghost connections to deleted notes |
| **Handling** | At the start of `link.py`, reconcile `embeddings/*.npy` against `wiki/**/*.md`. Delete orphaned `.npy` files and log: `"Removed orphaned embedding: {uuid}.npy"` |

---

### 8.4 Raw File Without Corresponding Wiki Note

| Field | Detail |
|-------|--------|
| **Trigger** | `classify.py` crashed mid-batch; some `raw/` files were never processed |
| **Risk** | Notes captured but never visible in the brain |
| **Handling** | Add a `raw/index.json` manifest that tracks `{uuid: {classified: bool, wiki_path: str}}`. Running `classify.py --all` checks the manifest and only processes unclassified files. |

---

### 8.5 `config.yaml` Missing or Malformed

| Field | Detail |
|-------|--------|
| **Trigger** | User deletes or corrupts `config.yaml` |
| **Risk** | All scripts fail to load configuration → crash at import time |
| **Handling** | `load_config()` in `utils/file_utils.py` should fall back to hardcoded defaults if `config.yaml` is missing. Log a warning. Never crash due to missing config. |

---

### 8.6 Clock Skew / Timezone Issues

| Field | Detail |
|-------|--------|
| **Trigger** | User is in a non-UTC timezone; timestamps in filenames and front-matter are inconsistent |
| **Risk** | Notes appear out of order in the timeline; sorting by timestamp fails |
| **Handling** | Always use UTC for all timestamps: `datetime.now(timezone.utc).isoformat()`. Never use `datetime.now()` without timezone info. |

---

## 9. Deployment

### 9.1 Secrets Not Configured on Streamlit Cloud

| Field | Detail |
|-------|--------|
| **Trigger** | Deployed app runs without `GROQ_API_KEY` set in Streamlit Cloud Secrets |
| **Risk** | All classify and ask calls fail silently or with cryptic errors |
| **Handling** | On app startup, run `check_secrets()`: if `GROQ_API_KEY` is not in `st.secrets` or `os.environ`, display a banner: `"⚠️ GROQ_API_KEY is not configured. Classification and Q&A features are disabled."` |

---

### 9.2 Cold Start — Model Download on Streamlit Cloud

| Field | Detail |
|-------|--------|
| **Trigger** | First deployment: `sentence-transformers` downloads the 90 MB model on the first request |
| **Risk** | First user request times out waiting for model download |
| **Handling** | Add a `@st.cache_resource` wrapper around `SentenceTransformer()` so it downloads once per server instance. Show a spinner: `"Loading AI model (first run only)..."` |

---

### 9.3 Streamlit Cloud Ephemeral Filesystem

| Field | Detail |
|-------|--------|
| **Trigger** | Streamlit Cloud restarts the app container (e.g., after inactivity) → all files written to disk are lost |
| **Risk** | New notes captured via UI disappear after restart |
| **Handling** | This is a fundamental limitation of Streamlit Cloud's free tier. Document clearly in README: "Notes added via the live demo are not persisted between deployments." For personal use, commit notes to the GitHub repo. Long-term: integrate with a persistent store (SQLite, Supabase) in a future version. |

---

### 9.4 `requirements.txt` Version Conflicts on Cloud Build

| Field | Detail |
|-------|--------|
| **Trigger** | A transitive dependency has a version incompatible with another package on Streamlit Cloud's Python version |
| **Risk** | Deployment build fails with pip resolver error |
| **Handling** | Pin all direct dependencies to exact versions (use `pip freeze > requirements.txt` locally after confirming everything works). Test in a fresh `venv` before deploying. |

---

### 9.5 Graph JSON Too Large for GitHub

| Field | Detail |
|-------|--------|
| **Trigger** | User has 500+ notes and `graph.json` exceeds GitHub's 100 MB file limit |
| **Risk** | `git push` fails; deployment breaks |
| **Handling** | Add `graph.json` to `.gitignore`. Instead, commit only `wiki/` and `raw/` and regenerate `graph.json` at app startup via `build_graph.py`. |

---

## 10. Security & Privacy

### 10.1 API Key Committed to Git

| Field | Detail |
|-------|--------|
| **Trigger** | User accidentally adds `.env` or hardcodes `GROQ_API_KEY` in a Python file and pushes to GitHub |
| **Risk** | API key is publicly exposed; immediate revocation needed |
| **Handling** | Add a pre-commit hook (or GitHub secret scanning alert). `.env` must be in `.gitignore`. All scripts must load the key via `os.getenv("GROQ_API_KEY")` only. |

---

### 10.2 Sensitive Personal Note Sent to Groq API

| Field | Detail |
|-------|--------|
| **Trigger** | User captures a note with passwords, medical data, or personal secrets — Groq API receives it for classification |
| **Risk** | Sensitive data transmitted to a third-party LLM provider |
| **Handling** | Add a warning in the UI sidebar: `"⚠️ Note content is sent to Groq's API for classification. Do not capture sensitive or confidential information."` Long-term: offer a local LLM option (Ollama) for air-gapped use. |

---

### 10.3 Path Traversal via Malicious Filename

| Field | Detail |
|-------|--------|
| **Trigger** | File upload in the UI has filename `../../etc/passwd` or similar |
| **Risk** | `FileHandler` writes outside the `raw/` directory |
| **Handling** | Always use `Path(uuid4()).with_suffix(ext)` as the saved filename. Never use the original filename for the write path. Only use the original filename for the `"filename"` metadata field. |

---

### 10.4 XSS via Note Content in Graph Popup

| Field | Detail |
|-------|--------|
| **Trigger** | Note content contains `<script>alert('xss')</script>` which is injected into the vis-network `title` (hover popup) |
| **Risk** | Script executes in the browser context of the Streamlit component |
| **Handling** | HTML-escape all note content before injecting into vis-network `title` fields. Use `html.escape(content)` in Python before JSON-encoding. |

---

## Edge Case Severity Matrix

| # | Edge Case | Severity | Phase | Status |
|---|-----------|----------|-------|--------|
| 1.1 | Empty input | Medium | 1 | ☐ |
| 1.2 | Very large content | High | 1 | ☐ |
| 1.3 | URL fetch failure | High | 1 | ☐ |
| 1.6 | Duplicate capture | Medium | 1 | ☐ |
| 2.1 | Groq rate limit | High | 2 | ☐ |
| 2.2 | Malformed LLM JSON | High | 2 | ☐ |
| 2.5 | Missing API key | Critical | 2 | ☐ |
| 3.1 | No existing embeddings | High | 3 | ☐ |
| 3.3 | Model download fails | High | 3 | ☐ |
| 4.2 | Broken wikilinks | High | 4 | ☐ |
| 4.4 | Empty wiki | Medium | 4 | ☐ |
| 5.5 | JS injection via content | Critical | 5 | ☐ |
| 6.1 | Empty knowledge base | High | 6 | ☐ |
| 6.3 | LLM hallucination | High | 6 | ☐ |
| 7.5 | Missing graph.json on start | High | 7 | ☐ |
| 8.2 | Front-matter corruption | High | Cross | ☐ |
| 9.1 | Secrets not configured | Critical | 9 | ☐ |
| 9.3 | Ephemeral filesystem | High | 9 | ☐ |
| 10.1 | API key in git | Critical | Cross | ☐ |
| 10.4 | XSS in graph popup | Critical | Cross | ☐ |

> **Severity:** Critical = data loss / security breach · High = feature broken · Medium = degraded experience · Low = cosmetic
