import { Composition } from 'remotion';
import { TourMain, TOUR_TOTAL } from './aifl/Main';

export const Root: React.FC = () => {
  return (
    <Composition
      id="CampusTour"
      component={TourMain}
      durationInFrames={TOUR_TOTAL}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
