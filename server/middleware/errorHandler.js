const notFound = (req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message);

  // Mongoose invalid ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid resource identifier provided.' });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      message: `A record with this ${field} already exists.`,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const firstMsg = Object.values(err.errors)[0]?.message || 'Invalid data supplied.';
    return res.status(400).json({ message: firstMsg });
  }

  const statusCode = err.statusCode || 500;
  const message =
    statusCode >= 500
      ? err.publicMessage || 'An unexpected server error occurred. Please try again.'
      : err.message;

  return res.status(statusCode).json({
    message,
    ...(err.code ? { code: err.code } : {}),
  });
};

module.exports = {
  notFound,
  errorHandler,
};
