import React, { useState } from "react";
import { CheckCircle2, XCircle, Play, Loader2, ShieldCheck, Clock, Terminal, AlertTriangle } from "lucide-react";
import { TestResults } from "../types";

export const TestingSuite: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/test-e2e", { method: "POST" });
      if (!res.ok) {
        throw new Error(`Test execution failed with HTTP status ${res.status}`);
      }
      const data: TestResults = await res.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message || "Failed to complete test suite run.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                TESTING PROTOCOLS &bull; PHASE 8
              </h2>
              {results && (
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                    results.passed
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                      : "bg-red-950 text-red-400 border border-red-800/60"
                  }`}
                >
                  {results.passed ? "ALL PROTOCOLS PASSED" : "TEST ISSUES DETECTED"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Validates Ingestion &rarr; PDF Parser &rarr; Groq Classification &rarr; Embeddings &rarr; Graph Builder &rarr; RAG Oracle Citations
            </p>
          </div>
        </div>

        <button
          onClick={runTest}
          disabled={isRunning}
          className="py-2 px-5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-slate-950 font-bold text-xs rounded-xl shadow-sm shadow-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Play className="w-4 h-4 text-slate-950 stroke-[2.5]" />}
          <span>{isRunning ? "RUNNING PROTOCOLS..." : "EXECUTE TEST SUITE"}</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Bento Metric Modules */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              PIPELINE COVERAGE
            </span>
            <div className="text-lg font-bold text-emerald-400 mt-1">
              {results ? `${results.steps.filter(s => s.success).length} of ${results.steps.length} Protocols` : "6 Core Protocols"}
            </div>
            <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full w-full" />
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              EXECUTION DURATION
            </span>
            <div className="text-lg font-bold text-white mt-1 font-mono">
              {results ? `${results.durationMs} ms` : "Standby"}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Live API benchmarking</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              COMPLIANCE STATUS
            </span>
            <div className="text-lg font-bold text-emerald-500 mt-1">
              {results?.passed ? "100% Verified" : "Ready to Test"}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block font-mono">End-to-end verified</span>
          </div>
        </div>

        {/* Banner */}
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-3">
          <Clock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-slate-100 uppercase tracking-wide text-[11px]">
              Automated Full-Stack Verification Protocols
            </p>
            <p className="text-slate-400 leading-relaxed font-sans">
              Every phase of SecondSelf is systematically validated against live inputs: testing raw file creation, Groq Llama 3 PARA categorization accuracy, 384-dimensional cosine similarity indexing, graph edge building, and grounded RAG answer synthesis.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Test Steps Checklist */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Verification Protocol Checklist
          </h3>

          {!results && !isRunning && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30 text-emerald-400" />
              <p className="text-sm font-medium text-slate-300">No test results recorded yet.</p>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                Click "EXECUTE TEST SUITE" to verify all 5 layers end-to-end.
              </p>
            </div>
          )}

          {isRunning && (
            <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-8 text-center text-emerald-200">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-emerald-400" />
              <p className="text-sm font-medium text-white">Executing full end-to-end pipeline verification...</p>
              <p className="text-xs text-emerald-400/80 mt-1 font-mono">
                Calling Groq Llama 3, testing embeddings, and checking assertions.
              </p>
            </div>
          )}

          {results && !isRunning && (
            <div className="space-y-2.5">
              {results.steps.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 transition-colors ${
                    step.success
                      ? "bg-slate-950 border-emerald-500/30"
                      : "bg-red-950/20 border-red-500/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {step.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="text-xs font-semibold text-white">{step.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{step.details}</p>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-emerald-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800 shrink-0">
                    {step.durationMs}ms
                  </span>
                </div>
              ))}

              {/* Total Summary */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-300">
                <span>
                  Total Test Duration: <strong className="text-white font-mono">{results.durationMs}ms</strong>
                </span>
                <span className="font-semibold text-emerald-400">
                  {results.steps.filter((s) => s.success).length} of {results.steps.length} Assertions Verified
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
