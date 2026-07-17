import { execFile, spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FPS = 30;
const TRANSITION_FRAMES = Math.round(FPS * 0.5);
const CATEGORIES = ["animated-hook", "agent-speaking", "broll"] as const;

type Category = (typeof CATEGORIES)[number];
type VideoInput = { category: Category; path: string };
type JobFile = { videos: VideoInput[]; output?: string; seed?: string };

const projectRoot = path.resolve(__dirname, "..");
const remotionBinary = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  "remotion",
);

const printHelp = () => {
  console.log(`Property video renderer

Usage:
  npm run render:property -- \\
    --video animated-hook=/absolute/path/hook.mp4 \\
    --video agent-speaking=/absolute/path/agent.mp4 \\
    --video broll=/absolute/path/broll.mp4 \\
    --out out/property-video.mp4

  npm run render:property -- --input ./render-job.json

Options:
  --video <category=path>  Add a clip in timeline order (repeatable)
  --input <json>           Load videos/output/seed from a JSON job file
  --out <path>             Output MP4 path
  --seed <text>            Deterministically choose a music track
  --keep-assets            Keep staged clips in public/generated
  --help                   Show this help

Categories: ${CATEGORIES.join(" | ")}`);
};

const parseVideo = (value: string, baseDirectory: string): VideoInput => {
  const separator = value.indexOf("=");
  if (separator === -1) {
    throw new Error(
      `Invalid --video value "${value}". Use category=/local/path.mp4.`,
    );
  }

  const category = value.slice(0, separator);
  const filePath = value.slice(separator + 1);
  if (!CATEGORIES.includes(category as Category)) {
    throw new Error(
      `Unknown category "${category}". Expected ${CATEGORIES.join(", ")}.`,
    );
  }
  if (!filePath) {
    throw new Error(`Missing local path for ${category}.`);
  }

  return {
    category: category as Category,
    path: path.resolve(baseDirectory, filePath),
  };
};

const parseArguments = async () => {
  const args = process.argv.slice(2);
  const videos: VideoInput[] = [];
  let inputPath: string | undefined;
  let output: string | undefined;
  let seed: string | undefined;
  let keepAssets = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--keep-assets") {
      keepAssets = true;
      continue;
    }

    const value = args[index + 1];
    if (["--video", "--input", "--out", "--seed"].includes(arg)) {
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }
      index++;
    }

    if (arg === "--video") {
      videos.push(parseVideo(value, process.cwd()));
    } else if (arg === "--input") {
      inputPath = path.resolve(process.cwd(), value);
    } else if (arg === "--out") {
      output = value;
    } else if (arg === "--seed") {
      seed = value;
    } else {
      throw new Error(`Unknown option "${arg}". Run with --help for usage.`);
    }
  }

  if (inputPath) {
    const job = JSON.parse(await readFile(inputPath, "utf8")) as JobFile;
    if (!Array.isArray(job.videos)) {
      throw new Error(`The job file must contain a "videos" array.`);
    }
    const baseDirectory = path.dirname(inputPath);
    videos.unshift(
      ...job.videos.map((video) =>
        parseVideo(`${video.category}=${video.path}`, baseDirectory),
      ),
    );
    output ??= job.output;
    seed ??= job.seed;
  }

  if (videos.length === 0) {
    throw new Error("Add at least one video with --video or --input.");
  }

  return {
    videos,
    output: path.resolve(
      process.cwd(),
      output ?? `out/property-video-${Date.now()}.mp4`,
    ),
    seed,
    keepAssets,
  };
};

const assertFile = async (filePath: string, label: string) => {
  const details = await stat(filePath).catch(() => null);
  if (!details?.isFile()) {
    throw new Error(`${label} does not exist or is not a file: ${filePath}`);
  }
};

const probeDuration = async (filePath: string) => {
  const { stdout } = await execFileAsync(
    remotionBinary,
    [
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { cwd: projectRoot },
  );
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Could not determine media duration: ${filePath}`);
  }
  return Math.max(1, Math.round(seconds * FPS));
};

const seededIndex = (seed: string, length: number) => {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
};

const selectMusic = async (seed?: string) => {
  const musicDirectory = path.join(projectRoot, "public", "music");
  const files = (await readdir(musicDirectory))
    .filter((file) => file.toLowerCase().endsWith(".mp3"))
    .sort();

  if (files.length === 0) {
    throw new Error(
      `No MP3 music found in ${musicDirectory}. Add at least one track and retry.`,
    );
  }

  const index = seed ? seededIndex(seed, files.length) : randomInt(files.length);
  return {
    absolutePath: path.join(musicDirectory, files[index]),
    publicPath: `music/${files[index]}`,
  };
};

const runRenderer = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(remotionBinary, args, {
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Remotion render failed${
              signal ? ` with signal ${signal}` : ` with exit code ${code}`
            }.`,
          ),
        );
      }
    });
  });

const main = async () => {
  const options = await parseArguments();
  const music = await selectMusic(options.seed);
  const whooshPath = path.join(projectRoot, "public", "audio", "whoosh.mp3");

  await Promise.all([
    ...options.videos.map((video, index) =>
      assertFile(video.path, `Video ${index + 1}`),
    ),
    assertFile(music.absolutePath, "Music"),
    assertFile(whooshPath, "Whoosh sound effect"),
  ]);

  const videoDurations = await Promise.all(
    options.videos.map((video) => probeDuration(video.path)),
  );

  videoDurations.forEach((duration, index) => {
    if (duration <= TRANSITION_FRAMES && options.videos.length > 1) {
      throw new Error(
        `Video ${index + 1} is ${duration} frames long. Each clip must be longer than the 15-frame transition.`,
      );
    }
  });

  const totalDurationInFrames =
    videoDurations.reduce((sum, duration) => sum + duration, 0) -
    TRANSITION_FRAMES * (options.videos.length - 1);

  const jobId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const stagingDirectory = path.join(
    projectRoot,
    "public",
    "generated",
    jobId,
  );
  const clipsDirectory = path.join(stagingDirectory, "clips");
  await mkdir(clipsDirectory, { recursive: true });
  await mkdir(path.dirname(options.output), { recursive: true });

  const clips = await Promise.all(
    options.videos.map(async (video, index) => {
      const extension = path.extname(video.path) || ".mp4";
      const filename = `${String(index + 1).padStart(3, "0")}${extension}`;
      const stagedPath = path.join(clipsDirectory, filename);
      await copyFile(video.path, stagedPath);
      return {
        category: video.category,
        src: `generated/${jobId}/clips/${filename}`,
        durationInFrames: videoDurations[index],
      };
    }),
  );

  const props = {
    clips,
    music: {
      src: music.publicPath,
    },
    whooshSrc: "audio/whoosh.mp3",
    transitionDurationInFrames: TRANSITION_FRAMES,
    totalDurationInFrames,
  };

  console.log(`Selected music: ${path.basename(music.absolutePath)}`);
  console.log(
    `Timeline: ${(totalDurationInFrames / FPS).toFixed(2)}s (${totalDurationInFrames} frames)`,
  );
  console.log(`Output: ${options.output}`);

  try {
    await runRenderer([
      "render",
      "src/index.ts",
      "PropertyVideo",
      options.output,
      "--props",
      JSON.stringify(props),
      "--codec",
      "h264",
      "--audio-codec",
      "aac",
      "--pixel-format",
      "yuv420p",
    ]);
  } finally {
    if (!options.keepAssets) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
