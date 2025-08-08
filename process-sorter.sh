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

# --- 1. EXTRACT FILE CONTENT & METADATA ---
FILE_EXTENSION="${FILE_PATH##*.}"
FILE_CONTENT=""
CREATION_DATE=$(exiftool -s -s -s -d "%Y-%m-%d %H:%M:%S" -CreateDate -ModifyDate -FileModifyDate "$FILE_PATH" | head -n 1)
if [ -z "$CREATION_DATE" ]; then CREATION_DATE="Not available"; fi

case "$FILE_EXTENSION" in
    pdf)
        # Attempt to extract text first to see if OCR is needed.
        TEXT_CHECK=$(pdftotext -layout "$FILE_PATH" - | tr -d '[:space:]')

        if [ ${#TEXT_CHECK} -lt 100 ]; then
            # PDF is likely image-based, perform OCR
            WORK_DIR=$(mktemp -d)
            gs -o "${WORK_DIR}/page_%03d.png" -sDEVICE=png16m -r150 "$FILE_PATH" >/dev/null 2>&1
            for page_image in "${WORK_DIR}"/page_*.png; do
                tesseract "$page_image" stdout -l eng+deu+spa >> "${WORK_DIR}/c.txt" 2>/dev/null
                rm "$page_image"
            done
            FILE_CONTENT=$(cat "${WORK_DIR}/c.txt")
            rm -rf "$WORK_DIR"
        else
            # PDF has text, extract it directly
            FILE_CONTENT=$(pdftotext -layout "$FILE_PATH" -)
        fi
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
if [ "$PROVIDER" = "openai" ]; then
    JSON_INSTRUCTION="Respond with only a valid JSON array containing the top 3 folder paths."
else
    JSON_INSTRUCTION="Respond with only the JSON array of the top 3 folder paths."
fi

FULL_PROMPT="Based on the following file name, creation date, and content, which of the provided destination folders is the best match? Please provide a JSON array of the top 3 most likely folder paths from the list, in order of relevance.

Destination folders:
${FOLDER_INDEX_JSON}

File name:
${FILE_NAME}

File creation date:
${CREATION_DATE}

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
    RAW_TEXT=$(jq -r '.choices[0].message.content' "$JSON_RESPONSE_FILE")
elif [ "$PROVIDER" = "anthropic" ]; then
    RAW_TEXT=$(jq -r '.content[0].text' "$JSON_RESPONSE_FILE")
fi

JSON_CANDIDATE=$(echo "$RAW_TEXT" | sed -n '/\[/,/\]/p')
if [ -z "$JSON_CANDIDATE" ]; then
    JSON_CANDIDATE=$(echo "$RAW_TEXT" | grep -o '\[.*\]')
fi
CLEAN_JSON=$(echo "$JSON_CANDIDATE" | sed 's/```json//g' | sed 's/```//g' | tr -d '\n\r')

if jq -e . >/dev/null 2>&1 <<<"$CLEAN_JSON"; then
    echo "$CLEAN_JSON"
else
    echo "[]"
fi

rm "$JSON_RESPONSE_FILE"
