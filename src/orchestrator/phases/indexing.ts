import type { Provider } from "../../types/provider"
import type { RunCheckpoint } from "../../types/checkpoint"
import { CheckpointManager } from "../checkpoint"
import { logger } from "../../utils/logger"
import { shouldStop } from "../../server/runState"

export async function runIndexingPhase(
    provider: Provider,
    checkpoint: RunCheckpoint,
    checkpointManager: CheckpointManager,
    questionIds?: string[]
): Promise<void> {
    const allQuestions = Object.values(checkpoint.questions)
    const targetQuestions = questionIds
        ? allQuestions.filter(q => questionIds.includes(q.questionId))
        : allQuestions

    // Filter to questions that completed ingest but not indexing
    const toIndex = targetQuestions.filter(q =>
        q.phases.ingest.status === "completed" &&
        q.phases.indexing.status !== "completed"
    )

    if (toIndex.length === 0) {
        logger.info("No questions pending indexing")
        return
    }

    logger.info(`Awaiting indexing for ${toIndex.length} questions...`)

    for (let i = 0; i < toIndex.length; i++) {
        // Check for stop signal
        if (shouldStop(checkpoint.runId)) {
            logger.info(`Run ${checkpoint.runId} stopped by user`)
            throw new Error(`Run stopped by user. Resume with the same run ID.`)
        }

        const question = toIndex[i]
        const ingestResult = question.phases.ingest.ingestResult

        // Skip if no documents/tasks to track
        if (!ingestResult || (ingestResult.documentIds.length === 0 && !ingestResult.taskIds?.length)) {
            checkpointManager.updatePhase(checkpoint, question.questionId, "indexing", {
                status: "completed",
                completedAt: new Date().toISOString(),
                durationMs: 0,
            })
            logger.progress(i + 1, toIndex.length, `Indexed ${question.questionId} (0ms)`)
            continue
        }

        const startTime = Date.now()
        checkpointManager.updatePhase(checkpoint, question.questionId, "indexing", {
            status: "in_progress",
            startedAt: new Date().toISOString(),
        })

        try {
            await provider.awaitIndexing(ingestResult, question.containerTag)

            const durationMs = Date.now() - startTime
            checkpointManager.updatePhase(checkpoint, question.questionId, "indexing", {
                status: "completed",
                completedAt: new Date().toISOString(),
                durationMs,
            })

            logger.progress(i + 1, toIndex.length, `Indexed ${question.questionId} (${durationMs}ms)`)
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e)
            checkpointManager.updatePhase(checkpoint, question.questionId, "indexing", {
                status: "failed",
                error,
            })
            logger.error(`Failed to index ${question.questionId}: ${error}`)
            throw new Error(`Indexing failed at ${question.questionId}: ${error}. Fix the issue and resume with the same run ID.`)
        }
    }

    logger.success("Indexing phase complete")
}
