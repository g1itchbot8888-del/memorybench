#!/bin/bash

# Batch search script for LoCoMo conversations
# Usage: ./search-batch.sh <runId> <conversationIds...> [waitSeconds]
# Example: ./search-batch.sh eval1 conv-26 conv-30
# Example: ./search-batch.sh eval1 all 120

set -e

if [ "$#" -lt 2 ]; then
    echo "Usage: ./search-batch.sh <runId> <conversationIds...> [waitSeconds]"
    echo "Example: ./search-batch.sh eval1 conv-26 conv-30"
    echo "Example: ./search-batch.sh eval1 all 120"
    exit 1
fi

RUN_ID=$1
shift

ALL_CONVERSATIONS=("conv-26" "conv-30" "conv-41" "conv-42" "conv-43" "conv-44" "conv-47" "conv-48" "conv-49" "conv-50")

# Parse arguments
WAIT_SECONDS=0
CONVERSATIONS=()

# Check if last argument is a number (wait time)
LAST_ARG="${@: -1}"
if [[ "$LAST_ARG" =~ ^[0-9]+$ ]]; then
    WAIT_SECONDS=$LAST_ARG
    set -- "${@:1:$(($#-1))}"
fi

if [ "$1" == "all" ]; then
    CONVERSATIONS=("${ALL_CONVERSATIONS[@]}")
else
    CONVERSATIONS=("$@")
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "═══════════════════════════════════════════════════════════════"
echo "                    LoCoMo Batch Search"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Run ID: $RUN_ID"
echo "Conversations: ${CONVERSATIONS[@]}"
echo "Total: ${#CONVERSATIONS[@]}"
if [ "$WAIT_SECONDS" -gt 0 ]; then
    echo "Wait before first search: ${WAIT_SECONDS}s"
fi
echo ""

SUCCESS_COUNT=0
FAILED_COUNT=0

for i in "${!CONVERSATIONS[@]}"; do
    CONVERSATION_ID="${CONVERSATIONS[$i]}"
    POSITION=$((i + 1))

    echo ""
    echo "───────────────────────────────────────────────────────────────"
    echo "[$POSITION/${#CONVERSATIONS[@]}] Searching: $CONVERSATION_ID"
    echo "───────────────────────────────────────────────────────────────"

    WAIT_ARG=""
    if [ $POSITION -eq 1 ] && [ "$WAIT_SECONDS" -gt 0 ]; then
        WAIT_ARG="$WAIT_SECONDS"
    fi

    if cd "$SCRIPT_DIR" && bun run search.ts "$CONVERSATION_ID" "$RUN_ID" $WAIT_ARG; then
        echo "✓ Successfully searched $CONVERSATION_ID"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "✗ Failed to search $CONVERSATION_ID"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi

    if [ $POSITION -lt ${#CONVERSATIONS[@]} ]; then
        echo ""
        echo "Waiting 5 seconds..."
        sleep 5
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                    Batch Search Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Successful: $SUCCESS_COUNT"
echo "Failed:     $FAILED_COUNT"
echo ""

