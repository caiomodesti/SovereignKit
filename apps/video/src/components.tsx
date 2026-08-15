import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {noise2D} from '@remotion/noise';
import {colors, fonts} from './theme';

export const Background = ({tone = 'cyan'}: {tone?: 'cyan' | 'mint' | 'amber' | 'red'}) => {
  const frame = useCurrentFrame();
  const accent = tone === 'mint' ? colors.mint : tone === 'amber' ? colors.amber : tone === 'red' ? colors.red : colors.cyan;
  const drift = noise2D('background', frame / 240, 0) * 7;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${28 + drift}% 28%, ${accent}22 0%, transparent 38%), radial-gradient(circle at 82% 72%, ${colors.blue}18 0%, transparent 42%), linear-gradient(145deg, ${colors.bg}, ${colors.bgSoft})`,
      }}
    >
      <AbsoluteFill style={{backgroundImage: 'linear-gradient(rgba(156,180,197,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(156,180,197,.035) 1px, transparent 1px)', backgroundSize: '48px 48px'}} />
      <AbsoluteFill style={{boxShadow: 'inset 0 0 180px rgba(0,0,0,.52)'}} />
    </AbsoluteFill>
  );
};

export const FadeUp = ({children, delay = 0, distance = 34, style}: {children: ReactNode; delay?: number; distance?: number; style?: CSSProperties}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame: frame - delay, fps, config: {damping: 200, stiffness: 120}});
  return <div style={{opacity: progress, transform: `translateY(${(1 - progress) * distance}px)`, ...style}}>{children}</div>;
};

export const Eyebrow = ({children, color = colors.cyan}: {children: ReactNode; color?: string}) => (
  <div style={{fontFamily: fonts.mono, color, fontSize: 28, letterSpacing: 4, fontWeight: 700, textTransform: 'uppercase'}}>{children}</div>
);

export const BrowserFrame = ({src, label, width = 1220}: {src: string; label: string; width?: number}) => {
  const frame = useCurrentFrame();
  const float = Math.sin(frame / 45) * 3;
  return (
    <div style={{width, borderRadius: 22, overflow: 'hidden', background: '#08131D', border: '1px solid rgba(56,189,248,.25)', boxShadow: '0 30px 90px rgba(0,0,0,.46)', transform: `translateY(${float}px) rotateX(1deg) rotateY(-1deg)`}}>
      <div style={{height: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', background: '#0B1721', borderBottom: '1px solid rgba(156,180,197,.12)'}}>
        {[colors.red, colors.amber, colors.mint].map((color) => <div key={color} style={{width: 12, height: 12, borderRadius: 99, background: color, opacity: .8}} />)}
        <div style={{marginLeft: 18, height: 30, flex: 1, maxWidth: 580, borderRadius: 8, background: 'rgba(156,180,197,.08)', color: colors.muted, fontFamily: fonts.mono, fontSize: 17, display: 'flex', alignItems: 'center', padding: '0 14px'}}>{label}</div>
      </div>
      <Img src={staticFile(src)} style={{display: 'block', width: '100%', height: 690, objectFit: 'cover', objectPosition: 'top'}} />
    </div>
  );
};

export const Caption = ({children}: {children: ReactNode}) => (
  <div style={{position: 'absolute', left: 150, right: 150, bottom: 48, display: 'flex', justifyContent: 'center', zIndex: 20}}>
    <div style={{fontFamily: fonts.sans, fontSize: 32, fontWeight: 650, color: colors.text, background: 'rgba(3,10,16,.82)', border: '1px solid rgba(156,180,197,.18)', borderRadius: 14, padding: '12px 24px', boxShadow: '0 16px 40px rgba(0,0,0,.28)', textAlign: 'center'}}>{children}</div>
  </div>
);

export const MetricCard = ({value, label, accent = colors.mint, delay = 0}: {value: string; label: string; accent?: string; delay?: number}) => (
  <FadeUp delay={delay} style={{flex: 1, minWidth: 0, padding: '34px 32px', borderRadius: 22, background: 'rgba(16,41,58,.78)', border: `1px solid ${accent}55`, boxShadow: `0 24px 70px ${accent}12`}}>
    <div style={{fontFamily: fonts.mono, fontSize: 80, lineHeight: 1, color: accent, fontWeight: 800}}>{value}</div>
    <div style={{fontFamily: fonts.sans, fontSize: 22, color: colors.muted, marginTop: 18, overflowWrap: 'anywhere', letterSpacing: -.4}}>{label}</div>
  </FadeUp>
);

export const AudioClip = ({name}: {name: string}) => {
  return <Audio src={staticFile(`audio/generated/${name}.mp3`)} volume={0.96} />;
};
