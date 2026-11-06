// A small PDF writer for reports: A4 pages, Helvetica, a cover, contents, numbered sections with lead text,
// key findings, paragraphs and tables, a footer and page numbers. No libraries. Text outside Latin-1 cannot be
// drawn with the built-in fonts, so callers pass an English gloss; anything left over becomes "?".

export type PdfTable = { caption?: string; head: string[]; widths: number[]; rows: string[][] };
export type PdfSection = { title: string; lead?: string; findings?: string[]; paras?: string[]; tables?: PdfTable[] };
/** A small logo drawn before a table cell whose text is the key: an SVG path in a 24 by 24 box (as in
 *  src/lib/providers.ts) in its colour, or a coloured dot when there is no path. White on the dark table head. */
export type PdfMark = { path?: string | null; color: string };
export type PdfDoc = { kicker: string; title: string; subtitle: string; coverMeta: [string, string][]; footer: string; coverNote?: string; sections: PdfSection[]; marks?: Record<string, PdfMark> };

const W = 595, H = 842, M = 56;
const RED = "0.84 0.27 0.27", INK = "0.08 0.08 0.08", GREY = "0.37 0.37 0.37", FAINT = "0.55 0.55 0.55";

/** "#D97757" as PDF colour components, "0.851 0.467 0.341". */
export function pdfRgb(hex: string) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  return v.map((x) => +(parseInt(x, 16) / 255).toFixed(3)).join(" ");
}

/** An SVG path's d attribute as PDF path operators (m, l, c, h) in the same coordinates. Every SVG command is
 *  supported: lines, cubic and quadratic curves with their smooth forms (quadratics become cubics) and arcs (split
 *  into cubic pieces of at most 90 degrees). The caller flips the y axis with a cm transform. */
export function svgPathToPdf(d: string): string {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  const f = (n: number) => String(+n.toFixed(3));
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0, prev = "";
  const num = () => parseFloat(tokens[i++]);
  // Arc flags may be written without separators ("0 01.5 2"): read one digit when the token holds more.
  const flag = () => { const t = tokens[i]; if (t.length > 1) tokens[i] = t.slice(1); else i++; return +t[0]; };
  const curve = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => { out.push(`${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(ex)} ${f(ey)} c`); cx = x2; cy = y2; x = ex; y = ey; };
  const arc = (rx: number, ry: number, rot: number, large: number, sweep: number, ex: number, ey: number) => {
    if (!rx || !ry) { out.push(`${f(ex)} ${f(ey)} l`); x = ex; y = ey; return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = (rot * Math.PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi);
    const dx = (x - ex) / 2, dy = (y - ey) / 2, x1 = cs * dx + sn * dy, y1 = -sn * dx + cs * dy;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const sq = Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1));
    const k = (large === sweep ? -1 : 1) * Math.sqrt(sq), ccx = (k * rx * y1) / ry, ccy = (-k * ry * x1) / rx;
    const mx = cs * ccx - sn * ccy + (x + ex) / 2, my = sn * ccx + cs * ccy + (y + ey) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1 - ccx) / rx, (y1 - ccy) / ry);
    let dt = ang((x1 - ccx) / rx, (y1 - ccy) / ry, (-x1 - ccx) / rx, (-y1 - ccy) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), step = dt / n, a = (4 / 3) * Math.tan(step / 4);
    const pt = (t: number) => [mx + rx * Math.cos(t) * cs - ry * Math.sin(t) * sn, my + rx * Math.cos(t) * sn + ry * Math.sin(t) * cs];
    const dv = (t: number) => [-rx * Math.sin(t) * cs - ry * Math.cos(t) * sn, -rx * Math.sin(t) * sn + ry * Math.cos(t) * cs];
    for (let j = 0; j < n; j++) {
      const ta = t1 + j * step, tb = ta + step, [ax, ay] = pt(ta), [bx, by] = pt(tb), [dax, day] = dv(ta), [dbx, dby] = dv(tb);
      curve(ax + a * dax, ay + a * day, bx - a * dbx, by - a * dby, j === n - 1 ? ex : bx, j === n - 1 ? ey : by);
    }
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "Z") { out.push("h"); x = sx; y = sy; prev = "Z"; cmd = ""; continue; }
    if (C === "M") { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push(`${f(x)} ${f(y)} m`); cmd = rel ? "l" : "L"; prev = "M"; continue; }
    if (C === "L") { x = ox + num(); y = oy + num(); out.push(`${f(x)} ${f(y)} l`); }
    else if (C === "H") { x = ox + num(); out.push(`${f(x)} ${f(y)} l`); }
    else if (C === "V") { y = oy + num(); out.push(`${f(x)} ${f(y)} l`); }
    else if (C === "C") { const a = [num(), num(), num(), num(), num(), num()]; curve(ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]); }
    else if (C === "S") { const a = [num(), num(), num(), num()]; const [r1, r2] = prev === "C" ? [2 * x - cx, 2 * y - cy] : [x, y]; curve(r1, r2, ox + a[0], oy + a[1], ox + a[2], oy + a[3]); }
    else if (C === "Q" || C === "T") {
      let px: number, py: number;
      if (C === "Q") { px = ox + num(); py = oy + num(); } else [px, py] = prev === "Q" ? [2 * x - qx, 2 * y - qy] : [x, y];
      const ex = ox + num(), ey = oy + num();
      curve(x + (2 / 3) * (px - x), y + (2 / 3) * (py - y), ex + (2 / 3) * (px - ex), ey + (2 / 3) * (py - ey), ex, ey);
      qx = px; qy = py;
    } else if (C === "A") { const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(); arc(rx, ry, rot, large, sweep, ox + num(), oy + num()); }
    else { i++; continue; }
    prev = C === "S" ? "C" : C === "T" ? "Q" : C;
  }
  return out.join(" ");
}

