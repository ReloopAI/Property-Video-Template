import { Audio, Video } from "@remotion/media";
import { getStaticFiles } from "@remotion/studio";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import React from "react";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Composition,
  Sequence,
  interpolate,
  random,
  staticFile,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { getAudioDuration } from "./media/getAudioDuration";
import { studioSafeCrossZoom } from "./transitions/StudioSafeCrossZoom";

const FPS = 30;

export const videoCategorySchema = z.enum([
  "animated-hook",
  "agent-speaking",
  "broll",
]);

export const propertyVideoSchema = z.object({
  clips: z.array(
    z.object({
      src: z.string(),
      category: videoCategorySchema,
      durationInFrames: z.number().int().positive(),
    }),
  ),
  music: z
    .object({
      src: z.string(),
      durationInFrames: z.number().int().positive().optional(),
    })
    .nullable(),
  whooshSrc: z.string(),
  transitionDurationInFrames: z.number().int().positive(),
  totalDurationInFrames: z.number().int().positive(),
});

export type PropertyVideoProps = z.infer<typeof propertyVideoSchema>;

const calculateMetadata: CalculateMetadataFunction<PropertyVideoProps> = async ({
  props,
  abortSignal,
}) => {
  const availableMusic = getStaticFiles()
    .filter(
      (file) =>
        file.name.startsWith("music/") &&
        file.name.toLowerCase().endsWith(".mp3"),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  if (availableMusic.length === 0) {
    throw new Error(
      "No background music found. Add at least one MP3 to public/music.",
    );
  }

  const requestedMusic = props.music
    ? availableMusic.find((file) => file.name === props.music?.src)
    : null;
  const selectedMusic =
    requestedMusic ??
    availableMusic[
      Math.floor(
        random(`background-music-${Date.now()}`) * availableMusic.length,
      )
    ];
  const musicUrl = `${selectedMusic.src}?duration-probe=${Date.now()}`;
  const durationInSeconds = await getAudioDuration(musicUrl, abortSignal);
  const musicDurationInFrames = Math.max(
    1,
    Math.round(durationInSeconds * FPS),
  );

  return {
    durationInFrames: props.totalDurationInFrames,
    defaultOutName: "property-video.mp4",
    props: {
      ...props,
      music: {
        src: selectedMusic.name,
        durationInFrames: musicDurationInFrames,
      },
    },
  };
};

export const MyComposition = () => {
  return (
    <Composition
      id="PropertyVideo"
      component={PropertyVideo}
      durationInFrames={30}
      fps={30}
      width={1080}
      height={1920}
      schema={propertyVideoSchema}
      defaultProps={{
        clips: [
          {
            src: "video/scene-001-animated-hook.mp4",
            category: "animated-hook",
            durationInFrames: 152,
          },
          {
            src: "video/scene-002-agent-speaking.mp4",
            category: "agent-speaking",
            durationInFrames: 242,
          },
          {
            src: "video/scene-003-broll.mp4",
            category: "broll",
            durationInFrames: 176,
          },
          {
            src: "video/scene-004-agent-speaking.mp4",
            category: "agent-speaking",
            durationInFrames: 242,
          },
          {
            src: "video/scene-005-broll.mp4",
            category: "broll",
            durationInFrames: 176,
          },
          {
            src: "video/scene-006-agent-speaking.mp4",
            category: "agent-speaking",
            durationInFrames: 242,
          },
        ],
        music: null,
        whooshSrc: "audio/whoosh.mp3",
        transitionDurationInFrames: 15,
        totalDurationInFrames: 1155,
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};

const getClipStarts = (
  clips: PropertyVideoProps["clips"],
  transitionDurationInFrames: number,
) => {
  let cursor = 0;
  return clips.map((clip, index) => {
    const start = cursor;
    cursor += clip.durationInFrames;
    if (index < clips.length - 1) {
      cursor -= transitionDurationInFrames;
    }
    return start;
  });
};

const getMusicVolume = (
  frame: number,
  clips: PropertyVideoProps["clips"],
  clipStarts: number[],
) => {
  const duckedVolume = 0.1;
  const rampFrames = 5;

  return clips.reduce((volume, clip, index) => {
    if (clip.category !== "agent-speaking") {
      return volume;
    }

    const start = clipStarts[index];
    const end = start + clip.durationInFrames;
    const fadeDown = interpolate(
      frame,
      [start - rampFrames, start + rampFrames],
      [1, duckedVolume],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const fadeUp = interpolate(
      frame,
      [end - rampFrames, end + rampFrames],
      [duckedVolume, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    return Math.min(volume, Math.max(fadeDown, fadeUp));
  }, 1);
};

const BackgroundMusic: React.FC<{
  music: { src: string; durationInFrames: number };
  totalDurationInFrames: number;
  clips: PropertyVideoProps["clips"];
  clipStarts: number[];
}> = ({ music, totalDurationInFrames, clips, clipStarts }) => {
  const { fps } = useVideoConfig();

  if (totalDurationInFrames >= music.durationInFrames) {
    const finalPlaythroughStart =
      totalDurationInFrames - music.durationInFrames;

    return (
      <>
        {finalPlaythroughStart > 0 ? (
          <Sequence
            durationInFrames={finalPlaythroughStart}
            premountFor={fps}
          >
            <Audio
              src={staticFile(music.src)}
              loop
              loopVolumeCurveBehavior="extend"
              volume={(frame) =>
                getMusicVolume(frame, clips, clipStarts)
              }
            />
          </Sequence>
        ) : null}
        <Sequence
          from={finalPlaythroughStart}
          durationInFrames={music.durationInFrames}
          premountFor={fps}
        >
          <Audio
            src={staticFile(music.src)}
            volume={(frame) =>
              getMusicVolume(
                finalPlaythroughStart + frame,
                clips,
                clipStarts,
              )
            }
          />
        </Sequence>
      </>
    );
  }

  const introFrames = Math.ceil(totalDurationInFrames / 2);
  const outroFrames = totalDurationInFrames - introFrames;

  return (
    <>
      <Sequence durationInFrames={introFrames} premountFor={fps}>
        <Audio
          src={staticFile(music.src)}
          trimAfter={introFrames}
          volume={(frame) => getMusicVolume(frame, clips, clipStarts)}
        />
      </Sequence>
      {outroFrames > 0 ? (
        <Sequence
          from={introFrames}
          durationInFrames={outroFrames}
          premountFor={fps}
        >
          <Audio
            src={staticFile(music.src)}
            trimBefore={music.durationInFrames - outroFrames}
            trimAfter={music.durationInFrames}
            volume={(frame) =>
              getMusicVolume(introFrames + frame, clips, clipStarts)
            }
          />
        </Sequence>
      ) : null}
    </>
  );
};

const Clip: React.FC<{ clip: PropertyVideoProps["clips"][number] }> = ({
  clip,
}) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Video
      src={staticFile(clip.src)}
      volume={() => 1}
      objectFit="cover"
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  </AbsoluteFill>
);

export const PropertyVideo: React.FC<PropertyVideoProps> = ({
  clips,
  music,
  whooshSrc,
  transitionDurationInFrames,
  totalDurationInFrames,
}) => {
  const { fps } = useVideoConfig();
  const clipStarts = getClipStarts(clips, transitionDurationInFrames);

  if (clips.length === 0) {
    return (
      <AbsoluteFill
        style={{
          alignItems: "center",
          backgroundColor: "#090909",
          color: "#f5f5f5",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          fontSize: 52,
          justifyContent: "center",
          padding: 100,
          textAlign: "center",
        }}
      >
        Run the render script with at least one property video clip.
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {clips.map((clip, index) => (
          <React.Fragment key={`${clip.src}-${index}`}>
            <TransitionSeries.Sequence
              durationInFrames={clip.durationInFrames}
              premountFor={fps}
            >
              <Clip clip={clip} />
            </TransitionSeries.Sequence>
            {index < clips.length - 1 ? (
              <TransitionSeries.Transition
                presentation={studioSafeCrossZoom({
                  blur: 14,
                  zoom: 0.14,
                })}
                timing={linearTiming({
                  durationInFrames: transitionDurationInFrames,
                })}
              />
            ) : null}
          </React.Fragment>
        ))}
      </TransitionSeries>

      {music?.durationInFrames ? (
        <BackgroundMusic
          music={{
            src: music.src,
            durationInFrames: music.durationInFrames,
          }}
          totalDurationInFrames={totalDurationInFrames}
          clips={clips}
          clipStarts={clipStarts}
        />
      ) : null}

      {clipStarts.slice(1).map((start, index) => (
        <Sequence
          key={`whoosh-${start}-${index}`}
          from={start}
          durationInFrames={transitionDurationInFrames}
          premountFor={fps}
        >
          <Audio
            src={staticFile(whooshSrc)}
            trimAfter={transitionDurationInFrames}
            volume={() => 0.5}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
