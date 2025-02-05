// pages/archives.tsx

import Link from 'next/link';  // Use Link from next/link for navigation

const problems = [
  { id: "001", name: "Plastic Balls", url: "/problems/1" },
  { id: "002", name: "coming soon!", url: "/problems/2" },
  { id: "003", name: "coming soon!", url: "/problems/3" },
  { id: "004", name: "coming soon!", url: "/problems/4" },
  { id: "005", name: "coming soon!", url: "/problems/5" },
  { id: "006", name: "coming soon!", url: "/problems/6" },
  { id: "007", name: "coming soon!", url: "/problems/7" },
  { id: "008", name: "coming soon!", url: "/problems/8" },
  { id: "009", name: "coming soon!", url: "/problems/9" },
  { id: "010", name: "coming soon!", url: "/problems/10" },
  { id: "011", name: "coming soon!", url: "/problems/11" },
  { id: "012", name: "coming soon!", url: "/problems/12" },
  { id: "013", name: "coming soon!", url: "/problems/13" },
  { id: "014", name: "coming soon!", url: "/problems/14" },
  { id: "015", name: "coming soon!", url: "/problems/15" },
  { id: "016", name: "coming soon!", url: "/problems/16" },
  { id: "017", name: "coming soon!", url: "/problems/17" },
  { id: "018", name: "coming soon!", url: "/problems/18" },
  { id: "019", name: "coming soon!", url: "/problems/19" },
  { id: "020", name: "Unit Square String", url: "/problems/20" },
  { id: "021", name: "coming soon!", url: "/problems/21" },
  { id: "022", name: "coming soon!", url: "/problems/22" },
  { id: "023", name: "coming soon!", url: "/problems/23" },
  { id: "024", name: "coming soon!", url: "/problems/24" },
  { id: "025", name: "coming soon!", url: "/problems/25" },
  { id: "026", name: "coming soon!", url: "/problems/26" },
  { id: "027", name: "coming soon!", url: "/problems/27" },
  { id: "028", name: "Glass Marbles", url: "/problems/28" },
  { id: "029", name: "coming soon!", url: "/problems/29" },
  { id: "030", name: "coming soon!", url: "/problems/30" },
  { id: "031", name: "coming soon!", url: "/problems/31" },
  { id: "032", name: "coming soon!", url: "/problems/32" },
  { id: "033", name: "coming soon!", url: "/problems/33" },
  { id: "034", name: "coming soon!", url: "/problems/34" },
  { id: "035", name: "Perfect Cannoli", url: "/problems/35" }
];

export default function Archives() {
    return (
        <div className="max-w-4xl mx-auto p-8">
          <h1 className="text-4xl font-bold text-center mb-8">Archives</h1>
          <ul className="space-y-4">
            {/* Render header */}
            <li className="grid grid-cols-3 gap-4 text-gray-500 font-semibold border-b pb-2">
              <span className="text-lg">ID</span>
              <span className="text-lg">Problem Name</span>
              <span className="text-lg">Status</span>
            </li>
    
            {/* Render problem list */}
            {problems.map((problem, index) => (
              <li
                key={index}
                className="grid grid-cols-3 gap-4 items-center p-4 rounded-lg hover:bg-gray-100 border-b"
              >
                <span className="font-medium text-gray-800">{problem.id}</span>
                <Link
                  href={problem.url}
                  className={`font-medium text-blue-600 hover:underline ${
                    problem.url ? '' : 'text-gray-500'
                  }`}
                >
                  {problem.name}
                </Link>
                <span
                  className={`text-sm ${
                    problem.url ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {problem.url ? 'Available' : 'Coming Soon'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    };