/** Draws a mark size points square with its bottom left at (x, y). */
export function markOps(m: PdfMark, x: number, y: number, size: number, onDark = false) {
  const rgb = onDark ? "1 1 1" : pdfRgb(m.color);
  if (!m.path) {
    const r = size * 0.32, k = r * 0.5523, ox = x + size / 2, oy = y + size / 2;
    return `q ${rgb} rg ${ox + r} ${oy} m ${ox + r} ${oy + k} ${ox + k} ${oy + r} ${ox} ${oy + r} c ${ox - k} ${oy + r} ${ox - r} ${oy + k} ${ox - r} ${oy} c ${ox - r} ${oy - k} ${ox - k} ${oy - r} ${ox} ${oy - r} c ${ox + k} ${oy - r} ${ox + r} ${oy - k} ${ox + r} ${oy} c f Q`;
  }
  const s = size / 24;
  return `q ${rgb} rg ${s.toFixed(4)} 0 0 ${(-s).toFixed(4)} ${x.toFixed(1)} ${(y + size).toFixed(1)} cm ${svgPathToPdf(m.path)} f Q`;
}

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
      // A cell that is a provider name, or a comma list of them, gets each name's mark before it.
      const marked = (c: string) => { const parts = c.split(/,\s*/); return doc.marks && c && parts.every((p) => doc.marks![p]) ? parts : null; };
      // Items flow side by side and wrap; an item too wide for its column puts its mark on a line above the name.
      const MK = 8.5, GAP = 3.5;
      type Item = { p: string; mark: boolean; label: boolean };
      const flow = (parts: string[], width: number, bold: boolean) => {
        const wd = (p: string) => MK + GAP + clean(p).length * (bold ? 5.2 : 4.7);
        const lines: Item[][] = [[]]; let used = 0;
        for (const p of parts) {
          if (wd(p) > width) { if (used) lines.push([]); lines[lines.length - 1].push({ p, mark: true, label: false }); lines.push([{ p, mark: false, label: true }], []); used = 0; continue; }
          if (used && used + wd(p) > width) { lines.push([]); used = 0; }
          lines[lines.length - 1].push({ p, mark: true, label: true }); used += wd(p) + 8;
        }
        return lines.filter((l) => l.length);
      };
      const row = (cells: string[], head: boolean) => {
        const cl = cells.map((c, j) => { const m = marked(c); return m ? flow(m, cw[j] - 10, head) : wrap(c, 9, cw[j] - 10).map((l): Item[] => [{ p: l, mark: false, label: true }]); });
        const hgt = Math.max(...cl.map((a) => a.length)) * 12 + 8; need(hgt + 2);
        if (head) rect(M, y - hgt, W - 2 * M, hgt, INK);
        const rgb = head ? "1 1 1" : INK;
        let x = M; cl.forEach((ls, j) => {
          ls.forEach((items, k) => {
            const base = y - 13 - k * 12;
            let ix = x + 5;
            for (const it of items) {
              if (it.mark) { cur.push(markOps(doc.marks![it.p], ix, base - 1, MK, head)); }
              if (it.label) text(it.mark ? ix + MK + GAP : ix, base, it.p, 9, head, rgb);
              ix += MK + GAP + clean(it.p).length * (head ? 5.2 : 4.7) + 8;
            }
          });
          x += cw[j];
        });
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
