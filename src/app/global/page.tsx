'use client'

import { useState, useEffect } from 'react';
import LeaderboardSelector from '../lib/components/global/LeaderboardSelector';

interface Player {
  username: string;
  firstanswertime?: string;
  questionsAnswered?: number;
}

const GlobalLeaderboard = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);

  // const handleProblemSelect = (problem: string) => {
  //   setSelectedProblem(problem);
  // };

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      setLoading(true);
      try {
        const url = selectedProblem
          ? `/top-players-specific-problem/${selectedProblem}`
          : '/top-Players';

        const response = await fetch(url);
        const result = await response.json();

        if (result.success) {
          setPlayers(result.topPlayers);
        } else {
          console.error('Error fetching leaderboard:', result.message);
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [selectedProblem]);

  return (
    <div className="max-w-7xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-4xl font-bold text-gray-900">Vanguard</h1>
        <LeaderboardSelector
          setSelectedProblem={setSelectedProblem}
        />
      </div>

      {loading ? (
        <p className="text-center text-lg text-gray-600">Loading...</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          <li className="grid grid-cols-4 gap-4 py-3 text-lg font-semibold text-gray-800 bg-gray-100">
            <span className="text-center">Rank</span>
            <div className="col-span-2">Username</div>
            {selectedProblem ? (
              <span className="text-center">Answer Time</span>
            ) : (
              <span className="text-center">Questions Answered</span>
            )}
          </li>

          {players.map((player, index) => (
            <li
              key={player.username}
              className="grid grid-cols-4 gap-4 py-3 text-gray-800 hover:bg-gray-50"
            >
              <span className="text-center">{index + 1}</span>
              <div className="col-span-2 flex items-center space-x-2">
                <span>{player.username}</span>
                {/* Badge (if needed) */}
                {/* <img className="w-6 h-6 rounded-full" src="/images/badges/badge_of_knowledge.png" alt="Badge" /> */}
              </div>
              {selectedProblem ? (
                <span className="text-center">{player.firstanswertime}</span>
              ) : (
                <span className="text-center">{player.questionsAnswered}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default GlobalLeaderboard;
