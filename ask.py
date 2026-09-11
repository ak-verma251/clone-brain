#!/usr/bin/env python3
"""
Phase 6: RAG Query Engine (The Oracle - Ask Anything)
Embeds question, retrieves top-K notes by cosine similarity, synthesizes
cited answer using Groq (Llama 3), and returns {answer, sources}.
"""
import sys
import os
import json
import urllib.request
import urllib.error
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils.file_utils import (
    load_config,
    check_api_key,
    load_wiki_note,
    get_all_wiki_files,
    BASE_DIR
)
from link import generate_semantic_vector, cosine_similarity, load_all_embeddings

config = load_config()
TOP_K = config.get("retrieval", {}).get("top_k", 5)
MIN_SIMILARITY = config.get("retrieval", {}).get("min_similarity", 0.50)
LLM_MODEL = config.get("llm", {}).get("model", "llama-3.3-70b-versatile")
LLM_TEMP = config.get("llm", {}).get("temperature", 0.2)

def embed_question(question: str) -> list:
    question = question.strip()[:512]
    return generate_semantic_vector(question)

def retrieve_top_k(query_vec: list, k: int = TOP_K, min_sim: float = MIN_SIMILARITY) -> list:
    all_embeddings = load_all_embeddings()
    if not all_embeddings:
        return []

    # Map of id to wiki file
    id_to_file = {}
    for wf in get_all_wiki_files():
        try:
            meta, _ = load_wiki_note(wf)
            if meta.get("id"):
                id_to_file[meta["id"]] = wf
        except Exception:
            continue

    scores = []
    for nid, vec in all_embeddings.items():
        sim = cosine_similarity(query_vec, vec)
        if sim >= min_sim:
            scores.append((nid, sim))

    scores.sort(key=lambda x: x[1], reverse=True)
    top_matches = scores[:k]

    retrieved = []
    for nid, score in top_matches:
        wf = id_to_file.get(nid)
        if not wf:
            continue
        try:
            meta, content = load_wiki_note(wf)
            retrieved.append({
                "id": nid,
                "title": meta.get("summary", "Note"),
                "category": meta.get("category", "Resources"),
                "tags": meta.get("tags", []),
                "content": content,
                "score": round(float(score), 3)
            })
        except Exception:
            continue

    return retrieved

def build_rag_prompt(question: str, retrieved: list) -> str:
    notes_block = []
    for idx, item in enumerate(retrieved, start=1):
        # Truncate content for context window safety
        safe_content = item["content"][:500].strip()
        notes_block.append(f"[{idx}] {item['title']}:\n{safe_content}")

    notes_text = "\n\n".join(notes_block)

    return f"""You are a personal assistant with access to the user's private knowledge base.
Answer the question using ONLY the notes provided below.
If the answer is not in the notes, say "I don't have information about this."

NOTES:
{notes_text}

QUESTION: {question}

Answer concisely and accurately. Cite relevant notes by their number (e.g., [1], [2])."""

def synthesize_answer(prompt: str, api_key: str = None) -> str:
    if api_key is None:
        api_key = check_api_key()

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "SecondSelf-Oracle/1.0"
    }
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": "You are a faithful personal knowledge assistant. Ground answers strictly in provided notes and cite notes using [1], [2]."},
            {"role": "user", "content": prompt}
        ],
        "temperature": LLM_TEMP,
        "max_tokens": 512
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res_body = resp.read().decode("utf-8")
            res_json = json.loads(res_body)
            return res_json["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        # Fallback to openai/gpt-oss-20b
        payload["model"] = "openai/gpt-oss-20b"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp2:
            res_body2 = resp2.read().decode("utf-8")
            res_json2 = json.loads(res_body2)
            return res_json2["choices"][0]["message"]["content"]

def attach_citations(answer: str, retrieved: list) -> dict:
    sources = []
    for idx, item in enumerate(retrieved, start=1):
        sources.append({
            "index": idx,
            "id": item["id"],
            "title": item["title"],
            "category": item["category"],
            "score": item["score"],
            "preview": item["content"][:200]
        })
    return {
        "answer": answer,
        "sources": sources
    }

def ask(question: str) -> dict:
    question = question.strip()
    if not question:
        return {"answer": "Please ask a question.", "sources": []}

    all_files = get_all_wiki_files()
    if not all_files:
        return {
            "answer": "Your SecondSelf knowledge base is currently empty. Capture some notes first!",
            "sources": []
        }

    q_vec = embed_question(question)
    retrieved = retrieve_top_k(q_vec, k=TOP_K, min_sim=MIN_SIMILARITY)

    if not retrieved:
        return {
            "answer": "I don't have enough relevant notes to answer this.",
            "sources": []
        }

    try:
        prompt = build_rag_prompt(question, retrieved)
        answer = synthesize_answer(prompt)
        return attach_citations(answer, retrieved)
    except Exception as e:
        return {
            "answer": f"Unable to generate response from LLM ({str(e)}). Here are the most relevant notes retrieved.",
            "sources": [
                {"index": i+1, "id": r["id"], "title": r["title"], "category": r["category"], "score": r["score"], "preview": r["content"][:200]}
                for i, r in enumerate(retrieved)
            ]
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ask.py \"your question here\"")
        sys.exit(1)

    q = " ".join(sys.argv[1:])
    print(f"\nAsking: '{q}'\n")
    res = ask(q)
    print("--- ANSWER ---")
    print(res["answer"])
    print("\n--- SOURCES ---")
    for s in res["sources"]:
        print(f"[{s['index']}] {s['title']} ({s['category']}) - score: {s['score']}")
