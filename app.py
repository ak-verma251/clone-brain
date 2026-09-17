"""
CLONE BRAIN — SecondSelf PARA Intelligence Engine
Streamlit entrypoint — rebuilt from full project architecture.

5-layer pipeline:
  capture.py  →  classify.py  →  link.py  →  build_graph.py  →  graph.json
  ask.py (RAG) → synthesised answers with citations

Tabs:
  1. 🧠 Brain Graph    — vis-network force-directed knowledge graph
  2. 💬 Ask Oracle     — RAG Q&A powered by Groq Llama 3
  3. 📂 Knowledge Wiki — PARA-organised browsable note vault
  4. ⚡ Capture Note   — ingest note / URL / file into the full pipeline
"""

# ── stdlib ────────────────────────────────────────────────────────────────────
import os
import json
import tempfile
import traceback
from pathlib import Path

# ── Streamlit (must be the very first Streamlit call) ─────────────────────────
import streamlit as st

st.set_page_config(
    page_title="CLONE BRAIN — PARA Intelligence Engine",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Project imports ────────────────────────────────────────────────────────────
from utils.file_utils import (
    load_config,
    ensure_dirs,
    get_all_wiki_files,
    load_wiki_note,
    BASE_DIR,
)
from capture import capture_note, capture_url, capture_file
from classify import classify_all
from link import link_all
from build_graph import export_graph
from ask import ask
from components.graph_component import build_vis_html

# ── Bootstrap ─────────────────────────────────────────────────────────────────
ensure_dirs()
config = load_config()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
if not GROQ_API_KEY:
    st.error(
        "⚠️ **GROQ_API_KEY is not configured.**\n\n"
        "**Local:** Add `GROQ_API_KEY=gsk_...` to your `.env` file.\n\n"
        "**Streamlit Cloud:** Go to *App Settings → Secrets* and paste:\n"
        "```toml\nGROQ_API_KEY = \"gsk_...\"\n```"
    )
    st.stop()

# Ensure graph.json exists on cold start
_graph_path = BASE_DIR / "graph.json"
if not _graph_path.exists():
    try:
        export_graph()
    except Exception:
        _graph_path.write_text(json.dumps({"nodes": [], "edges": []}))

# ── Global CSS ─────────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');

html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
    background-color: #020617 !important;
    color: #CBD5E1 !important;
}
.stApp { background-color: #020617 !important; }
.main .block-container { padding: 1.25rem 1.5rem 2rem !important; max-width:100% !important; }
#MainMenu, footer, header { visibility: hidden !important; }
.stDeployButton { display: none !important; }

/* ── Header ── */
.cb-header {
    display:flex; align-items:center; justify-content:space-between;
    flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem; padding:0 0.25rem;
}
.cb-brand { display:flex; align-items:center; gap:0.875rem; }
.cb-logo {
    width:44px; height:44px;
    background:linear-gradient(135deg,#10B981,#06B6D4);
    border-radius:12px; display:flex; align-items:center;
    justify-content:center; color:#020617; font-size:1.25rem; font-weight:900;
    box-shadow:0 0 24px rgba(16,185,129,0.35); flex-shrink:0;
}
.cb-title { font-size:1.3rem; font-weight:900; color:#fff; letter-spacing:-0.03em; line-height:1.2; }
.cb-version {
    font-size:0.6rem; font-family:'JetBrains Mono',monospace; font-weight:700;
    padding:2px 7px; background:#0F172A; color:#34D399;
    border:1px solid #1E293B; border-radius:5px; margin-left:6px; vertical-align:middle;
}
.cb-subtitle {
    font-size:0.6875rem; color:#64748B; text-transform:uppercase;
    letter-spacing:0.1em; font-family:'JetBrains Mono',monospace; margin-top:3px;
}
.cb-badge {
    display:inline-flex; align-items:center; gap:8px;
    background:#0F172A; border:1px solid #1E293B;
    padding:7px 14px; border-radius:9999px;
    font-size:0.75rem; font-weight:500; color:#CBD5E1;
}
.cb-dot { width:8px;height:8px;border-radius:50%;background:#10B981;animation:blink 2s infinite; }
@keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
.cb-val { color:#34D399;font-family:'JetBrains Mono',monospace;font-size:0.6875rem;font-weight:700; }

/* ── Stat cards ── */
.stat-card {
    background:#0F172A; border:1px solid #1E293B; border-radius:16px;
    padding:16px 18px; display:flex; flex-direction:column;
    justify-content:space-between; min-height:96px;
    transition:border-color .2s;
}
.stat-card:hover { border-color:#334155; }
.stat-label { font-size:0.625rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.12em; }
.stat-val { font-size:1.5rem;font-weight:900;color:#fff;margin-top:4px; }
.stat-val.em { color:#34D399; }
.stat-val.cy { color:#22D3EE; }
.stat-val.am { color:#F9A825; }
.stat-sub { font-size:0.6875rem;color:#94A3B8;font-weight:500; }
.stat-bar-bg { width:100%;height:3px;background:#1E293B;border-radius:9999px;margin-top:10px;overflow:hidden; }
.stat-bar { height:100%;border-radius:9999px; }

/* ── Tabs ── */
.stTabs [data-baseweb="tab-list"] {
    background:#0F172A !important; border:1px solid #1E293B !important;
    border-radius:16px !important; padding:6px !important; gap:4px !important;
}
.stTabs [data-baseweb="tab"] {
    background:transparent !important; border-radius:10px !important;
    color:#64748B !important; font-weight:700 !important;
    font-size:0.75rem !important; padding:8px 16px !important;
    border:none !important; transition:all .15s ease !important;
}
.stTabs [aria-selected="true"] {
    background:#020617 !important; color:#fff !important;
    border:1px solid #334155 !important;
    box-shadow:0 1px 6px rgba(0,0,0,.5) !important;
}
.stTabs [data-baseweb="tab-highlight"],
.stTabs [data-baseweb="tab-border"] { display:none !important; }

/* ── Inputs ── */
.stTextInput>div>div>input,
.stTextArea>div>div>textarea {
    background:#0F172A !important; border:1px solid #1E293B !important;
    color:#E2E8F0 !important; border-radius:12px !important;
    font-family:'Inter',sans-serif !important; font-size:.875rem !important;
}
.stTextInput>div>div>input:focus,
.stTextArea>div>div>textarea:focus {
    border-color:#10B981 !important;
    box-shadow:0 0 0 2px rgba(16,185,129,.18) !important; outline:none !important;
}

/* ── Buttons ── */
.stButton>button {
    background:#059669 !important; color:#020617 !important;
    font-weight:700 !important; border:none !important; border-radius:12px !important;
    font-size:.75rem !important; letter-spacing:.03em !important;
    transition:all .15s ease !important;
}
.stButton>button:hover {
    background:#10B981 !important; transform:translateY(-1px);
    box-shadow:0 4px 16px rgba(16,185,129,.3) !important;
}
.stButton>button:active { transform:scale(.97) !important; }

/* ── Expanders ── */
.streamlit-expanderHeader {
    background:#0F172A !important; border:1px solid #1E293B !important;
    border-radius:12px !important; color:#CBD5E1 !important;
    font-size:.8125rem !important; font-weight:600 !important;
}
.streamlit-expanderContent {
    background:#0A0F1E !important; border:1px solid #1E293B !important;
    border-top:none !important; border-radius:0 0 12px 12px !important;
    padding:14px !important;
}

/* ── PARA pills ── */
.pill-projects  {background:rgba(108,99,255,.15);color:#6C63FF;border:1px solid rgba(108,99,255,.3);border-radius:9999px;padding:2px 10px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;}
.pill-areas     {background:rgba(249,168,37,.15);color:#F9A825;border:1px solid rgba(249,168,37,.3);border-radius:9999px;padding:2px 10px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;}
.pill-resources {background:rgba(38,198,218,.15);color:#26C6DA;border:1px solid rgba(38,198,218,.3);border-radius:9999px;padding:2px 10px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;}
.pill-archives  {background:rgba(120,144,156,.15);color:#78909C;border:1px solid rgba(120,144,156,.3);border-radius:9999px;padding:2px 10px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;}

/* ── Note cards ── */
.note-card {
    background:#0F172A; border:1px solid #1E293B; border-radius:14px;
    padding:14px 16px; margin-bottom:10px;
    transition:border-color .15s,box-shadow .15s;
}
.note-card:hover { border-color:#334155; box-shadow:0 6px 24px rgba(0,0,0,.4); }
.note-title  { font-size:.8125rem;font-weight:600;color:#F1F5F9;margin-bottom:6px;line-height:1.4; }
.note-prev   { font-size:.75rem;color:#64748B;line-height:1.55;margin-bottom:8px; }
.note-tags   { display:flex;flex-wrap:wrap;gap:4px; }
.note-tag    { font-size:.5625rem;font-family:'JetBrains Mono',monospace;font-weight:600;padding:2px 7px;background:#1E293B;color:#94A3B8;border:1px solid #334155;border-radius:5px; }
.note-meta   { font-size:.5625rem;color:#475569;font-family:'JetBrains Mono',monospace;margin-top:6px; }

/* ── Capture panel ── */
.cap-panel { background:#0F172A;border:1px solid #1E293B;border-radius:20px;padding:22px;margin-bottom:16px; }
.cap-label { font-size:.625rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.12em;margin-bottom:14px;display:flex;align-items:center;gap:8px; }

/* ── Oracle ── */
.oracle-q { background:#0F172A;border:1px solid #1E293B;border-radius:12px;padding:16px;margin-bottom:10px; }
.oracle-a { background:linear-gradient(135deg,rgba(16,185,129,.06),rgba(6,182,212,.03));border:1px solid rgba(16,185,129,.2);border-radius:12px;padding:20px;font-size:.875rem;color:#CBD5E1;line-height:1.75; }

/* ── Section heads ── */
.sh { display:flex;align-items:center;gap:10px;margin-bottom:16px; }
.sh-icon { width:34px;height:34px;border-radius:10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0; }
.sh-title { font-size:.875rem;font-weight:700;color:#F1F5F9;text-transform:uppercase;letter-spacing:.05em;margin:0; }
.sh-sub   { font-size:.6875rem;color:#64748B;margin:2px 0 0; }

/* ── Step rows ── */
.step { display:flex;align-items:center;gap:10px;font-size:.6875rem;color:#94A3B8;margin-bottom:8px; }
.step-n { width:20px;height:20px;border-radius:50%;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);display:flex;align-items:center;justify-content:center;font-size:.5rem;color:#34D399;font-weight:700;flex-shrink:0; }

/* ── Misc ── */
hr{border-color:#1E293B !important;margin:14px 0 !important;}
.stSuccess{background:rgba(16,185,129,.08) !important;border:1px solid rgba(16,185,129,.25) !important;border-radius:10px !important;}
.stError{background:rgba(239,68,68,.08) !important;border:1px solid rgba(239,68,68,.25) !important;border-radius:10px !important;}
.stWarning{background:rgba(245,158,11,.08) !important;border:1px solid rgba(245,158,11,.25) !important;border-radius:10px !important;}
.stInfo{background:rgba(6,182,212,.08) !important;border:1px solid rgba(6,182,212,.25) !important;border-radius:10px !important;}
.stSpinner>div{border-top-color:#10B981 !important;}
</style>
""", unsafe_allow_html=True)


# ── Helpers ────────────────────────────────────────────────────────────────────

def load_graph() -> dict:
    try:
        with open(BASE_DIR / "graph.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"nodes": [], "edges": []}


def pill(cat: str) -> str:
    return f"pill-{cat.lower()}"


def icon(cat: str) -> str:
    return {"Projects": "🟣", "Areas": "🟡", "Resources": "🔵", "Archives": "⚫"}.get(cat, "⚪")


def run_pipeline(status=None):
    """classify → link → export_graph."""
    def s(msg):
        if status:
            status.text(msg)
    s("🔍 Classifying via Groq LLM…")
    classify_all()
    s("🔗 Embedding & linking notes…")
    link_all()
    s("📊 Rebuilding graph.json…")
    export_graph()
    s("✅ Done!")


# ── Load graph ─────────────────────────────────────────────────────────────────
g = load_graph()
N = len(g.get("nodes", []))
E = len(g.get("edges", []))
cat_n = {}
for nd in g.get("nodes", []):
    c = nd.get("category", "Resources")
    cat_n[c] = cat_n.get(c, 0) + 1

llm_model = config.get("llm", {}).get("model", "llama-3.3-70b-versatile")


# ══════════════════════════════════════════════════════════════════════════════
# HEADER
# ══════════════════════════════════════════════════════════════════════════════
st.markdown(f"""
<div class="cb-header">
  <div class="cb-brand">
    <div class="cb-logo">🧠</div>
    <div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="cb-title">CLONE BRAIN</span>
        <span class="cb-version">v3.0</span>
      </div>
      <div class="cb-subtitle">SecondSelf · PARA Intelligence Engine · Knowledge Graph</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <div class="cb-badge">
      <span class="cb-dot"></span>
      API ACTIVE: <span class="cb-val">{llm_model}</span>
    </div>
    <div class="cb-badge">
      <span style="font-size:.65rem;color:#64748B">PIPELINE</span>
      <span class="cb-val" style="margin-left:4px">ONLINE</span>
    </div>
  </div>
</div>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# STAT STRIP
# ══════════════════════════════════════════════════════════════════════════════
n_pct = min(100, (N / max(N, 25)) * 100)
e_pct = min(100, (E / max(E, 30)) * 100)
strong_e = sum(1 for e in g.get("edges", []) if e.get("type") == "strong")
s_pct = int((strong_e / max(E, 1)) * 100)

c1, c2, c3, _c4 = st.columns([2, 2, 2, 6])
with c1:
    st.markdown(f"""
    <div class="stat-card">
      <span class="stat-label">📚 Knowledge Nodes</span>
      <div><span class="stat-val">{N}</span>
           <span class="stat-sub"> notes</span></div>
      <div class="stat-bar-bg"><div class="stat-bar" style="width:{n_pct:.0f}%;background:#10B981"></div></div>
    </div>""", unsafe_allow_html=True)
with c2:
    st.markdown(f"""
    <div class="stat-card">
      <span class="stat-label">🕸️ Semantic Edges</span>
      <div><span class="stat-val cy">{E}</span>
           <span class="stat-sub"> links</span></div>
      <div class="stat-bar-bg"><div class="stat-bar" style="width:{e_pct:.0f}%;background:#22D3EE"></div></div>
    </div>""", unsafe_allow_html=True)
with c3:
    st.markdown(f"""
    <div class="stat-card">
      <span class="stat-label">⚡ Strong Links</span>
      <div><span class="stat-val am">{strong_e}</span>
           <span class="stat-sub"> ≥ 0.85</span></div>
      <div class="stat-bar-bg"><div class="stat-bar" style="width:{s_pct}%;background:#F9A825"></div></div>
    </div>""", unsafe_allow_html=True)

st.markdown("<div style='margin-top:10px'></div>", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# TABS
# ══════════════════════════════════════════════════════════════════════════════
tab1, tab2, tab3, tab4 = st.tabs([
    f"🧠 Brain Graph  [{N}N · {E}E]",
    "💬 Ask Oracle  [RAG]",
    f"📂 Knowledge Wiki  [{N}]",
    "⚡ Capture Note",
])


# ────────────────────────────────────────────────────────────────────────────
# TAB 1 — BRAIN GRAPH
# ────────────────────────────────────────────────────────────────────────────
with tab1:
    hdr, btn_col = st.columns([8, 2])
    with hdr:
        st.markdown("""
        <div class="sh">
          <div class="sh-icon">🕸️</div>
          <div>
            <p class="sh-title">Knowledge Graph</p>
            <p class="sh-sub">Force-directed semantic graph · Drag · Hover for summary · Zoom</p>
          </div>
        </div>""", unsafe_allow_html=True)
    with btn_col:
        if st.button("🔄 Rebuild Graph", use_container_width=True, key="btn_rebuild"):
            slot = st.empty()
            with st.spinner("Rebuilding…"):
                try:
                    run_pipeline(slot)
                    st.success("✅ Graph rebuilt!")
                    st.rerun()
                except Exception as ex:
                    st.error(f"❌ {ex}")
                    with st.expander("Traceback"):
                        st.code(traceback.format_exc())

    if N == 0:
        st.markdown("""
        <div style="text-align:center;padding:60px;color:#334155">
          <div style="font-size:3rem;margin-bottom:12px">🌌</div>
          <div style="font-size:1rem;font-weight:600;color:#64748B">Your knowledge graph is empty</div>
          <div style="font-size:.8rem;color:#475569;margin-top:6px">
            Capture some notes in Tab 4 — they will appear here as glowing nodes.
          </div>
        </div>""", unsafe_allow_html=True)
    else:
        nodes_js = json.dumps(g.get("nodes", []))
        edges_js  = json.dumps(g.get("edges", []))
        st.components.v1.html(
            build_vis_html(nodes_js, edges_js, height=620),
            height=690, scrolling=False,
        )

    # Legend
    LEGEND = [("Projects","#6C63FF","🟣"),("Areas","#F9A825","🟡"),
               ("Resources","#26C6DA","🔵"),("Archives","#78909C","⚫")]
    parts = "".join(
        f'<span style="display:flex;align-items:center;gap:5px">'
        f'<span style="width:10px;height:10px;border-radius:50%;background:{col};display:inline-block"></span>'
        f'{ic} {c} <span style="color:#475569;font-family:JetBrains Mono,monospace;font-size:.6rem">({cat_n.get(c,0)})</span>'
        f'</span>'
        for c, col, ic in LEGEND
    )
    st.markdown(
        f'<div style="display:flex;gap:20px;flex-wrap:wrap;padding:10px 0;font-size:.6875rem;color:#64748B">'
        + parts +
        '<span style="margin-left:auto;font-size:.625rem;color:#475569">Thick edges = strong links (≥0.85)</span></div>',
        unsafe_allow_html=True,
    )


# ────────────────────────────────────────────────────────────────────────────
# TAB 2 — ASK ORACLE
# ────────────────────────────────────────────────────────────────────────────
with tab2:
    st.markdown("""
    <div class="sh">
      <div class="sh-icon">💬</div>
      <div>
        <p class="sh-title">Ask Oracle</p>
        <p class="sh-sub">RAG · Groq Llama 3 · 384-dim Vector Retrieval</p>
      </div>
    </div>""", unsafe_allow_html=True)

    SAMPLES = [
        "What are my rules for deep work?",
        "How does SecondSelf link notes?",
        "Explain the PARA framework.",
        "What productivity systems do I use?",
        "Summarise my project ideas.",
        "What AI resources have I saved?",
    ]
    st.markdown("<p style='font-size:.6875rem;color:#64748B;margin-bottom:8px'>💡 SUGGESTED QUERIES</p>",
                unsafe_allow_html=True)

    sq_cols = st.columns(len(SAMPLES))
    sel = None
    for i, sq in enumerate(SAMPLES):
        with sq_cols[i]:
            if st.button(sq[:26] + "…", key=f"sq{i}", use_container_width=True):
                sel = sq

    st.markdown("<div style='margin-top:14px'></div>", unsafe_allow_html=True)

    qcol, acol = st.columns([5, 1])
    with qcol:
        oracle_q = st.text_input(
            "Q", value=sel or "",
            placeholder="Ask anything across your knowledge base…",
            label_visibility="collapsed", key="oracle_q",
        )
    with acol:
        ask_btn = st.button("⚡ Ask", type="primary", use_container_width=True, key="ask_btn")

    eff_q = (sel or oracle_q or "").strip()
    if (ask_btn or sel) and eff_q:
        if N == 0:
            st.warning("⚠️ Your knowledge base is empty. Capture some notes first!")
        else:
            with st.spinner("Scanning vector space · Groq synthesizing…"):
                try:
                    result = ask(eff_q)
                except Exception as ex:
                    result = {"answer": f"⚠️ LLM error: {ex}", "sources": []}

            st.markdown(f"""
            <div class="oracle-q">
              <span style="font-size:.6rem;color:#64748B;font-weight:700;
                text-transform:uppercase;letter-spacing:.1em">YOUR QUESTION</span><br>
              <span style="font-size:.9rem;color:#F1F5F9;font-weight:600">{eff_q}</span>
            </div>""", unsafe_allow_html=True)

            ans = result.get("answer", "No answer generated.")
            st.markdown(f"""
            <div class="oracle-a">
              <div style="font-size:.6rem;color:#34D399;font-weight:700;
                text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">
                ⚡ ORACLE RESPONSE
              </div>
              {ans}
            </div>""", unsafe_allow_html=True)

            sources = result.get("sources", [])
            if sources:
                st.markdown(
                    f"<p style='font-size:.6875rem;color:#64748B;margin-top:16px;margin-bottom:8px'>"
                    f"📎 {len(sources)} CITED SOURCE{'S' if len(sources)>1 else ''}</p>",
                    unsafe_allow_html=True,
                )
                for s in sources:
                    cat  = s.get("category", "Resources")
                    with st.expander(f"[{s['index']}] {s['title']} — score: {s['score']}"):
                        st.markdown(
                            f'<span class="{pill(cat)}">{cat}</span>'
                            f'<p style="font-size:.8rem;color:#94A3B8;margin-top:8px">'
                            f'{s.get("preview","")}</p>',
                            unsafe_allow_html=True,
                        )


# ────────────────────────────────────────────────────────────────────────────
# TAB 3 — KNOWLEDGE WIKI
# ────────────────────────────────────────────────────────────────────────────
with tab3:
    st.markdown("""
    <div class="sh">
      <div class="sh-icon">📂</div>
      <div>
        <p class="sh-title">
          Knowledge Wiki
          <span style="font-size:.6rem;font-family:'JetBrains Mono',monospace;
            background:#0F172A;color:#34D399;border:1px solid #1E293B;
            border-radius:5px;padding:2px 7px;margin-left:8px">PARA SYSTEM</span>
        </p>
        <p class="sh-sub">
          Categorised markdown vault · Projects · Areas · Resources · Archives
        </p>
      </div>
    </div>""", unsafe_allow_html=True)

    CATS = ["All", "Projects", "Areas", "Resources", "Archives"]
    if "wf" not in st.session_state:
        st.session_state.wf = "All"

    fc = st.columns(len(CATS))
    for i, cat in enumerate(CATS):
        with fc[i]:
            cnt = N if cat == "All" else cat_n.get(cat, 0)
            lbl = (f"🔍 All ({cnt})" if cat == "All"
                   else f"{icon(cat)} {cat} ({cnt})")
            if st.button(lbl, key=f"wf_{cat}", use_container_width=True):
                st.session_state.wf = cat

    af = st.session_state.wf
    sq2 = st.text_input(
        "Search", placeholder="🔍  Search notes, tags, summaries…",
        label_visibility="collapsed", key="wiki_sq",
    )
    st.markdown("<hr>", unsafe_allow_html=True)

    shown = 0
    for wf in get_all_wiki_files():
        try:
            meta, content = load_wiki_note(wf)
        except Exception:
            continue

        cat = meta.get("category", "Resources")
        if af != "All" and cat != af:
            continue

        summary  = meta.get("summary", Path(wf).stem)
        raw_tags = meta.get("tags", [])
        if isinstance(raw_tags, str):
            tags = [raw_tags]
        elif isinstance(raw_tags, list):
            tags = [str(t) for t in raw_tags if str(t).strip()]
        else:
            tags = []

        preview = content[:220].strip()

        if sq2.strip():
            q_ = sq2.lower()
            if not (q_ in summary.lower() or q_ in preview.lower()
                    or any(q_ in t.lower() for t in tags)):
                continue

        tags_html = "".join(f'<span class="note-tag">#{t}</span>' for t in tags[:6])
        ts = meta.get("timestamp", "")[:10]
        src = meta.get("type", "note")

        st.markdown(f"""
        <div class="note-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
            <span class="note-title">{icon(cat)} {summary[:90]}</span>
            <span class="{pill(cat)}" style="flex-shrink:0;margin-left:8px">{cat}</span>
          </div>
          <p class="note-prev">{preview}{'…' if len(content)>220 else ''}</p>
          <div class="note-tags">{tags_html}</div>
          <div class="note-meta">{src.upper()} · {ts}</div>
        </div>""", unsafe_allow_html=True)
        shown += 1

    if shown == 0:
        st.markdown("""
        <div style="text-align:center;padding:48px;color:#334155">
          <div style="font-size:2.5rem;margin-bottom:10px">📭</div>
          <div style="font-size:.9rem;font-weight:600;color:#64748B">No notes found</div>
          <div style="font-size:.75rem;color:#475569;margin-top:4px">
            Try a different filter or capture your first note in Tab 4.
          </div>
        </div>""", unsafe_allow_html=True)


# ────────────────────────────────────────────────────────────────────────────
# TAB 4 — CAPTURE NOTE
# ────────────────────────────────────────────────────────────────────────────
with tab4:
    st.markdown("""
    <div class="sh">
      <div class="sh-icon">⚡</div>
      <div>
        <p class="sh-title">Capture to Brain</p>
        <p class="sh-sub">Ingest notes · URLs · Docs → Classify → Embed → Link → Graph</p>
      </div>
    </div>""", unsafe_allow_html=True)

    left, right = st.columns([3, 2])

    with left:
        src_type = st.radio(
            "Source", ["📝 Note", "🌐 URL", "📄 File Upload"],
            horizontal=True, label_visibility="collapsed", key="cap_src",
        )

        # ── Note ────────────────────────────────────────────────────────────
        if "📝 Note" in src_type:
            note_txt = st.text_area(
                "Note", placeholder="Capture an insight, idea, meeting note, or any text…",
                height=190, label_visibility="collapsed", key="cap_note_txt",
            )
            cc = len(note_txt) if note_txt else 0
            st.markdown(
                f"<p style='font-size:.625rem;color:#475569;text-align:right'>{cc}/8000</p>",
                unsafe_allow_html=True,
            )
            if st.button("⚡ CAPTURE NOTE → BRAIN", type="primary",
                         use_container_width=True, key="btn_note"):
                if not note_txt or len(note_txt.strip()) < 10:
                    st.warning("⚠️ Note must be at least 10 characters.")
                else:
                    prog = st.empty()
                    with st.spinner("Ingesting → Classifying → Embedding → Linking → Graph…"):
                        try:
                            res = capture_note(note_txt)
                            if res is None:
                                st.warning("⚠️ Duplicate — this note already exists in your brain.")
                            else:
                                run_pipeline(prog)
                                st.success(f"✅ Note captured! ID: `{res['id'][:8]}…`")
                                st.rerun()
                        except Exception as ex:
                            st.error(f"❌ {ex}")
                            with st.expander("Details"):
                                st.code(traceback.format_exc())

        # ── URL ──────────────────────────────────────────────────────────────
        elif "🌐 URL" in src_type:
            url_val = st.text_input(
                "URL", placeholder="https://example.com/article",
                label_visibility="collapsed", key="cap_url_val",
            )
            if st.button("⚡ CAPTURE URL → BRAIN", type="primary",
                         use_container_width=True, key="btn_url"):
                u = (url_val or "").strip()
                if not u.startswith(("http://", "https://")):
                    st.warning("⚠️ Please enter a URL starting with http:// or https://")
                else:
                    prog = st.empty()
                    with st.spinner("Fetching · Extracting · Classifying · Linking…"):
                        try:
                            res = capture_url(u)
                            if res is None:
                                st.warning("⚠️ Duplicate — this URL was already captured.")
                            else:
                                run_pipeline(prog)
                                st.success("✅ Web page saved and linked into your Brain!")
                                st.rerun()
                        except Exception as ex:
                            st.error(f"❌ {ex}")
                            with st.expander("Details"):
                                st.code(traceback.format_exc())

        # ── File ─────────────────────────────────────────────────────────────
        else:
            upl = st.file_uploader(
                "Document", type=["txt", "md", "pdf"],
                label_visibility="collapsed", key="cap_file_upl",
            )
            if upl:
                st.markdown(
                    f"<div style='font-size:.75rem;color:#34D399;padding:6px 0'>"
                    f"📎 {upl.name} ready</div>",
                    unsafe_allow_html=True,
                )
                if st.button("⚡ INDEX DOCUMENT → BRAIN", type="primary",
                             use_container_width=True, key="btn_file"):
                    prog = st.empty()
                    suffix = "." + upl.name.rsplit(".", 1)[-1]
                    with st.spinner(f"Parsing {upl.name} · Classifying · Linking…"):
                        tmp_path = None
                        try:
                            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                                tmp.write(upl.read())
                                tmp_path = tmp.name
                            res = capture_file(tmp_path)
                            if res is None:
                                st.warning("⚠️ Duplicate — this document was already captured.")
                            else:
                                run_pipeline(prog)
                                st.success(f"✅ {upl.name} indexed and integrated!")
                                st.rerun()
                        except Exception as ex:
                            st.error(f"❌ {ex}")
                            with st.expander("Details"):
                                st.code(traceback.format_exc())
                        finally:
                            if tmp_path and os.path.exists(tmp_path):
                                os.unlink(tmp_path)

    # ── Right: vitals ─────────────────────────────────────────────────────────
    with right:
        STAGES = [
            ("Capture → raw/",              "The Archivist"),
            ("Classify (Groq LLM) → wiki/", "The Librarian"),
            ("Embed (384-dim) → embeddings/","The Connector"),
            ("Link (cosine sim) → YAML",    "The Mapper"),
            ("Export → graph.json",          "The Cartographer"),
            ("RAG Query → answer",           "The Oracle"),
        ]
        steps_html = "".join(
            f'<div class="step"><span class="step-n">{i+1}</span>'
            f'{stage} <span style="color:#475569">— {role}</span></div>'
            for i,(stage,role) in enumerate(STAGES)
        )
        breakdown = "".join(
            f'<div style="display:flex;justify-content:space-between;'
            f'font-size:.6875rem;margin-bottom:5px">'
            f'<span style="color:#94A3B8">{icon(c)} {c}</span>'
            f'<span style="color:#34D399;font-family:\'JetBrains Mono\',monospace;'
            f'font-size:.625rem">{cat_n.get(c,0)}</span></div>'
            for c in ["Projects","Areas","Resources","Archives"]
        )
        st.markdown(f"""
        <div class="cap-panel">
          <div class="cap-label">📊 BRAIN VITALS</div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
            <div>
              <div style="font-size:.6rem;color:#64748B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">KNOWLEDGE NODES</div>
              <div style="font-size:1.5rem;font-weight:900;color:#fff">{N} <span style="font-size:.75rem;color:#64748B;font-weight:500">notes</span></div>
            </div>
            <div>
              <div style="font-size:.6rem;color:#64748B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">SEMANTIC EDGES</div>
              <div style="font-size:1.5rem;font-weight:900;color:#22D3EE">{E} <span style="font-size:.75rem;color:#64748B;font-weight:500">links</span></div>
            </div>
          </div>
          <div style="font-size:.6rem;color:#64748B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">PARA BREAKDOWN</div>
          {breakdown}
          <hr>
          <div style="font-size:.6rem;color:#64748B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">PIPELINE STAGES</div>
          {steps_html}
        </div>""", unsafe_allow_html=True)

