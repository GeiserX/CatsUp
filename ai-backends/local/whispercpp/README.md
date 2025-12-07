# whispercpp local backend

This backend wraps the whisper.cpp CLI for file transcription.

Requirements:
- Built whisper.cpp CLI binary (e.g., `main`, `whisper-cli`)
- A compatible model file (e.g., `ggml-base.en.bin`)

Configure:
- `binaryPath`: absolute path to whisper.cpp binary
- `modelPath`: absolute path to your model file
- Optionally set `TranscriberModelOptions.modelId` to override `modelPath`
- Language `auto` or a BCP-47 code (e.g., `en`)

Notes:
- Stream mode is not implemented in this wrapper.
- whisper.cpp JSON schema can vary; this wrapper handles common fields (`segments` with `text`, `start`, `end`, optional `words`).
