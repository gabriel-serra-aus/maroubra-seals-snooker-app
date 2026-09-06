/** An error with an HTTP status: 400 bad input, 401 no session, 404 missing, 409 not allowed in this state (spec 7). */
export class AppError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
