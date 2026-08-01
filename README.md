# Secretary Mee

Secretary Mee is a local-first desktop meeting assistant for recording, real-time transcription, Simplified Chinese translation, and AI summaries.

## Features

- Real-time transcription with Parakeet or Whisper
- Live English and Simplified Chinese transcript view
- Local or API-based AI summaries
- Audio import, retranscription, model management, and meeting history
- English and Simplified Chinese interfaces
- Local SQLite storage

## Technology

- Tauri 2 and Rust desktop backend
- Next.js and React frontend
- SQLite meeting storage
- `whisper.cpp` and ONNX transcription engines
- Built-in AI and configurable external model providers

## Build from source

Requirements: Node.js, pnpm, Rust, CMake, and the platform's native build tools.

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build
pnpm tauri build --bundles app -- --features metal
```

The macOS application is generated under `target/release/bundle/macos/Secretary Mee.app`.

## Development

```bash
cd frontend
pnpm tauri dev -- --features metal
```

## Repository

[Vincent-Willem-van-Gogh/Secetary-Mee](https://github.com/Vincent-Willem-van-Gogh/Secetary-Mee)

## Source and license

Secretary Mee contains a source-only import of the open-source Meetily Community Edition. See [UPSTREAM.md](UPSTREAM.md) for pinned source commits and excluded upstream artifacts. The original licenses remain in this repository.
