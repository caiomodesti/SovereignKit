import type {ReactNode} from 'react';
import {
  AbsoluteFill,
  Img,
  staticFile,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {AudioClip, Background, BrowserFrame, Caption, Eyebrow, FadeUp, MetricCard} from './components';
import {colors, fonts} from './theme';

const TRANSITION = 15;
const SCENE_DURATIONS = [255, 435, 615, 615, 615, 735, 555, 495, 465, 405] as const;
export const TOTAL_FRAMES = SCENE_DURATIONS.reduce((sum, duration) => sum + duration, 0) - TRANSITION * (SCENE_DURATIONS.length - 1);

const Scene = ({children, tone = 'cyan'}: {children: ReactNode; tone?: 'cyan' | 'mint' | 'amber' | 'red'}) => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <Background tone={tone} />
    {children}
  </AbsoluteFill>
);

const Hook = () => (
  <Scene>
    <AudioClip name="01-hook" />
    <AbsoluteFill style={{padding: '110px 150px', justifyContent: 'center'}}>
      <FadeUp><Eyebrow>Solana transaction accessibility</Eyebrow></FadeUp>
      <FadeUp delay={12} style={{maxWidth: 1350}}>
        <div style={{fontFamily: fonts.sans, fontSize: 112, lineHeight: .98, letterSpacing: -5, color: colors.text, fontWeight: 780, marginTop: 28}}>Your RPC accepted the transaction.</div>
      </FadeUp>
      <FadeUp delay={28}><div style={{fontFamily: fonts.sans, fontSize: 72, color: colors.amber, fontWeight: 740, marginTop: 34}}>Did it land?</div></FadeUp>
      <Caption>RPC acknowledgement is not landing.</Caption>
    </AbsoluteFill>
  </Scene>
);

const Problem = () => (
  <Scene tone="amber">
    <AudioClip name="02-problem" />
    <AbsoluteFill style={{padding: '100px 130px', flexDirection: 'row', alignItems: 'center', gap: 80}}>
      <div style={{width: 570}}>
        <FadeUp><Eyebrow color={colors.amber}>The observability gap</Eyebrow></FadeUp>
        <FadeUp delay={12}><div style={{fontFamily: fonts.sans, fontSize: 72, lineHeight: 1.04, color: colors.text, fontWeight: 760, marginTop: 28}}>Acceptance, execution and finality are different events.</div></FadeUp>
      </div>
      <FadeUp delay={20}><BrowserFrame src="screens/lifecycle.png" label="sovereignkit / lifecycle evidence" width={1050} /></FadeUp>
      <Caption>Submission success cannot prove ledger execution.</Caption>
    </AbsoluteFill>
  </Scene>
);

const Architecture = () => (
  <Scene>
    <AudioClip name="03-architecture" />
    <AbsoluteFill style={{padding: '76px 120px', alignItems: 'center'}}>
      <FadeUp style={{alignSelf: 'flex-start'}}><Eyebrow>Controlled evidence pipeline</Eyebrow></FadeUp>
      <FadeUp delay={12} style={{marginTop: 28}}><BrowserFrame src="screens/architecture.png" label="sovereignkit / architecture" width={1510} /></FadeUp>
      <Caption>Matched probes. Logical routes. Observation quorum.</Caption>
    </AbsoluteFill>
  </Scene>
);

