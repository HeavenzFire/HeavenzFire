# Termux Agent Web Observation v0.1

This feature adds explicit, bounded web and YouTube observation commands to the local Termux agent. It uses Node.js built-ins for public-page retrieval and DuckDuckGo HTML search. YouTube metadata and available English subtitles/captions are retrieved through the optional `yt-dlp` executable.

## Commands

From the repository root:

```sh
node UnifiedField/TermuxAgent/observe.cjs search "query terms"
node UnifiedField/TermuxAgent/observe.cjs page "https://example.org/"
node UnifiedField/TermuxAgent/observe.cjs youtube "https://www.youtube.com/watch?v=VIDEO_ID"
node UnifiedField/TermuxAgent/observe.cjs youtube "https://youtu.be/VIDEO_ID" --captions
```

The interactive local agent also accepts:

- `:search <query>`
- `:page <https-url>`
- `:youtube <youtube-url> [--captions]`

The retrieved evidence is passed to the local model as **untrusted source material**. Instructions embedded in pages, search results, descriptions, or captions must not be followed.

## Optional YouTube dependency

Install yt-dlp from the configured Termux package repository:

```sh
pkg install yt-dlp
yt-dlp --version
```

Caption retrieval is best-effort. Videos may have no English captions, may be region/age restricted, or may be unavailable to yt-dlp. This adapter does not bypass authentication, DRM, paywalls, or access controls.

## Evidence semantics

- Web page: retrieved HTML text, metadata, links, capture timestamp, SHA-256 of extracted text.
- Search: search-result titles and destination URLs; a result is a lead, not proof of the destination's contents.
- YouTube without captions: video metadata only.
- YouTube with captions: metadata plus available English captions.
- `visual_inspection: false` is intentional. A title or transcript is **not** evidence that an agent visually watched the video.
- No screenshot, rendered-page visual understanding, or frame-by-frame video perception is claimed in v0.1. Those require a separately deployed browser/screen-capture adapter and a vision-capable model.

## Safety and resource bounds

- HTTP(S) only; URL credentials, localhost, local hostnames, private/reserved IP literals, and hostnames resolving to private/reserved addresses are rejected.
- Redirects are followed manually, revalidated, and limited to five hops.
- Page responses are streamed with a 1 MB cap and a 15-second default timeout.
- Extracted page text is capped at 40,000 characters; search results at 10.
- yt-dlp calls have a 30-second default timeout and bounded process output. Caption text is capped at 30,000 characters and temporary caption files are removed.
- No browser profile, cookies, login credentials, arbitrary shell, or remote execution is exposed to the agent.
- Search availability depends on DuckDuckGo's public HTML endpoint and may be rate-limited or changed upstream.

## Validation

```sh
bash UnifiedField/TermuxAgent/verify-termux.sh
```

The verification script syntax-checks `observe.cjs` and runs its deterministic tests plus the agent command-routing tests. These tests use mocked network responses; they do not prove live search-provider availability or live YouTube access.

For live smoke checks, run one search, one public page, and one permitted YouTube video manually. Record the returned evidence types and confirm that the agent never labels transcript-only evidence as visual inspection.

## Status

Implementation is a feature branch pending review and CI. It is not yet deployed to the user's Termux checkout. The existing Windows Edge BrowserBridge remains a separate component and is not connected to Android by this change.
