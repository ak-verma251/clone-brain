import json
import html

def build_vis_html(nodes_js: str, edges_js: str, height: int = 700) -> str:
    """Generates HTML string embedding vis-network force-directed graph."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    body, html {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0F172A; color: #F8FAFC; }}
    #mynetwork {{ width: 100%; height: {height}px; border: 1px solid #334155; border-radius: 12px; }}
    .legend {{ display: flex; gap: 16px; padding: 10px 16px; background: #1E293B; border-radius: 8px; font-size: 13px; margin-top: 8px; flex-wrap: wrap; }}
    .legend-item {{ display: flex; align-items: center; gap: 6px; }}
    .dot {{ width: 12px; height: 12px; border-radius: 50%; display: inline-block; }}
  </style>
</head>
<body>
  <div id="mynetwork"></div>
  <div class="legend">
    <div class="legend-item"><span class="dot" style="background:#6C63FF"></span> Projects</div>
    <div class="legend-item"><span class="dot" style="background:#F9A825"></span> Areas</div>
    <div class="legend-item"><span class="dot" style="background:#26C6DA"></span> Resources</div>
    <div class="legend-item"><span class="dot" style="background:#78909C"></span> Archives</div>
    <div style="margin-left:auto; color:#94A3B8; font-size:12px;">Thick edges = Strong links (&ge;0.85) &bull; Drag, zoom, click nodes</div>
  </div>

  <script type="text/javascript">
    const rawNodes = {nodes_js};
    const rawEdges = {edges_js};

    const colorMap = {{
      "Projects": "#6C63FF",
      "Areas": "#F9A825",
      "Resources": "#26C6DA",
      "Archives": "#78909C"
    }};

    const visNodes = rawNodes.map(n => {{
      const col = colorMap[n.category] || "#94A3B8";
      const tagsStr = (n.tags || []).map(t => "#" + t).join(" ");
      return {{
        id: n.id,
        label: n.label,
        title: "<b>" + n.summary + "</b><br><i>" + n.category + " " + tagsStr + "</i><br><br>" + (n.content || "").substring(0, 200) + "...",
        color: {{
          background: col,
          border: "#FFFFFF",
          highlight: {{ background: col, border: "#FFD700" }}
        }},
        shape: "dot",
        size: 18 + (n.links ? n.links.length * 2 : 0),
        font: {{ color: "#F8FAFC", size: 12, face: "sans-serif" }}
      }};
    }});

    const visEdges = rawEdges.map(e => ({{
      from: e.source,
      to: e.target,
      width: e.type === "strong" ? 3.0 : 1.2,
      color: {{
        color: e.type === "strong" ? "#CBD5E1" : "#475569",
        highlight: "#60A5FA"
      }},
      title: "Similarity: " + e.weight + " (" + e.type + ")"
    }}));

    const container = document.getElementById("mynetwork");
    const data = {{
      nodes: new vis.DataSet(visNodes),
      edges: new vis.DataSet(visEdges)
    }};

    const options = {{
      physics: {{
        forceAtlas2Based: {{
          gravitationalConstant: -35,
          centralGravity: 0.005,
          springLength: 100,
          springConstant: 0.18
        }},
        maxVelocity: 50,
        solver: "forceAtlas2Based",
        timestep: 0.35,
        stabilization: {{ iterations: 150 }}
      }},
      interaction: {{
        hover: true,
        tooltipDelay: 100,
        zoomView: true,
        dragView: true
      }}
    }};

    const network = new vis.Network(container, data, options);
  </script>
</body>
</html>"""
