"""
SecondSelf — CLONE BRAIN
Streamlit Entrypoint — UI mirroring the React/Vite bento-grid design
PARA Intelligence Engine & Knowledge Graph
"""
import streamlit as st
import json
import os
from pathlib import Path

# ── MUST be the very first Streamlit call ─────────────────────────────────────
st.set_page_config(
    page_title="CLONE BRAIN — PARA Intelligence Engine",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Startup: API key guard ────────────────────────────────────────────────────
from utils.file_utils import load_config, ensure_dirs, get_all_wiki_files, load_wiki_note
from capture import capture_note, capture_url
from classify import classify_all
from link import link_all
from build_graph import build_graph, export_graph
from ask import ask
from components.graph_component import build_vis_html

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
if not GROQ_API_KEY:
    st.error(
        "⚠️ **GROQ_API_KEY is not configured.**\n\n"
        "**Local:** Add `GROQ_API_KEY=gsk_...` to your `.env` file.\n\n"
        "**Streamlit Cloud:** Go to *App Settings → Secrets* and paste:\n"
        "```toml\nGROQ_API_KEY = \"gsk_...\"\n```"
    )
    st.stop()

ensure_dirs()
config = load_config()

# Ensure graph exists
if not Path("graph.json").exists():
    export_graph()

# ── Inject CSS: Dark bento-grid matching React design ─────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');

/* Global reset */
html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
    background-color: #020617 !important;
    color: #CBD5E1 !important;
}
.stApp { background-color: #020617 !important; }
.main .block-container { padding: 1.25rem 1.5rem 2rem !important; max-width: 100% !important; }

/* Hide default Streamlit chrome */
#MainMenu, footer, header { visibility: hidden !important; }
.stDeployButton { display: none !important; }

/* ── HEADER ─────────────────────────────────────────────────────────────────── */
.cb-header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 1rem;
    margin-bottom: 1rem; padding: 0 0.25rem;
}
.cb-brand { display: flex; align-items: center; gap: 0.875rem; cursor: pointer; }
.cb-logo {
    width: 40px; height: 40px; background: #10B981; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #020617; font-size: 1.125rem; font-weight: 900;
    box-shadow: 0 0 16px rgba(16,185,129,0.3);
}
.cb-title { font-size: 1.25rem; font-weight: 800; color: #fff; letter-spacing: -0.03em; }
.cb-version {
    font-size: 0.625rem; font-family: 'JetBrains Mono', monospace; font-weight: 700;
    padding: 2px 8px; background: #0F172A; color: #34D399;
    border: 1px solid #1E293B; border-radius: 6px; margin-left: 8px;
}
.cb-subtitle {
    font-size: 0.6875rem; color: #64748B; text-transform: uppercase;
    letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace; margin-top: 2px;
}
.cb-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: #0F172A; border: 1px solid #1E293B;
    padding: 6px 12px; border-radius: 9999px;
    font-size: 0.75rem; font-weight: 500; color: #CBD5E1;
}
.cb-badge-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #10B981;
    animation: pulse 2s infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.cb-badge-val { color: #34D399; font-family: 'JetBrains Mono', monospace; font-size: 0.6875rem; }

/* ── BENTO STAT CARDS ────────────────────────────────────────────────────────── */
.bento-stat {
    background: #0F172A; border: 1px solid #1E293B; border-radius: 16px;
    padding: 14px; display: flex; flex-direction: column; justify-content: space-between;
    min-height: 90px;
}
.bento-stat-label {
    font-size: 0.625rem; font-weight: 600; color: #64748B;
    text-transform: uppercase; letter-spacing: 0.1em;
}
.bento-stat-val {
    font-size: 1.375rem; font-weight: 900; color: #fff; margin-top: 6px;
}
.bento-stat-val.emerald { color: #34D399; }
.bento-stat-sub { font-size: 0.6875rem; color: #94A3B8; font-weight: 500; }
.bento-bar-bg { width: 100%; height: 4px; background: #1E293B; border-radius: 9999px; margin-top: 8px; overflow: hidden; }
.bento-bar-fill { height: 100%; border-radius: 9999px; }

/* ── NAV TABS ────────────────────────────────────────────────────────────────── */
.stTabs [data-baseweb="tab-list"] {
    background: #0F172A !important; border: 1px solid #1E293B !important;
    border-radius: 16px !important; padding: 6px !important; gap: 4px !important;
}
.stTabs [data-baseweb="tab"] {
    background: transparent !important; border-radius: 10px !important;
    color: #64748B !important; font-weight: 700 !important; font-size: 0.75rem !important;
    padding: 8px 16px !important; border: none !important;
    transition: all 0.15s ease !important;
}
.stTabs [aria-selected="true"] {
    background: #020617 !important; color: #fff !important;
    border: 1px solid #334155 !important; box-shadow: 0 1px 4px rgba(0,0,0,0.4) !important;
}
.stTabs [data-baseweb="tab-highlight"] { display: none !important; }
.stTabs [data-baseweb="tab-border"] { display: none !important; }

/* ── INPUTS ──────────────────────────────────────────────────────────────────── */
.stTextInput > div > div > input,
.stTextArea > div > div > textarea {
    background: #0F172A !important; border: 1px solid #1E293B !important;
    color: #E2E8F0 !important; border-radius: 12px !important;
    font-family: 'Inter', sans-serif !important; font-size: 0.875rem !important;
}
.stTextInput > div > div > input:focus,
.stTextArea > div > div > textarea:focus {
    border-color: #10B981 !important;
    box-shadow: 0 0 0 2px rgba(16,185,129,0.2) !important;
}

/* ── BUTTONS ─────────────────────────────────────────────────────────────────── */
.stButton > button {
    background: #059669 !important; color: #020617 !important;
    font-weight: 700 !important; border: none !important;
    border-radius: 12px !important; font-size: 0.75rem !important;
    transition: all 0.15s ease !important;
}
.stButton > button:hover { background: #10B981 !important; transform: translateY(-1px); }
.stButton > button:active { transform: scale(0.97) !important; }

/* ── EXPANDERS ────────────────────────────────────────────────────────────────── */
.streamlit-expanderHeader {
    background: #0F172A !important; border: 1px solid #1E293B !important;
    border-radius: 12px !important; color: #CBD5E1 !important;
    font-size: 0.8125rem !important; font-weight: 600 !important;
}
.streamlit-expanderContent {
    background: #0A0F1E !important; border: 1px solid #1E293B !important;
    border-radius: 0 0 12px 12px !important; padding: 12px !important;
}

/* ── RADIO / SELECT ──────────────────────────────────────────────────────────── */
.stRadio > div { gap: 6px !important; }
.stRadio [data-testid="stMarkdownContainer"] p { font-size: 0.75rem !important; }

/* ── CATEGORY PILLS ──────────────────────────────────────────────────────────── */
.pill-projects { background: rgba(108,99,255,0.15); color: #6C63FF; border: 1px solid rgba(108,99,255,0.3); border-radius: 9999px; padding: 2px 10px; font-size: 0.625rem; font-weight: 700; text-transform: uppercase; }
.pill-areas    { background: rgba(249,168,37,0.15); color: #F9A825; border: 1px solid rgba(249,168,37,0.3);  border-radius: 9999px; padding: 2px 10px; font-size: 0.625rem; font-weight: 700; text-transform: uppercase; }
.pill-resources{ background: rgba(38,198,218,0.15); color: #26C6DA; border: 1px solid rgba(38,198,218,0.3); border-radius: 9999px; padding: 2px 10px; font-size: 0.625rem; font-weight: 700; text-transform: uppercase; }
.pill-archives { background: rgba(120,144,156,0.15);color: #78909C; border: 1px solid rgba(120,144,156,0.3);border-radius: 9999px; padding: 2px 10px; font-size: 0.625rem; font-weight: 700; text-transform: uppercase; }

/* ── NOTE CARDS ──────────────────────────────────────────────────────────────── */
.note-card {
    background: #0F172A; border: 1px solid #1E293B; border-radius: 14px;
    padding: 14px 16px; margin-bottom: 10px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.note-card:hover { border-color: #334155; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
.note-title { font-size: 0.8125rem; font-weight: 600; color: #F1F5F9; margin-bottom: 6px; line-height: 1.4; }
.note-preview { font-size: 0.75rem; color: #64748B; line-height: 1.5; margin-bottom: 8px; }
.note-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.note-tag {
    font-size: 0.5625rem; font-family: 'JetBrains Mono', monospace; font-weight: 600;
    padding: 2px 7px; background: #1E293B; color: #94A3B8;
    border: 1px solid #334155; border-radius: 5px;
}

/* ── CAPTURE PANEL ───────────────────────────────────────────────────────────── */
.capture-panel {
    background: #0F172A; border: 1px solid #1E293B; border-radius: 20px;
    padding: 24px; margin-bottom: 16px;
}
.capture-title {
    font-size: 0.6875rem; font-weight: 700; color: #64748B;
    text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
}

/* ── ORACLE PANEL ────────────────────────────────────────────────────────────── */
.oracle-question-box {
    background: #0F172A; border: 1px solid #1E293B; border-radius: 12px;
    padding: 16px; margin-bottom: 10px;
    font-size: 0.875rem; color: #E2E8F0; font-weight: 500;
}
.oracle-answer-box {
    background: linear-gradient(135deg, rgba(16,185,129,0.05), rgba(6,182,212,0.03));
    border: 1px solid rgba(16,185,129,0.2); border-radius: 12px;
    padding: 18px; font-size: 0.8375rem; color: #CBD5E1; line-height: 1.7;
}
.sample-q-btn {
    display: inline-block; background: #0F172A; border: 1px solid #1E293B;
    color: #94A3B8; border-radius: 8px; padding: 6px 12px;
    font-size: 0.6875rem; cursor: pointer; margin: 3px;
    transition: all 0.15s; font-family: 'Inter', sans-serif;
}
.sample-q-btn:hover { border-color: #10B981; color: #34D399; }

/* ── DIVIDER ─────────────────────────────────────────────────────────────────── */
hr { border-color: #1E293B !important; margin: 16px 0 !important; }

/* ── SUCCESS / ERROR MESSAGES ────────────────────────────────────────────────── */
.stSuccess { background: rgba(16,185,129,0.1) !important; border: 1px solid rgba(16,185,129,0.3) !important; border-radius: 10px !important; }
.stError   { background: rgba(239,68,68,0.1)  !important; border: 1px solid rgba(239,68,68,0.3)  !important; border-radius: 10px !important; }
.stWarning { background: rgba(245,158,11,0.1) !important; border: 1px solid rgba(245,158,11,0.3) !important; border-radius: 10px !important; }
.stInfo    { background: rgba(6,182,212,0.1)  !important; border: 1px solid rgba(6,182,212,0.3)  !important; border-radius: 10px !important; }

/* ── SPINNER ─────────────────────────────────────────────────────────────────── */
.stSpinner > div { border-top-color: #10B981 !important; }
</style>
""", unsafe_allow_html=True)

# ── Load graph data ──────────────────────────────────────────────────────────
def _load_graph():
    try:
        with open("graph.json", "r") as f:
            return json.load(f)
    except Exception:
        return {"nodes": [], "edges": []}

g_data = _load_graph()
nodes_count = len(g_data.get("nodes", []))
edges_count = len(g_data.get("edges", []))

# ── HEADER ───────────────────────────────────────────────────────────────────
st.markdown(f"""
<div class="cb-header">
  <div class="cb-brand">
    <div class="cb-logo">A</div>
    <div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="cb-title">CLONE BRAIN</span>
        <span class="cb-version">v2.4</span>
      </div>
      <div class="cb-subtitle">PARA Intelligence Engine &amp; Knowledge Graph</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <div class="cb-badge">
      <span class="cb-badge-dot"></span>
      API ACTIVE: <span class="cb-badge-val">llama-3.3-70b-versatile</span>
    </div>
    <div class="cb-badge" style="display:none;font-family:'JetBrains Mono',monospace;font-size:0.6875rem;color:#64748B">
      ENV: PRODUCTION-READY
    </div>
  </div>
</div>
""", unsafe_allow_html=True)

# ── BENTO STAT STRIP ─────────────────────────────────────────────────────────
notes_pct = min(100, (nodes_count / 25) * 100)
edges_pct  = min(100, (edges_count  / 20) * 100)

col_a, col_b, col_c = st.columns([2, 2, 8])

with col_a:
    st.markdown(f"""
    <div class="bento-stat">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="bento-stat-label">KNOWLEDGE VAULT</span>
        <span style="font-size:0.75rem">🗂️</span>
      </div>
      <div style="margin-top:6px">
        <span class="bento-stat-val">{nodes_count}</span>
        <span class="bento-stat-sub"> notes stored</span>
      </div>
      <div class="bento-bar-bg">
        <div class="bento-bar-fill" style="width:{notes_pct}%;background:#10B981"></div>
      </div>
    </div>
    """, unsafe_allow_html=True)

with col_b:
    st.markdown(f"""
    <div class="bento-stat">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="bento-stat-label">VECTOR GRAPH</span>
        <span style="font-size:0.75rem">🧠</span>
      </div>
      <div style="margin-top:6px">
        <span class="bento-stat-val emerald">{edges_count}</span>
        <span class="bento-stat-sub"> dense edges</span>
      </div>
      <div class="bento-bar-bg">
        <div class="bento-bar-fill" style="width:{edges_pct}%;background:#22D3EE"></div>
      </div>
    </div>
    """, unsafe_allow_html=True)

with col_c:
    pass  # tabs go below

st.markdown("<div style='margin-top:8px'></div>", unsafe_allow_html=True)

# ── MAIN TABS ─────────────────────────────────────────────────────────────────
tab1, tab2, tab3, tab4 = st.tabs([
    f"🧠 Brain Graph  [{nodes_count}]",
    "💬 Ask Oracle  [RAG]",
    f"📂 Knowledge Wiki  [{nodes_count}]",
    "⚡ Capture Note",
])

# ════════════════════════════════════════════════════════════════════
# TAB 1 — BRAIN GRAPH
# ════════════════════════════════════════════════════════════════════
with tab1:
    header_col, btn_col = st.columns([8, 2])
    with header_col:
        st.markdown("""
        <div style="margin-bottom:12px">
          <h2 style="font-size:0.875rem;font-weight:700;color:#F1F5F9;margin:0;text-transform:uppercase;letter-spacing:0.05em">
            🕸️ KNOWLEDGE GRAPH
          </h2>
          <p style="font-size:0.75rem;color:#64748B;margin:4px 0 0">
            Force-directed semantic graph · Drag nodes · Hover for summary · Zoom to explore
          </p>
        </div>
        """, unsafe_allow_html=True)
    with btn_col:
        if st.button("🔄 Rebuild Graph", use_container_width=True):
            with st.spinner("Rebuilding knowledge graph..."):
                link_all()
                export_graph()
            st.success("Graph rebuilt!")
            st.rerun()

    nodes_js = json.dumps(g_data.get("nodes", []))
    edges_js  = json.dumps(g_data.get("edges", []))
    html_content = build_vis_html(nodes_js, edges_js, height=620)
    st.components.v1.html(html_content, height=690, scrolling=False)

    # Legend row
    st.markdown("""
    <div style="display:flex;gap:16px;flex-wrap:wrap;padding:8px 0;font-size:0.6875rem;color:#64748B">
      <span>🟣 Projects</span>
      <span>🟡 Areas</span>
      <span>🔵 Resources</span>
      <span>⚫ Archives</span>
      <span style="margin-left:auto">Thick edges = strong links (≥0.85) · Drag · Zoom · Click nodes</span>
    </div>
    """, unsafe_allow_html=True)

# ════════════════════════════════════════════════════════════════════
# TAB 2 — ASK ORACLE
# ════════════════════════════════════════════════════════════════════
with tab2:
    st.markdown("""
    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="width:32px;height:32px;border-radius:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;font-size:1rem">💬</div>
        <div>
          <h2 style="font-size:0.875rem;font-weight:700;color:#F1F5F9;margin:0;text-transform:uppercase;letter-spacing:0.05em">ASK ORACLE</h2>
          <p style="font-size:0.6875rem;color:#64748B;margin:2px 0 0">RAG · Groq Llama 3 · Semantic Vector Retrieval</p>
        </div>
      </div>
    </div>
    """, unsafe_allow_html=True)

    # Sample questions
    SAMPLE_QUESTIONS = [
        "What are my rules for deep work and focus?",
        "How does SecondSelf link notes together?",
        "Explain the core tenets of the PARA framework.",
        "What productivity systems have I captured?",
        "Summarise my project ideas.",
    ]
    st.markdown("<p style='font-size:0.6875rem;color:#64748B;margin-bottom:6px'>💡 SUGGESTED QUERIES</p>", unsafe_allow_html=True)
    sq_cols = st.columns(len(SAMPLE_QUESTIONS))
    selected_sample = None
    for i, sq in enumerate(SAMPLE_QUESTIONS):
        with sq_cols[i]:
            if st.button(sq[:30] + "…", key=f"sq_{i}", use_container_width=True):
                selected_sample = sq

    st.markdown("<div style='margin-top:12px'></div>", unsafe_allow_html=True)

    q_col, btn_col2 = st.columns([5, 1])
    with q_col:
        question = st.text_input(
            "Your question",
            value=selected_sample or "",
            placeholder="Ask anything across your knowledge base...",
            label_visibility="collapsed",
            key="oracle_input"
        )
    with btn_col2:
        ask_btn = st.button("⚡ Ask", type="primary", use_container_width=True, key="oracle_btn")

    if (ask_btn or selected_sample) and (question or selected_sample):
        q = selected_sample or question
        if q.strip():
            with st.spinner("Scanning 384-dimensional vector space · Groq Llama 3 synthesizing..."):
                result = ask(q)

            st.markdown(f"""
            <div class="oracle-question-box">
              <span style="font-size:0.625rem;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">YOUR QUESTION</span><br>
              <span style="font-size:0.875rem;color:#F1F5F9;font-weight:600">{q}</span>
            </div>
            """, unsafe_allow_html=True)

            answer_text = result.get("answer", "No answer generated.")
            st.markdown(f"""
            <div class="oracle-answer-box">
              <div style="font-size:0.625rem;color:#34D399;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">⚡ ORACLE RESPONSE</div>
              {answer_text}
            </div>
            """, unsafe_allow_html=True)

            sources = result.get("sources", [])
            if sources:
                st.markdown(f"<p style='font-size:0.6875rem;color:#64748B;margin-top:14px;margin-bottom:6px'>📎 {len(sources)} CITED SOURCE{'S' if len(sources)>1 else ''}</p>", unsafe_allow_html=True)
                for s in sources:
                    cat = s.get("category", "Resources").lower()
                    pill_class = f"pill-{cat}"
                    with st.expander(f"[{s['index']}] {s['title']} — score: {s['score']}"):
                        st.markdown(f'<span class="{pill_class}">{s.get("category","")}</span>', unsafe_allow_html=True)
                        st.markdown(f"<p style='font-size:0.8rem;color:#94A3B8;margin-top:8px'>{s.get('preview','')}</p>", unsafe_allow_html=True)

# ════════════════════════════════════════════════════════════════════
# TAB 3 — KNOWLEDGE WIKI
# ════════════════════════════════════════════════════════════════════
with tab3:
    st.markdown("""
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:32px;height:32px;border-radius:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;font-size:1rem">📂</div>
      <div>
        <h2 style="font-size:0.875rem;font-weight:700;color:#F1F5F9;margin:0;text-transform:uppercase;letter-spacing:0.05em">
          KNOWLEDGE WIKI <span style="font-size:0.625rem;font-family:'JetBrains Mono',monospace;background:#0F172A;color:#34D399;border:1px solid #1E293B;border-radius:5px;padding:2px 7px;margin-left:6px">PARA SYSTEM</span>
        </h2>
        <p style="font-size:0.6875rem;color:#64748B;margin:2px 0 0">Categorized markdown units sorted by projects, areas, resources &amp; archives</p>
      </div>
    </div>
    """, unsafe_allow_html=True)

    CATEGORY_COLORS = {
        "Projects":  {"color": "#6C63FF", "pill": "pill-projects", "icon": "🟣"},
        "Areas":     {"color": "#F9A825", "pill": "pill-areas",    "icon": "🟡"},
        "Resources": {"color": "#26C6DA", "pill": "pill-resources","icon": "🔵"},
        "Archives":  {"color": "#78909C", "pill": "pill-archives", "icon": "⚫"},
    }

    # Category filter pills
    filter_cols = st.columns(5)
    categories = ["All", "Projects", "Areas", "Resources", "Archives"]
    if "wiki_filter" not in st.session_state:
        st.session_state.wiki_filter = "All"

    for i, cat in enumerate(categories):
        with filter_cols[i]:
            if st.button(cat, key=f"wiki_filter_{cat}", use_container_width=True):
                st.session_state.wiki_filter = cat

    selected_cat = st.session_state.wiki_filter
    search_term = st.text_input("🔍 Search wiki notes & tags...", placeholder="Type to search...", label_visibility="collapsed", key="wiki_search")

    st.markdown("<hr>", unsafe_allow_html=True)

    all_wiki = get_all_wiki_files()
    shown = 0
    for cf in all_wiki:
        try:
            meta, content = load_wiki_note(cf)
        except Exception:
            continue

        cat = meta.get("category", "Resources")
        if selected_cat != "All" and cat != selected_cat:
            continue
        summary = meta.get("summary", Path(cf).stem)
        tags_raw = meta.get("tags", [])
        if isinstance(tags_raw, str):
            tags = [tags_raw]
        elif isinstance(tags_raw, dict):
            tags = list(tags_raw.keys())
        elif isinstance(tags_raw, list):
            tags = tags_raw
        else:
            tags = []
            
        tags = [str(t) for t in tags]

        preview = content[:200].strip()

        if search_term.strip():
            q = search_term.lower()
            if not (q in summary.lower() or q in preview.lower() or any(q in t.lower() for t in tags)):
                continue

        pill_class = CATEGORY_COLORS.get(cat, {}).get("pill", "pill-resources")
        icon = CATEGORY_COLORS.get(cat, {}).get("icon", "🔵")
        tags_html = "".join(f'<span class="note-tag">#{t}</span>' for t in tags[:5])


        st.markdown(f"""
        <div class="note-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
            <span class="note-title">{icon} {summary[:80]}</span>
            <span class="{pill_class}">{cat}</span>
          </div>
          <p class="note-preview">{preview}{'...' if len(content) > 200 else ''}</p>
          <div class="note-tags">{tags_html}</div>
        </div>
        """, unsafe_allow_html=True)
        shown += 1

    if shown == 0:
        st.markdown("""
        <div style="text-align:center;padding:40px;color:#334155">
          <div style="font-size:2rem;margin-bottom:8px">📭</div>
          <div style="font-size:0.875rem;font-weight:600">No notes found</div>
          <div style="font-size:0.75rem;color:#475569;margin-top:4px">Try a different filter or capture your first note</div>
        </div>
        """, unsafe_allow_html=True)

# ════════════════════════════════════════════════════════════════════
# TAB 4 — CAPTURE NOTE
# ════════════════════════════════════════════════════════════════════
with tab4:
    st.markdown("""
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <div style="width:32px;height:32px;border-radius:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;font-size:1rem">⚡</div>
      <div>
        <h2 style="font-size:0.875rem;font-weight:700;color:#F1F5F9;margin:0;text-transform:uppercase;letter-spacing:0.05em">CAPTURE TO BRAIN</h2>
        <p style="font-size:0.6875rem;color:#64748B;margin:2px 0 0">Ingest notes · URLs · Documents → Auto-classify → Link → Graph</p>
      </div>
    </div>
    """, unsafe_allow_html=True)

    cap_left, cap_right = st.columns([3, 2])

    with cap_left:
        input_type = st.radio("Input Source", ["📝 Note", "🌐 URL", "📄 File Upload"], horizontal=True, label_visibility="collapsed")

        if "📝 Note" in input_type:
            note_text = st.text_area(
                "Note Content",
                placeholder="Capture an insight, meeting takeaway, idea, or any text...",
                height=180,
                label_visibility="collapsed",
                key="cap_note"
            )
            char_count = len(note_text) if note_text else 0
            st.markdown(f"<p style='font-size:0.6875rem;color:#475569;text-align:right'>{char_count}/8000</p>", unsafe_allow_html=True)

            if st.button("⚡ CAPTURE NOTE → BRAIN", type="primary", use_container_width=True, key="btn_note"):
                if note_text and note_text.strip():
                    with st.spinner("Ingesting → Classifying → Embedding → Linking → Graph..."):
                        result = capture_note(note_text)
                        if result is None:
                            st.warning("⚠️ Duplicate detected — this note already exists in your brain.")
                        else:
                            classify_all()
                            link_all()
                            export_graph()
                            st.success(f"✅ Note synthesized and integrated into Brain! ID: `{result['id'][:8]}...`")
                            st.rerun()
                else:
                    st.warning("Note must be at least 10 characters.")

        elif "🌐 URL" in input_type:
            url_input = st.text_input(
                "Web URL",
                placeholder="https://example.com/article",
                label_visibility="collapsed",
                key="cap_url"
            )
            if st.button("⚡ CAPTURE URL → BRAIN", type="primary", use_container_width=True, key="btn_url"):
                if url_input and url_input.strip():
                    with st.spinner("Fetching · Extracting · Classifying · Linking..."):
                        result = capture_url(url_input)
                        if result is None:
                            st.warning("⚠️ Duplicate — this URL was already captured.")
                        else:
                            classify_all()
                            link_all()
                            export_graph()
                            st.success("✅ Web page saved and linked into Brain!")
                            st.rerun()
                else:
                    st.warning("Please enter a valid URL starting with http:// or https://")

        else:
            uploaded_file = st.file_uploader(
                "Upload Document",
                type=["txt", "md", "pdf"],
                label_visibility="collapsed",
                key="cap_file"
            )
            if uploaded_file:
                st.markdown(f"<div style='font-size:0.75rem;color:#34D399;padding:6px 0'>📎 {uploaded_file.name} ready to index</div>", unsafe_allow_html=True)
                if st.button("⚡ INDEX DOCUMENT → BRAIN", type="primary", use_container_width=True, key="btn_file"):
                    import tempfile
                    with st.spinner(f"Parsing {uploaded_file.name} · Classifying · Linking..."):
                        suffix = "." + uploaded_file.name.split(".")[-1]
                        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                            tmp.write(uploaded_file.read())
                            tmp_path = tmp.name
                        try:
                            from capture import capture_file
                            result = capture_file(tmp_path)
                            if result is None:
                                st.warning("⚠️ Duplicate — this document was already captured.")
                            else:
                                classify_all()
                                link_all()
                                export_graph()
                                st.success(f"✅ {uploaded_file.name} indexed and integrated!")
                                st.rerun()
                        finally:
                            import os as _os
                            _os.unlink(tmp_path)

    with cap_right:
        # Pipeline status card
        st.markdown(f"""
        <div class="capture-panel">
          <div class="capture-title">📊 BRAIN VITALS</div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div>
              <div style="font-size:0.625rem;color:#64748B;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">KNOWLEDGE NODES</div>
              <div style="font-size:1.5rem;font-weight:900;color:#fff">{nodes_count} <span style="font-size:0.75rem;color:#64748B;font-weight:500">notes</span></div>
              <div style="width:100%;height:3px;background:#1E293B;border-radius:9999px;margin-top:6px">
                <div style="width:{min(100,(nodes_count/25)*100)}%;height:100%;background:#10B981;border-radius:9999px"></div>
              </div>
            </div>
            <div>
              <div style="font-size:0.625rem;color:#64748B;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">SEMANTIC EDGES</div>
              <div style="font-size:1.5rem;font-weight:900;color:#22D3EE">{edges_count} <span style="font-size:0.75rem;color:#64748B;font-weight:500">links</span></div>
              <div style="width:100%;height:3px;background:#1E293B;border-radius:9999px;margin-top:6px">
                <div style="width:{min(100,(edges_count/20)*100)}%;height:100%;background:#22D3EE;border-radius:9999px"></div>
              </div>
            </div>
          </div>
          <hr>
          <div style="font-size:0.625rem;color:#64748B;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">PIPELINE STAGES</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            {''.join(f'''<div style="display:flex;align-items:center;gap:8px;font-size:0.6875rem;color:#94A3B8">
              <span style="width:18px;height:18px;border-radius:50%;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);display:flex;align-items:center;justify-content:center;font-size:0.5rem;color:#34D399;font-weight:700">{i+1}</span>
              {stage}
            </div>''' for i, stage in enumerate(["Capture → raw/", "Classify (Groq LLM) → wiki/", "Embed (384-dim vector)", "Link (cosine similarity)", "Export graph.json"]))}
          </div>
        </div>
        """, unsafe_allow_html=True)