const ScenarioLayout = ({title, status, statusColor, description, image, children}: {title: string; status: string; statusColor: string; description: string; image: string; children?: ReactNode}) => (
  <AbsoluteFill style={{padding: '84px 120px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
      <div><FadeUp><Eyebrow>Guided incident replay</Eyebrow></FadeUp><FadeUp delay={10}><div style={{fontFamily: fonts.sans, fontSize: 80, color: colors.text, fontWeight: 780, marginTop: 18}}>{title}</div></FadeUp></div>
      <FadeUp delay={16}><div style={{fontFamily: fonts.mono, fontSize: 34, color: statusColor, border: `1px solid ${statusColor}66`, background: `${statusColor}12`, borderRadius: 999, padding: '16px 28px', fontWeight: 800}}>{status}</div></FadeUp>
    </div>
    <div style={{display: 'flex', alignItems: 'center', gap: 58, marginTop: 48}}>
      <FadeUp delay={18}><BrowserFrame src={image} label="live fixture replay" width={1080} /></FadeUp>
      <FadeUp delay={28} style={{flex: 1, minWidth: 0}}><div style={{fontFamily: fonts.sans, fontSize: 40, lineHeight: 1.3, color: colors.text, fontWeight: 580}}>{description}</div>{children}</FadeUp>
    </div>
  </AbsoluteFill>
);

const Healthy = () => (
  <Scene tone="mint"><AudioClip name="04-healthy" /><ScenarioLayout title="Healthy baseline" status="HEALTHY" statusColor={colors.mint} description="Both matched classes remain equivalent across every logical route." image="screens/dashboard-overview.png" /><Caption>Equal treatment establishes the baseline.</Caption></Scene>
);

const Degraded = () => (
  <Scene tone="amber"><AudioClip name="05-degraded" /><ScenarioLayout title="General degradation" status="DEGRADED" statusColor={colors.amber} description="Route A falls to twenty percent for both classes. The engine does not call this asymmetry." image="screens/dashboard-overview.png"><div style={{display: 'flex', gap: 18, marginTop: 34}}><MetricCard value="20%" label="MATCHED_CONTROL" accent={colors.amber} /><MetricCard value="20%" label="PROGRAM_X" accent={colors.amber} delay={7} /></div></ScenarioLayout><Caption>Both classes fall together: DEGRADED.</Caption></Scene>
);

const Asymmetric = () => (
  <Scene tone="red"><AudioClip name="06-asymmetric" /><ScenarioLayout title="Selective rejection" status="ASYMMETRIC" statusColor={colors.red} description="Only route A separates the matched transaction classes. Classification is derived from measurements." image="screens/asymmetric-replay.png"><div style={{display: 'flex', gap: 18, marginTop: 34}}><MetricCard value="100%" label="MATCHED_CONTROL" accent={colors.mint} /><MetricCard value="0%" label="PROGRAM_X" accent={colors.red} delay={7} /></div></ScenarioLayout><Caption>Same method. Different treatment. Reproducible evidence.</Caption></Scene>
);

const Failover = () => (
  <Scene tone="mint">
    <AudioClip name="07-failover" />
    <AbsoluteFill style={{padding: '100px 140px'}}>
      <FadeUp><Eyebrow>Fail-open routing</Eyebrow></FadeUp>
      <FadeUp delay={10}><div style={{fontFamily: fonts.sans, fontSize: 82, fontWeight: 780, color: colors.text, marginTop: 20}}>Evidence informs a bounded fallback.</div></FadeUp>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, marginTop: 115}}>
        {[
          {name: 'PRIMARY', state: 'RPC_REJECTED', color: colors.red},
          {name: 'FALLBACK', state: 'RPC_ACKNOWLEDGED', color: colors.amber},
          {name: 'READERS', state: 'QUORUM 2/3', color: colors.cyan},
          {name: 'LEDGER', state: 'CONFIRMED', color: colors.mint},
        ].map((item, index) => <FadeUp key={item.name} delay={12 + index * 10} style={{display: 'flex', alignItems: 'center', gap: 26}}><div style={{width: 330, padding: '34px 28px', borderRadius: 20, background: 'rgba(16,41,58,.84)', border: `1px solid ${item.color}66`}}><div style={{fontFamily: fonts.mono, fontSize: 26, color: colors.muted}}>{item.name}</div><div style={{fontFamily: fonts.mono, fontSize: 30, color: item.color, marginTop: 18, fontWeight: 800}}>{item.state}</div></div>{index < 3 && <div style={{fontFamily: fonts.sans, color: colors.muted, fontSize: 50}}>→</div>}</FadeUp>)}
      </div>
      <Caption>Acknowledgement remains separate from observation.</Caption>
    </AbsoluteFill>
  </Scene>
);

