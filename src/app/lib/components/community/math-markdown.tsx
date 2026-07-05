"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Shared markdown+LaTeX renderer for community content (problem statements,
// answers, comments). Mirrors the archives problem page setup.
export function MathMarkdown({ children }: { children: string }) {
  return (
    <div className="prose-invert max-w-none text-[15px] leading-relaxed [&_p]:my-2 [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
