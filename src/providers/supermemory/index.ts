import { Supermemory } from "supermemory"
import type { Provider, ProviderConfig, IngestOptions, IngestResult, SearchOptions } from "../../types/provider"
import type { UnifiedSession } from "../../types/unified"
import { logger } from "../../utils/logger"
import { SUPERMEMORY_PROMPTS } from "./prompts"

export class SupermemoryProvider implements Provider {
    name = "supermemory"
    prompts = SUPERMEMORY_PROMPTS
    private client: Supermemory | null = null

    async initialize(config: ProviderConfig): Promise<void> {
        this.client = new Supermemory({
            apiKey: config.apiKey,
        })
        logger.info(`Initialized Supermemory provider`)
    }

    async ingest(sessions: UnifiedSession[], options: IngestOptions): Promise<IngestResult> {
        if (!this.client) throw new Error("Provider not initialized")

        const documentIds: string[] = []

        for (const session of sessions) {
            const sessionStr = JSON.stringify(session.messages)
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')

            const formattedDate = session.metadata?.formattedDate as string
            const isoDate = session.metadata?.date as string
            const content = formattedDate
                ? `Here is the date the following session took place: ${formattedDate}\n\nHere is the session as a stringified JSON:\n${sessionStr}`
                : `Here is the session as a stringified JSON:\n${sessionStr}`

            const response = await this.client.add({
                content,
                containerTag: options.containerTag,
                metadata: {
                    sessionId: session.sessionId,
                    ...(isoDate ? { date: isoDate } : {}),
                },
            })
            documentIds.push(response.id)
            logger.debug(`Ingested session ${session.sessionId}`)
        }

        return { documentIds }
    }

    async awaitIndexing(result: IngestResult, _containerTag: string): Promise<void> {
        if (!this.client) throw new Error("Provider not initialized")
        if (result.documentIds.length === 0) return

        const pollInterval = 2000
        const timeout = 300000
        const total = result.documentIds.length

        for (let i = 0; i < total; i++) {
            const docId = result.documentIds[i]
            const start = Date.now()

            while (Date.now() - start < timeout) {
                const doc = await this.client.documents.get(docId)
                if (doc.status === "done" || doc.status === "failed") {
                    logger.debug(`[${i + 1}/${total}] Document ${docId} indexed (${doc.status})`)
                    break
                }
                await new Promise(r => setTimeout(r, pollInterval))
            }

            while (Date.now() - start < timeout) {
                const memory = await this.client.memories.get(docId)
                if (memory.status === "done" || memory.status === "failed") {
                    logger.debug(`[${i + 1}/${total}] Memory ${docId} extracted (${memory.status})`)
                    break
                }
                await new Promise(r => setTimeout(r, pollInterval))
            }
        }
    }

    async search(query: string, options: SearchOptions): Promise<unknown[]> {
        if (!this.client) throw new Error("Provider not initialized")

        const response = await this.client.search.memories({
            q: query,
            containerTag: options.containerTag,
            limit: options.limit || 10,
            threshold: options.threshold || 0.3,
            include: {
                chunks: true,
            },
        })

        return response.results || []
    }

    async clear(containerTag: string): Promise<void> {
        if (!this.client) throw new Error("Provider not initialized")
        logger.warn(`Clear not implemented for Supermemory - containerTag: ${containerTag}`)
    }
}

export default SupermemoryProvider
