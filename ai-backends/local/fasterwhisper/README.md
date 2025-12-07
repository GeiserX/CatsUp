# fasterwhisper local backend

This backend calls a local HTTP server that runs Faster-Whisper (e.g., a small FastAPI/Flask service).

Expected API:
- POST /transcribe
  Request: { filePath: string, language?: string, options?: { diarization?: boolean, timestamps?: 'segments'|'words', maxSegmentMs?: number }, model?: {...} }
  Response: { segments: [{ start:number, end:number, text:string, words?:[{start,end,word,prob?}] }], language?: string }

Notes:
- Stream mode not implemented here. You can extend the server with SSE/WS for partials and wire it similarly.
- Ensure your server has access to the same file path or support multipart upload.
