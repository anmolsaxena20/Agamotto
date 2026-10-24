import { logger } from '../observability/index.js';

const log = logger('server');

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  log('ERROR', err.message || 'Internal Server Error', {
    'http.request.method': req.method,
    'url.path': req.originalUrl,
    'http.response.status_code': statusCode,
    error_name: err.name,
    error_stack: err.stack,
  });

  const response = {
    error: err.message || 'Internal Server Error',
  };

  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
