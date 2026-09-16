"""
SecondSelf — Personal AI Knowledge Base
Streamlit Entrypoint (Phase 7)
"""
import streamlit as st
import json
import os
from pathlib import Path

from utils.file_utils import load_config, ensure_dirs, get_all_wiki_files, load_wiki_note
from capture import capture_note, capture_url
from classify import classify_all
from link import link_all
from build_graph import build_graph, export_graph
from ask import ask
from components.graph_component import build_vis_html

# ── MUST be the very first Streamlit call ─────────────────────────────────────
st.set_page_config(page_title="SecondSelf — Personal AI Brain", page_icon="🧠", layout="wide")

# ── Startup: API key guard ────────────────────────────────────────────────────
# Reads from environment variable (local .env) or Streamlit Cloud Secrets.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
if not GROQ_API_KEY:
    st.error(
        "⚠️ **GROQ_API_KEY is not configured.**\n\n"
        "**Local:** Add `GROQ_API_KEY=gsk_...` to your `.env` file.\n\n"
        "**Streamlit Cloud:** Go to *App Settings → Secrets* and paste:\n"
        "```toml\nGROQ_API_KEY = \"gsk_...\"\n```"
    )
    st.stop()


# ── Cached model loader (avoids re-downloading ~90 MB on every session) ───────
# NOTE: Using built-in generate_semantic_vector() in link.py instead of
# sentence-transformers to avoid heavy PyTorch dependency on Streamlit Cloud.

ensure_dirs()
config = load_config()

# Ensure graph exists
graph_path = Path("graph.json")
if not graph_path.exists():
    export_graph()

# Sidebar: Capture Layer
with st.sidebar:
    st.title("🧠 SecondSelf")
    st.caption("Personal AI Knowledge Graph with PARA & Groq Llama 3")
    
    st.subheader("📥 Capture to Brain")
    input_type = st.radio("Input Source", ["Note", "URL", "File Upload"], horizontal=True)

    if input_type == "Note":
        note_text = st.text_area("Note Content", placeholder="Capture an insight, meeting takeaway, or idea...", height=150)
        if st.button("Add Note to Brain", type="primary", use_container_width=True):
            if note_text.strip():
                with st.spinner("Processing through capture -> classify -> link pipeline..."):
                    capture_note(note_text)
                    classify_all()
                    link_all()
                    export_graph()
                st.success("Note synthesized and integrated into Brain!")
                st.rerun()
            else:
                st.warning("Please enter note content.")

    elif input_type == "URL":
        url_input = st.text_input("Web URL", placeholder="https://example.com/article")
        if st.button("Add URL to Brain", type="primary", use_container_width=True):
            if url_input.strip():
                with st.spinner("Scraping and analyzing content..."):
                    capture_url(url_input)
                    classify_all()
                    link_all()
                    export_graph()
                st.success("Web page saved and linked!")
                st.rerun()
            else:
                st.warning("Please enter a valid URL.")

    else:
        uploaded_file = st.file_uploader("Upload Document (.txt, .md, .pdf)", type=["txt", "md", "pdf"])
        if uploaded_file and st.button("Index Document", type="primary", use_container_width=True):
            with st.spinner("Parsing file..."):
                content = uploaded_file.read().decode("utf-8", errors="ignore")
                capture_note(content)
                classify_all()
                link_all()
                export_graph()
            st.success(f"{uploaded_file.name} added!")
            st.rerun()

    st.divider()
    # Stats
    wiki_files = get_all_wiki_files()
    try:
        with open("graph.json", "r") as f:
            g_data = json.load(f)
            nodes_count = len(g_data.get("nodes", []))
            edges_count = len(g_data.get("edges", []))
    except Exception:
        nodes_count = len(wiki_files)
        edges_count = 0

    st.markdown(f"**Brain Vital Statistics:**\n- 📚 **{nodes_count}** Knowledge Nodes\n- 🔗 **{edges_count}** Semantic Links\n- ⚡ **Groq Llama 3** Connected")

# Main Interface Tabs
tab1, tab2, tab3 = st.tabs(["🧠 Brain Graph", "💬 Ask Your Brain (Oracle)", "📂 PARA Wiki"])

with tab1:
    st.subheader("Interactive Knowledge Graph")
    try:
        with open("graph.json", "r") as f:
            g_data = json.load(f)
    except Exception:
        g_data = {"nodes": [], "edges": []}

    nodes_js = json.dumps(g_data.get("nodes", []))
    edges_js = json.dumps(g_data.get("edges", []))
    html_content = build_vis_html(nodes_js, edges_js, height=650)
    st.components.v1.html(html_content, height=720, scrolling=False)

with tab2:
    st.subheader("Ask Your Brain (RAG Oracle)")
    st.caption("Ask questions across your entire knowledge base. SecondSelf retrieves relevant notes and generates cited answers using Groq Llama 3.")
    
    col1, col2 = st.columns([4, 1])
    with col1:
        question = st.text_input("Enter your question:", placeholder="e.g., What are my notes about productivity systems and deep work?")
    with col2:
        st.write("")
        st.write("")
        ask_btn = st.button("Ask Oracle", type="primary", use_container_width=True)

    if ask_btn and question.strip():
        with st.spinner("Consulting Groq Llama 3 and scanning vector space..."):
            result = ask(question)
        
        st.markdown("### Answer")
        st.markdown(result.get("answer", "No answer."))

        sources = result.get("sources", [])
        if sources:
            st.markdown("#### Citations & Sources")
            for s in sources:
                with st.expander(f"[{s['index']}] {s['title']} ({s['category']}) — Similarity: {s['score']}"):
                    st.write(s.get("preview", ""))

with tab3:
    st.subheader("PARA Knowledge Explorer")
    cols = st.columns(4)
    categories = ["Projects", "Areas", "Resources", "Archives"]
    for idx, cat in enumerate(categories):
        with cols[idx]:
            st.markdown(f"#### {cat}")
            cat_files = [f for f in get_all_wiki_files() if f"wiki/{cat}" in f or f"wiki\\{cat}" in f]
            for cf in cat_files:
                meta, content = load_wiki_note(cf)
                with st.expander(meta.get("summary", Path(cf).stem)[:30]):
                    st.caption(f"Tags: {', '.join(meta.get('tags', []))}")
                    st.write(content[:300] + ("..." if len(content) > 300 else ""))
