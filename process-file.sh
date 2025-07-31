#!/bin/bash

# This is the final, standalone processing script called by the Electron app.
# It is designed to be robust and handle multiple file types.

# --- ARGUMENT MAPPING ---
# $1: Input file path
# $2: Output directory path
# $3: Originals directory path
# $4: Boolean for moving the original file ("true" or "false")
# $5: API Key
# $6: AI Model Name (e.g., "gemini-1.5-flash-latest")
# $7: The full text of the prompt to use
# $8: The AI Provider ("gemini", "openai", "anthropic")
# $9: Boolean for converting to PDF/A ("true" or "false")
# $10: The file extension (e.g., "pdf", "txt")

# --- CONFIGURATION ---
ORIGINAL_FILE_PATH="$1"
OUTPUT_DIR="$2"
ORIGINALS_DIR="$3"
MOVE_ORIGINAL="$4"
API_KEY="$5"
MODEL_NAME="$6"
PROMPT_TEXT="$7"
PROVIDER="$8"
CONVERT_TO_PDFA="$9"
FILE_EXTENSION="${10}"

# --- Set the PATH for Homebrew tools ---
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH

# --- 1. SETUP & VALIDATION ---
if [ -z "$API_KEY" ]; then
    echo "Processing failed: API Key is missing." >&2
    exit 1
fi

BASE_NAME=$(basename "$ORIGINAL_FILE_PATH" ."$FILE_EXTENSION")
WORK_DIR=$(mktemp -d)
JSON_RESPONSE_FILE="${WORK_DIR}/api_response.json"
FINAL_SOURCE_FILE=""
FULL_PROMPT=""
EXTRACTED_TEXT=""

# --- 2. CREATE A WORKING COPY & HANDLE ORIGINAL ---
# The script will now work on a copy, preserving the original file.
PROCESSING_FILE_PATH="${WORK_DIR}/$(basename "$ORIGINAL_FILE_PATH")"
cp "$ORIGINAL_FILE_PATH" "$PROCESSING_FILE_PATH"

# Archive the original file if requested. This does not affect the processing copy.
if [ "$MOVE_ORIGINAL" = "true" ]; then
    mkdir -p "$ORIGINALS_DIR"
    mv "$ORIGINAL_FILE_PATH" "$ORIGINALS_DIR"
fi


# --- 3. MAIN LOGIC: Differentiate between PDF and other files ---
if [ "$FILE_EXTENSION" = "pdf" ]; then
    # --- PDF PROCESSING WORKFLOW ---
    
    # Attempt to extract text first to see if OCR is needed.
    TEXT_CHECK=$(pdftotext -layout "$PROCESSING_FILE_PATH" - | tr -d '[:space:]')
    
    # If extracted text is very short (less than 100 chars), assume it's an image-based PDF needing OCR.
    if [ ${#TEXT_CHECK} -lt 100 ]; then
        # PDF is likely image-based, proceed with OCR workflow
        SEARCHABLE_PDF="${WORK_DIR}/searchable_ocr.pdf"
        
        gtimeout 120 gs -o "${WORK_DIR}/page_%03d.png" -sDEVICE=png16m -r300 "$PROCESSING_FILE_PATH" >/dev/null 2>&1
        if [ $? -ne 0 ] || ! ls "${WORK_DIR}/page_"*.png >/dev/null 2>&1; then
            echo "Processing failed: Ghostscript failed to convert PDF to images." >&2; rm -rf "$WORK_DIR"; exit 1
        fi

        gtimeout 120 find "$WORK_DIR" -name "*.png" | sort | tesseract stdin "${SEARCHABLE_PDF%.pdf}" -l eng+deu+spa pdf >/dev/null 2>&1
        if [ ! -s "$SEARCHABLE_PDF" ]; then
            echo "Processing failed: Tesseract could not create a searchable PDF." >&2; rm -rf "$WORK_DIR"; exit 1
        fi

        if [ "$CONVERT_TO_PDFA" = "true" ]; then
            PDFA_PDF="${WORK_DIR}/${BASE_NAME}_PDFA.pdf"
            gtimeout 120 gs -dPDFA=2 -dBATCH -dNOPAUSE -sColorConversionStrategy=sRGB -sDEVICE=pdfwrite -sOutputFile="$PDFA_PDF" "$SEARCHABLE_PDF" >/dev/null 2>&1
            if [ $? -eq 0 ] && [ -s "$PDFA_PDF" ]; then
                FINAL_SOURCE_FILE="$PDFA_PDF"
            else
                FINAL_SOURCE_FILE="$SEARCHABLE_PDF" # Fallback on conversion failure
            fi
        else
            FINAL_SOURCE_FILE="$SEARCHABLE_PDF"
        fi
        # Re-extract text from the new OCR'd PDF
        EXTRACTED_TEXT=$(pdftotext -layout "$FINAL_SOURCE_FILE" -)
    else
        # PDF has text, no OCR needed. Use the initially extracted text.
        EXTRACTED_TEXT=$(pdftotext -layout "$PROCESSING_FILE_PATH" -) # Get text with spaces this time
        
        if [ "$CONVERT_TO_PDFA" = "true" ]; then
            PDFA_PDF="${WORK_DIR}/${BASE_NAME}_PDFA.pdf"
            gtimeout 120 gs -dPDFA=2 -dBATCH -dNOPAUSE -sColorConversionStrategy=sRGB -sDEVICE=pdfwrite -sOutputFile="$PDFA_PDF" "$PROCESSING_FILE_PATH" >/dev/null 2>&1
            if [ $? -eq 0 ] && [ -s "$PDFA_PDF" ]; then
                FINAL_SOURCE_FILE="$PDFA_PDF"
            else
                FINAL_SOURCE_FILE="$PROCESSING_FILE_PATH" # Fallback on conversion failure
            fi
        else
            FINAL_SOURCE_FILE="$PROCESSING_FILE_PATH"
        fi
    fi

    FULL_PROMPT="${PROMPT_TEXT}
File content:
$EXTRACTED_TEXT"

else
    # --- NON-PDF PROCESSING WORKFLOW ---
    FINAL_SOURCE_FILE="$PROCESSING_FILE_PATH"
    CREATION_DATE=$(exiftool -s -s -s -d "%Y-%m-%d %H:%M:%S" -CreateDate -ModifyDate -FileModifyDate "$PROCESSING_FILE_PATH" | head -n 1)
    if [ -z "$CREATION_DATE" ]; then CREATION_DATE="Not available"; fi

    case "$FILE_EXTENSION" in
        txt) FILE_CONTENT=$(cat "$PROCESSING_FILE_PATH") ;;
        docx|doc|pptx|ppt) FILE_CONTENT=$(pandoc --from "$FILE_EXTENSION" --to plain "$PROCESSING_FILE_PATH") ;;
        *) FILE_CONTENT=$(basename "$PROCESSING_FILE_PATH") ;;
    esac
    
    FULL_PROMPT="${PROMPT_TEXT}
