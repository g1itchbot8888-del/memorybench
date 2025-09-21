// will use the results from retrieve.ts and the users' query together to generate an answer using generateAnswer from llm.ts
import { retrieve } from "./retrieve";
import { generateAnswer } from "./utils/llm";
import type { qaItem } from "../../../benchmarks/LoCoMo/types";
import { answerQuestionWithRetrievedSearchResultsPrompt } from "./utils/prompts";

interface ExtendedQaItem extends qaItem {
  providerAnswer: string;
}

interface LoCoMoResult {
  qa: ExtendedQaItem[];
}

let savedAnswers: LoCoMoResult[] = [];

async function generateContextualPrompt(
  query: string,
  context: string[],
): Promise<string> {
  const prompt = answerQuestionWithRetrievedSearchResultsPrompt(
    query,
    context.join("\n"),
  );
  return prompt;
}

export async function answer(
  query: string,
  originalQaItem?: qaItem,
): Promise<string> {
  const chunks = await retrieve(query);
  const answerContext = await generateContextualPrompt(
    query,
    chunks.map((chunk) => chunk.content),
  );

  const generatedAnswer = await generateAnswer(answerContext);

  // Saves the answer in LoCoMo format if originalQaItem is provided
  if (originalQaItem) {
    const extendedQaItem: ExtendedQaItem = {
      ...originalQaItem,
      providerAnswer: generatedAnswer,
    };

    // Check if we already have a result set for this question
    let existingResult = savedAnswers.find((result) =>
      result.qa.some((qa) => qa.question === originalQaItem.question),
    );

    if (existingResult) {
      // Update existing entry
      const qaIndex = existingResult.qa.findIndex(
        (qa) => qa.question === originalQaItem.question,
      );
      if (qaIndex !== -1) {
        existingResult.qa[qaIndex] = extendedQaItem;
      }
    } else {
      // Create new result entry
      savedAnswers.push({
        qa: [extendedQaItem],
      });
    }

    // Save to file
    await saveAnswersToFile();
  }

  return generatedAnswer;
}

async function saveAnswersToFile(): Promise<void> {
  const filePath =
    "./providers/ContextualRetrieval/results/LoCoMo/results.json";
  const content = JSON.stringify(savedAnswers);
  await Bun.write(filePath, content);
}

export function getSavedAnswers(): LoCoMoResult[] {
  return savedAnswers;
}
