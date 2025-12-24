import type { Judge } from "../../types/judge"
import type { Benchmark } from "../../types/benchmark"
import type { RunCheckpoint } from "../../types/checkpoint"
import type { Provider } from "../../types/provider"
import { CheckpointManager } from "../checkpoint"
import { logger } from "../../utils/logger"
import { shouldStop } from "../../server/runState"
import { calculateRetrievalMetrics } from "./retrieval-eval"

export async function runEvaluatePhase(
    judge: Judge,
    benchmark: Benchmark,
    checkpoint: RunCheckpoint,
    checkpointManager: CheckpointManager,
    questionIds?: string[],
    provider?: Provider
): Promise<void> {
    const questions = benchmark.getQuestions()
    const targetQuestions = questionIds
        ? questions.filter(q => questionIds.includes(q.questionId))
        : questions

    logger.info(`Evaluating ${targetQuestions.length} questions with ${judge.name}...`)

    for (let i = 0; i < targetQuestions.length; i++) {
        // Check for stop signal
        if (shouldStop(checkpoint.runId)) {
            logger.info(`Run ${checkpoint.runId} stopped by user`)
            throw new Error(`Run stopped by user. Resume with the same run ID.`)
        }

        const question = targetQuestions[i]

        const status = checkpointManager.getPhaseStatus(checkpoint, question.questionId, "evaluate")
        if (status === "completed") {
            logger.debug(`Skipping ${question.questionId} - already evaluated`)
            continue
        }

        const answerStatus = checkpointManager.getPhaseStatus(checkpoint, question.questionId, "answer")
        if (answerStatus !== "completed") {
            logger.warn(`Skipping ${question.questionId} - not yet answered`)
            continue
        }

        const hypothesis = checkpoint.questions[question.questionId].phases.answer.hypothesis
        if (!hypothesis) {
            logger.warn(`Skipping ${question.questionId} - no hypothesis found`)
            continue
        }

        const startTime = Date.now()
        checkpointManager.updatePhase(checkpoint, question.questionId, "evaluate", {
            status: "in_progress",
            startedAt: new Date().toISOString(),
        })

        try {
            const searchResults = checkpoint.questions[question.questionId].phases.search.results || []

            const [result, retrievalMetrics] = await Promise.all([
                judge.evaluate({
                    question: question.question,
                    questionType: question.questionType,
                    groundTruth: question.groundTruth,
                    hypothesis,
                    providerPrompts: provider?.prompts,
                }),
                calculateRetrievalMetrics(
                    judge.getModel(),
                    question.question,
                    question.groundTruth,
                    searchResults
                )
            ])

            const durationMs = Date.now() - startTime
            checkpointManager.updatePhase(checkpoint, question.questionId, "evaluate", {
                status: "completed",
                score: result.score,
                label: result.label,
                explanation: result.explanation,
                retrievalMetrics,
                completedAt: new Date().toISOString(),
                durationMs,
            })

            const retrievalInfo = retrievalMetrics
                ? ` | Hit@${retrievalMetrics.k}=${retrievalMetrics.hitAtK}, MRR=${retrievalMetrics.mrr.toFixed(2)}`
                : ""
            logger.progress(i + 1, targetQuestions.length, `Evaluated ${question.questionId}: ${result.label}${retrievalInfo} (${durationMs}ms)`)
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e)
            checkpointManager.updatePhase(checkpoint, question.questionId, "evaluate", {
                status: "failed",
                error,
            })
            logger.error(`Failed to evaluate ${question.questionId}: ${error}`)
            throw new Error(`Evaluate failed at ${question.questionId}: ${error}. Fix the issue and resume with the same run ID.`)
        }
    }

    logger.success("Evaluate phase complete")
}
