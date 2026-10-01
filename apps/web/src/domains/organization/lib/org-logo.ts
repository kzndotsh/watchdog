/** Longest edge of a stored organization logo. Logos live in the `logo` column as a data URL. */
const ORG_LOGO_SIZE = 128;

const MAX_LOGO_FILE_BYTES = 4 * 1024 * 1024;

export function logoFileProblem(file: {
  type: string;
  size: number;
}): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image file";
  if (file.size > MAX_LOGO_FILE_BYTES) return "Image must be under 4 MB";
  return null;
}

/** Initials for the avatar fallback (first letters of up to two words). */
export function orgInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Center-crop to a square and downscale to a small PNG data URL. Browser only. */
export async function resizeLogoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = ORG_LOGO_SIZE;
    canvas.height = ORG_LOGO_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't read the image");
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      ORG_LOGO_SIZE,
      ORG_LOGO_SIZE
    );
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
