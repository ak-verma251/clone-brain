import React, { useState } from "react";
import { Sparkles, Send, BookOpen, ChevronDown, ChevronUp, Loader2, MessageSquare, ExternalLink, Lightbulb } from "lucide-react";
import { AskResponse, CitationSource } from "../types";

interface AskOracleProps {
  onSelectNode: (nodeId: string) => void;
}

const SAMPLE_QUESTIONS = [
  "What are my rules for deep work and focus management?",
  "How does SecondSelf link notes together in the knowledge graph?",
  "What was the setup for the home office acoustic treatment?",
  "Explain the core tenets of the PARA framework.",
  "What was filed for the 2025 tax return?",
];

export const AskOracle: React.FC<AskOracleProps> = ({ onSelectNode }) => {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [conversation, setConversation] = useState<
    Array<{
      question: string;
      answer: string;
      sources: CitationSource[];
      timestamp: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<number, boolean>>({});

  const handleAsk = async (qText?: string) => {
    const query = (qText || question).trim();
    if (!query || loading) return;

    setError(null);
    setLoading(true);
    setStatusMessage("Scanning 384-dimensional vector space...");

    const progressTimer = setTimeout(() => {
      setStatusMessage("Groq Llama 3 synthesizing cited response...");
    }, 600);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });

      clearTimeout(progressTimer);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }

      const data: AskResponse = await res.json();

      setConversation((prev) => [
        {
          question: query,
          answer: data.answer,
          sources: data.sources || [],
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ]);

      setQuestion("");
    } catch (err: any) {
      setError(err.message || "Failed to query Oracle.");
    } finally {
      setLoading(false);
      setStatusMessage("");
    }
  };

  const toggleSources = (idx: number) => {
    setExpandedSources((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Render text with clickable citation badges [1], [2]
  const renderFormattedAnswer = (text: string, sources: CitationSource[]) => {
    const parts = text.split(/(\[\d+\])/g);
    return (
      <div className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
        {parts.map((part, i) => {
          const match = part.match(/\[(\d+)\]/);
          if (match) {
            const citeNum = parseInt(match[1], 10);
            const source = sources.find((s) => s.index === citeNum);
            return (
              <button
                key={i}
                onClick={() => source && onSelectNode(source.id)}
                title={source ? `View: ${source.title} (${(source.score * 100).toFixed(0)}% match)` : "Source citation"}
                className="inline-flex items-center justify-center px-1.5 py-0.2 mx-0.5 text-[11px] font-bold font-mono bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-md transition-colors cursor-pointer"
              >
                [{citeNum}]
              </button>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                SYNTHESIS ORACLE
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-950 text-emerald-400 border border-slate-800">
                GROQ RAG ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Strictly grounds answers in semantic vector knowledge notes with cited references
            </p>
          </div>
        </div>
      </div>

      {/* Suggested Questions bar */}
      <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
        <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-xs text-slate-400 shrink-0 font-medium">Quick Prompts:</span>
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {SAMPLE_QUESTIONS.map((sq, i) => (
            <button
              key={i}
              onClick={() => handleAsk(sq)}
              disabled={loading}
              className="text-xs whitespace-nowrap bg-slate-950 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation / Results area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {loading && (
          <div className="p-4 bg-slate-950 border border-emerald-500/30 rounded-xl flex items-center gap-3 animate-pulse">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
            <div className="text-xs text-slate-200">
              <span className="font-semibold text-emerald-400">{statusMessage || "Consulting knowledge base..."}</span>
              <p className="text-[11px] text-slate-400 mt-0.5">UI stays fully responsive during vector search &amp; Groq LPU token inference.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300">
            {error}
          </div>
        )}

        {conversation.length === 0 && !loading && (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <MessageSquare className="w-10 h-10 mb-3 opacity-30 text-emerald-400" />
            <p className="text-sm font-semibold text-slate-300">Query your second brain using Groq-powered RAG.</p>
            <p className="text-xs text-slate-500 max-w-md mt-1 font-mono">
              SecondSelf computes vector embeddings, matches top-scoring PARA knowledge items, and synthesizes answers with verifiable sources.
            </p>
          </div>
        )}

        {conversation.map((entry, idx) => {
          const isSourcesOpen = expandedSources[idx] ?? true;
          return (
            <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-3.5 shadow-sm">
              {/* Question */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h3 className="text-sm font-semibold text-white">{entry.question}</h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">{entry.timestamp}</span>
              </div>

              {/* Synthesized Answer */}
              <div className="bg-slate-900/60 rounded-xl border border-slate-800/80 p-4">
                {renderFormattedAnswer(entry.answer, entry.sources)}
              </div>

              {/* Sources Section */}
              {entry.sources.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => toggleSources(idx)}
                    className="flex items-center justify-between w-full text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                      Cited Knowledge Sources ({entry.sources.length})
                    </span>
                    {isSourcesOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isSourcesOpen && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5">
                      {entry.sources.map((src) => (
                        <div
                          key={src.index}
                          onClick={() => onSelectNode(src.id)}
                          className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-3 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-mono font-bold text-emerald-400">
                              [{src.index}] {src.category}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                              {(src.score * 100).toFixed(0)}% match
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-200 group-hover:text-emerald-300 transition-colors line-clamp-1">
                            {src.title}
                          </p>
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 font-mono">{src.preview}</p>
                          <div className="flex items-center justify-end mt-1 text-[10px] text-emerald-400 group-hover:underline">
                            Inspect node <ExternalLink className="w-2.5 h-2.5 ml-1" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Input Bar */}
      <div className="p-3.5 bg-slate-900 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your knowledge vault, projects, protocols, ideas..."
            disabled={loading}
            className="flex-1 bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-sans"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-slate-950 font-bold text-xs rounded-xl shadow-sm shadow-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Send className="w-4 h-4 text-slate-950 stroke-[2.5]" />}
            <span>ASK ORACLE</span>
          </button>
        </form>
      </div>
    </div>
  );
};
