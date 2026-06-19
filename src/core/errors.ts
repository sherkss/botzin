/**
 * Raised when caller-supplied data fails validation. The web layer maps this to
 * HTTP 400 so client mistakes are not reported as internal server errors (500).
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
