// A small PDF writer for reports: A4 pages, Helvetica, a cover, contents, numbered sections with lead text,
// key findings, paragraphs and tables, a footer and page numbers. No libraries. Text outside Latin-1 cannot be
// drawn with the built-in fonts, so callers pass an English gloss; anything left over becomes "?".

export type PdfTable = { caption?: string; head: string[]; widths: number[]; rows: string[][] };
export type PdfSection = { title: string; lead?: string; findings?: string[]; paras?: string[]; tables?: PdfTable[] };
export type PdfDoc = { kicker: string; title: string; subtitle: string; coverMeta: [string, string][]; footer: string; coverNote?: string; sections: PdfSection[] };

const W = 595, H = 842, M = 56;
const RED = "0.84 0.27 0.27", INK = "0.08 0.08 0.08", GREY = "0.37 0.37 0.37", FAINT = "0.55 0.55 0.55";

export function clean(t: string) {
  return String(t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/·/g, "-").replace(/→/g, "->").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}
const esc = (t: string) => clean(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function buildPdf(doc: PdfDoc): Uint8Array {
  const pages: string[][] = [];
  let cur: string[] = [], y = 0;
  const newPage = () => { cur = []; pages.push(cur); y = H - M; };
  const need = (h: number) => { if (y - h < M + 30) newPage(); };
  const text = (x: number, yy: number, str: string, size: number, bold = false, rgb = INK) => cur.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb} rg ${x.toFixed(1)} ${yy.toFixed(1)} Td (${esc(str)}) Tj ET`);
  const rect = (x: number, yy: number, w: number, h: number, rgb: string) => cur.push(`${rgb} rg ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
  const rule = (x1: number, yy: number, x2: number, rgb: string) => cur.push(`${rgb} RG 0.6 w ${x1.toFixed(1)} ${yy.toFixed(1)} m ${x2.toFixed(1)} ${yy.toFixed(1)} l S`);
  const wrap = (str: string, size: number, width: number) => {
    const words = clean(str).split(/\s+/), out: string[] = [], max = width / (size * 0.5);
    let ln = "";
    for (const w of words) { if ((ln + " " + w).trim().length > max) { if (ln) out.push(ln); ln = w; } else ln = (ln + " " + w).trim(); }
    if (ln) out.push(ln);
    return out.length ? out : [""];
  };
  const para = (str: string, size: number, rgb = INK) => { for (const l of wrap(str, size, W - 2 * M)) { need(size + 5); text(M, y - size, l, size, false, rgb); y -= size + 4.5; } y -= 4; };

  // Cover
  newPage(); rect(0, H - 8, W, 8, RED); rect(M, H - 250, 46, 4, RED);
  text(M, H - 200, doc.kicker, 10, true, RED); y = H - 280;
  for (const l of wrap(doc.title, 26, W - 2 * M)) { text(M, y, l, 26, true); y -= 32; }
  y -= 6; for (const l of wrap(doc.subtitle, 13, W - 2 * M)) { text(M, y, l, 13, false, GREY); y -= 18; }
  y -= 30; for (const [k, v] of doc.coverMeta) { text(M, y, k, 9, true, FAINT); text(M + 120, y, v, 10.5); y -= 18; }
  text(M, M + 10, doc.coverNote ?? "Confidential.", 8.5, false, FAINT);
  // Contents
  newPage(); text(M, y - 18, "Contents", 18, true); y -= 44;
  doc.sections.forEach((sc, i) => { text(M, y, `${i + 1}.`, 11, true, RED); text(M + 26, y, sc.title, 11); y -= 20; });
  // Sections flow on, starting a page only when little room is left
  doc.sections.forEach((sc, i) => {
    if (i === 0) newPage(); else { need(200); y -= 22; }
    rect(M, y - 4, 26, 3, RED); y -= 26; text(M, y, `${i + 1}. ${sc.title}`, 17, true); y -= 26;
    if (sc.lead) para(sc.lead, 11.5, "0.2 0.2 0.2");
    for (const f of sc.findings ?? []) {
      const ls = wrap(f, 10.5, W - 2 * M - 22); need(ls.length * 15 + 12);
      rect(M, y - ls.length * 15 - 6, 3, ls.length * 15 + 4, RED);
      for (const l of ls) { text(M + 14, y - 12, l, 10.5); y -= 15; }
      y -= 12;
    }
    for (const p of sc.paras ?? []) para(p, 10.5);
    for (const tb of sc.tables ?? []) {
      if (tb.caption) { need(30); y -= 4; text(M, y - 10, tb.caption, 10, true, GREY); y -= 20; }
      const cw = tb.widths.map((f) => f * (W - 2 * M));
      const row = (cells: string[], head: boolean) => {
        const cl = cells.map((c, j) => wrap(c, 9, cw[j] - 10));
        const hgt = Math.max(...cl.map((a) => a.length)) * 12 + 8; need(hgt + 2);
        if (head) rect(M, y - hgt, W - 2 * M, hgt, INK);
        let x = M; cl.forEach((ls, j) => { ls.forEach((l, k) => text(x + 5, y - 13 - k * 12, l, 9, head, head ? "1 1 1" : INK)); x += cw[j]; });
        y -= hgt; if (!head) rule(M, y, W - M, "0.89 0.89 0.89");
      };
      row(tb.head, true); for (const r of tb.rows) row(r, false); y -= 16;
    }
  });
  // Footers on every page after the cover
  pages.forEach((pg, i) => { if (!i) return; cur = pg; rule(M, M - 6, W - M, "0.85 0.85 0.85"); text(M, M - 20, doc.footer, 8, false, FAINT); text(W - M - 40, M - 20, `Page ${i + 1} of ${pages.length}`, 8, false, FAINT); });

  // Assemble the file
  const objs: string[] = [], add = (o: string) => { objs.push(o); return objs.length; };
  const cat = add(""), pagesId = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = pages.map((pg) => {
    const content = pg.join("\n");
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`);
  });
  objs[cat - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

/** Saves bytes or text as a file through the browser. */
export function downloadFile(filename: string, data: Uint8Array | string, type: string) {
  const blob = new Blob([typeof data === "string" ? data : (data as BlobPart)], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
