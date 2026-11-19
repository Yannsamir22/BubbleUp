export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg, code = "bad_request") => new HttpError(400, msg, code);
export const unauthorized = (msg = "Please log in first.") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "You don't have permission to do that.") =>
  new HttpError(403, msg, "forbidden");
export const notFound = (msg = "Not found.") => new HttpError(404, msg, "not_found");
export const conflict = (msg) => new HttpError(409, msg, "conflict");

/** Validates `data` against a zod schema, throwing a friendly 400 on failure. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    throw badRequest(field ? `${field}: ${issue.message}` : issue.message, "validation");
  }
  return result.data;
}

export function errorHandler(logger = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "That file is too big.", code: "too_large" });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Malformed JSON.", code: "bad_json" });
    }
    logger.error("[error]", err);
    res.status(500).json({ error: "Something went wrong on our side. Try again?", code: "internal" });
  };
}
