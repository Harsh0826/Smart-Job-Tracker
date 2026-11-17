const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  bull: "•",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#") && lower !== "#39") return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? whole;
  });
}

/**
 * HTML -> readable plain text that keeps list items and headings on their own lines, which the
 * section splitter relies on. Not a sanitiser: output is only ever rendered as text.
 */
export function htmlToText(html: string): string {
  let text = html;
  // Greenhouse double-encodes its content field.
  if (/&lt;[a-z/]/i.test(text)) text = decodeEntities(text);
  text = text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<(h[1-6]|p|div|ul|ol|section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n+(?=• )/g, "\n") // list items directly under their heading / previous item
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
