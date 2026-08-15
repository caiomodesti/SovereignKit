import {Composition} from 'remotion';
import {PitchVideo, TOTAL_FRAMES} from './SovereignKitPitch';
import {Thumbnail} from './Thumbnail';

export const RemotionRoot = () => (
  <>
    <Composition
      id="SovereignKitPitch"
      component={PitchVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="SovereignKitThumbnail"
      component={Thumbnail}
      durationInFrames={1}
      fps={30}
      width={1280}
      height={720}
    />
  </>
);
