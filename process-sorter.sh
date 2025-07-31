#!/bin/bash

# This script gets sorting suggestions for a single file.

# --- ARGUMENT MAPPING ---
# $1: Input file path
# $2: JSON string of the folder index (array of paths)
# $3: API Key
# $4: AI Model Name
# $5: The base prompt text
# $6: The AI Provider

# --- CONFIGURATION ---
FILE_PATH="$1"
FOLDER_INDEX_JSON="$2"
API_KEY="$3"
MODEL_NAME="$4"
BASE_PROMPT_TEXT="$5"
PROVIDER="$6"

# --- Set PATH ---
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH

# --- 1. EXTRACT FILE CONTENT ---
FILE_EXTENSION="${FILE_PATH##*.}"
FILE_CONTENT=""
case "$FILE_EXTENSION" in
    pdf)
        # For PDFs, we need a temporary searchable version
        WORK_DIR=$(mktemp -d)
        gs -o "${WORK_DIR}/p.png" -sDEVICE=png16m -r150 "$FILE_PATH" >/dev/null 2>&1
        tesseract "${WORK_DIR}/p.png" "${WORK_DIR}/c" -l eng+deu+spa >/dev/null 2>&1
        FILE_CONTENT=$(cat "${WORK_DIR}/c.txt")
        rm -rf "$WORK_DIR"
        ;;
    txt)
        FILE_CONTENT=$(cat "$FILE_PATH")
        ;;
    docx|doc|pptx|ppt)
        FILE_CONTENT=$(pandoc --from "$FILE_EXTENSION" --to plain "$FILE_PATH")
        ;;
    *)
        FILE_CONTENT=$(basename "$FILE_PATH")
        ;;
esac

# --- 2. CONSTRUCT THE PROMPT ---
FULL_PROMPT="Based on the following file content, which of the provided destination folders is the best match? Please provide a JSON array of the top 3 most likely folder paths from the list.

Destination folders:
${FOLDER_INDEX_JSON}

File content:
${FILE_CONTENT}

Respond with only the JSON array of the top 3 folder paths."

# --- 3. CALL THE DYNAMIC API ---
JSON_RESPONSE_FILE=$(mktemp)

if [ "$PROVIDER" = "gemini" ]; then
    JSON_PAYLOAD=$(jq -n --arg prompt "$FULL_PROMPT" '{"contents":[{"parts":[{"text":$prompt}]}]}')
    MODEL_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$MODEL_URL"
elif [ "$PROVIDER" = "openai" ]; then
    JSON_PAYLOAD=$(jq -n --arg model "$MODEL_NAME" --arg prompt "$FULL_PROMPT" '{"model":$model, "response_format": { "type": "json_object" }, "messages":[{"role":"user","content":$prompt}]}')
    MODEL_URL="https://api.openai.com/v1/chat/completions"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d "$JSON_PAYLOAD" "$MODEL_URL"
elif [ "$PROVIDER" = "anthropic" ]; then
    # Anthropic doesn't have a guaranteed JSON mode, this is a best-effort prompt
    JSON_PAYLOAD=$(jq -n --arg model "$MODEL_NAME" --arg prompt "$FULL_PROMPT" '{"model":$model,"max_tokens":1024,"messages":[{"role":"user","content":$prompt}]}')
    MODEL_URL="https://api.anthropic.com/v1/messages"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -H "x-api-key: $API_KEY" -H "anthropic-version: 2023-06-01" -d "$JSON_PAYLOAD" "$MODEL_URL"
fi

# --- 4. EXTRACT AND OUTPUT JSON ---
# This part is tricky because LLM output can be messy. We try to find the JSON array.
CLEAN_JSON=$(cat "$JSON_RESPONSE_FILE" | grep -o '\[.*\]' | sed 's/```json//g' | sed 's/```//g')

if [ -n "$CLEAN_JSON" ]; then
    echo "$CLEAN_JSON"
else
    # Fallback if no JSON is found
    echo "[]"
fi

rm "$JSON_RESPONSE_FILE"
