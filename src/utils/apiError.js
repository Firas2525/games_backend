import { HTTP_STATUS } from '../constants/httpStatusCodes.js';

export class ApiError extends Error {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
