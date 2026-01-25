
export interface answer{
    answer: string;
}

export interface Problem {
  id: number;
  subtitle: string;
  status: string; // Or specifically: "solved" | "current" | "locked"
  difficulty: string;
  symbol: string;
}

// Define a return type to handle the different outcomes
export type SubmissionResult = 
  | { success: false, message: string }
  | { success: true, isCorrect: boolean };
