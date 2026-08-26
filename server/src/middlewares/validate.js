import { ApiError } from "../utils/ApiError.js";

export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
    headers: req.headers,
  });

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue?.path?.filter(part => part !== 'body').join('.') || 'request';
    const message = firstIssue?.message || 'Validation failed';
    return next(new ApiError(400, `${field}: ${message}`, result.error.issues));
  }

  if (result.data.body) req.body = result.data.body;
  if (result.data.query) req.query = result.data.query;
  if (result.data.params) req.params = result.data.params;
  next();
};
