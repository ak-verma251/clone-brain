import React, { useEffect, useRef, useState } from "react";
import { Network } from "vis-network";
import { DataSet } from "vis-data";
import { Search, ZoomIn, ZoomOut, Maximize2, Pause, Play, RefreshCw, Filter } from "lucide-react";
import { CategoryType, GraphData, GraphNode } from "../types";

interface BrainGraphProps {
  data: GraphData;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onRebuildGraph: () => void;
  isLoading: boolean;
}

const PARA_COLORS: Record<CategoryType, string> = {
  Projects: "#6C63FF",
  Areas: "#F9A825",
  Resources: "#26C6DA",
  Archives: "#78909C",
};

export const BrainGraph: React.FC<BrainGraphProps> = ({
  data,
  selectedNodeId,
  onSelectNode,
  onRebuildGraph,
  isLoading,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize and update network
  useEffect(() => {
    if (!containerRef.current || !data) return;

    // Filter nodes by category and search
    let filteredNodes = data.nodes;
    if (selectedCategory !== "All") {
      filteredNodes = filteredNodes.filter((n) => n.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (n) =>
          n.summary.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    const filteredIds = new Set(filteredNodes.map((n) => n.id));

    // Map to vis nodes
    const visNodes = filteredNodes.map((n) => {
      const isSelected = n.id === selectedNodeId;
      const baseColor = PARA_COLORS[n.category] || "#94A3B8";

      const tagsHtml = (n.tags || []).map((t) => `#${t}`).join(" ");
      const tooltip = `<div style="padding:4px; max-width:260px; font-family:sans-serif; color:#f8fafc;">
        <strong style="font-size:13px; color:#ffffff;">${n.summary}</strong>
        <div style="font-size:11px; color:#94a3b8; margin: 3px 0;">${n.category} &bull; ${tagsHtml}</div>
        <div style="font-size:11px; line-height:1.4; color:#cbd5e1;">${n.content.slice(0, 160)}...</div>
      </div>`;

      return {
        id: n.id,
        label: n.summary.length > 28 ? n.summary.slice(0, 28) + "..." : n.summary,
        title: tooltip,
        color: {
          background: baseColor,
          border: isSelected ? "#FFFFFF" : baseColor,
          highlight: {
            background: baseColor,
            border: "#FFFFFF",
          },
        },
        borderWidth: isSelected ? 3 : 1,
        shape: "dot",
        size: isSelected ? 24 : 16,
        font: {
          color: "#E2E8F0",
          size: 11,
          face: "Inter, -apple-system, sans-serif",
          strokeWidth: 2,
          strokeColor: "#0b0f19",
        },
      };
    });

    // Map to vis edges
    const visEdges = data.edges
      .filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target))
      .map((e) => {
        const isConnectedToSelected = selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId);
        const isStrong = e.type === "strong";
        return {
          from: e.source,
          to: e.target,
          width: isConnectedToSelected ? 3.5 : isStrong ? 2.5 : 1.2,
          color: {
            color: isConnectedToSelected ? "#60A5FA" : isStrong ? "#94A3B8" : "#334155",
            highlight: "#60A5FA",
          },
          hoverWidth: 1.5,
          title: `Semantic Similarity: ${(e.weight * 100).toFixed(1)}% (${e.type})`,
        };
      });

    const nodesDataSet = new DataSet(visNodes);
    const edgesDataSet = new DataSet(visEdges);

    const options = {
      physics: {
        enabled: physicsEnabled,
        solver: "forceAtlas2Based",
        forceAtlas2Based: {
          gravitationalConstant: -40,
          centralGravity: 0.006,
          springLength: 110,
          springConstant: 0.16,
          damping: 0.85,
        },
        maxVelocity: 50,
        stabilization: {
          iterations: 120,
          fit: true,
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 120,
        zoomView: true,
        dragView: true,
      },
    };

    const network = new Network(containerRef.current, { nodes: nodesDataSet, edges: edgesDataSet }, options);
    networkRef.current = network;

    network.on("click", (params) => {
      if (params.nodes.length > 0) {
        onSelectNode(params.nodes[0] as string);
      }
    });

    // ResizeObserver to handle container adjustments cleanly
    const ro = new ResizeObserver(() => {
      network.redraw();
      network.fit();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      network.destroy();
    };
  }, [data, selectedCategory, searchQuery, selectedNodeId, physicsEnabled]);

  const togglePhysics = () => {
    setPhysicsEnabled((prev) => !prev);
    if (networkRef.current) {
      networkRef.current.setOptions({ physics: { enabled: !physicsEnabled } });
    }
  };

  const fitView = () => {
    networkRef.current?.fit({ animation: { duration: 600, easingFunction: "easeInOutQuad" } });
  };

  const zoomIn = () => {
    if (!networkRef.current) return;
    const scale = networkRef.current.getScale();
    networkRef.current.moveTo({ scale: scale * 1.3, animation: true });
  };

  const zoomOut = () => {
    if (!networkRef.current) return;
    const scale = networkRef.current.getScale();
    networkRef.current.moveTo({ scale: scale / 1.3, animation: true });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden relative shadow-lg">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900 border-b border-slate-800 z-10">
        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5 text-emerald-500" /> PARA:
          </span>
          {(["All", "Projects", "Areas", "Resources", "Archives"] as const).map((cat) => {
            const isAll = cat === "All";
            const color = isAll ? "#94A3B8" : PARA_COLORS[cat as CategoryType];
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700"
                }`}
              >
                {!isAll && (
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: color }}
                  />
                )}
                {cat}
              </button>
            );
          })}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search graph nodes or tags..."
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 rounded-xl pl-8 pr-3 py-1.5 w-48 sm:w-60 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-sans"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          </div>

          <button
            onClick={fitView}
            title="Fit to screen"
            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={zoomIn}
            title="Zoom In"
            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={zoomOut}
            title="Zoom Out"
            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={togglePhysics}
            title={physicsEnabled ? "Pause physics" : "Enable physics"}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              physicsEnabled
                ? "bg-slate-950 text-emerald-400 border-emerald-500/40"
                : "bg-slate-950 text-amber-400 border-amber-500/40"
            }`}
          >
            {physicsEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onRebuildGraph}
            disabled={isLoading}
            title="Re-compute semantic embeddings & links"
            className="p-2 bg-slate-950 hover:bg-slate-800 text-emerald-400 rounded-xl border border-emerald-500/30 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Network Canvas */}
      <div ref={containerRef} className="flex-1 w-full h-[600px] min-h-[500px] bg-slate-950" />

      {/* Bottom Floating Legend */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950/95 border border-slate-800 rounded-xl backdrop-blur-md text-xs text-slate-400 shadow-xl pointer-events-auto">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PARA_COLORS.Projects }} />
            <span className="text-slate-300 font-medium">Projects</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PARA_COLORS.Areas }} />
            <span className="text-slate-300 font-medium">Areas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PARA_COLORS.Resources }} />
            <span className="text-slate-300 font-medium">Resources</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PARA_COLORS.Archives }} />
            <span className="text-slate-300 font-medium">Archives</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-emerald-400 inline-block" /> Strong Link (&ge;0.85)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-px bg-slate-600 inline-block" /> Weak Link (&ge;0.75)
          </span>
          <span className="text-emerald-400 font-mono font-medium ml-2">
            {data.nodes.length} nodes &bull; {data.edges.length} connections
          </span>
        </div>
      </div>
    </div>
  );
};
