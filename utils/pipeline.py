import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from classify import classify_single
from link import run_link_pipeline
from build_graph import export_graph
from utils.file_utils import get_all_wiki_files

def run_full_pipeline(raw_path: str) -> str:
    """Runs capture -> classify -> embed -> link -> build_graph."""
    print(f"[Pipeline] 1. Classifying {raw_path}...")
    wiki_path = classify_single(raw_path)
    if not wiki_path:
        # Note was already classified or skipped, find its wiki file
        raw_stem = Path(raw_path).stem
        # check if ends in uuid
        parts = raw_stem.split("_")
        raw_id = parts[-1] if len(parts) > 1 else raw_stem
        for wf in get_all_wiki_files():
            if raw_id in wf:
                wiki_path = wf
                break

    if wiki_path:
        print(f"[Pipeline] 2. Embedding & auto-linking {wiki_path}...")
        run_link_pipeline(wiki_path)

    print("[Pipeline] 3. Rebuilding graph.json...")
    export_graph()
    print("[Pipeline] Complete!")
    return wiki_path
