export function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0
  if (text.charCodeAt(0) === 0xfeff) i = 1
  for (; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      row.push(field)
      field = ""
      out.push(row)
      row = []
      if (c === "\r" && text[i + 1] === "\n") i++
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    out.push(row)
  }
  return out.filter((r) => r.some((c) => c.trim() !== ""))
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const escape = (v: string | number): string => {
    const s = String(v)
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const lines = [headers, ...rows].map((r) => r.map(escape).join(","))
  const csv = lines.join("\r\n")
  // BOM so Excel reads UTF-8 correctly
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
