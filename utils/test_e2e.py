#!/usr/bin/env python3
"""
Phase 8: End-to-End Integration Testing Protocol
Validates all layers: capture -> classify -> link -> graph -> ask.
"""
import sys
import os
import json
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from capture import capture_note, capture_url, capture_file
from classify import classify_single, classify_all
from link import link_all, load_all_embeddings
from build_graph import build_graph, export_graph
from ask import ask
from utils.file_utils import get_all_wiki_files, load_config

def run_e2e_test() -> dict:
    results = {
        "passed": False,
        "steps": [],
        "errors": []
    }

    def record_step(name: str, success: bool, details: str = ""):
        results["steps"].append({
            "name": name,
            "success": success,
            "details": details
        })
        status = "PASSED" if success else "FAILED"
        print(f"[{status}] {name} - {details}")
        if not success:
            results["errors"].append(f"{name}: {details}")

    print("==================================================")
    print("      SecondSelf - End-to-End Test Protocol       ")
    print("==================================================")

    # 1. Capture Note
    try:
        note = capture_note("Deep work requires uninterrupted blocks of 90 to 120 minutes with zero notifications to reach state of flow.")
        record_step("1. Capture Text Note", bool(note), f"Created note ID {note['id'] if note else 'skipped'}")
    except Exception as e:
        record_step("1. Capture Text Note", False, str(e))

    # 2. Capture URL
    try:
        url_item = capture_url("https://en.wikipedia.org/wiki/Getting_Things_Done")
        record_step("2. Capture URL", bool(url_item), f"Captured source {url_item['source'] if url_item else 'skipped'}")
    except Exception as e:
        record_step("2. Capture URL", False, str(e))

    # 3. Classify all
    try:
        classify_all()
        wiki_files = get_all_wiki_files()
        record_step("3. LLM PARA Classification", len(wiki_files) >= 2, f"Total wiki notes in storage: {len(wiki_files)}")
    except Exception as e:
        record_step("3. LLM PARA Classification", False, str(e))

    # 4. Link & Embeddings
    try:
        link_all()
        embeds = load_all_embeddings()
        record_step("4. Embeddings & Semantic Linking", len(embeds) >= 2, f"Total embeddings generated: {len(embeds)}")
    except Exception as e:
        record_step("4. Embeddings & Semantic Linking", False, str(e))

    # 5. Build Graph
    try:
        g = build_graph()
        export_graph(g)
        nodes_count = len(g.get("nodes", []))
        edges_count = len(g.get("edges", []))
        record_step("5. Graph Builder Export", nodes_count >= 2, f"Exported graph with {nodes_count} nodes and {edges_count} edges.")
    except Exception as e:
        record_step("5. Graph Builder Export", False, str(e))

    # 6. RAG Query Engine
    try:
        res = ask("What is required for deep work?")
        ans = res.get("answer", "")
        sources = res.get("sources", [])
        has_content = len(ans) > 10 and "I don't have information" not in ans
        record_step("6. RAG Oracle Synthesis", has_content or len(sources) > 0, f"Answer length: {len(ans)} chars, Citations: {len(sources)}")
    except Exception as e:
        record_step("6. RAG Oracle Synthesis", False, str(e))

    all_passed = all(s["success"] for s in results["steps"])
    results["passed"] = all_passed
    print("==================================================")
    print(f"Overall Test Result: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    print("==================================================")
    return results

if __name__ == "__main__":
    res = run_e2e_test()
    sys.exit(0 if res["passed"] else 1)
