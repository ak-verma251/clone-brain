#!/usr/bin/env python3
"""
Phase 1: Capture Layer (The Archivist)
CLI to capture notes, URLs, or files into raw/ with UUID + timestamp.
"""
import sys
import os
import uuid
import datetime
import urllib.request
import re
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils.file_utils import load_config, save_raw, get_all_raw_files, load_raw, content_hash, ensure_dirs

config = load_config()
MAX_CONTENT_CHARS = config.get("capture", {}).get("max_content_chars", 8000)
MIN_CONTENT_CHARS = config.get("capture", {}).get("min_content_chars", 10)
ALLOWED_EXTENSIONS = tuple(config.get("capture", {}).get("allowed_file_extensions", [".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg"]))

def check_duplicate(content: str) -> bool:
    chash = content_hash(content)
    for raw_path in get_all_raw_files():
        try:
            item = load_raw(raw_path)
            if content_hash(item.get("content", "")) == chash:
                return True
        except Exception:
            continue
    return False

def capture_note(text: str) -> dict:
    text = text.strip()
    if len(text) < MIN_CONTENT_CHARS:
        raise ValueError(f"Note content too short (min {MIN_CONTENT_CHARS} characters).")
    
    if check_duplicate(text):
        print("Warning: Duplicate content detected. Skipping capture.")
        return None

    if len(text) > MAX_CONTENT_CHARS:
        print(f"Warning: Truncating content to {MAX_CONTENT_CHARS} characters.")
        text = text[:MAX_CONTENT_CHARS]

    item = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "type": "note",
        "source": "cli_note",
        "content": text,
        "filename": None
    }
    saved_path = save_raw(item)
    print(f"Captured note to {saved_path} (ID: {item['id']})")
    return item

def capture_url(url: str) -> dict:
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise ValueError("URL must start with http:// or https://")

    print(f"Fetching URL: {url}...")
    content = ""
    item_type = "url"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SecondSelf/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            html_raw = resp.read().decode("utf-8", errors="ignore")
            # Strip tags and normalize text
            clean_text = re.sub(r"<script.*?</script>", " ", html_raw, flags=re.DOTALL | re.IGNORECASE)
            clean_text = re.sub(r"<style.*?</style>", " ", clean_text, flags=re.DOTALL | re.IGNORECASE)
            clean_text = re.sub(r"<[^>]+>", " ", clean_text)
            clean_text = re.sub(r"\s+", " ", clean_text).strip()
            content = clean_text
    except Exception as e:
        print(f"URL fetch failed: {e}. Saving as url_failed.")
        item_type = "url_failed"
        content = f"Failed to fetch content from {url}. Error: {str(e)}"

    if len(content) > MAX_CONTENT_CHARS:
        content = content[:MAX_CONTENT_CHARS]

    if item_type == "url" and check_duplicate(content):
        print("Warning: Duplicate content detected from URL. Skipping.")
        return None

    item = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "type": item_type,
        "source": url,
        "content": content,
        "filename": None
    }
    saved_path = save_raw(item)
    print(f"Captured URL to {saved_path} (ID: {item['id']})")
    return item

def capture_file(filepath: str) -> dict:
    p = Path(filepath)
    if not p.exists():
        raise FileNotFoundError(f"File not found: {filepath}")
    
    if p.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File extension '{p.suffix}' not allowed. Allowed: {ALLOWED_EXTENSIONS}")

    content = ""
    if p.suffix.lower() in [".txt", ".md"]:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    elif p.suffix.lower() == ".pdf":
        try:
            import fitz  # PyMuPDF if installed
            doc = fitz.open(p)
            text_pages = [page.get_text() for page in doc]
            content = "\n\n".join(text_pages)
        except Exception:
            try:
                import zlib
                with open(p, "rb") as f:
                    raw_bytes = f.read()
                # Decompress FlateDecode streams
                streams = re.findall(rb"stream\r?\n([\s\S]*?)\r?\nendstream", raw_bytes)
                extracted_chunks = []
                for s in streams:
                    decomp = None
                    try:
                        decomp = zlib.decompress(s)
                    except Exception:
                        decomp = s
                    # Find text in parentheses Tj or TJ
                    tj_matches = re.findall(rb"\(([^()]+)\)\s*(?:Tj|TJ)", decomp)
                    if tj_matches:
                        for m in tj_matches:
                            try:
                                txt = m.decode("utf-8", errors="ignore").strip()
                                if txt:
                                    extracted_chunks.append(txt)
                            except Exception:
                                pass
                if extracted_chunks:
                    content = " ".join(extracted_chunks)
                else:
                    matches = re.findall(rb"[\x20-\x7E]{4,}", raw_bytes)
                    content = b" ".join(matches).decode("utf-8", errors="ignore")
            except Exception:
                with open(p, "rb") as f:
                    raw_bytes = f.read()
                matches = re.findall(rb"[\x20-\x7E]{4,}", raw_bytes)
                content = b" ".join(matches).decode("utf-8", errors="ignore")
    else:
        content = f"Binary file captured: {p.name}"

    content = content.strip()
    if len(content) < MIN_CONTENT_CHARS:
        content = f"File {p.name} contains minimal or binary content."

    if len(content) > MAX_CONTENT_CHARS:
        content = content[:MAX_CONTENT_CHARS]

    if check_duplicate(content):
        print("Warning: Duplicate content detected from file. Skipping.")
        return None

    item = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "type": "file",
        "source": str(p.absolute()),
        "content": content,
        "filename": p.name
    }
    saved_path = save_raw(item)
    print(f"Captured file to {saved_path} (ID: {item['id']})")
    return item

if __name__ == "__main__":
    ensure_dirs()
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python capture.py note \"your note text here\"")
        print("  python capture.py url \"https://example.com\"")
        print("  python capture.py file ./path/to/document.pdf")
        sys.exit(1)

    cmd = sys.argv[1].lower()
    arg = sys.argv[2]
    if cmd == "note":
        capture_note(arg)
    elif cmd == "url":
        capture_url(arg)
    elif cmd == "file":
        capture_file(arg)
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
