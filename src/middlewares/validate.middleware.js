import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../constants/httpStatusCodes.js';

export const validate = (schema) => (req, res, next) => {
  try {
    const validatedData = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (validatedData.body) req.body = validatedData.body;
    if (validatedData.query) req.query = validatedData.query;
    if (validatedData.params) req.params = validatedData.params;

    next();
  } catch (error) {
    if (error.issues) {
      const formattedErrors = error.issues.map((issue) => ({
        field: issue.path.slice(1).join('.'),
        message: issue.message,
      }));
      return next(
        new ApiError('Validation error', HTTP_STATUS.BAD_REQUEST, formattedErrors)
      );
    }
    next(error);
  }
};
