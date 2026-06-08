import type { DatabaseSync } from "node:sqlite";
import { generateQuizQuestionBatch } from "./generateQuizQuestions.js";
import { resolveStoryTextForQuiz } from "./quizContentSource.js";
import { resolveVideoForQuiz } from "./publishableVideos.js";
import type { GenerateQuizQuestionsInput, QuizQuestionDraft } from "./types.js";

export class QuizQuestionService {
  constructor(private readonly db: DatabaseSync) {}

  async generateBatch(userId: string, input: GenerateQuizQuestionsInput): Promise<QuizQuestionDraft[]> {
    resolveVideoForQuiz(this.db, userId, input.interviewId, input.taskId);
    const storyArticle = resolveStoryTextForQuiz(userId, input.interviewId, input.taskId);
    return generateQuizQuestionBatch({
      storyArticle,
      excludeQuestions: input.excludeQuestions ?? [],
    });
  }
}