const Devnet = () => {
  const signature = '2RzqePQSCvQL6Ve88sZR6uLMyNiKE7HukCN9aqroYgTud8LAWYzZX8XrnsEGdWt6BC78pQLWuufiyH7dzaAn5mvD';
  return <Scene><AudioClip name="08-devnet" /><AbsoluteFill style={{padding: '90px 130px'}}><FadeUp><Eyebrow>Real Devnet integration proof</Eyebrow></FadeUp><FadeUp delay={10}><div style={{fontFamily: fonts.sans, fontSize: 74, color: colors.text, fontWeight: 760, marginTop: 20}}>Observed through FINALIZED.</div></FadeUp><div style={{display: 'flex', gap: 54, alignItems: 'center', marginTop: 52}}><FadeUp delay={18}><BrowserFrame src="screens/lifecycle.png" label="Solana Devnet / accepted evidence" width={1120} /></FadeUp><FadeUp delay={28} style={{flex: 1}}><MetricCard value="2/3" label="logical reader quorum" accent={colors.cyan} /><div style={{fontFamily: fonts.mono, fontSize: 24, lineHeight: 1.55, color: colors.muted, marginTop: 34, wordBreak: 'break-all'}}>{signature}</div></FadeUp></div><Caption>Devnet validates integration, not statistical claims.</Caption></AbsoluteFill></Scene>;
};

const Proof = () => (
  <Scene tone="mint"><AudioClip name="09-proof" /><AbsoluteFill style={{padding: '110px 140px'}}><FadeUp><Eyebrow>Reproducible release gate</Eyebrow></FadeUp><FadeUp delay={10}><div style={{fontFamily: fonts.sans, fontSize: 78, color: colors.text, fontWeight: 760, marginTop: 22}}>Evidence before infrastructure claims.</div></FadeUp><div style={{display: 'flex', gap: 24, marginTop: 125}}><MetricCard value="600" label="signed statistical units" /><MetricCard value="85" label="TypeScript tests" delay={7} /><MetricCard value="3" label="Rust tests" delay={14} /><MetricCard value="95.06%" label="line coverage" delay={21} /></div><Caption>Controlled proof. Explicit limitations. Open source.</Caption></AbsoluteFill></Scene>
);

const CTA = () => (
  <Scene><AudioClip name="10-cta" /><AbsoluteFill style={{padding: '120px 150px', justifyContent: 'center', alignItems: 'center'}}><FadeUp><Img src={staticFile('brand/sovereignkit-mark.svg')} style={{width: 150, height: 150}} /></FadeUp><FadeUp delay={12}><div style={{fontFamily: fonts.sans, fontSize: 82, color: colors.text, fontWeight: 790, marginTop: 30}}>Replay the evidence.</div></FadeUp><FadeUp delay={22}><div style={{fontFamily: fonts.mono, fontSize: 34, color: colors.cyan, marginTop: 26}}>sovereignkit-observatory.samuel-rramos.chatgpt.site</div></FadeUp><FadeUp delay={30}><div style={{fontFamily: fonts.mono, fontSize: 28, color: colors.muted, marginTop: 18}}>github.com/caiomodesti/SovereignKit</div></FadeUp><Caption>Measure the path. Preserve the evidence.</Caption></AbsoluteFill></Scene>
);

const sequences = [Hook, Problem, Architecture, Healthy, Degraded, Asymmetric, Failover, Devnet, Proof, CTA];

export const PitchVideo = () => (
  <TransitionSeries>
    {sequences.map((Component, index) => [
      <TransitionSeries.Sequence key={`scene-${index}`} durationInFrames={SCENE_DURATIONS[index]!} premountFor={30}><Component /></TransitionSeries.Sequence>,
      index < sequences.length - 1 ? <TransitionSeries.Transition key={`transition-${index}`} presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION})} /> : null,
    ])}
  </TransitionSeries>
);
