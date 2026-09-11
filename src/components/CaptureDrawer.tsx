import React, { useState } from "react";
import { X, FileText, Globe, Upload, Sparkles, CheckCircle2, AlertCircle, Loader2, FileCheck } from "lucide-react";

interface CaptureDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newNoteId: string) => void;
}

export const CaptureDrawer: React.FC<CaptureDrawerProps> = ({ isOpen, onClose, onSuccess }) => {
  const [tab, setTab] = useState<"note" | "url" | "file">("note");
  const [noteContent, setNoteContent] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [pdfStats, setPdfStats] = useState<{ pages: number; words: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    let contentToSubmit = "";
    let sourceType = tab;
    let sourceName = "web_ui";

    if (tab === "note") {
      if (noteContent.trim().length < 10) {
        setError("Note must be at least 10 characters.");
        return;
      }
      contentToSubmit = noteContent.trim();
    } else if (tab === "url") {
      if (!urlInput.startsWith("http://") && !urlInput.startsWith("https://")) {
        setError("URL must begin with http:// or https://");
        return;
      }
      sourceName = urlInput.trim();
      contentToSubmit = `Resource URL: ${urlInput.trim()}\nWeb research link for PARA knowledge storage.`;
    } else if (tab === "file") {
      if (!fileContent.trim()) {
        setError("Please upload a valid text, markdown, or document file.");
        return;
      }
      contentToSubmit = fileContent.trim();
      sourceName = fileName;
    }

    try {
      setLoading(true);
      setStage("Ingesting capture payload...");

      // Simulate step feedback for ultra-responsive experience while async backend runs
      setTimeout(() => setStage("Groq Llama 3 analyzing PARA classification & tags..."), 400);
      setTimeout(() => setStage("Computing 384-dim semantic embedding vector..."), 1200);
      setTimeout(() => setStage("Evaluating cosine links & updating graph..."), 1800);

      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: sourceType,
          content: contentToSubmit,
          source: sourceName,
          filename: tab === "file" ? fileName : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setError(`Duplicate content detected. Note already exists in knowledge base (ID: ${data.existingId?.slice(0, 8)}).`);
        } else {
          setError(data.error || "Failed to capture note.");
        }
        setLoading(false);
        return;
      }

      setSuccessMsg(`Classified as "${data.category}": "${data.summary}"`);
      setNoteContent("");
      setUrlInput("");
      setFileContent("");
      setFileName("");
      setTimeout(() => {
        onSuccess(data.id);
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Network error while saving capture.");
    } finally {
      setLoading(false);
      setStage("");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setPdfStats(null);

    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

    if (isPdf) {
      setIsExtractingPdf(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = (event.target?.result as string) || "";
        try {
          const res = await fetch("/api/extract-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileBase64: base64Data, filename: file.name }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Failed to parse PDF document.");
          }
          setFileContent(data.text || "");
          setPdfStats({ pages: data.numPages || 1, words: data.wordsCount || 0 });
        } catch (extractErr: any) {
          console.warn("Client extraction fallback:", extractErr);
          // Store raw base64 data so server /api/capture can also attempt decoding
          setFileContent(base64Data);
          setError(`PDF notice: ${extractErr.message || "Will process during ingestion."}`);
        } finally {
          setIsExtractingPdf(false);
        }
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setFileContent(text || "");
      };
      reader.readAsText(file);
    }
  };

  const loadSamplePdf = async () => {
    setFileName("Attention_And_Transformer_Architecture_Spec.pdf");
    setError(null);
    setIsExtractingPdf(true);
    setPdfStats(null);

    try {
      // Synthesize a valid PDF stream client-side to test PDF extraction pipeline
      const samplePdfText = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj
4 0 obj<</Length 185>>stream
BT /F1 12 Tf 50 720 Td (Attention Mechanisms and Transformer Scaling Laws) Tj ET
BT /F1 10 Tf 50 690 Td (Modern self-attention networks rely on key-query dot-product calculations) Tj ET
BT /F1 10 Tf 50 670 Td (scaled by the square root of projection dimension dk.) Tj ET
BT /F1 10 Tf 50 640 Td (Key conclusions: quadratic memory complexity can be reduced via flash-attention) Tj ET
BT /F1 10 Tf 50 620 Td (and KV-cache quantization for long-context retrieval architectures.) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000216 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
452
%%EOF`;

      const base64Sample = btoa(samplePdfText);
      const res = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: `data:application/pdf;base64,${base64Sample}`,
          filename: "Attention_And_Transformer_Architecture_Spec.pdf",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse sample PDF.");
      setFileContent(data.text);
      setPdfStats({ pages: data.numPages, words: data.wordsCount });
    } catch (err: any) {
      setError(err.message || "Failed to load sample PDF.");
    } finally {
      setIsExtractingPdf(false);
    }
  };

  const samplePresets = [
    {
      title: "Design System Tokens",
      text: "Standardize design tokens across the application: Primary brand neutral #0F172A, high-contrast surface #1E293B, and accent purple #6C63FF. All border radii for standard cards must remain at 12px.",
    },
    {
      title: "Sprint Retrospective Loop",
      text: "Sprint 14 Retrospective notes: Team velocity stabilized at 38 points. Code review latency dropped from 14 hours down to 2.4 hours with automated linters. Next focus: memory profiling for graph visualizer.",
    },
    {
      title: "Cognitive Load Theory",
      text: "Sweller's Cognitive Load Theory highlights three types of load: Intrinsic (inherent difficulty), Extraneous (poor visual presentation), and Germane (processing and construction of mental schemas).",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  CAPTURE NEW INSIGHT
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-950 text-emerald-400 border border-slate-800">
                  AUTO-PARA
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Archivist ingestion &rarr; Groq PARA classification &rarr; Auto-linking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Type Selector */}
        <div className="flex border-b border-slate-800 px-6 pt-3 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setTab("note")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              tab === "note"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            <FileText className="w-4 h-4" /> Quick Note
          </button>
          <button
            type="button"
            onClick={() => setTab("url")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              tab === "url"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            <Globe className="w-4 h-4" /> Web URL
          </button>
          <button
            type="button"
            onClick={() => setTab("file")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              tab === "file"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            <Upload className="w-4 h-4" /> Document File
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
          {tab === "note" && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Note Content (Markdown supported)
              </label>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your note, meeting takeaways, architectural decisions, or insights..."
                rows={7}
                disabled={loading}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 resize-none font-mono"
              />
              <div className="flex items-center justify-between mt-1 text-xs text-slate-500 font-mono">
                <span>Min 10 characters</span>
                <span>{noteContent.length} chars</span>
              </div>

              {/* Quick Presets */}
              <div className="mt-3">
                <span className="text-xs text-slate-400 font-medium">Or fill sample insight:</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {samplePresets.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNoteContent(p.text)}
                      className="text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer font-sans"
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "url" && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Web Article or Documentation URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/article"
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pl-10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-mono"
                />
                <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                SecondSelf will extract key text, auto-classify into Projects, Areas, Resources, or Archives, and establish vector connections.
              </p>
            </div>
          )}

          {tab === "file" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Upload Note or Document (.pdf, .md, .txt)
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    PDF Supported
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    .md &bull; .txt
                  </span>
                </div>
              </div>

              <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/60 rounded-xl p-5 text-center bg-slate-950/50 transition-colors cursor-pointer relative">
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.json"
                  onChange={handleFileUpload}
                  disabled={loading || isExtractingPdf}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                {isExtractingPdf ? (
                  <div className="py-2 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-2" />
                    <p className="text-xs font-semibold text-emerald-400">Parsing PDF & Extracting Text...</p>
                    <p className="text-[11px] text-slate-500 mt-1">Reading page layout streams and text operators</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-200 font-medium">
                      {fileName ? (
                        <span className="text-emerald-400 font-mono font-semibold">{fileName}</span>
                      ) : (
                        "Click to select or drag PDF / Markdown / Text document here"
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Full-text extraction from Adobe PDF (.pdf), Markdown (.md), and plain text (.txt)
                    </p>
                  </>
                )}
              </div>

              {/* Sample PDF quick load button */}
              <div className="mt-2.5 flex items-center justify-between text-xs">
                <span className="text-slate-500 text-[11px]">Don't have a PDF file handy?</span>
                <button
                  type="button"
                  onClick={loadSamplePdf}
                  disabled={loading || isExtractingPdf}
                  className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 hover:underline cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Load Sample Research PDF
                </button>
              </div>

              {/* PDF Extraction Stats & Document Preview */}
              {pdfStats && (
                <div className="mt-2.5 p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold font-mono text-[11px]">
                      PDF Parsed: {pdfStats.pages} Page{pdfStats.pages > 1 ? "s" : ""} &bull; {pdfStats.words.toLocaleString()} Words Extracted
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400/80 font-mono">Ready for PARA indexing</span>
                </div>
              )}

              {fileContent && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span className="font-mono text-[11px]">Extracted Text Preview ({fileContent.length} chars):</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFileContent("");
                        setFileName("");
                        setPdfStats(null);
                      }}
                      className="text-[10px] text-slate-500 hover:text-slate-300"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                    {fileContent.slice(0, 400)}
                    {fileContent.length > 400 && "..."}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Feedback & Stage Indicators */}
          {loading && (
            <div className="p-3.5 bg-slate-950 border border-emerald-500/30 rounded-xl flex items-center gap-3 animate-pulse">
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
              <div className="text-xs text-slate-200">
                <p className="font-semibold text-emerald-400">{stage || "Processing note..."}</p>
                <p className="text-slate-400 text-[11px] mt-0.5">UI remains fully responsive while LLM processes.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-slate-950 rounded-xl shadow-sm shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" /> Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" /> ADD TO BRAIN
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
