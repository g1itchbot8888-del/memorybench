#!/bin/bash

# Batch search script for LongMemEval questions
# Usage: ./search-batch.sh --runId=<runId> [--questionType=<questionType>] --startPosition=<startPos> --endPosition=<endPos>
# If --questionType is omitted, all question types will be processed

set -e

# Function to parse arguments
parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --runId=*) RUN_ID="${1#*=}" ;;
            --questionType=*) QUESTION_TYPE="${1#*=}" ;;
            --startPosition=*) START_POS="${1#*=}" ;;
            --endPosition=*) END_POS="${1#*=}" ;;
            *) echo "Unknown parameter passed: $1"; exit 1 ;;
        esac
        shift
    done
}

parse_args "$@"

if [ -z "$RUN_ID" ] || [ -z "$START_POS" ] || [ -z "$END_POS" ]; then
    echo "Usage: ./search-batch.sh --runId=<runId> [--questionType=<questionType>] --startPosition=<startPos> --endPosition=<endPos>"
    echo "Example: ./search-batch.sh --runId=run1 --questionType=single-session-user --startPosition=1 --endPosition=50"
    echo "Example (all types): ./search-batch.sh --runId=run1 --startPosition=1 --endPosition=50"
    echo ""
    echo "Available question types:"
    echo "  - single-session-user"
    echo "  - single-session-assistant"
    echo "  - single-session-preference"
    echo "  - knowledge-update"
    echo "  - temporal-reasoning"
    echo "  - multi-session"
    echo ""
    echo "Note: If --questionType is omitted, all question types will be processed."
    exit 1
fi

# Get script directory and root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
QUESTIONS_DIR="$ROOT_DIR/datasets/questions"
RESULTS_DIR="$ROOT_DIR/results"
CHECKPOINTS_BASE="$ROOT_DIR/checkpoints"
BATCH_CHECKPOINT_DIR="$CHECKPOINTS_BASE/search/batch"

# Create directories if they don't exist
mkdir -p "$RESULTS_DIR"
mkdir -p "$BATCH_CHECKPOINT_DIR"

# Search checkpoint file
if [ -z "$QUESTION_TYPE" ]; then
    QUESTION_TYPE_DISPLAY="all"
else
    QUESTION_TYPE_DISPLAY="$QUESTION_TYPE"
fi
SEARCH_CHECKPOINT_FILE="$BATCH_CHECKPOINT_DIR/search-checkpoint-${RUN_ID}-${QUESTION_TYPE_DISPLAY}-${START_POS}-${END_POS}.json"

