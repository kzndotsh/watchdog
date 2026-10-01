/** Longest edge of a stored organization logo. Logos live in the `logo` column as a data URL. */
const ORG_LOGO_SIZE = 128;

const MAX_LOGO_FILE_BYTES = 4 * 1024 * 1024;

/** A small file can still decode to a huge bitmap; refuse anything beyond this edge. */
const MAX_LOGO_EDGE = 8192;

export function logoFileProblem(file: {
  type: string;
  size: number;
}): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image file";
  if (file.size > MAX_LOGO_FILE_BYTES) return "Image must be under 4 MB";
  return null;
}

/** One-letter avatar fallback, the same as the account avatar's. */
export function orgInitials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/**
 * Resolves on `load`, when the header is parsed and the dimensions are known, before the
 * pixels are decoded; `decode()` would decode a huge image just to tell us it is huge.
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the image load event
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve(image);
    });
    image.addEventListener("error", () => {
      reject(new Error("Couldn't read the image"));
    });
    image.src = url;
  });
}

function drawSquareLogo(image: HTMLImageElement): string {
  const { naturalWidth: width, naturalHeight: height } = image;
  // A file that loads but has no readable size would otherwise draw a blank logo.
  if (width === 0 || height === 0) throw new Error("Couldn't read the image");
  if (width > MAX_LOGO_EDGE || height > MAX_LOGO_EDGE) {
    throw new Error(
      `Image is too large; use one up to ${MAX_LOGO_EDGE} pixels on each side`
    );
  }
  const side = Math.min(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = ORG_LOGO_SIZE;
  canvas.height = ORG_LOGO_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't read the image");
  context.drawImage(
    image,
    (width - side) / 2,
    (height - side) / 2,
    side,
    side,
    0,
    0,
    ORG_LOGO_SIZE,
    ORG_LOGO_SIZE
  );
  return canvas.toDataURL("image/png");
}

/** Center-crop to a square and downscale to a small PNG data URL. Browser only. */
export async function resizeLogoToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    return drawSquareLogo(await loadImage(url));
  } finally {
    URL.revokeObjectURL(url);
  }
}
