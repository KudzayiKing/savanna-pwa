/**
 * Content-type verification from the bytes themselves.
 *
 * The declared `mimeType` arrives from the browser and is therefore attacker
 * controlled. A client can send a PDF, an HTML document or a script and label
 * it `image/png`; if the server trusts the label it stores and later serves the
 * file with an `image/png` Content-Type, which is enough to turn a
 * user-controlled upload into stored XSS in some browser/context combinations.
 *
 * These checks look at the file's magic bytes instead. They are a floor, not a
 * complete defence — a valid PNG can still contain a malicious payload — so
 * uploads must also be served with `Content-Disposition: attachment` or from a
 * separate, cookie-less origin. Sniffing just closes the cheapest hole: the
 * declared type being an outright lie.
 */

type Signature = {
  mimeType: string;
  /** Byte offsets that must match `bytes`. */
  matches: Array<{ offset: number; bytes: number[] }>;
};

// Not `[...text]`: the project's TS target predates downlevelIteration.
const ascii = (text: string) => text.split("").map(char => char.charCodeAt(0));

const SIGNATURES: Signature[] = [
  { mimeType: "image/jpeg", matches: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  {
    mimeType: "image/png",
    matches: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  {
    // RIFF....WEBP
    mimeType: "image/webp",
    matches: [
      { offset: 0, bytes: ascii("RIFF") },
      { offset: 8, bytes: ascii("WEBP") },
    ],
  },
  { mimeType: "application/pdf", matches: [{ offset: 0, bytes: ascii("%PDF") }] },
  {
    // MP4/MOV family: a 4-byte box size followed by the `ftyp` brand.
    mimeType: "video/mp4",
    matches: [{ offset: 4, bytes: ascii("ftyp") }],
  },
];

/**
 * MPEG audio has no single fixed header. An ID3v2 tag is the common case;
 * otherwise the file begins with an 11-bit frame sync. Accepting only the
 * frame-sync form means the first byte is 0xFF and the top three bits of the
 * second are set.
 */
function isMpegAudio(bytes: Buffer): boolean {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true; // "ID3"
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function matchesSignature(bytes: Buffer, signature: Signature): boolean {
  return signature.matches.every(({ offset, bytes: expected }) => {
    if (bytes.length < offset + expected.length) return false;
    return expected.every((value, index) => bytes[offset + index] === value);
  });
}

/**
 * Returns true when the bytes plausibly are the declared MIME type.
 *
 * Unknown/unsupported types return false — an allowlist is the point. Callers
 * should reject the upload rather than fall back to trusting the header.
 */
export function bytesMatchMimeType(bytes: Buffer, declaredMimeType: string): boolean {
  if (declaredMimeType === "audio/mpeg") return isMpegAudio(bytes);
  const signature = SIGNATURES.find(entry => entry.mimeType === declaredMimeType);
  if (!signature) return false;
  return matchesSignature(bytes, signature);
}
