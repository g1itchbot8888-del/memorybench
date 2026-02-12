import type { ProviderPrompts } from "../../types/prompts"

export const AGENT_MEMORY_PROMPTS: ProviderPrompts = {
  answerPrompt: (question: string, context: unknown[], questionDate?: string) => {
    const memories = (context as Array<{ memory?: string; score?: number }>)
      .map((r, i) => {
        const memory = r.memory || JSON.stringify(r)
        const score = r.score ? ` (relevance: ${r.score.toFixed(2)})` : ""
        return `${i + 1}. ${memory}${score}`
      })
      .join("\n")

    return `You are answering questions based on memories from past conversations.

${questionDate ? `Current date context: ${questionDate}\n` : ""}
Retrieved memories:
${memories || "(no relevant memories found)"}

Question: ${question}

Instructions:
- Answer ONLY based on the retrieved memories above
- If the memories don't contain enough information, say so
- Be specific and cite details from the memories
- For temporal questions, pay attention to dates and sequence of events
- If memories contradict each other, prefer the most recent one

Answer:`
  },
}
