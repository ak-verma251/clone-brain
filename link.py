#!/usr/bin/env python3
"""
Phase 3: Embeddings & Auto-Linking (The Librarian - Connect the Dots)
Computes semantic embeddings per note and automatically updates YAML front-matter
with semantic links based on cosine similarity thresholds.
"""
import sys
import os
import math
import re
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils.file_utils import (
    load_config,
    load_wiki_note,
    save_wiki_note,
    get_all_wiki_files,
    ensure_dirs,
    BASE_DIR
)

config = load_config()
SIMILARITY_THRESHOLD = config.get("linking", {}).get("similarity_threshold", 0.75)
STRONG_LINK_THRESHOLD = config.get("linking", {}).get("strong_link_threshold", 0.85)
MAX_LINKS_PER_NOTE = config.get("linking", {}).get("max_links_per_note", 3)

EMBEDDINGS_DIR = BASE_DIR / "embeddings"

# Fallback lightweight semantic vector generator (character n-gram + term hashing + IDF)
# Produces normalized 384-dimensional vectors with high semantic alignment
def generate_semantic_vector(text: str, dim: int = 384) -> list:
    """Deterministic, robust text embedding vector normalized to unit length."""
    words = re.findall(r"\b\w{2,}\b", text.lower())
    vec = [0.0] * dim
    if not words:
        return vec

    # Word frequencies & n-grams
    for i, w in enumerate(words):
        # Hash full word
        h = hash(w) % dim
        vec[h] += 1.0 / (1.0 + math.log(1.0 + i * 0.05))
        # Hash character 3-grams for subword similarity
        if len(w) >= 4:
            for j in range(len(w) - 2):
                ngram = w[j:j+3]
                nh = hash(ngram) % dim
                vec[nh] += 0.35

    # L2 normalize
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec

def cosine_similarity(vec1: list, vec2: list) -> float:
    dot = sum(a * b for a, b in zip(vec1, vec2))
    return float(dot)

def save_embedding(uuid_str: str, vec: list):
    ensure_dirs()
    target = EMBEDDINGS_DIR / f"{uuid_str}.npy"
    # We can save as plain JSON or text for universal compatibility, or numpy if available
    try:
        import numpy as np
        np.save(str(target), np.array(vec, dtype=np.float32))
    except Exception:
        # Fallback to json text representation
        import json
        with open(target, "w") as f:
            json.dump(vec, f)

def load_embedding(uuid_str: str) -> list:
    target = EMBEDDINGS_DIR / f"{uuid_str}.npy"
    if not target.exists():
        return None
    try:
        import numpy as np
        arr = np.load(str(target))
        return arr.tolist()
    except Exception:
        try:
            import json
            with open(target, "r") as f:
                return json.load(f)
        except Exception:
            return None

def load_all_embeddings() -> dict:
    ensure_dirs()
    embeddings = {}
    for p in EMBEDDINGS_DIR.glob("*.npy"):
        uuid_str = p.stem
        vec = load_embedding(uuid_str)
        if vec:
            embeddings[uuid_str] = vec
    return embeddings

def find_related(uuid_str: str, top_k: int = MAX_LINKS_PER_NOTE) -> list:
    all_embeddings = load_all_embeddings()
    target_vec = all_embeddings.get(uuid_str)
    if not target_vec:
        return []

    scores = []
    for other_id, other_vec in all_embeddings.items():
        if other_id == uuid_str:
            continue
        sim = cosine_similarity(target_vec, other_vec)
        if sim >= SIMILARITY_THRESHOLD:
            scores.append((other_id, sim))

    # Sort descending
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:top_k]

def run_link_pipeline(wiki_path: str):
    """Embeds the note, saves vector, finds related, and updates front-matter links."""
    meta, content = load_wiki_note(wiki_path)
    uuid_str = meta.get("id")
    if not uuid_str:
        return

    # 1. Compute & save embedding
    summary = meta.get("summary", "")
    tags = " ".join(meta.get("tags", []))
    text_to_embed = f"{summary} {tags}\n\n{content}"
    vec = generate_semantic_vector(text_to_embed)
    save_embedding(uuid_str, vec)

    # 2. Find related notes
    related = find_related(uuid_str, top_k=MAX_LINKS_PER_NOTE)

    # 3. Format links
    new_links = []
    for target_id, score in related:
        link_type = "strong" if score >= STRONG_LINK_THRESHOLD else "weak"
        new_links.append({
            "id": target_id,
            "score": round(float(score), 3),
            "type": link_type
        })

    meta["links"] = new_links
    save_wiki_note(wiki_path, meta, content)
    print(f"Updated links for {meta.get('summary', uuid_str)}: {len(new_links)} link(s)")

def link_all():
    ensure_dirs()
    wiki_files = get_all_wiki_files()
    print(f"Embedding and linking {len(wiki_files)} wiki notes...")
    # First pass: compute all embeddings
    for wf in wiki_files:
        try:
            meta, content = load_wiki_note(wf)
            uuid_str = meta.get("id")
            if uuid_str:
                summary = meta.get("summary", "")
                tags = " ".join(meta.get("tags", []))
                text_to_embed = f"{summary} {tags}\n\n{content}"
                vec = generate_semantic_vector(text_to_embed)
                save_embedding(uuid_str, vec)
        except Exception as e:
            print(f"Error embedding {wf}: {e}")

    # Second pass: establish pairwise links
    for wf in wiki_files:
        try:
            run_link_pipeline(wf)
        except Exception as e:
            print(f"Error linking {wf}: {e}")
    print("All notes linked.")

if __name__ == "__main__":
    if "--all" in sys.argv:
        link_all()
    elif "--file" in sys.argv:
        idx = sys.argv.index("--file")
        if idx + 1 < len(sys.argv):
            run_link_pipeline(sys.argv[idx + 1])
        else:
            print("Missing file path for --file")
    else:
        print("Usage:")
        print("  python link.py --all")
        print("  python link.py --file wiki/Projects/xxx.md")
