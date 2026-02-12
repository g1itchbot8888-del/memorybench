import type {
  Provider,
  ProviderConfig,
  IngestOptions,
  IngestResult,
  SearchOptions,
  IndexingProgressCallback,
} from "../../types/provider"
import type { UnifiedSession } from "../../types/unified"
import { logger } from "../../utils/logger"
import { AGENT_MEMORY_PROMPTS } from "./prompts"

/**
 * agent-memory provider for MemoryBench.
 * 
 * Connects to a local agent-memory bench server (Python HTTP wrapper).
 * The server manages per-container SQLite databases with semantic embeddings
 * and graph-based memory relationships.
 * 
 * Start the server: python -m agent_memory.bench_server --port 9876
 */
export class AgentMemoryProvider implements Provider {
  name = "agent-memory"
  prompts = AGENT_MEMORY_PROMPTS
  concurrency = {
    default: 10,  // Local, so moderate concurrency
  }
  private baseUrl: string = "http://127.0.0.1:9876"

  async initialize(config: ProviderConfig): Promise<void> {
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl
    }

    // Health check
    try {
      const res = await fetch(`${this.baseUrl}/health`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { status: string }
      logger.info(`Connected to agent-memory bench server: ${data.status}`)
    } catch (e) {
      throw new Error(
        `Cannot connect to agent-memory bench server at ${this.baseUrl}. ` +
        `Start it with: python -m agent_memory.bench_server --port 9876\n` +
        `Error: ${e}`
      )
    }
  }

  async ingest(sessions: UnifiedSession[], options: IngestOptions): Promise<IngestResult> {
    // Send sessions in batches to avoid overwhelming the server
    const batchSize = 5
    const allDocIds: string[] = []

    for (let i = 0; i < sessions.length; i += batchSize) {
      const batch = sessions.slice(i, i + batchSize)
      
      const res = await fetch(`${this.baseUrl}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerTag: options.containerTag,
          sessions: batch,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Ingest failed: ${text}`)
      }

      const data = await res.json() as { documentIds: string[], count: number }
      allDocIds.push(...data.documentIds)
      
      if (i % 20 === 0 && i > 0) {
        logger.info(`Ingested ${i}/${sessions.length} sessions (${allDocIds.length} memories)`)
      }
    }

    logger.info(`Ingested ${sessions.length} sessions → ${allDocIds.length} memories`)
    return { documentIds: allDocIds }
  }

  async awaitIndexing(
    result: IngestResult,
    _containerTag: string,
    onProgress?: IndexingProgressCallback
  ): Promise<void> {
    // agent-memory indexes synchronously on ingest, no waiting needed
    const total = result.documentIds.length
    onProgress?.({
      completedIds: result.documentIds,
      failedIds: [],
      total,
    })
  }

  async search(query: string, options: SearchOptions): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        containerTag: options.containerTag,
        query,
        limit: options.limit || 30,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Search failed: ${text}`)
    }

    const data = await res.json() as { results: unknown[] }
    return data.results ?? []
  }

  async clear(containerTag: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ containerTag }),
    })

    if (!res.ok) {
      logger.warn(`Clear failed for ${containerTag}`)
    } else {
      logger.info(`Cleared memories for: ${containerTag}`)
    }
  }
}

export default AgentMemoryProvider
