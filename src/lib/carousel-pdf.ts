// A small PDF writer with no libraries: pages of filled rectangles and Helvetica text. Used for carousels,
// which LinkedIn takes as a PDF document post. Text outside Latin-1 cannot be drawn by the built-in fonts.

type Page = string[];
const clean = (t: string) => String(t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[•·]/g, "-").replace(/→/g, "->").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const esc = (t: string) => clean(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const rgb = (hex: string) => { const n = parseInt(hex.replace("#", ""), 16); return `${((n >> 16) & 255) / 255} ${((n >> 8) & 255) / 255} ${(n & 255) / 255}`; };

export function wrap(str: string, size: number, width: number) {
  const max = Math.max(4, Math.floor(width / (size * 0.52)));
  const out: string[] = []; let line = "";
  for (const w of clean(str).split(/\s+/)) { if ((line + " " + w).trim().length > max) { if (line) out.push(line); line = w; } else line = (line + " " + w).trim(); }
  if (line) out.push(line);
  return out.length ? out : [""];
}

export class Pdf {
  pages: Page[] = [];
  w: number; h: number;
  constructor(w: number, h: number) { this.w = w; this.h = h; }
  page() { const p: Page = []; this.pages.push(p); return p; }
  rect(p: Page, x: number, y: number, w: number, h: number, color: string) { p.push(`${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`); }
  text(p: Page, x: number, y: number, s: string, size: number, color = "#141414", bold = false) { p.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`); }
  bytes() {
    const objs: string[] = [];
    const add = (s: string) => { objs.push(s); return objs.length; };
    const cat = add(""), pagesId = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = this.pages.map((pg) => {
      const content = pg.join("\n");
      const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.w} ${this.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`);
    });
    objs[cat - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    let out = "%PDF-1.4\n"; const offs: number[] = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const b = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255;
    return b;
  }
}

/** The Prax mark, "Corners" (src/components/logo.tsx), as PDF operators: the 24 by 24 tile with rx 5.5, the white
 *  corner M4.5 4.5H15V7.5H7.5V15H4.5Z and the red corner M19.5 19.5H9V16.5H16.5V9H19.5Z, drawn size points square
 *  with its bottom left at (x, y). On a dark page it inverts as in the sidebar: white tile, ink corner, red corner.
 *  The same as logoOps in src/lib/pdf.ts, kept here because this file imports nothing (the logic tests check they match). */
const LOGO_TILE = "5.5 0 m 18.5 0 l 21.538 0 24 2.462 24 5.5 c 24 18.5 l 24 21.538 21.538 24 18.5 24 c 5.5 24 l 2.462 24 0 21.538 0 18.5 c 0 5.5 l 0 2.462 2.462 0 5.5 0 c h";
const LOGO_YOU = "4.5 4.5 m 15 4.5 l 15 7.5 l 7.5 7.5 l 7.5 15 l 4.5 15 l h";
const LOGO_THEM = "19.5 19.5 m 9 19.5 l 9 16.5 l 16.5 16.5 l 16.5 9 l 19.5 9 l h";
export function logoOps(x: number, y: number, size: number, onDark = false) {
  const s = +(size / 24).toFixed(4), ink = "0.078 0.078 0.078", white = "1 1 1";
  return `q ${s} 0 0 ${-s} ${+x.toFixed(2)} ${+(y + size).toFixed(2)} cm ${onDark ? white : ink} rg ${LOGO_TILE} f ${onDark ? ink : white} rg ${LOGO_YOU} f 0.839 0.271 0.271 rg ${LOGO_THEM} f Q`;
}

export type Slide = { title: string; body: string };
/** The house carousel template: 4:5 pages, dark cover and closing slide, white middle slides, a red rule and a byline
 *  (the profile's name and company). */
export function carouselPdf(slides: Slide[], byline = "") {
  const W = 540, H = 675, M = 48, pdf = new Pdf(W, H);
  slides.forEach((s, i) => {
    const p = pdf.page(), dark = i === 0 || i === slides.length - 1;
    const bg = dark ? "#141414" : "#ffffff", ink = dark ? "#ffffff" : "#141414", sub = dark ? "#cfcfcf" : "#5f5f5f";
    pdf.rect(p, 0, 0, W, H, bg);
    pdf.text(p, M, H - M - 10, String(i + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0"), 11, "#d64545", true);
    let y = H - M - 90;
    const size = i === 0 ? 34 : 28;
    for (const l of wrap(s.title, size, W - 2 * M)) { pdf.text(p, M, y, l, size, ink, true); y -= size + 8; }
    y -= 14;
    for (const l of wrap(s.body, 15, W - 2 * M)) { pdf.text(p, M, y, l, 15, sub); y -= 22; }
    pdf.rect(p, M, M + 40, 44, 4, "#d64545");
    p.push(logoOps(M, M + 10, 16, dark));
    pdf.text(p, M + 24, M + 14, byline, 11, sub, true);
  });
  return pdf.bytes();
}
