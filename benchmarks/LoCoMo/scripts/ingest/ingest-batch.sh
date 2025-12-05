#!/bin/bash

# Batch ingestion script for LoCoMo conversations
# Usage: ./ingest-batch.sh <runId> <conversationIds...>
# Example: ./ingest-batch.sh eval1 conv-26 conv-30
# Example: ./ingest-batch.sh eval1 all

set -e

if [ "$#" -lt 2 ]; then
    echo "Usage: ./ingest-batch.sh <runId> <conversationIds...>"
    echo "Example: ./ingest-batch.sh eval1 conv-26 conv-30"
    echo "Example: ./ingest-batch.sh eval1 all"
    exit 1
fi

RUN_ID=$1
shift

# All conversations in LoCoMo-10
ALL_CONVERSATIONS=("conv-26" "conv-30" "conv-41" "conv-42" "conv-43" "conv-44" "conv-47" "conv-48" "conv-49" "conv-50")

# Parse conversation IDs
CONVERSATIONS=()
if [ "$1" == "all" ]; then
    CONVERSATIONS=("${ALL_CONVERSATIONS[@]}")
else
    CONVERSATIONS=("$@")
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "═══════════════════════════════════════════════════════════════"
echo "                  LoCoMo Batch Ingestion"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Run ID: $RUN_ID"
echo "Conversations: ${CONVERSATIONS[@]}"
echo "Total: ${#CONVERSATIONS[@]}"
echo ""

SUCCESS_COUNT=0
FAILED_COUNT=0

for i in "${!CONVERSATIONS[@]}"; do
    CONVERSATION_ID="${CONVERSATIONS[$i]}"
    POSITION=$((i + 1))

    echo ""
    echo "───────────────────────────────────────────────────────────────"
    echo "[$POSITION/${#CONVERSATIONS[@]}] Ingesting: $CONVERSATION_ID"
    echo "───────────────────────────────────────────────────────────────"

    if cd "$SCRIPT_DIR" && bun run ingest.ts "$CONVERSATION_ID" "$RUN_ID"; then
        echo "✓ Successfully ingested $CONVERSATION_ID"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "✗ Failed to ingest $CONVERSATION_ID"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi

    # Wait between conversations for indexing
    if [ $POSITION -lt ${#CONVERSATIONS[@]} ]; then
        echo ""
        echo "Waiting 60 seconds for indexing..."
        sleep 60
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                  Batch Ingestion Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Successful: $SUCCESS_COUNT"
echo "Failed:     $FAILED_COUNT"
echo ""

