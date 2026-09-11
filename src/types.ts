export type CategoryType = "Projects" | "Areas" | "Resources" | "Archives";

export interface GraphNode {
  id: string;
  label: string;
  category: CategoryType;
  tags: string[];
  summary: string;
  timestamp: string;
  content: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: "strong" | "weak";
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NoteLink {
  id: string;
  score: number;
  type: "strong" | "weak";
}

export interface NoteMeta {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  category: CategoryType;
  tags: string[];
  summary: string;
  links: NoteLink[];
  embedding_file: string;
}

export interface WikiNoteSummary {
  id: string;
  summary: string;
  category: CategoryType;
  tags: string[];
  timestamp: string;
  type: string;
  linksCount: number;
  preview: string;
}

export interface WikiNoteDetail {
  meta: NoteMeta;
  content: string;
  filePath: string;
}

export interface CitationSource {
  index: number;
  id: string;
  title: string;
  category: CategoryType;
  score: number;
  preview: string;
}

export interface AskResponse {
  answer: string;
  sources: CitationSource[];
  error?: string;
}

export interface BrainStats {
  totalNotes: number;
  categoryCounts: Record<CategoryType, number>;
  totalLinks: number;
  totalWords: number;
  model: string;
  groqConfigured: boolean;
}

export interface TestResultStep {
  name: string;
  success: boolean;
  details: string;
  durationMs: number;
}

export interface TestResults {
  passed: boolean;
  durationMs: number;
  steps: TestResultStep[];
  errors: string[];
}
