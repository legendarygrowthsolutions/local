export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new ServiceError(404, "not_found", what);
export const badRequest = (msg: string, code = "bad_request") => new ServiceError(400, code, msg);
export const unauthorized = () => new ServiceError(401, "unauthorized", "Please log in to continue");
export const conflict = (msg: string, code = "conflict") => new ServiceError(409, code, msg);
