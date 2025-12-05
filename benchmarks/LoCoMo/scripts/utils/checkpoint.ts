
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface SessionCheckpoint {
    sessionNumber: number;
    sessionKey: string;
    turnsTotal: number;
    turnsIngested: number;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    timestamp?: string;
    error?: string;
}

export interface CheckpointData {
    conversationId: string;
    runId: string;
    containerTag: string;
    totalSessions: number;
    sessions: SessionCheckpoint[];
}

export interface BatchCheckpointData {
    runId: string;
    conversations: {
        conversationId: string;
        status: 'pending' | 'in_progress' | 'completed' | 'failed';
        timestamp: string;
    }[];
}

export class CheckpointManager {
    private checkpointDir: string;

    constructor(baseDir: string) {
        this.checkpointDir = baseDir;
        if (!existsSync(this.checkpointDir)) {
            mkdirSync(this.checkpointDir, { recursive: true });
        }
    }

    getCheckpointPath(conversationId: string, runId: string): string {
        return join(this.checkpointDir, `checkpoint-${conversationId}-${runId}.json`);
    }

    loadCheckpoint(conversationId: string, runId: string): CheckpointData | null {
        const path = this.getCheckpointPath(conversationId, runId);
        if (existsSync(path)) {
            return JSON.parse(readFileSync(path, 'utf8'));
        }
        return null;
    }

    saveCheckpoint(checkpoint: CheckpointData) {
        const path = this.getCheckpointPath(checkpoint.conversationId, checkpoint.runId);
        writeFileSync(path, JSON.stringify(checkpoint, null, 2));
    }
}

