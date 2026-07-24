// Minimal RFC-4180-ish CSV parser used by the knowledge loader.
// Read-only: knowledge assets are versioned; we never rewrite them.
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (c === "\r") continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function expandCriterionTokens(raw: string): string[] {
  const out: string[] = [];
  const tokens = raw
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const t of tokens) {
    const range = t.match(/^C(\d+)-C(\d+)$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      const width = range[1].length;
      for (let n = start; n <= end; n++) {
        out.push("C" + String(n).padStart(width, "0"));
      }
    } else if (/^C\d+$/.test(t)) {
      out.push(t);
    }
  }
  return out;
}
