/**
 * Standard API middleware - internal HTTP requests are not logged to keep DB focused on provider logs.
 */
export const auditLogMiddleware = (req, res, next) => {
  next();
};

export default auditLogMiddleware;
