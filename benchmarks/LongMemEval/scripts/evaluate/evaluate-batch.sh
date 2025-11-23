#!/bin/bash

# Batch evaluation script for LongMemEval results
# Usage: ./evaluate-batch.sh --runId=<runId> [--questionType=<questionType>]

set -e

# Function to parse arguments
parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --runId=*) RUN_ID="${1#*=}" ;;
            --questionType=*) QUESTION_TYPE="${1#*=}" ;;
            *) echo "Unknown parameter passed: $1"; exit 1 ;;
        esac
        shift
    done
}

parse_args "$@"

if [ -z "$RUN_ID" ]; then
    echo "Usage: ./evaluate-batch.sh --runId=<runId> [--questionType=<questionType>]"
    echo "Example: ./evaluate-batch.sh --runId=run1"
    echo "Example: ./evaluate-batch.sh --runId=run1 --questionType=single-session-user"
    exit 1
fi

# Get script directory and root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Starting evaluation..."
echo "Run ID: $RUN_ID"
echo "Model: gemini-3-pro-preview"
if [ -n "$QUESTION_TYPE" ]; then
    echo "Question type: $QUESTION_TYPE"
else
    echo "Question type: all"
fi
echo "Using all results from each file"
echo ""

if [ -n "$QUESTION_TYPE" ]; then
    cd "$ROOT_DIR" && bun run scripts/evaluate/evaluate.ts "$RUN_ID" "$QUESTION_TYPE"
else
    cd "$ROOT_DIR" && bun run scripts/evaluate/evaluate.ts "$RUN_ID"
fi
