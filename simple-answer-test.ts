/**
 * Simple test to see if answer.ts works
 */
import { answer } from "./providers/ContextualRetrieval/src/answer";

async function simpleTest() {
  // Simple test question
  const testQuestion = "Is caroline single?";

  console.log(`Question: "${testQuestion}"`);
  try {
    const mockQAItem = {
      question: testQuestion,
      answer: "Single",
      evidence: ["D1:3"],
      category: 2,
    };

    const result = await answer(testQuestion, mockQAItem);
    console.log(`Answer: "${result}"`);
  } catch (error) {
    console.error("Error:", error);
  }
}

simpleTest();
