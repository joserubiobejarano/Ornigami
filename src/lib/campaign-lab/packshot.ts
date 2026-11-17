export const PACKSHOT_DECODE_TIMEOUT_MS = 4_000;

const CORRUPT_MESSAGE =
  "The image file is corrupt or has no readable dimensions. Choose another PNG, JPEG, or WebP.";
const RETRY_MESSAGE =
  "The packshot took too long to load. Check the file and try again with a PNG, JPEG, or WebP.";
const HASH_MESSAGE =
  "The packshot could not be read completely. Reselect the file and try again.";

export class PackshotReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackshotReadError";
  }
}

export type PackshotReadResult = {
  src: string;
  width: number;
  height: number;
  contentHash: string;
};

export function hasUsablePackshotImage(
  image: Pick<HTMLImageElement, "complete" | "naturalWidth" | "naturalHeight">,
): boolean {
  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Decode can stall in some browsers even after the image itself loaded
 * successfully. Prefer valid dimensions, but keep a bounded retry path.
 */
export async function waitForDecodedPackshot(image: HTMLImageElement): Promise<void> {
  if (hasUsablePackshotImage(image)) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };

    const finish = (ok: boolean, error?: PackshotReadError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok && hasUsablePackshotImage(image)) resolve();
      else reject(error ?? new PackshotReadError(CORRUPT_MESSAGE));
    };

    const onLoad = () => {
      if (hasUsablePackshotImage(image)) finish(true);
      else finish(false, new PackshotReadError(CORRUPT_MESSAGE));
    };
    const onError = () => finish(false, new PackshotReadError(CORRUPT_MESSAGE));

    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });

    timer = setTimeout(() => {
      if (hasUsablePackshotImage(image)) finish(true);
      else if (image.complete) finish(false, new PackshotReadError(CORRUPT_MESSAGE));
      else finish(false, new PackshotReadError(RETRY_MESSAGE));
    }, PACKSHOT_DECODE_TIMEOUT_MS);

    try {
      image
        .decode()
        .then(() => finish(true))
        .catch(() => {
          // A rejected decode can still describe a usable loaded image.
          if (hasUsablePackshotImage(image)) finish(true);
        });
    } catch {
      if (hasUsablePackshotImage(image)) finish(true);
    }

    if (image.complete) {
      finish(
        hasUsablePackshotImage(image),
        hasUsablePackshotImage(image) ? undefined : new PackshotReadError(CORRUPT_MESSAGE),
      );
    }
  });
}

export async function readPackshotFile(file: File): Promise<PackshotReadResult> {
  const src = URL.createObjectURL(file);
  const image = new Image();
  image.src = src;

  try {
    await waitForDecodedPackshot(image);
    return {
      src,
      width: image.naturalWidth,
      height: image.naturalHeight,
      contentHash: await sha256(file),
    };
  } catch (error) {
    URL.revokeObjectURL(src);
    if (error instanceof PackshotReadError) throw error;
    throw new PackshotReadError(HASH_MESSAGE);
  }
}
