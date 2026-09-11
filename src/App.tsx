import React, { useState, useEffect } from "react";
import {
  Brain,
  MessageSquare,
  Folder,
  ShieldCheck,
  Plus,
  RefreshCw,
  Cpu,
  Layers,
  Sparkles,
} from "lucide-react";
import { BrainStats, GraphData, WikiNoteSummary } from "./types";
import { BrainGraph } from "./components/BrainGraph";
import { AskOracle } from "./components/AskOracle";
import { WikiExplorer } from "./components/WikiExplorer";
import { TestingSuite } from "./components/TestingSuite";
import { CaptureDrawer } from "./components/CaptureDrawer";
import { NoteModal } from "./components/NoteModal";

export default function App() {
  const [activeTab, setActiveTab] = useState<"graph" | "ask" | "wiki" | "tests">("graph");
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [wikiNotes, setWikiNotes] = useState<WikiNoteSummary[]>([]);
  const [stats, setStats] = useState<BrainStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [graphRes, wikiRes, statsRes] = await Promise.all([
        fetch("/api/graph"),
        fetch("/api/wiki"),
        fetch("/api/stats"),
      ]);

      if (graphRes.ok) {
        const g = await graphRes.json();
        setGraphData(g);
      }
      if (wikiRes.ok) {
        const w = await wikiRes.json();
        setWikiNotes(w);
      }
      if (statsRes.ok) {
        const s = await statsRes.json();
        setStats(s);
      }
    } catch (err) {
      console.error("Failed to load SecondSelf data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRebuildGraph = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/graph/rebuild", { method: "POST" });
      await loadData();
    } catch (err) {
      console.error("Rebuild failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await fetch(`/api/wiki/${id}`, { method: "DELETE" });
      await loadData();
      if (selectedNodeId === id) setSelectedNodeId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleCaptureSuccess = async (newId: string) => {
    await loadData();
    setSelectedNodeId(newId);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 p-4 sm:p-6 text-slate-300 font-sans select-none overflow-hidden antialiased">
      {/* Bento Grid Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-4 px-1 shrink-0">
        <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => setActiveTab("graph")}>
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center text-slate-950 font-black text-lg tracking-tighter shadow-sm shadow-emerald-500/20">
            A
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">CLONE BRAIN</h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-900 text-emerald-400 rounded-md border border-slate-800">
                v2.4
              </span>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">
              PARA Intelligence Engine &amp; Knowledge Graph
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Badge 1 */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-300">
              API ACTIVE: <span className="text-emerald-400 font-mono">{stats?.model || "openai/gpt-oss-120b"}</span>
            </span>
          </div>

          {/* Status Badge 2 */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
            <span className="text-xs font-medium text-slate-400 font-mono">ENV: PRODUCTION-READY</span>
          </div>

          {/* Capture to Brain Action */}
          <button
            onClick={() => setIsCaptureOpen(true)}
            className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-slate-950 font-bold rounded-xl transition-all text-xs flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            <span>CAPTURE NOTE</span>
          </button>

          {/* Refresh Sync */}
          <button
            onClick={loadData}
            disabled={isLoading}
            title="Refresh knowledge base"
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800/80 rounded-xl transition-colors border border-slate-800 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </header>

      {/* Bento Grid Top Vitals Strip & Navigation Bar */}
      <div className="grid grid-cols-12 gap-3 mb-4 shrink-0">
        {/* Bento Stat 1: Notes Vault */}
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>KNOWLEDGE VAULT</span>
            <Layers className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl font-black text-white">
              {stats?.totalNotes ?? graphData.nodes.length}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">notes stored</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{
                width: `${Math.min(100, ((stats?.totalNotes ?? graphData.nodes.length) / 25) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Bento Stat 2: Semantic Connections */}
        <div className="col-span-6 sm:col-span-3 lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>VECTOR GRAPH</span>
            <Brain className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl font-black text-emerald-400">
              {stats?.totalLinks ?? graphData.edges.length}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">dense edges</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full"
              style={{
                width: `${Math.min(100, ((stats?.totalLinks ?? graphData.edges.length) / 20) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Bento Module 3: Navigation Tab Switcher */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-2 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 w-full">
            <button
              onClick={() => setActiveTab("graph")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === "graph"
                  ? "bg-slate-950 text-white border border-slate-700 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <Brain className={`w-4 h-4 ${activeTab === "graph" ? "text-emerald-400" : ""}`} />
              <span className="truncate">Brain Graph</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 text-emerald-400 font-mono border border-slate-800">
                {graphData.nodes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("ask")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === "ask"
                  ? "bg-slate-950 text-white border border-slate-700 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <MessageSquare className={`w-4 h-4 ${activeTab === "ask" ? "text-emerald-400" : ""}`} />
              <span className="truncate">Ask Oracle</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20">
                RAG
              </span>
            </button>

            <button
              onClick={() => setActiveTab("wiki")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === "wiki"
                  ? "bg-slate-950 text-white border border-slate-700 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <Folder className={`w-4 h-4 ${activeTab === "wiki" ? "text-emerald-400" : ""}`} />
              <span className="truncate">Knowledge Wiki</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 text-slate-400 font-mono border border-slate-800">
                {wikiNotes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("tests")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === "tests"
                  ? "bg-slate-950 text-white border border-slate-700 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
            >
              <ShieldCheck className={`w-4 h-4 ${activeTab === "tests" ? "text-emerald-400" : ""}`} />
              <span className="truncate">Protocols</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-mono border border-emerald-800/60">
                E2E
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Bento Workspace Viewport */}
      <main className="flex-1 overflow-hidden min-h-0">
        {activeTab === "graph" && (
          <BrainGraph
            data={graphData}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => setSelectedNodeId(id)}
            onRebuildGraph={handleRebuildGraph}
            isLoading={isLoading}
          />
        )}

        {activeTab === "ask" && (
          <AskOracle onSelectNode={(id) => setSelectedNodeId(id)} />
        )}

        {activeTab === "wiki" && (
          <WikiExplorer
            notes={wikiNotes}
            onSelectNode={(id) => setSelectedNodeId(id)}
            onDeleteNote={handleDeleteNote}
          />
        )}

        {activeTab === "tests" && <TestingSuite />}
      </main>

      {/* Capture Modal Drawer */}
      <CaptureDrawer
        isOpen={isCaptureOpen}
        onClose={() => setIsCaptureOpen(false)}
        onSuccess={handleCaptureSuccess}
      />

      {/* Note Detail Modal */}
      <NoteModal
        noteId={selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
        onSelectNode={(id) => setSelectedNodeId(id)}
        onDeleteNote={handleDeleteNote}
      />
    </div>
  );
}
