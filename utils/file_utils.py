import os
import json
import hashlib
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Built-in zero-dependency .env loader
def load_env_file():
    env_path = BASE_DIR / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k not in os.environ:
                    os.environ[k] = v

load_env_file()

DEFAULT_CONFIG = {
    "llm": {
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "fallback_model": "openai/gpt-oss-20b",
        "temperature": 0.2,
        "max_tokens": 512
    },
    "embeddings": {
        "model": "sentence-transformers/all-MiniLM-L6-v2",
        "dimensions": 384,
        "max_content_chars": 8000
    },
    "linking": {
        "similarity_threshold": 0.75,
        "strong_link_threshold": 0.85,
        "max_links_per_note": 3
    },
    "retrieval": {
        "top_k": 5,
        "min_similarity": 0.50
    },
    "graph": {
        "max_display_nodes": 100,
        "node_colors": {
            "Projects": "#6C63FF",
            "Areas": "#F9A825",
            "Resources": "#26C6DA",
            "Archives": "#78909C"
        },
        "default_edge_color": "#AAAAAA"
    },
    "capture": {
        "max_content_chars": 8000,
        "min_content_chars": 10,
        "allowed_file_extensions": [".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg"],
        "max_file_size_mb": 10
    }
}

# Simple zero-dependency YAML parser for key-value and simple lists/dicts
def simple_yaml_load(text: str) -> dict:
    result = {}
    current_key = None
    current_sub = None
    
    for line in text.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        
        # Sub-indent (4 spaces)
        if line.startswith("    ") and current_sub and current_key:
            sub_key, val = trimmed.split(":", 1)
            sub_key = sub_key.strip()
            val = val.strip().strip('"').strip("'")
            if current_key in result and isinstance(result[current_key], dict):
                if current_sub in result[current_key] and isinstance(result[current_key][current_sub], dict):
                    result[current_key][current_sub][sub_key] = val
            continue
            
        # First level indent (2 spaces)
        if line.startswith("  ") and current_key:
            if ":" in trimmed:
                sub_key, val = trimmed.split(":", 1)
                sub_key = sub_key.strip()
                val = val.strip().strip('"').strip("'")
                if not val:
                    current_sub = sub_key
                    if current_key not in result:
                        result[current_key] = {}
                    result[current_key][sub_key] = {}
                else:
                    if val.isdigit():
                        val = int(val)
                    elif val.replace(".", "", 1).isdigit():
                        val = float(val)
                    elif val.startswith("[") and val.endswith("]"):
                        items = [x.strip().strip('"').strip("'") for x in val[1:-1].split(",") if x.strip()]
                        val = items
                    if current_key not in result or not isinstance(result[current_key], dict):
                        result[current_key] = {}
                    result[current_key][sub_key] = val
            continue
            
        # Root level
        if ":" in trimmed:
            k, v = trimmed.split(":", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if not v:
                current_key = k
                result[k] = {}
            else:
                if v.startswith("[") and v.endswith("]"):
                    items = [x.strip().strip('"').strip("'") for x in v[1:-1].split(",") if x.strip()]
                    v = items
                elif v.isdigit():
                    v = int(v)
                elif v.replace(".", "", 1).isdigit():
                    v = float(v)
                result[k] = v
                current_key = None
    return result

def simple_yaml_dump(data: dict) -> str:
    lines = []
    for k, v in data.items():
        if isinstance(v, list):
            items_str = ", ".join(f'"{x}"' if isinstance(x, str) else str(x) for x in v)
            lines.append(f"{k}: [{items_str}]")
        elif isinstance(v, dict):
            lines.append(f"{k}:")
            for sub_k, sub_v in v.items():
                lines.append(f"  {sub_k}: {sub_v}")
        else:
            lines.append(f"{k}: {v}")
    return "\n".join(lines) + "\n"

def ensure_dirs():
    """Ensure all required folders exist."""
    dirs = [
        BASE_DIR / "raw",
        BASE_DIR / "wiki" / "Projects",
        BASE_DIR / "wiki" / "Areas",
        BASE_DIR / "wiki" / "Resources",
        BASE_DIR / "wiki" / "Archives",
        BASE_DIR / "embeddings",
        BASE_DIR / "utils",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)

def load_config() -> dict:
    """Loads config.yaml with fallback to DEFAULT_CONFIG."""
    config_path = BASE_DIR / "config.yaml"
    if not config_path.exists():
        return DEFAULT_CONFIG
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = simple_yaml_load(f.read())
            # Merge defaults
            merged = DEFAULT_CONFIG.copy()
            for k, v in cfg.items():
                if isinstance(v, dict) and k in merged:
                    merged[k].update(v)
                else:
                    merged[k] = v
            return merged
    except Exception:
        return DEFAULT_CONFIG

def check_api_key() -> str:
    """Validates GROQ_API_KEY is set, returns the key or raises error."""
    key = os.getenv("GROQ_API_KEY")
    if not key or key.strip() == "your_groq_api_key_here":
        raise ValueError("GROQ_API_KEY environment variable is missing or placeholder.")
    return key.strip()

def content_hash(content: str) -> str:
    """Computes SHA-256 hex digest for duplicate detection."""
    return hashlib.sha256(content.strip().encode("utf-8")).hexdigest()

def save_raw(data: dict, path: str = None) -> str:
    """Save raw capture dict to raw/{timestamp}_{id}.json."""
    ensure_dirs()
    if path is None:
        ts_slug = data["timestamp"].replace("-", "").replace(":", "").replace("T", "_")[:15]
        file_name = f"{ts_slug}_{data['id']}.json"
        target_path = BASE_DIR / "raw" / file_name
    else:
        target_path = Path(path)
    
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return str(target_path)

def load_raw(path: str) -> dict:
    """Read a raw JSON capture file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def get_all_raw_files() -> list:
    """Returns sorted list of paths in raw/."""
    raw_dir = BASE_DIR / "raw"
    if not raw_dir.exists():
        return []
    files = [str(p) for p in raw_dir.glob("*.json")]
    return sorted(files)

def parse_markdown_with_frontmatter(text: str):
    """Parses frontmatter without external pyyaml dependency."""
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) >= 3:
        fm_text = parts[1]
        body = parts[2].lstrip("\r\n")
        try:
            metadata = simple_yaml_load(fm_text) or {}
            return metadata, body
        except Exception:
            return {}, text
    return {}, text

def load_wiki_note(path: str) -> tuple[dict, str]:
    """Reads Markdown + YAML front-matter."""
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    return parse_markdown_with_frontmatter(content)

def save_wiki_note(path: str, metadata: dict, content: str):
    """Writes Markdown + YAML front-matter."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    fm_str = simple_yaml_dump(metadata)
    full_text = f"---\n{fm_str}---\n\n{content.strip()}\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(full_text)

def get_all_wiki_files() -> list:
    """Returns sorted list of all markdown files in wiki/ (excluding .gitkeep)."""
    wiki_dir = BASE_DIR / "wiki"
    if not wiki_dir.exists():
        return []
    files = [str(p) for p in wiki_dir.glob("*/*.md")]
    return sorted(files)
