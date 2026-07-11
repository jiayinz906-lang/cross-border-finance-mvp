export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}
