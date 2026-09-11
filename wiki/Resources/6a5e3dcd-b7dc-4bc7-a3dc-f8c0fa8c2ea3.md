---
id: 6a5e3dcd-b7dc-4bc7-a3dc-f8c0fa8c2ea3
timestamp: 2026-08-11T00:13:29.787Z
type: note
source: initial_seed
category: Resources
tags: null
summary: Sentence Transformers & MiniLM Vector Spaces
links:
  - id: 73bee3dd-efe3-4c8c-a125-8b05869ecf35
    score: 0.803
    type: weak
embedding_file: embeddings/6a5e3dcd-b7dc-4bc7-a3dc-f8c0fa8c2ea3.npy
---

Overview of sentence-transformers/all-MiniLM-L6-v2:
- Maps sentences and paragraphs to a 384-dimensional dense vector space.
- Optimized for semantic search, clustering, and sentence similarity tasks.
- Cosine similarity threshold >= 0.75 denotes clear semantic relationship; >= 0.85 denotes strong conceptual overlap.
- Fast inference speed (<10ms per paragraph) makes it ideal for live knowledge graphs.
