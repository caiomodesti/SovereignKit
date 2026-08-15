# Hackathon video production

## Deliverable

- Title: `SovereignKit — Measure the path. Preserve the evidence.`
- Format: 1920×1080, 30 fps, H.264 video, AAC stereo audio, BT.709
- Duration: 168.554667 seconds
- Final local file: `apps/video/out/sovereignkit-hackathon.mp4`
- SHA-256: `4407D1B438BB75E523FC1EEEAB23355178ABBA112E6A3CA06580AC9962F8497F`
- Public release: <https://github.com/caiomodesti/SovereignKit/releases/tag/hackathon-demo-v0.1>

The MP4 is a release asset rather than a tracked Git blob. The reproducible
source lives in `apps/video/`.

## Narrative

The video uses a hackathon speedrun structure:

1. RPC acknowledgement is not landing.
2. SovereignKit separates submission, observation, confirmation, and finality.
3. Matched probes and a logical 2/3 observation quorum create retained evidence.
4. HEALTHY establishes equivalent treatment.
5. DEGRADED shows both classes falling together.
6. ASYMMETRIC shows the controlled 100% versus 0% selective-reject result.
7. The SDK performs bounded fail-open routing without treating acknowledgement as confirmation.
8. A real Devnet fixture reconstructs through FINALIZED.
9. The release gate reports 600 signed units, 85 TypeScript tests, 3 Rust tests, and 95.06% line coverage.
10. The viewer is directed to the live evidence replay and source repository.

All numbers are sourced from accepted repository artifacts. The video preserves
the project's epistemic limits: the local readers are logically redundant, not
infrastructure-independent, and Devnet validates integration rather than the
controlled statistical result.

## Reproduce

Requirements are the repository-pinned Node.js and pnpm versions. The first
render downloads Remotion's pinned headless browser.

```powershell
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm video:audio
corepack pnpm video:check
corepack pnpm video:thumbnail
corepack pnpm video:render
```

The narration generator uses Microsoft Edge's online text-to-speech service
with `en-US-AriaNeural`. Generated voice files and render outputs are ignored by
Git; the script and exact narration remain versioned.

## Verification

```powershell
node_modules\.pnpm\@remotion+compositor-win32-x64-msvc@4.0.512\node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe `
  -v error `
  -show_entries format=duration,size,bit_rate `
  -show_entries stream=index,codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels `
  -of json `
  apps\video\out\sovereignkit-hackathon.mp4
```

Expected streams:

- H.264, 1920×1080, 30 fps
- AAC, 48 kHz, stereo

## Accessibility and media

- [English captions](video/sovereignkit-hackathon.srt)
- [1280×720 thumbnail](video/sovereignkit-thumbnail.png)
