import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";
import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";

type StudioSafeCrossZoomProps = {
  blur?: number;
  zoom?: number;
};

const StudioSafeCrossZoomPresentation: React.FC<
  TransitionPresentationComponentProps<StudioSafeCrossZoomProps>
> = ({ children, passedProps, presentationDirection, presentationProgress }) => {
  const isEntering = presentationDirection === "entering";
  const blur = passedProps.blur ?? 14;
  const zoom = passedProps.zoom ?? 0.14;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000",
        filter: `blur(${interpolate(
          presentationProgress,
          [0, 0.5, 1],
          isEntering ? [blur, blur * 0.35, 0] : [0, blur * 0.35, blur],
          {
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}px)`,
        opacity: interpolate(
          presentationProgress,
          [0, 1],
          isEntering ? [0, 1] : [1, 0],
          {
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        ),
        scale: interpolate(
          presentationProgress,
          [0, 1],
          isEntering ? [1 - zoom, 1] : [1, 1 + zoom],
          {
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        ),
        transformOrigin: "50% 50%",
        zIndex: isEntering ? 1 : 0,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const studioSafeCrossZoom = (
  props: StudioSafeCrossZoomProps = {},
): TransitionPresentation<StudioSafeCrossZoomProps> => ({
  component: StudioSafeCrossZoomPresentation,
  props,
});
