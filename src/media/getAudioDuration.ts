import { ALL_FORMATS, Input, UrlSource } from "mediabunny";

export const getAudioDuration = async (
  src: string,
  abortSignal?: AbortSignal,
) => {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, {
      getRetryDelay: () => null,
    }),
  });
  const dispose = () => input.dispose();

  if (abortSignal?.aborted) {
    dispose();
    throw new DOMException("Music metadata calculation was aborted", "AbortError");
  }

  abortSignal?.addEventListener("abort", dispose, { once: true });

  try {
    return await input.computeDuration();
  } finally {
    abortSignal?.removeEventListener("abort", dispose);
    dispose();
  }
};
