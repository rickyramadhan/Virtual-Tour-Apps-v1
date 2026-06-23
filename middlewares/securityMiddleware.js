const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Setup Helmet untuk security headers
 */
function setupHelmet() {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:", "blob:", "https:"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                connectSrc: ["'self'"],
                mediaSrc: ["'self'", "blob:"],
                workerSrc: ["'self'", "blob:"]
            }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    });
}

/**
 * Setup CORS
 */
function setupCors() {
    return cors({
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    });
}

/**
 * Rate limiter untuk API endpoints
 */
function setupApiRateLimiter() {
    return rateLimit({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 menit
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        message: {
            success: false,
            error: 'Terlalu banyak request. Silakan coba lagi nanti.'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger.warn('Rate limit exceeded', {
                ip: req.ip,
                url: req.originalUrl,
                method: req.method
            });
            res.status(429).json({
                success: false,
                error: 'Terlalu banyak request dari IP ini. Coba lagi dalam 15 menit.'
            });
        }
    });
}

/**
 * Rate limiter khusus untuk upload (lebih ketat)
 */
function setupUploadRateLimiter() {
    return rateLimit({
        windowMs: 60 * 1000, // 1 menit
        max: 10, // 10 upload per menit
        message: {
            success: false,
            error: 'Terlalu banyak upload. Tunggu sebentar.'
        }
    });
}

/**
 * Middleware untuk block suspicious requests
 */
function blockSuspiciousRequests(req, res, next) {
    const suspiciousPatterns = [
        /(\.\.\/)|(\.\.\\)/,  // Path traversal
        /<script.*?>/i,        // XSS attempt
        /union\s+select/i,     // SQL injection
        /eval\s*\(/i,          // Code injection
        /exec\s*\(/i           // Command injection
    ];
    
    const checkString = `${req.url}${JSON.stringify(req.body || {})}${JSON.stringify(req.query || {})}`;
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(checkString)) {
            logger.warn('Suspicious request blocked', {
                ip: req.ip,
                url: req.url,
                pattern: pattern.toString()
            });
            return res.status(400).json({
                success: false,
                error: 'Request mencurigakan terdeteksi dan diblokir'
            });
        }
    }
    
    next();
}

/**
 * Request logger middleware
 */
function requestLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('user-agent')
        };
        
        if (res.statusCode >= 400) {
            logger.warn('Request completed with error', logData);
        } else {
            logger.info('Request completed', logData);
        }
    });
    
    next();
}

module.exports = {
    setupHelmet,
    setupCors,
    setupApiRateLimiter,
    setupUploadRateLimiter,
    blockSuspiciousRequests,
    requestLogger
};