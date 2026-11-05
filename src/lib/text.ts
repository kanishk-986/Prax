// Text decoding and repair for anything that comes into Prax from a file or a paste.
// "Jimena Santill√°n" is UTF-8 read as Mac Roman: the bytes C3 A1 ("á") shown as "√" and "°".
// Pure functions only, so the same code runs in the page and in scripts/test-text.ts. db/014 does the same in SQL.

/** Mac Roman bytes 0x80 to 0xFF, in order. Index i is byte 0x80 + i. */
export const MAC_ROMAN_HIGH = "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ";

const byteOf = new Map<string, number>([...MAC_ROMAN_HIGH].map((c, i) => [c, 0x80 + i]));
const cls = (from: number, to: number) => [...MAC_ROMAN_HIGH.slice(from - 0x80, to - 0x80 + 1)].join("");
const CONT = cls(0x80, 0xbf);
// A UTF-8 lead byte followed by the right number of continuation bytes, all shown as Mac Roman characters.
const SEQ = new RegExp(`[${cls(0xc2, 0xdf)}][${CONT}]|[${cls(0xe0, 0xef)}][${CONT}]{2}|[${cls(0xf0, 0xf4)}][${CONT}]{3}`, "gu");
const strict = new TextDecoder("utf-8", { fatal: true });

/** Reverses Mac Roman mojibake, one sequence at a time. A sequence is replaced only when its bytes are valid UTF-8
 *  for a single printable character (not a control or a combining mark), so real text is left alone and a second
 *  run changes nothing. */
export function repairMojibake(text: string): string {
  if (!text) return text;
  return text.replace(SEQ, (seq) => {
    const bytes = Uint8Array.from([...seq].map((c) => byteOf.get(c)!));
    let out: string;
    try { out = strict.decode(bytes); } catch { return seq; }
    const cp = out.codePointAt(0)!;
    if ([...out].length !== 1 || cp < 0xa0 || (cp >= 0x300 && cp <= 0x36f) || cp === 0xfffd) return seq;
    return out;
  });
}

/** Decodes file bytes: a UTF-8 or UTF-16 byte order mark first, then strict UTF-8, then Windows-1252 (old Excel
 *  CSVs). Mojibake already saved inside the file is repaired as well. */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) text = new TextDecoder("utf-8").decode(bytes.subarray(3));
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  else {
    try { text = strict.decode(bytes); } catch { text = new TextDecoder("windows-1252").decode(bytes); }
  }
  return repairMojibake(text);
}

/** Decodes a fetched web page: the charset in the Content-Type header, else a <meta charset> in the first 2 KB,
 *  else decodeText. An unknown charset label falls back to decodeText too. */
export function decodePage(bytes: Uint8Array, contentType = ""): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const label = (/charset=["']?([\w-]+)/i.exec(contentType) ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head))?.[1]?.toLowerCase();
  if (label && !/^utf-?8$/.test(label)) { try { return new TextDecoder(label).decode(bytes); } catch { /* unknown label */ } }
  return decodeText(bytes);
}

/** Repairs every string value of a record before it is saved (typed or pasted text). Other values pass through. */
export function repairFields<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === "string" ? repairMojibake(v) : v;
  return out as T;
}
