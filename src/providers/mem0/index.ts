import { webcrypto } from "crypto"
if (typeof window === "undefined") {
    (globalThis as unknown as { window: { crypto: Crypto } }).window = { crypto: webcrypto as Crypto }
}
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto as Crypto
}

import MemoryClient, { type MemoryOptions, type SearchOptions as Mem0SearchOptions } from "mem0ai"
import type { Provider, ProviderConfig, IngestOptions, IngestResult, SearchOptions } from "../../types/provider"
import type { UnifiedSession } from "../../types/unified"
import { logger } from "../../utils/logger"
import { MEM0_PROMPTS } from "./prompts"

/**
 * Custom instructions from Mem0's official evaluation.
 * Sets project-level instructions for memory extraction.
 */
const CUSTOM_INSTRUCTIONS = `Generate personal memories that follow these guidelines:

1. Each memory should be self-contained with complete context, including:
   - The person's name, do not use "user" while creating memories
   - Personal details (career aspirations, hobbies, life circumstances)
   - Emotional states and reactions
   - Ongoing journeys or future plans
   - Specific dates when events occurred

2. Include meaningful personal narratives focusing on:
   - Identity and self-acceptance journeys
   - Family planning and parenting
   - Creative outlets and hobbies
   - Mental health and self-care activities
   - Career aspirations and education goals
   - Important life events and milestones

3. Make each memory rich with specific details rather than general statements
   - Include timeframes (exact dates when possible)
   - Name specific activities (e.g., "charity race for mental health" rather than just "exercise")
   - Include emotional context and personal growth elements

4. Extract memories only from user messages, not incorporating assistant responses

5. Format each memory as a paragraph with a clear narrative structure that captures the person's experience, challenges, and aspirations`

export class Mem0Provider implements Provider {
    name = "mem0"
    prompts = MEM0_PROMPTS
    private client: MemoryClient | null = null
    private apiKey: string = ""
    private pendingEventIds: string[] = []

    async initialize(config: ProviderConfig): Promise<void> {
        this.apiKey = config.apiKey
        this.client = new MemoryClient({ apiKey: config.apiKey })

        try {
            await this.client.updateProject({ custom_instructions: CUSTOM_INSTRUCTIONS })
        } catch (e) {
            logger.warn(`Could not set custom instructions: ${e}`)
        }

        logger.info(`Initialized Mem0 provider`)
    }

    async ingest(sessions: UnifiedSession[], options: IngestOptions): Promise<IngestResult> {
        if (!this.client) throw new Error("Provider not initialized")

        this.pendingEventIds = []

        for (const session of sessions) {
            const messages = session.messages.map(m => ({
                role: m.role,
                content: m.content,
            }))

            const addOptions: MemoryOptions = {
                user_id: options.containerTag,
                version: "v2",
                enable_graph: false,
                async_mode: true,
                metadata: {
                    sessionId: session.sessionId,
                    timestamp: session.metadata?.date,
                    ...session.metadata,
                    ...options.metadata,
                },
            }

            const result = await this.client.add(messages, addOptions)
            if (Array.isArray(result)) {
                for (const mem of result) {
                    if (mem.id) this.pendingEventIds.push(mem.id)
                }
            }
        }

        return { documentIds: this.pendingEventIds }
    }

    private async getEventStatus(eventId: string): Promise<string> {
        const response = await fetch(`https://api.mem0.ai/v1/event/${eventId}/`, {
            headers: { Authorization: `Token ${this.apiKey}` },
        })
        if (!response.ok) return "UNKNOWN"
        const data = await response.json()
        return data.status || "UNKNOWN"
    }

    async awaitIndexing(_result: IngestResult, _containerTag: string): Promise<void> {
        if (this.pendingEventIds.length === 0) return

        const pollInterval = 1000
        const timeout = 300000
        const start = Date.now()
        const total = this.pendingEventIds.length

        const completed = new Set<string>()

        while (Date.now() - start < timeout) {
            for (const eventId of this.pendingEventIds) {
                if (completed.has(eventId)) continue

                const status = await this.getEventStatus(eventId)
                if (status === "SUCCEEDED" || status === "FAILED") {
                    completed.add(eventId)
                }
            }

            logger.progress(completed.size, total, `Indexing memories (${completed.size}/${total})`)

            if (completed.size === total) return

            await new Promise(r => setTimeout(r, pollInterval))
        }

        logger.warn(`Indexing timeout after ${timeout}ms`)
    }

    async search(query: string, options: SearchOptions): Promise<unknown[]> {
        if (!this.client) throw new Error("Provider not initialized")

        const searchOptions: Mem0SearchOptions = {
            user_id: options.containerTag,
            top_k: options.limit || 30,
            enable_graph: false,
            output_format: "v1.1",
        }

        const response = await this.client.search(query, searchOptions)

        const res = response as { results?: unknown[] }
        return res.results ?? []
    }

    async clear(containerTag: string): Promise<void> {
        if (!this.client) throw new Error("Provider not initialized")
        await this.client.deleteAll({ user_id: containerTag })
        logger.info(`Cleared memories for user: ${containerTag}`)
    }
}

export default Mem0Provider
