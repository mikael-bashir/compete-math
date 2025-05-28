import { useState, useEffect } from 'react';

interface ProblemOption {
  value: string | undefined;
  label: string;
}

interface LeaderboardSelectorProps {
  className?: string;
  setSelectedProblem: (problem: string | undefined) => void;
}

const LeaderboardSelector: React.FC<LeaderboardSelectorProps> = ({
  className = '',
  setSelectedProblem,
}) => {
  const [problemOptions, setProblemOptions] = useState<ProblemOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const response = await fetch('/ProblemNumbers');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();

        const options = data.map((problem: any) => ({
          value: problem.problem_number.toString(), // Ensure value is string
          label: problem.problem_name,
        }));

        setProblemOptions([{ value: undefined, label: 'Global Leaderboard' }, ...options]);
      } catch (error) {
        console.error('Error fetching problems:', error);
        setError(error instanceof Error ? error.message : 'An unknown error occurred');
      }
    };
    fetchProblems();
  }, []);

  const handleOptionSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value || undefined; // Use the selected value or undefined
    setSelectedProblem(selectedValue); // Properly update the selected problem
  };

  return (
    <div className={`${className} w-full max-w-sm mx-auto`}>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Select a Leaderboard</h2>
      {error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <select
          onChange={handleOptionSelect}
          className="block w-full px-4 py-2 text-gray-700 bg-white border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {problemOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default LeaderboardSelector;
