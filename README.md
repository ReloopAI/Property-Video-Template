# Property Video Template

A TypeScript Remotion template that combines local property clips into a vertical
1080 × 1920 video at 30 fps. It includes 0.5-second cross-zoom transitions, a
50% whoosh effect, and automatically selected and ducked background music.

## 1. Install the project

Open Terminal, enter the project directory, and install the dependencies:

```bash
cd "/Users/sam/Desktop/Other/Skool Property/Property Motion Graphics/property-video-template"
npm install
```

## 2. Add background music

Put one or more MP3 files in:

```text
public/music/
```

The filenames do not matter. For example, all of these are valid:

```text
public/music/sample.mp3
public/music/Modern House Tour.mp3
public/music/upbeat-listing-02.mp3
```

Before loading music, the template checks `public/music` for files ending in
`.mp3`. It reports a clear error when none exist. Otherwise, it randomly selects
one track. `calculateMetadata` measures the selected MP3, so changing its name or
duration does not require editing the code.

## 3. Render the included sample videos

From the project directory, run:

```bash
npm run render:property -- \
  --video animated-hook="public/video/scene-001-animated-hook.mp4" \
  --video agent-speaking="public/video/scene-002-agent-speaking.mp4" \
  --video broll="public/video/scene-003-broll.mp4" \
  --video agent-speaking="public/video/scene-004-agent-speaking.mp4" \
  --video broll="public/video/scene-005-broll.mp4" \
  --video agent-speaking="public/video/scene-006-agent-speaking.mp4" \
  --out "out/sample-property-video.mp4" \
  --seed "sample-property-video"
```

The finished video will be written to:

```text
out/sample-property-video.mp4
```

## 4. Render your own videos

Add one `--video` argument for every clip, in the exact order they should appear:

```bash
npm run render:property -- \
  --video animated-hook="/absolute/path/to/hook.mp4" \
  --video agent-speaking="/absolute/path/to/agent.mp4" \
  --video broll="/absolute/path/to/broll.mp4" \
  --out "out/property-video.mp4"
```

Each video argument has this format:

```text
--video category="path/to/video.mp4"
```

Supported categories:

- `animated-hook`: an animated opening or attention-grabbing hook.
- `agent-speaking`: a clip containing agent dialogue. Background music ducks to
  25% while it is active.
- `broll`: property footage or supporting visuals. Background music remains at
  100%.

Relative paths are resolved from the directory where you run the command.
Absolute paths also work. Keep paths containing spaces inside quotes.

When rendering multiple clips, every clip must be longer than the 0.5-second
transition.

## Command options

| Option | Purpose |
| --- | --- |
| `--video category=path` | Adds a video in timeline order. Repeat for every clip. |
| `--input path.json` | Loads the videos and options from a JSON job file. |
| `--out path.mp4` | Chooses the output filename. |
| `--seed text` | Selects the same random music track again for repeatable renders. |
| `--keep-assets` | Keeps temporarily staged clips under `public/generated` for debugging. |
| `--help` | Displays the renderer's built-in help. |

If `--out` is omitted, the script creates a timestamped MP4 under `out/`.

## Render using a JSON job

For reusable render jobs, copy `render-job.example.json` and edit it:

```json
{
  "videos": [
    {"category": "animated-hook", "path": "./clips/hook.mp4"},
    {"category": "agent-speaking", "path": "./clips/agent.mp4"},
    {"category": "broll", "path": "./clips/broll.mp4"}
  ],
  "output": "out/property-video.mp4",
  "seed": "listing-001"
}
```

Then render it:

```bash
npm run render:property -- --input "./render-job.json"
```

Video paths inside the JSON file are resolved relative to the JSON file. A
command-line `--out` or `--seed` overrides the corresponding JSON value.

## What the renderer does

1. Validates every video, the whoosh effect, and the available MP3 files.
2. Randomly selects an MP3 from `public/music`. With `--seed`, selection is
   repeatable.
3. Probes every input video and calculates its exact frame duration.
4. Temporarily copies the clips into `public/generated` for Remotion.
5. Uses `calculateMetadata` to measure the selected music file.
6. Renders an H.264 MP4 with AAC audio and `yuv420p` pixel format.
7. Removes the temporary video copies unless `--keep-assets` was supplied.

## Timeline and audio behavior

- Output resolution: 1080 × 1920.
- Frame rate: 30 fps.
- Cross-zoom duration: 15 frames, or 0.5 seconds.
- Output duration: `sum of clip frames - 15 × (clip count - 1)`.
- Whoosh volume: 50% during every cross-zoom.
- Video audio: 100%.
- Background music: 100% normally and 25% during `agent-speaking` clips.
- The video begins at the start of the selected music and closes at its end.
- If necessary, the music is repeated and trimmed to match the video timeline.

## Preview in Remotion Studio

Run:

```bash
npm run dev
```

The default preview uses the six sample clips from `public/video` and randomly
selects any available MP3 from `public/music`.

Studio is useful for reviewing the composition. Use `npm run render:property`
for production renders because the script probes the local video paths and stages
them automatically.

## Validation and help

Run the project checks:

```bash
npm run lint
```

Show the renderer help:

```bash
npm run render:property -- --help
```

## Troubleshooting

### No background music found

Add at least one `.mp3` file to `public/music`. Other audio formats are ignored.

### A video path does not exist

Check the spelling and quote paths containing spaces. Absolute paths are the
safest option when running the command from another directory.

### A clip is shorter than the transition

Each clip must be longer than 15 frames, or 0.5 seconds, when rendering more than
one clip.

### First render downloads Chrome

Remotion may download its pinned Headless Chrome binary during the first render.
After the download, future renders reuse it.
