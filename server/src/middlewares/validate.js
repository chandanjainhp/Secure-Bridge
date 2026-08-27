import { ApiError } from "../utils/ApiError.js";

export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body ?? {},
    query: req.query ?? {},
    params: req.params ?? {},
    headers: req.headers ?? {},
  });

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path || [];
    const field = path.filter((part) => part !== "body" && part !== "query" && part !== "params" && part !== "headers").join(".") || path[0] || "request";
    const message = firstIssue?.message || "Validation failed";
    return next(new ApiError(400, `${field}: ${message}`, result.error.issues));
  }

  if (result.data.body !== undefined) {
    req.body = result.data.body;
  }
  if (result.data.query !== undefined) {
    Object.keys(req.query).forEach((key) => delete req.query[key]);
    Object.assign(req.query, result.data.query);
  }
  if (result.data.params !== undefined) {
    Object.keys(req.params).forEach((key) => delete req.params[key]);
    Object.assign(req.params, result.data.params);
  }

  next();
};
