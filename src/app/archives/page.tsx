// pages/archives.tsx
import Link from 'next/link';
import { problems } from '../lib/constants/archives/problems';

export default function Archives() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-10 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-black mb-2">The Archive</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Browse all problems ever published on CompeteMath.
        </p>
      </div>

      <div className="bg-white overflow-hidden border-gray-100">
        <div className="grid grid-cols-12 bg-white px-6 py-4 font-semibold text-gray-700 border-b border-gray-200">
          <div className="col-span-8">Problem Name</div>
        </div>

        <div className="divide-y divide-gray-100">
          {problems.filter(problem => problem.name !== "coming soon!").map((problem) => (
            <div 
              key={problem.id} 
              className="grid grid-cols-12 px-6 py-4 hover:bg-indigo-50/50 transition-colors duration-150"
            >
              <div className="col-span-8 flex items-center">
                {problem.url ? (
                  <Link href={problem.url} className="group">
                    <span className="font-medium text-gray-800 group-hover:text-indigo-600 transition-colors">
                      {problem.name}
                    </span>
                  </Link>
                ) : (
                  <span className="font-medium text-gray-800">{problem.name}</span>
                )}
              </div>
            
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 text-center text-sm text-gray-500">
      • Updated weekly • 
      </div>
    </div>
  );
}