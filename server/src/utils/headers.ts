// Replaces characters that could break out of a quoted Content-Disposition filename.
export function safeHeaderFileName(name: string): string {
  return name.replace(/["\\\r\n]/g, "_");
}
