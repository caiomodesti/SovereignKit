import {AbsoluteFill, Img, staticFile} from 'remotion';
import {Background} from './components';
import {colors, fonts} from './theme';

export const Thumbnail = () => (
  <AbsoluteFill>
    <Background />
    <AbsoluteFill style={{padding: '72px 82px', justifyContent: 'center'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 26}}><Img src={staticFile('brand/sovereignkit-mark.svg')} style={{width: 92, height: 92}} /><div style={{fontFamily: fonts.mono, color: colors.cyan, fontSize: 25, letterSpacing: 3}}>SOVEREIGNKIT</div></div>
      <div style={{fontFamily: fonts.sans, fontSize: 83, lineHeight: .98, color: colors.text, fontWeight: 800, letterSpacing: -4, maxWidth: 980, marginTop: 40}}>Your RPC said yes.</div>
      <div style={{fontFamily: fonts.sans, fontSize: 72, lineHeight: 1, color: colors.amber, fontWeight: 800, letterSpacing: -3, marginTop: 20}}>Did it land?</div>
      <div style={{position: 'absolute', right: 82, bottom: 72, fontFamily: fonts.mono, fontSize: 22, color: colors.muted}}>SOLANA · EVIDENCE · FAILOVER</div>
    </AbsoluteFill>
  </AbsoluteFill>
);
