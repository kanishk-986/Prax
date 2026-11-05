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

export type Slide = { title: string; body: string };
/** Antier carousel template: 4:5 pages, dark cover and closing slide, white middle slides, a red rule and a byline. */
export function carouselPdf(slides: Slide[], byline = "Shashi Pal - Antier") {
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
    pdf.text(p, M, M + 14, byline, 11, sub, true);
  });
  return pdf.bytes();
}
