const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/validator');

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
    // Default error values
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Terjadi kesalahan pada server';
    const code = err.code || 'SERVER_ERROR';
    
    // Log error
    const logData = {
        error: message,
        code: code,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.body
    };
    
    if (statusCode >= 500) {
        logger.error('Server error occurred', logData);
    } else {
        logger.warn('Client error occurred', logData);
    }
    
    // Jangan expose stack trace di production
    const response = {
        success: false,
        error: {
            code: code,
            message: process.env.NODE_ENV === 'production' && statusCode >= 500 
                ? 'Terjadi kesalahan internal server' 
                : message
        }
    };
    
    // Tambahkan details untuk validation errors di development
    if (process.env.NODE_ENV === 'development' && err.details) {
        response.error.details = err.details;
    }
    
    res.status(statusCode).json(response);
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`
        }
    });
}

/**
 * Async handler wrapper untuk catch errors di async routes
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler
};