File creation date: ${CREATION_DATE}
File content/name:
${FILE_CONTENT}"
fi

# --- 4. CALL THE DYNAMIC API ---
if [ "$PROVIDER" = "gemini" ]; then
    JSON_PAYLOAD=$(jq -n --arg prompt "$FULL_PROMPT" '{"contents":[{"parts":[{"text":$prompt}]}]}')
    MODEL_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$MODEL_URL"
elif [ "$PROVIDER" = "openai" ]; then
    JSON_PAYLOAD=$(jq -n --arg model "$MODEL_NAME" --arg prompt "$FULL_PROMPT" '{"model":$model,"messages":[{"role":"user","content":$prompt}]}')
    MODEL_URL="https://api.openai.com/v1/chat/completions"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d "$JSON_PAYLOAD" "$MODEL_URL"
elif [ "$PROVIDER" = "anthropic" ]; then
    JSON_PAYLOAD=$(jq -n --arg model "$MODEL_NAME" --arg prompt "$FULL_PROMPT" '{"model":$model,"max_tokens":1024,"messages":[{"role":"user","content":$prompt}]}')
    MODEL_URL="https://api.anthropic.com/v1/messages"
    curl -s -o "$JSON_RESPONSE_FILE" -X POST -H "Content-Type: application/json" -H "x-api-key: $API_KEY" -H "anthropic-version: 2023-06-01" -d "$JSON_PAYLOAD" "$MODEL_URL"
fi

if [ $? -ne 0 ]; then
    echo "Processing failed: The API call with curl failed." >&2; rm -rf "$WORK_DIR"; exit 1
fi

# --- 5. PROCESS RESPONSE AND RENAME ---
SUGGESTED_NAME=""
if [ "$PROVIDER" = "gemini" ]; then
    SUGGESTED_NAME=$(jq -r '.candidates[0].content.parts[0].text' "$JSON_RESPONSE_FILE" | tr -d '`\n/')
elif [ "$PROVIDER" = "openai" ]; then
    SUGGESTED_NAME=$(jq -r '.choices[0].message.content' "$JSON_RESPONSE_FILE" | tr -d '`\n/')
elif [ "$PROVIDER" = "anthropic" ]; then
    SUGGESTED_NAME=$(jq -r '.content[0].text' "$JSON_RESPONSE_FILE" | tr -d '`\n/')
fi

if [ $? -ne 0 ] || [[ -z "$SUGGESTED_NAME" || "$SUGGESTED_NAME" = "null" ]]; then
    echo "Processing failed: Could not get a valid name from the AI provider." >&2
    mv "$FINAL_SOURCE_FILE" "${OUTPUT_DIR}/${BASE_NAME}_PROCESSED.${FILE_EXTENSION}"
    FINAL_MESSAGE="Created: ${BASE_NAME}_PROCESSED.${FILE_EXTENSION}. AI failed to suggest a name."
else
    NEW_FILE_PATH="${OUTPUT_DIR}/${SUGGESTED_NAME}.${FILE_EXTENSION}"
    mv "$FINAL_SOURCE_FILE" "$NEW_FILE_PATH"
    FINAL_MESSAGE="Renamed to: ${SUGGESTED_NAME}.${FILE_EXTENSION}"
fi

# --- 6. CLEANUP ---
rm -rf "$WORK_DIR"

# --- 7. FINISH ---
echo "$FINAL_MESSAGE"
