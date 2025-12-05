#!/bin/bash

# Batch evaluation script for LoCoMo conversations
# Usage: ./evaluate-batch.sh <runId> <conversationIds...>
# Example: ./evaluate-batch.sh eval1 conv-26 conv-30
# Example: ./evaluate-batch.sh eval1 all

set -e

if [ "$#" -lt 2 ]; then
    echo "Usage: ./evaluate-batch.sh <runId> <conversationIds...>"
    echo "Example: ./evaluate-batch.sh eval1 conv-26 conv-30"
    echo "Example: ./evaluate-batch.sh eval1 all"
    exit 1
fi

RUN_ID=$1
shift

ALL_CONVERSATIONS=("conv-26" "conv-30" "conv-41" "conv-42" "conv-43" "conv-44" "conv-47" "conv-48" "conv-49" "conv-50")

CONVERSATIONS=()
if [ "$1" == "all" ]; then
    CONVERSATIONS=("${ALL_CONVERSATIONS[@]}")
else
    CONVERSATIONS=("$@")
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "═══════════════════════════════════════════════════════════════"
echo "                  LoCoMo Batch Evaluation"
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
    echo "[$POSITION/${#CONVERSATIONS[@]}] Evaluating: $CONVERSATION_ID"
    echo "───────────────────────────────────────────────────────────────"

    if cd "$SCRIPT_DIR" && bun run evaluate.ts "$CONVERSATION_ID" "$RUN_ID"; then
        echo "✓ Successfully evaluated $CONVERSATION_ID"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "✗ Failed to evaluate $CONVERSATION_ID"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi

    if [ $POSITION -lt ${#CONVERSATIONS[@]} ]; then
        echo ""
        echo "Waiting 5 seconds..."
        sleep 5
    fi
done

# Generate aggregate report
echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Generating aggregate report..."
echo "───────────────────────────────────────────────────────────────"

cd "$SCRIPT_DIR" && bun run generate-report.ts "$RUN_ID"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                  Batch Evaluation Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Successful: $SUCCESS_COUNT"
echo "Failed:     $FAILED_COUNT"
echo ""

