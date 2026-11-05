/**
 * Wraps an async route handler or middleware to automatically forward errors to Express errorHandler
 * @param {Function} fn
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

