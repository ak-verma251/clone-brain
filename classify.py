#!/usr/bin/env python3
"""
Phase 2: LLM Classification (The Librarian - Sorting Hat)
Auto-classifies raw captures using Groq (Llama 3) into PARA:
Projects | Areas | Resources | Archives, generates tags and summary,
and writes to wiki/{category}/{id}.md
"""
import sys
import os
import json
import re
import time
import urllib.request
import urllib.error
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils.file_utils import (
    load_config,
    check_api_key,
    load_raw,
    get_all_raw_files,
    save_wiki_note,
    ensure_dirs,
    get_all_wiki_files,
    BASE_DIR
)

VALID_CATEGORIES = {"Projects", "Areas", "Resources", "Archives"}

def build_prompt(content: str) -> str:
    return f"""You are a personal knowledge manager. Given the following note content,
respond ONLY with a valid JSON object and nothing else:
{{
  "category": "one of: Projects | Areas | Resources | Archives",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "one concise sentence summarizing this note"
}}

Note content:
{content}"""

def call_groq(prompt: str, api_key: str, model: str = "openai/gpt-oss-120b", temperature: float = 0.2) -> str:
    """Calls Groq Chat Completion API via standard HTTPS with exponential backoff."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "SecondSelf-Classifier/1.0"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are an expert PARA knowledge organizer. You respond strictly in valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature,
        "max_tokens": 512,
        "response_format": {"type": "json_object"}
    }
    
    data = json.dumps(payload).encode("utf-8")
    
    max_retries = 3
    base_delay = 2.0
    
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                res_body = resp.read().decode("utf-8")
                res_json = json.loads(res_body)
                return res_json["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                sleep_time = base_delay * (2 ** attempt)
                print(f"Rate limited (429). Retrying in {sleep_time}s...")
                time.sleep(sleep_time)
            elif attempt < max_retries - 1:
                print(f"Error {e.code}. Falling back to openai/gpt-oss-20b...")
                payload["model"] = "openai/gpt-oss-20b"
                data = json.dumps(payload).encode("utf-8")
                time.sleep(2)
            else:
                raise e
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
            else:
                raise e

def parse_response(raw_response: str) -> dict:
    """Extract and validate JSON from model output."""
    try:
        data = json.loads(raw_response)
    except Exception:
        # Regex search for JSON block
        match = re.search(r"\{[\s\S]*\}", raw_response)
        if match:
            try:
                data = json.loads(match.group(0))
            except Exception:
                data = {}
        else:
            data = {}

    category = str(data.get("category", "")).strip().capitalize()
    if category not in VALID_CATEGORIES:
        category = "Resources"
        
    tags = data.get("tags", [])
    if not isinstance(tags, list):
        tags = ["knowledge"]
    tags = [str(t).strip().lower() for t in tags if str(t).strip()]
    if not tags:
        tags = ["knowledge"]

    summary = str(data.get("summary", "")).strip()
    if not summary or summary.lower() == "none":
        summary = "Knowledge Note"

    return {
        "category": category,
        "tags": tags[:5],
        "summary": summary
    }

def is_already_classified(raw_id: str) -> bool:
    for wiki_path in get_all_wiki_files():
        if f"{raw_id}.md" in wiki_path:
            return True
    return False

def classify_single(raw_path: str, force: bool = False) -> str:
    api_key = check_api_key()
    config = load_config()
    model = config.get("llm", {}).get("model", "llama-3.3-70b-versatile")
    temperature = config.get("llm", {}).get("temperature", 0.2)

    raw_data = load_raw(raw_path)
    raw_id = raw_data.get("id")

    if not force and is_already_classified(raw_id):
        print(f"Note {raw_id} is already classified. Skipping (use --force to reclassify).")
        return None

    content = raw_data.get("content", "")
    prompt = build_prompt(content[:4000])

    print(f"Calling Groq LLM ({model}) for note {raw_id}...")
    llm_output = call_groq(prompt, api_key, model=model, temperature=temperature)
    parsed = parse_response(llm_output)

    metadata = {
        "id": raw_id,
        "timestamp": raw_data.get("timestamp"),
        "type": raw_data.get("type", "note"),
        "source": raw_data.get("source", ""),
        "category": parsed["category"],
        "tags": parsed["tags"],
        "summary": parsed["summary"],
        "links": [],
        "embedding_file": f"embeddings/{raw_id}.npy"
    }

    wiki_path = BASE_DIR / "wiki" / parsed["category"] / f"{raw_id}.md"
    body = f"# {parsed['summary']}\n\n{content}"
    save_wiki_note(str(wiki_path), metadata, body)

    print(f"Classified -> {parsed['category']} | Tags: {parsed['tags']} | Summary: {parsed['summary']}")
    print(f"Saved to {wiki_path}")
    return str(wiki_path)

def classify_all(force: bool = False):
    ensure_dirs()
    raw_files = get_all_raw_files()
    print(f"Found {len(raw_files)} raw files to check...")
    classified_count = 0
    for rf in raw_files:
        try:
            res = classify_single(rf, force=force)
            if res:
                classified_count += 1
                time.sleep(0.5)  # respectful pacing
        except Exception as e:
            print(f"Error classifying {rf}: {e}")
    print(f"Batch classification complete. Classified {classified_count} new notes.")

if __name__ == "__main__":
    ensure_dirs()
    force_flag = "--force" in sys.argv
    if "--all" in sys.argv:
        classify_all(force=force_flag)
    elif "--file" in sys.argv:
        idx = sys.argv.index("--file")
        if idx + 1 < len(sys.argv):
            classify_single(sys.argv[idx + 1], force=force_flag)
        else:
            print("Missing file path for --file")
    else:
        print("Usage:")
        print("  python classify.py --all [--force]")
        print("  python classify.py --file raw/example.json [--force]")
