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

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error("Couldn't read the image");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Center-crop to a square and downscale to a small PNG data URL. Browser only. */
export async function resizeLogoToDataUrl(file: File): Promise<string> {
  const image = await loadImage(file);
  const { naturalWidth: width, naturalHeight: height } = image;
  if (width > MAX_LOGO_EDGE || height > MAX_LOGO_EDGE) {
    throw new Error("Image is too large; use one under 8000 pixels wide");
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
