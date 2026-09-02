"use client";

import { useState } from "react";
import Link from "next/link";
import { verifyAndFetchBenchmarks } from "./actions";

export function AccessForm() {
  const [code, setCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<any[] | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) return;
    
    setError(null);
    setLoading(true);

    const result = await verifyAndFetchBenchmarks(code);

    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setFiles(result.data);
    }
    
    setLoading(false);
  }

  if (files) {
    return (
      <div className="grid gap-4 mt-6">
        {files.map((file) => (
          <div key={file.sha} className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{file.name}</h3>
            <div className="mt-3 flex gap-4 text-sm">
              <a 
                href={file.html_url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:underline font-medium"
              >
                View on GitHub
              </a>
              {file.download_url && (
                <a 
                  href={file.download_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:underline"
                >
                  Download Raw Data
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4 max-w-sm">
      <div>
        <label htmlFor="access-code" className="font-semibold text-zinc-900 dark:text-zinc-100">
          Enter access code
        </label>
        <input
          id="access-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. LRR-8492-XXXX"
          className="mt-1 w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent text-zinc-900 dark:text-zinc-100"
          required
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="terms"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          required
        />
        <label htmlFor="terms" className="text-sm text-zinc-600 dark:text-zinc-400">
          I agree to the <Link href="/lrr/policy" target="_blank" className="text-blue-600 hover:underline font-medium">LRR Terms of Access</Link> and will strictly not use this data for AI/ML training.
        </label>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      
      <button 
        type="submit" 
        disabled={loading || !acceptedTerms || !code}
        className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Verifying..." : "Unlock Benchmarks"}
      </button>
      
      <p className="text-sm text-zinc-500 mt-2">
        <strong>Warning:</strong> This code is strictly single-use. Navigating away or refreshing the page will permanently burn access.
      </p>
    </form>
  );
}