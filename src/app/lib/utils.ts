import { Problem } from "./types/problems";

export function problemNameExtractor(problem: string) {
    return problem.replace('-', ' ');
}

export function formatProblem(problem: { questionId: string, subtitle: string, questionTitle: string, difficulty: string, points: string, questionProblem: string }) {
    return { id: problem.questionId, subtitle: problem.subtitle, title: problem.questionTitle, difficulty: problem.difficulty, points: problem.points, content: problem.questionProblem }
}

