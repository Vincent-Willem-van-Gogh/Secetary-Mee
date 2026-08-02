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

Requirements: Node.js 22, pnpm 11, stable Rust, CMake, and the platform's native build tools. Linux additionally needs the WebKitGTK, ALSA, and PulseAudio development packages used by Tauri and system-audio capture.

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build
pnpm tauri build --bundles app -- --features metal
```

The macOS application is generated under `target/release/bundle/macos/Secretary Mee.app`.

Windows x64 uses WASAPI Loopback and Linux x64 uses the PulseAudio default monitor (also provided by `pipewire-pulse`). CPU prerelease packages are built on their native GitHub runners:

```bash
# Windows
cd frontend
pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc

# Ubuntu
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
  patchelf libasound2-dev libpulse-dev libclang-dev
cd frontend
pnpm tauri build --bundles appimage --target x86_64-unknown-linux-gnu
```

Models are downloaded after first launch and are not included in installers. The `Windows and Linux prerelease` GitHub Actions workflow builds both helpers and FFmpeg, verifies the packaged sidecars, generates `SHA256SUMS`, and publishes the unsigned prerelease artifacts.

## Development

```bash
cd frontend
pnpm tauri dev -- --features metal
```

## Repository

[Vincent-Willem-van-Gogh/Secetary-Mee](https://github.com/Vincent-Willem-van-Gogh/Secetary-Mee)

## Source and license

Secretary Mee contains a source-only import of the open-source Meetily Community Edition. See [UPSTREAM.md](UPSTREAM.md) for pinned source commits and excluded upstream artifacts. The original licenses remain in this repository.
