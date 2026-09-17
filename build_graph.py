#!/usr/bin/env python3
"""
Phase 4: Graph Builder (The Cartographer - Shape)
Parses all wiki notes and their links, builds nodes-and-edges structure,
cleans dangling/duplicate edges, and exports to graph.json.
"""
import sys
import os
import json
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils.file_utils import (
    load_config,
    load_wiki_note,
    get_all_wiki_files,
    ensure_dirs,
    BASE_DIR
)

def parse_notes() -> list:
    wiki_files = get_all_wiki_files()
    notes = []
    seen_ids = set()

    for wf in wiki_files:
        try:
            meta, content = load_wiki_note(wf)
            note_id = meta.get("id")
            if not note_id or note_id in seen_ids:
                continue
            seen_ids.add(note_id)

            summary = meta.get("summary", "Untitled Note")
            category = meta.get("category", "Resources")
            tags = meta.get("tags", [])
            timestamp = meta.get("timestamp", "")
            links = meta.get("links", [])

            # Node schema
            node = {
                "id": str(note_id),
                "label": summary[:50] + ("..." if len(summary) > 50 else ""),
                "category": category,
                "tags": tags,
                "summary": summary,
                "timestamp": timestamp,
                "content": content,
                "links": links
            }
            notes.append(node)
        except Exception as e:
            print(f"Error parsing note {wf}: {e}")

    return notes

def parse_edges(notes: list) -> list:
    valid_ids = {n["id"] for n in notes}
    edges_map = {}  # key: (min(id1, id2), max(id1, id2)) -> edge dict

    for node in notes:
        src = node["id"]
        for link in node.get("links", []):
            if not isinstance(link, dict):
                continue  # skip malformed legacy entries (stringified dicts)
            tgt = link.get("id")
            if not tgt or tgt == src:
                continue
            # Dangling check
            if tgt not in valid_ids:
                continue

            weight = float(link.get("score", 0.75))
            link_type = link.get("type", "weak")

            pair_key = tuple(sorted([src, tgt]))
            existing = edges_map.get(pair_key)
            if existing is None or weight > existing["weight"]:
                edges_map[pair_key] = {
                    "source": src,
                    "target": tgt,
                    "weight": round(weight, 3),
                    "type": link_type
                }

    return list(edges_map.values())

def build_graph(notes: list = None, edges: list = None) -> dict:
    if notes is None:
        notes = parse_notes()
    if edges is None:
        edges = parse_edges(notes)

    # Strip raw 'links' field from node JSON to keep clean
    clean_nodes = []
    for n in notes:
        node_copy = {k: v for k, v in n.items() if k != "links"}
        clean_nodes.append(node_copy)

    return {
        "nodes": clean_nodes,
        "edges": edges
    }

def export_graph(graph: dict = None, out_path: str = None):
    ensure_dirs()
    if graph is None:
        graph = build_graph()
    if out_path is None:
        out_path = BASE_DIR / "graph.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(graph, f, indent=2, ensure_ascii=False)

    print(f"Exported graph to {out_path}: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges.")
    return str(out_path)

if __name__ == "__main__":
    g = build_graph()
    export_graph(g)
