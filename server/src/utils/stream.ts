export async function streamToBuffer(stream: any): Promise<Buffer> {
  if (!stream) {
    throw new Error("No stream received from S3.");
  }

  if (Buffer.isBuffer(stream)) {
    return stream;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}