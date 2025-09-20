// will use the results from retrieve.ts and the users' query together to generate an answer using generateAnswer from llm.ts
import { retrieve } from "./retrieve";
import { generateAnswer } from "./utils/llm";
import type { qaItem } from "../../../benchmarks/LoCoMo/types";

interface ExtendedQaItem extends qaItem {
  providerAnswer: string;
}

interface LoCoMoResult {
  qa: ExtendedQaItem[];
}

let savedAnswers: LoCoMoResult[] = [];

export async function answer(
  query: string,
  originalQaItem?: qaItem,
): Promise<string> {
  const chunks = await retrieve(query);
  const generatedAnswer = await generateAnswer(
    query,
    chunks.map((chunk) => chunk.content),
  );

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
    "/Users/sreeramsreedhar/code/memorybench/benchmarks/LoCoMo/ContextualRetrieval.json";
  const content = JSON.stringify(savedAnswers);
  await Bun.write(filePath, content);
}

export function getSavedAnswers(): LoCoMoResult[] {
  return savedAnswers;
}
