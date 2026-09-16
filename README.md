# 🧠 SecondSelf — Personal AI Knowledge Graph

> A personal AI second brain built with Python, Streamlit, and Groq Llama 3. Capture notes, URLs, and documents — the app auto-classifies them into a PARA knowledge base and builds a semantic knowledge graph you can query in natural language.

[![Open in Streamlit](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://share.streamlit.io)

---

## ✨ Features

- **🧠 Brain Graph** — Interactive force-directed knowledge graph (vis-network) with PARA categorisation
- **💬 Ask Oracle** — RAG-powered Q&A: ask anything across your entire knowledge base, get cited answers via Groq Llama 3
- **📂 PARA Wiki** — Browse all notes organised by Projects / Areas / Resources / Archives
- **📥 Capture** — Add notes, URLs, or documents via sidebar; auto-classifies and links in real time

---

## 🚀 Deploy to Streamlit Community Cloud

1. **Fork** this repository to your GitHub account
2. Go to [share.streamlit.io](https://share.streamlit.io) → **New app** → **From existing repo**
3. Configure:
   - Repository: `your-username/clone-brain`
   - Branch: `main`
   - Main file path: `app.py`
4. Click **Advanced settings → Secrets** and add:
   ```toml
   GROQ_API_KEY = "gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
   ```
5. Click **Deploy!** — first build takes ~5 minutes (model download)

---

## 🛠️ Run Locally

```bash
# Clone
git clone https://github.com/your-username/clone-brain.git
cd clone-brain

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Set your Groq API key
copy .env.example .env
# Edit .env and add: GROQ_API_KEY=gsk_...

# Run
streamlit run app.py
```

---

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key for Llama 3 — get one free at [console.groq.com](https://console.groq.com) |

---

## 📁 Project Structure

```
clone-brain/
├── app.py              # Streamlit entry point
├── capture.py          # Note / URL / file ingestion
├── classify.py         # PARA classification via Groq
├── link.py             # Semantic linking & embeddings
├── build_graph.py      # Knowledge graph builder
├── ask.py              # RAG query engine (Oracle)
├── components/
│   └── graph_component.py  # vis-network HTML component
├── utils/
│   ├── file_utils.py   # File helpers & config loader
│   └── pipeline.py     # Pipeline orchestration
├── wiki/               # Markdown knowledge base (PARA)
├── embeddings/         # Semantic embedding vectors (.npy)
├── graph.json          # Pre-built knowledge graph
├── config.yaml         # Model & retrieval settings
├── requirements.txt    # Pinned Python dependencies
└── .streamlit/
    └── config.toml     # Streamlit theme & server config
```

---

## ⚠️ Ephemeral Filesystem Note

Streamlit Community Cloud uses an **ephemeral filesystem**. Notes captured at runtime are lost on app restart. The repo ships with seed data (`wiki/`, `embeddings/`, `graph.json`) so the demo always starts populated. For persistent storage, consider connecting a database (Supabase, Firebase).

---

## 🙏 Tech Stack

- [Streamlit](https://streamlit.io) — UI framework
- [Groq](https://groq.com) — LLM inference (Llama 3)
- [sentence-transformers](https://www.sbert.net) — Semantic embeddings
- [vis-network](https://visjs.github.io/vis-network/) — Interactive graph visualisation
- [PyMuPDF](https://pymupdf.readthedocs.io) — PDF parsing
