"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { verifyAndFetchBenchmarks } from "./actions";

// --- FOLDER TREE COMPONENTS ---

// Helper to turn the flat array into a nested tree structure
function buildTree(files: any[]) {
  const root: any = { files: [], dirs: {} };
  
  files.forEach(file => {
    const parts = file.name.split('/');
    let current = root;
    
    // Traverse/build folders
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current.dirs[parts[i]]) {
        current.dirs[parts[i]] = { files: [], dirs: {} };
      }
      current = current.dirs[parts[i]];
    }
    // Add file to the deepest folder
    current.files.push({ ...file, displayName: parts[parts.length - 1] });
  });
  return root;
}

// Recursive component to render folders
const FolderTree = ({ name, node }: { name: string, node: any }) => (
  <details className="ml-4 mt-2">
    <summary className="cursor-pointer font-semibold text-white/80 hover:text-white list-none flex items-center gap-2 transition-colors">
      📁 {name}
    </summary>
    <div className="ml-4 border-l-2 border-white/10 pl-2 mt-1">
      {Object.entries(node.dirs).map(([dirName, childNode]) => (
        <FolderTree key={dirName} name={dirName} node={childNode} />
      ))}
      {node.files.map((file: any) => (
        <div key={file.sha} className="flex items-center gap-4 py-1 text-sm">
          📄 <span className="font-mono text-white/50">{file.displayName}</span>
          <a href={file.html_url} target="_blank" rel="noreferrer" className="text-emerald-400/80 hover:text-emerald-300 transition-colors">View</a>
          {file.download_url && (
            <a href={file.download_url} className="text-emerald-400/80 hover:text-emerald-300 transition-colors">Download</a>
          )}
        </div>
      ))}
    </div>
  </details>
);

// Wrapper for the unlocked state
function RepoViewer({ files, sessionToken }: { files: any[], sessionToken: string }) {
  const fileTree = useMemo(() => buildTree(files), [files]);

  return (
    <div className="mt-8 border border-white/10 rounded-lg p-6 bg-white/[0.02] shadow-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-4 border-b border-white/10 gap-4">
        <h3 className="text-xl font-bold text-white/90">Research Repository Unlocked</h3>
        <a 
          href={`/api/lrr/download?type=zip&token=${sessionToken}`}
          className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-md hover:bg-emerald-500/20 transition-colors font-medium whitespace-nowrap text-sm"
        >
          📦 Download Full Repo (.zip)
        </a>
      </div>
      
      {/* Render the root directories and files */}
      <div className="-ml-4">
        {Object.entries(fileTree.dirs).map(([dirName, node]) => (
          <FolderTree key={dirName} name={dirName} node={node} />
        ))}
        {fileTree.files.map((file: any) => (
          <div key={file.sha} className="flex items-center gap-4 py-1 ml-4 text-sm mt-1">
            📄 <span className="font-mono text-white/50">{file.displayName}</span>
            <a href={file.html_url} target="_blank" rel="noreferrer" className="text-emerald-400/80 hover:text-emerald-300 transition-colors">View</a>
            {file.download_url && (
              <a href={file.download_url} className="text-emerald-400/80 hover:text-emerald-300 transition-colors">Download</a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- MAIN FORM COMPONENT ---

export function AccessForm() {
  const [code, setCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [repoData, setRepoData] = useState<{ files: any[], sessionToken: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) return;
    
    setError(null);
    setLoading(true);

    const result = await verifyAndFetchBenchmarks(code);

    if (result.error) {
      setError(result.error);
    } else if (result.data && result.sessionToken) {
      setRepoData({ files: result.data, sessionToken: result.sessionToken });
    } else {
      setError("An unexpected error occurred parsing the repository data.");
    }
    
    setLoading(false);
  }

  if (repoData) {
    return <RepoViewer files={repoData.files} sessionToken={repoData.sessionToken} />;
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4 max-w-sm">
      <div>
        <label htmlFor="access-code" className="font-semibold text-white/90">
          Enter access code
        </label>
        <input
          id="access-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. LRR-8492-XXXX"
          className="mt-1 w-full px-3 py-2 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 bg-white/5 text-white placeholder-white/30"
          required
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="terms"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0"
          required
        />
        <label htmlFor="terms" className="text-sm text-white/60">
          I agree to the <Link href="/lrr/policy" target="_blank" className="text-emerald-400 hover:underline font-medium">LRR Terms of Access</Link> and will strictly not use this data for AI/ML training.
        </label>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      
      <button 
        type="submit" 
        disabled={loading || !acceptedTerms || !code}
        className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium rounded-md hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
      >
        {loading ? "Verifying..." : "Unlock Benchmarks"}
      </button>
      
      <p className="text-sm text-white/40 mt-2">
        <strong className="text-white/60">Warning:</strong> This code is strictly single-use. Navigating away or refreshing the page will permanently burn access.
      </p>
    </form>
  );
}