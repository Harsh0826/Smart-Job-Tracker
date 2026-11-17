/** Make a file name safe to embed in a quoted Content-Disposition header value. */
export function safeHeaderFileName(name: string): string {
  return name.replace(/["\\\r\n]/g, "_");
}
