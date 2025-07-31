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
FILE_NAME=$(basename "$FILE_PATH")


# --- Set PATH ---
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH

# --- 1. EXTRACT FILE CONTENT ---
FILE_EXTENSION="${FILE_PATH##*.}"
FILE_CONTENT=""
case "$FILE_EXTENSION" in
    pdf)
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
        FILE_CONTENT="No text content could be extracted."
        ;;
esac

# --- 2. CONSTRUCT THE PROMPT ---
# Note: For OpenAI, we add a specific instruction to ensure JSON output.
if [ "$PROVIDER" = "openai" ]; then
    JSON_INSTRUCTION="Respond with only a valid JSON array containing the top 3 folder paths."
else
    JSON_INSTRUCTION="Respond with only the JSON array of the top 3 folder paths."
fi

FULL_PROMPT="Based on the following file name and content, which of the provided destination folders is the best match? Please provide a JSON array of the top 3 most likely folder paths from the list, in order of relevance.

Destination folders:
${FOLDER_INDEX_JSON}

File name:
${FILE_NAME}

File content:
${FILE_CONTENT}

${JSON_INSTRUCTION}"


# --- 3. CALL THE DYNAMIC API ---
JSON_RESPONSE_FILE=$(mktemp)

if [ "$PROVIDER" = "gemini" ]; then
    JSON_PAYLOAD=$(jq -n --arg prompt "$FULL_PROMPT" '{"contents":[{"parts":[{"text":$prompt}]}]}')
    MODEL_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$MODEL_URL"
elif [ "$PROVIDER" = "openai" ]; then
    # OpenAI has a specific JSON mode which is more reliable
    JSON_PAYLOAD=$(jq -n --arg model "$MODEL_NAME" --arg prompt "$FULL_PROMPT" '{"model":$model, "response_format": { "type": "json_object" }, "messages":[{"role":"user","content":$prompt}]}')
    MODEL_URL="https://api.openai.com/v1/chat/completions"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d "$JSON_PAYLOAD" "$MODEL_URL"
elif [ "$PROVIDER" = "anthropic" ]; then
    JSON_PAYLOAD=$(jq -n --arg model "$MODEL_NAME" --arg prompt "$FULL_PROMPT" '{"model":$model,"max_tokens":1024,"messages":[{"role":"user","content":$prompt}]}')
    MODEL_URL="https://api.anthropic.com/v1/messages"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -H "x-api-key: $API_KEY" -H "anthropic-version: 2023-06-01" -d "$JSON_PAYLOAD" "$MODEL_URL"
fi

# --- 4. EXTRACT AND OUTPUT JSON ---
RAW_TEXT=""
if [ "$PROVIDER" = "gemini" ]; then
    RAW_TEXT=$(jq -r '.candidates[0].content.parts[0].text' "$JSON_RESPONSE_FILE")
elif [ "$PROVIDER" = "openai" ]; then
    # For OpenAI's JSON mode, the content itself is a JSON string.
    RAW_TEXT=$(jq -r '.choices[0].message.content' "$JSON_RESPONSE_FILE")
elif [ "$PROVIDER" = "anthropic" ]; then
    RAW_TEXT=$(jq -r '.content[0].text' "$JSON_RESPONSE_FILE")
fi

# Find the start of the JSON array '[' and the end ']'
JSON_CANDIDATE=$(echo "$RAW_TEXT" | sed -n '/\[/,/\]/p')

# If that fails (e.g., it's all on one line), try grep
if [ -z "$JSON_CANDIDATE" ]; then
    JSON_CANDIDATE=$(echo "$RAW_TEXT" | grep -o '\[.*\]')
fi

# Remove markdown backticks and any newlines/carriage returns
CLEAN_JSON=$(echo "$JSON_CANDIDATE" | sed 's/```json//g' | sed 's/```//g' | tr -d '\n\r')

# Validate and output
if jq -e . >/dev/null 2>&1 <<<"$CLEAN_JSON"; then
    echo "$CLEAN_JSON"
else
    # If JSON is invalid, return an empty array
    echo "[]"
fi

rm "$JSON_RESPONSE_FILE"
