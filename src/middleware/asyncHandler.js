// Express 4 does not catch rejected promises from async route handlers --
// without this wrapper, a thrown/rejected DB call hangs the request
// instead of reaching the error handler in index.js.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
