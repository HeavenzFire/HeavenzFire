# HeavenzFire Voice — source-first foundation

This subsystem starts with the recordings already made for HeavenzFire. It does not ask the creator to re-record by default and does not pretend a voice model exists before one has been built and tested.

The catalog API defaults to loopback port `8793` to avoid colliding with the existing HeavenzFire Tesla voice service on `8796`. It is not started by the Unified Field launcher and does not replace the existing voice service.

## Current capability

- Recursively inventories supported audio files in a user-designated local folder.
- Records relative path, file size, modification time, SHA-256, and WAV technical metadata (codec, channels, sample rate, bit depth, duration when available).
- Skips hidden entries and symbolic links; limits traversal depth and catalog size.
- Reads source audio only. It does not upload, transcode, rename, overwrite, or delete source recordings.
- Requires no npm dependencies and works with Node.js 18+.

## Bring the existing catalog into the workflow

1. Collect original masters or vocal stems already owned by the creator from existing release/archive folders. Prefer clean spoken or dry vocal material where it already exists; do not download or re-use a third party's voice.
2. Copy or export those files into `UnifiedField/Voice/sources/`. This is an intentional user-controlled copy; the indexer itself is read-only.
3. From the repository root, run in PowerShell 5.1: `node .\\UnifiedField\\Voice\\index-voice-sources.cjs`
4. Or specify a source folder and output manifest: `node .\\UnifiedField\\Voice\\index-voice-sources.cjs 'D:\\HeavenzFire-Audio' '.\\UnifiedField\\Voice\\voice-source-catalog.json'`
5. Inspect the generated catalog. It contains local paths and content hashes; keep it private if the source directory or file names are sensitive.

## Identity and implementation boundary

This is the auditable **source-intake stage**, not a trained voice clone and not a TTS engine. Singing/rapping recordings can provide identity information, but effects, backing tracks, mastering, and musical delivery can degrade speech-model training. The next stage must evaluate whether available owned recordings contain sufficient clean vocal material, then select a local inference/training path that fits the machine's storage and hardware budget. Do not install a large model or duplicate audio assets without approval.

The final voice pipeline should expose a local synthesis adapter to the Digital Brain and Avatar Body, include an explicit microphone/recording permission gate for enrollment, and make audio deletion/export user-controlled. Until a locally generated sample is evaluated, report voice synthesis as **not configured**. A generic system voice is not the creator's voice.

## Tests

Run `node --test .\\UnifiedField\\Voice\\voice-source-indexer.test.cjs` from the repository root.
