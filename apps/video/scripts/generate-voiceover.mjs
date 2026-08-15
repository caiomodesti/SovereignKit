import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {EdgeTTS} from 'node-edge-tts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicAudioDirectory = path.resolve(scriptDirectory, '../public/audio/generated');
const outputDirectory = path.resolve(scriptDirectory, '../out');

const scenes = [
  {name: '01-hook', start: '00:00:00,000', end: '00:00:08,000', text: 'Your RPC said yes. But acknowledgement is not execution, confirmation, or finality. Did it land?'},
  {name: '02-problem', start: '00:00:08,000', end: '00:00:22,000', text: 'During network incidents, wallets and protocols often see an acknowledgement without independent evidence of ledger execution. SovereignKit preserves those events separately, because collapsing them creates false certainty.'},
  {name: '03-architecture', start: '00:00:22,000', end: '00:00:42,000', text: 'SovereignKit runs unique but methodologically matched transactions through logical routes. Three logical readers observe independently from the submission client. A two-of-three quorum reconstructs the lifecycle from append-only, signed evidence.'},
  {name: '04-healthy', start: '00:00:42,000', end: '00:01:02,000', text: 'First, the healthy baseline. MATCHED CONTROL and PROGRAM X receive equivalent treatment across all routes. The policy reports healthy only from the retained measurements, never from a provider label or assumption.'},
  {name: '05-degraded', start: '00:01:02,000', end: '00:01:22,000', text: 'Next, general degradation. Route A falls to twenty percent for both classes, while the other routes remain healthy. Because both classes fall together, the engine correctly reports degraded, not asymmetric.'},
  {name: '06-asymmetric', start: '00:01:22,000', end: '00:01:46,000', text: 'Now the selective-reject scenario. Route A lands one hundred percent of MATCHED CONTROL probes and zero percent of PROGRAM X probes. The controlled profile produces a distinct, reproducible asymmetric classification, with limited evidence strength explicitly disclosed.'},
  {name: '07-failover', start: '00:01:46,000', end: '00:02:04,000', text: 'The SDK consumes versioned route intelligence with T T L, hysteresis and developer override. When the primary rejects, it performs bounded failover. A fallback acknowledgement still waits for independent quorum before confirmation.'},
  {name: '08-devnet', start: '00:02:04,000', end: '00:02:20,000', text: 'A real Solana Devnet transaction then validates the integration path. Raw events reconstruct the complete lifecycle through confirmed and finalized, with a two-of-three logical reader quorum. Devnet is not the statistical proof.'},
  {name: '09-proof', start: '00:02:20,000', end: '00:02:35,000', text: 'The release gate verifies six hundred signed statistical units, eighty-five TypeScript tests, three Rust tests, and ninety-five point zero six percent line coverage. The limitations remain part of the result.'},
  {name: '10-cta', start: '00:02:35,000', end: '00:02:48,500', text: 'SovereignKit is open source. Replay the accepted fixtures, inspect the evidence, and test the live read-only observatory. Measure the path. Preserve the evidence.'},
];

await mkdir(publicAudioDirectory, {recursive: true});
await mkdir(outputDirectory, {recursive: true});

const tts = new EdgeTTS({
  voice: 'en-US-AriaNeural',
  lang: 'en-US',
  outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
  saveSubtitles: false,
  pitch: '-2Hz',
  rate: '+12%',
  volume: 'default',
  timeout: 30000,
});

for (const scene of scenes) {
  const outputPath = path.join(publicAudioDirectory, `${scene.name}.mp3`);
  await tts.ttsPromise(scene.text, outputPath);
  process.stdout.write(`Generated ${scene.name}\n`);
}

const srt = scenes.map((scene, index) => `${index + 1}\r\n${scene.start} --> ${scene.end}\r\n${scene.text}\r\n`).join('\r\n');
const captionPath = path.join(outputDirectory, 'sovereignkit-hackathon.srt');
await writeFile(captionPath, srt, 'utf8');
process.stdout.write(`Generated ${captionPath}\n`);
