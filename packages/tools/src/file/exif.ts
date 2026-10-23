/**
 * Bounded EXIF reader for the tags Watchdog reports. It walks the container
 * (JPEG segments, PNG chunks) and then the TIFF directories, checking every
 * offset against the buffer, and decodes no values (it only notes which tags
 * exist). Bounds: at most `MAX_SEGMENTS` container records, one Exif block of
 * at most 64 KiB, three directories, `MAX_ENTRIES` entries each. Each loop
 * advances by a fixed step, so cost is linear in the bytes inspected.
 */

const MAX_SEGMENTS = 256;
const MAX_ENTRIES = 1024;
const MAX_EXIF_BYTES = 65_536;

const TAG_NAMES = {
  0x01_0f: "Make",
  0x01_10: "Model",
  0x01_31: "Software",
  0x01_3b: "Artist",
  0x82_98: "Copyright",
} as const;
const TAG_EXIF_IFD = 0x87_69;
const TAG_GPS_IFD = 0x88_25;
const TAG_DATE_TIME_ORIGINAL = 0x90_03;
const TAG_GPS_LATITUDE = 0x00_02;

/** Hint names in report order. */
export const EXIF_HINT_ORDER = [
  "Make",
  "Model",
  "DateTimeOriginal",
  "GPSLatitude",
  "Software",
  "Artist",
  "Copyright",
] as const;

export type ExifHint = (typeof EXIF_HINT_ORDER)[number];

function isExifSegment(b: Uint8Array, at: number): boolean {
  return (
    b[at] === 0x45 &&
    b[at + 1] === 0x78 &&
    b[at + 2] === 0x69 &&
    b[at + 3] === 0x66 &&
    b[at + 4] === 0 &&
    b[at + 5] === 0
  );
}

/** The TIFF block of the first Exif APP1 segment of a JPEG, or null. */
function jpegExif(bytes: Uint8Array): Uint8Array | null {
  let i = 2;
  for (let seg = 0; seg < MAX_SEGMENTS; seg += 1) {
    while (bytes[i] === 0xff && bytes[i + 1] === 0xff) i += 1;
    if (bytes[i] !== 0xff || i + 4 > bytes.length) return null;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] ?? 0) * 256 + (bytes[i + 3] ?? 0);
    if (length < 2) return null;
    const dataStart = i + 4;
    const dataEnd = Math.min(i + 2 + length, bytes.length);
    if (marker === 0xe1 && isExifSegment(bytes, dataStart)) {
      return bytes.subarray(
        dataStart + 6,
        Math.min(dataEnd, dataStart + 6 + MAX_EXIF_BYTES)
      );
    }
    i += 2 + length;
  }
  return null;
}

/** The TIFF block of a PNG `eXIf` chunk, or null. */
function pngExif(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  for (
    let chunk = 0;
    chunk < MAX_SEGMENTS && i + 8 <= bytes.length;
    chunk += 1
  ) {
    const length = view.getUint32(i);
    const type = String.fromCodePoint(
      bytes[i + 4] ?? 0,
      bytes[i + 5] ?? 0,
      bytes[i + 6] ?? 0,
      bytes[i + 7] ?? 0
    );
    if (type === "IDAT" || type === "IEND") return null;
    if (type === "eXIf") {
      const start = i + 8;
      return bytes.subarray(
        start,
        Math.min(start + length, start + MAX_EXIF_BYTES, bytes.length)
      );
    }
    i += 12 + length;
  }
  return null;
}

function readIfd(
  view: DataView,
  offset: number,
  little: boolean,
  tags: Set<number>
): { exifIfd: number; gpsIfd: number } {
  const next = { exifIfd: 0, gpsIfd: 0 };
  if (offset < 8 || offset + 2 > view.byteLength) return next;
  const count = Math.min(view.getUint16(offset, little), MAX_ENTRIES);
  for (let n = 0; n < count; n += 1) {
    const at = offset + 2 + n * 12;
    if (at + 12 > view.byteLength) break;
    const tag = view.getUint16(at, little);
    tags.add(tag);
    if (tag === TAG_EXIF_IFD) next.exifIfd = view.getUint32(at + 8, little);
    if (tag === TAG_GPS_IFD) next.gpsIfd = view.getUint32(at + 8, little);
  }
  return next;
}

function tiffHints(tiff: Uint8Array): ExifHint[] {
  if (tiff.length < 8) return [];
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!(little || big) || view.getUint16(2, little) !== 0x2a) return [];

  const ifd0 = new Set<number>();
  const { exifIfd, gpsIfd } = readIfd(
    view,
    view.getUint32(4, little),
    little,
    ifd0
  );
  const photo = new Set<number>();
  readIfd(view, exifIfd, little, photo);
  const gps = new Set<number>();
  readIfd(view, gpsIfd, little, gps);

  const found = new Set<ExifHint>();
  for (const [tag, name] of Object.entries(TAG_NAMES)) {
    if (ifd0.has(Number(tag))) found.add(name);
  }
  if (photo.has(TAG_DATE_TIME_ORIGINAL)) found.add("DateTimeOriginal");
  if (gps.has(TAG_GPS_LATITUDE)) found.add("GPSLatitude");
  return EXIF_HINT_ORDER.filter((name) => found.has(name));
}

/** EXIF tags present in a JPEG or PNG; empty for anything else or on malformed data. */
export function exifHints(
  bytes: Uint8Array,
  container: "JPEG" | "PNG" | null
): ExifHint[] {
  let tiff: Uint8Array | null = null;
  if (container === "JPEG") tiff = jpegExif(bytes);
  else if (container === "PNG") tiff = pngExif(bytes);
  return tiff === null ? [] : tiffHints(tiff);
}
