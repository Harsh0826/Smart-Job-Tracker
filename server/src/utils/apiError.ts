/** Error with an HTTP status, so handlers can throw 4xx without the error handler turning it into 500. */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}
