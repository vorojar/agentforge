/** Split text into overlapping chunks, respecting paragraph and sentence boundaries */
export function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;
    if (end >= text.length) { chunks.push(text.slice(start).trim()); break; }

    // Try to break at paragraph
    const paraBreak = text.lastIndexOf("\n\n", end);
    if (paraBreak > start + chunkSize / 2) end = paraBreak;
    else {
      // Try sentence break (English ". " or Chinese "。" "！" "？")
      const half = start + chunkSize / 2;
      let sentBreak = -1;
      for (const sep of ["。", "！", "？", ". "]) {
        const pos = text.lastIndexOf(sep, end);
        if (pos > half && pos > sentBreak) sentBreak = pos + sep.length;
      }
      if (sentBreak > half) end = sentBreak;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end - overlap;
  }

  return chunks.filter(c => c.length > 0);
}
