import React, { useEffect, useState } from "react";
import { X, Calendar, Tag, Link2, ExternalLink, Trash2, ArrowRight } from "lucide-react";
import { CategoryType, WikiNoteDetail } from "../types";

interface NoteModalProps {
  noteId: string | null;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
  onDeleteNote: (nodeId: string) => void;
}

const CATEGORY_STYLES: Record<CategoryType, { bg: string; text: string; border: string }> = {
  Projects: { bg: "bg-[#6C63FF]/20", text: "text-[#6C63FF]", border: "border-[#6C63FF]/40" },
  Areas: { bg: "bg-[#F9A825]/20", text: "text-[#F9A825]", border: "border-[#F9A825]/40" },
  Resources: { bg: "bg-[#26C6DA]/20", text: "text-[#26C6DA]", border: "border-[#26C6DA]/40" },
  Archives: { bg: "bg-[#78909C]/20", text: "text-[#78909C]", border: "border-[#78909C]/40" },
};

export const NoteModal: React.FC<NoteModalProps> = ({ noteId, onClose, onSelectNode, onDeleteNote }) => {
  const [detail, setDetail] = useState<WikiNoteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) {
      setDetail(null);
      return;
    }

    const fetchNote = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/wiki/${noteId}`);
        if (!res.ok) throw new Error("Note could not be loaded");
        const data = await res.json();
        setDetail(data);
      } catch (err: any) {
        setError(err.message || "Failed to load note details");
      } finally {
        setLoading(false);
      }
    };

    fetchNote();
  }, [noteId]);

  if (!noteId) return null;

  const cat = detail?.meta.category || "Resources";
  const catStyle = CATEGORY_STYLES[cat] || CATEGORY_STYLES.Resources;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800 bg-slate-900">
          <div className="space-y-1.5 pr-4">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                {cat}
              </span>
              {detail?.meta.timestamp && (
                <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                  <Calendar className="w-3 h-3" />
                  {new Date(detail.meta.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-slate-100 leading-snug">
              {detail?.meta.summary || "Loading note..."}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading && (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">
              Loading note details...
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {detail && (
            <>
              {/* Note Body */}
              <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans bg-slate-950 border border-slate-800 p-4.5 rounded-xl">
                {detail.content}
              </div>

              {/* Tags */}
              {(detail.meta.tags || []).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-400">
                  <Tag className="w-3.5 h-3.5 text-slate-500" />
                  {detail.meta.tags.map((t, idx) => (
                    <span key={idx} className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-lg text-slate-300 font-mono text-[11px]">
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Connected Semantic Links */}
              <div className="space-y-2 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                    SEMANTIC LINKS ({(detail.meta.links || []).length})
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 font-normal">Auto-woven vectors</span>
                </div>

                {(detail.meta.links || []).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No semantic connections above threshold yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.meta.links.map((lnk) => (
                      <div
                        key={lnk.id}
                        onClick={() => onSelectNode(lnk.id)}
                        className="flex items-center justify-between p-3 bg-slate-950 hover:bg-slate-950/80 border border-slate-800 hover:border-emerald-500/40 rounded-xl cursor-pointer transition-colors group"
                      >
                        <span className="text-xs text-slate-200 font-mono group-hover:text-emerald-400 truncate max-w-[340px]">
                          Node: {lnk.id}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
                              lnk.type === "strong"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                                : "bg-slate-900 text-slate-400 border border-slate-800"
                            }`}
                          >
                            {(lnk.score * 100).toFixed(0)}% &bull; {lnk.type}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {detail && (
          <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
            <button
              onClick={() => {
                if (confirm(`Delete note "${detail.meta.summary}"?`)) {
                  onDeleteNote(detail.meta.id);
                  onClose();
                }
              }}
              className="text-xs font-medium text-red-400 hover:text-red-300 flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-red-950/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Note
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
