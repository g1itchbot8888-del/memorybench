import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { embedMany, generateText } from "ai";
import { EMBEDDING_DIMENSION } from "./config";
import { answerQuestionWithRetrievedSearchResultsPrompt } from "./prompts";

/**
 * Generate embedding using Gemini Embedding 001
 * @param inputs - String or array of strings to embed
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(
  inputs: string | string[],
): Promise<number[][]> {
  try {
    if (typeof inputs === "string") {
      inputs = [inputs];
    }

    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      values: inputs,
      providerOptions: {
        google: {
          outputDimensionality: EMBEDDING_DIMENSION,
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
    });

    return embeddings;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to generate embeddings");
  }
}

export async function generateAnswer(
  query: string,
  context: string[],
): Promise<string> {
  try {
    const prompt = answerQuestionWithRetrievedSearchResultsPrompt(
      query,
      context.join("\n"),
    );

    const { text } = await generateText({
      model: anthropic("claude-3-5-haiku-latest"),
      prompt,
    });

    return text;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to generate answer");
  }
}
