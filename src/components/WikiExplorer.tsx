import React, { useState } from "react";
import { Folder, FileText, Search, Tag, ExternalLink, Calendar, Hash, Trash2 } from "lucide-react";
import { CategoryType, WikiNoteSummary } from "../types";

interface WikiExplorerProps {
  notes: WikiNoteSummary[];
  onSelectNode: (nodeId: string) => void;
  onDeleteNote: (nodeId: string) => void;
}

const CATEGORY_STYLES: Record<CategoryType, { bg: string; text: string; border: string }> = {
  Projects: { bg: "bg-[#6C63FF]/15", text: "text-[#6C63FF]", border: "border-[#6C63FF]/30" },
  Areas: { bg: "bg-[#F9A825]/15", text: "text-[#F9A825]", border: "border-[#F9A825]/30" },
  Resources: { bg: "bg-[#26C6DA]/15", text: "text-[#26C6DA]", border: "border-[#26C6DA]/30" },
  Archives: { bg: "bg-[#78909C]/15", text: "text-[#78909C]", border: "border-[#78909C]/30" },
};

export const WikiExplorer: React.FC<WikiExplorerProps> = ({ notes, onSelectNode, onDeleteNote }) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | "All">("All");
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // All unique tags
  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags || []))).slice(0, 18);

  const filtered = notes.filter((n) => {
    if (selectedCategory !== "All" && n.category !== selectedCategory) return false;
    if (selectedTag && !(n.tags || []).includes(selectedTag)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        n.summary.toLowerCase().includes(q) ||
        n.preview.toLowerCase().includes(q) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
      {/* Header & Filter Controls */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  KNOWLEDGE WIKI
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-950 text-emerald-400 border border-slate-800">
                  PARA SYSTEM
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Categorized markdown units sorted by projects, areas, resources &amp; archives
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search wiki notes & tags..."
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 rounded-xl pl-8 pr-3 py-1.5 w-56 sm:w-64 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-sans"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {/* Category Pill Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(["All", "Projects", "Areas", "Resources", "Archives"] as const).map((cat) => {
            const count = cat === "All" ? notes.length : notes.filter((n) => n.category === cat).length;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? "bg-emerald-600 text-slate-950 font-bold shadow-xs border border-emerald-500"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700"
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                    isActive ? "bg-slate-950 text-emerald-400 font-bold" : "bg-slate-900 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tags bar */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs text-slate-400 pt-1 border-t border-slate-800/60">
            <Tag className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="text-[11px] text-slate-500 shrink-0 font-mono">TAGS:</span>
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="text-[11px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer font-mono"
              >
                Clear #{selectedTag} &times;
              </button>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`text-[11px] px-2 py-0.5 rounded-lg font-mono transition-colors cursor-pointer ${
                  tag === selectedTag
                    ? "bg-emerald-600 text-slate-950 font-bold"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Note Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-600" />
            <p className="text-sm font-medium text-slate-400">No wiki notes found matching your filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filtered.map((note) => {
              const catStyle = CATEGORY_STYLES[note.category] || CATEGORY_STYLES.Resources;
              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNode(note.id)}
                  className="bg-slate-950 hover:bg-slate-950/80 border border-slate-800 hover:border-emerald-500/40 rounded-xl p-4.5 transition-all duration-200 cursor-pointer flex flex-col justify-between group shadow-xs hover:shadow-md"
                >
                  <div>
                    {/* Header: Category & Date */}
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                        {note.category}
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3" />
                        {new Date(note.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors line-clamp-2">
                      {note.summary}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-xs text-slate-400 line-clamp-3 mt-1.5 leading-relaxed font-sans">
                      {note.preview}
                    </p>
                  </div>

                  {/* Footer: Tags & Links */}
                  <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1 overflow-hidden">
                      {(note.tags || []).slice(0, 2).map((t, idx) => (
                        <span key={idx} className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400 truncate max-w-[80px] font-mono text-[10px]">
                          #{t}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold text-emerald-400">
                        {note.linksCount} {note.linksCount === 1 ? "link" : "links"}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete note "${note.summary}"?`)) {
                            onDeleteNote(note.id);
                          }
                        }}
                        title="Delete note"
                        className="text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-slate-900 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