# Get all question files and filter by type (if specified)
ALL_QUESTION_FILES=($(ls "$QUESTIONS_DIR"/*.json | sort))
QUESTION_FILES=()

if [ -z "$QUESTION_TYPE" ]; then
    echo "Processing all question types"
    QUESTION_FILES=("${ALL_QUESTION_FILES[@]}")
else
    echo "Filtering questions by type: $QUESTION_TYPE"
    for file in "${ALL_QUESTION_FILES[@]}"; do
        QUESTION_TYPE_IN_FILE=$(cat "$file" | jq -r '.question_type // empty' 2>/dev/null || echo "")
        if [ "$QUESTION_TYPE_IN_FILE" == "$QUESTION_TYPE" ]; then
            QUESTION_FILES+=("$file")
        fi
    done
fi

TOTAL_QUESTIONS=${#QUESTION_FILES[@]}

if [ "$TOTAL_QUESTIONS" -eq 0 ]; then
    if [ -z "$QUESTION_TYPE" ]; then
        echo "Error: No questions found in $QUESTIONS_DIR"
    else
        echo "Error: No questions found with type '$QUESTION_TYPE'"
        echo "Available question types:"
        echo "  - single-session-user"
        echo "  - single-session-assistant"
        echo "  - single-session-preference"
        echo "  - knowledge-update"
        echo "  - temporal-reasoning"
        echo "  - multi-session"
    fi
    exit 1
fi

if [ -z "$QUESTION_TYPE" ]; then
    echo "Total questions (all types): $TOTAL_QUESTIONS"
else
    echo "Total questions of type '$QUESTION_TYPE': $TOTAL_QUESTIONS"
fi
echo "Searching questions from position $START_POS to $END_POS (1-indexed, inclusive)"
echo "Run ID: $RUN_ID"

# Validate positions
if [ "$START_POS" -lt 1 ] || [ "$START_POS" -gt "$TOTAL_QUESTIONS" ]; then
    echo "Error: Start position must be between 1 and $TOTAL_QUESTIONS"
    exit 1
fi

if [ "$END_POS" -lt "$START_POS" ] || [ "$END_POS" -gt "$TOTAL_QUESTIONS" ]; then
    echo "Error: End position must be between $START_POS and $TOTAL_QUESTIONS"
    exit 1
fi

# Initialize or load search checkpoint
if [ -f "$SEARCH_CHECKPOINT_FILE" ]; then
    echo "Loading existing search checkpoint..."
else
    echo "Creating new search checkpoint..."
    if [ -z "$QUESTION_TYPE" ]; then
        echo "{\"runId\": \"$RUN_ID\", \"questionType\": \"all\", \"startPosition\": $START_POS, \"endPosition\": $END_POS, \"questions\": []}" > "$SEARCH_CHECKPOINT_FILE"
    else
        echo "{\"runId\": \"$RUN_ID\", \"questionType\": \"$QUESTION_TYPE\", \"startPosition\": $START_POS, \"endPosition\": $END_POS, \"questions\": []}" > "$SEARCH_CHECKPOINT_FILE"
    fi
fi

# Function to update search checkpoint
update_search_checkpoint() {
    local question_id=$1
    local status=$2
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Read current checkpoint
    local checkpoint=$(cat "$SEARCH_CHECKPOINT_FILE")
    
    # Check if question already exists in checkpoint
    local exists=$(echo "$checkpoint" | jq ".questions[] | select(.questionId == \"$question_id\") | .questionId" | wc -l)
    
    if [ "$exists" -gt 0 ]; then
        # Update existing entry
        checkpoint=$(echo "$checkpoint" | jq ".questions = [.questions[] | if .questionId == \"$question_id\" then .status = \"$status\" | .timestamp = \"$timestamp\" else . end]")
    else
        # Add new entry
        checkpoint=$(echo "$checkpoint" | jq ".questions += [{\"questionId\": \"$question_id\", \"status\": \"$status\", \"timestamp\": \"$timestamp\"}]")
    fi
    
    echo "$checkpoint" > "$SEARCH_CHECKPOINT_FILE"
}

# Process questions in the specified range
SUCCESS_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0

for i in $(seq $((START_POS - 1)) $((END_POS - 1))); do
    QUESTION_FILE="${QUESTION_FILES[$i]}"
    QUESTION_ID=$(basename "$QUESTION_FILE" .json)
    
    POSITION=$((i + 1))
    echo ""
    echo "========================================="
    if [ -z "$QUESTION_TYPE" ]; then
        echo "Searching question $POSITION/$TOTAL_QUESTIONS (all types): $QUESTION_ID"
    else
        echo "Searching question $POSITION/$TOTAL_QUESTIONS ($QUESTION_TYPE): $QUESTION_ID"
    fi
    echo "========================================="
    
    # Check if already processed successfully
    if [ -f "$SEARCH_CHECKPOINT_FILE" ]; then
        STATUS=$(cat "$SEARCH_CHECKPOINT_FILE" | jq -r ".questions[] | select(.questionId == \"$QUESTION_ID\") | .status" || echo "")
        if [ "$STATUS" == "completed" ]; then
            echo "Question $QUESTION_ID already successfully searched, skipping..."
            SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            continue
        fi
    fi
    
    # Run search
    update_search_checkpoint "$QUESTION_ID" "in_progress"
    
    if cd "$ROOT_DIR" && bun run scripts/search/search.ts "$QUESTION_ID" "$RUN_ID"; then
        echo "Successfully completed search for $QUESTION_ID"
        update_search_checkpoint "$QUESTION_ID" "completed"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "Failed to search $QUESTION_ID"
        update_search_checkpoint "$QUESTION_ID" "failed"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
    
    # Small delay between searches to avoid overwhelming the API
    sleep 1
done

echo ""
echo "========================================="
if [ -z "$QUESTION_TYPE" ]; then
    echo "Batch Search Complete - All Question Types"
else
    echo "Batch Search Complete - $QUESTION_TYPE"
fi
echo "========================================="
if [ -z "$QUESTION_TYPE" ]; then
    echo "Question Type: all"
else
    echo "Question Type: $QUESTION_TYPE"
fi
echo "Position Range: $START_POS to $END_POS"
echo "Total questions in category: $TOTAL_QUESTIONS"
echo "Successful: $SUCCESS_COUNT"
echo "Failed: $FAILED_COUNT"
echo "Skipped: $SKIPPED_COUNT"
echo "Total processed: $((SUCCESS_COUNT + FAILED_COUNT + SKIPPED_COUNT))"
echo ""
echo "Search checkpoint saved to: $SEARCH_CHECKPOINT_FILE"
echo "Results saved to: $RESULTS_DIR"
