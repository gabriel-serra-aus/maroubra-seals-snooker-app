/** An error with an HTTP status: 400 bad input, 401 no session, 404 missing, 409 not allowed in this state (spec 7). */
export class AppError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 409,
    message: string,
    /** Extra fields for the reply, e.g. `code: "rematch"` when the screen has a question to ask (O-20). */
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string, extra?: Record<string, unknown>) => new AppError(409, message, extra);
