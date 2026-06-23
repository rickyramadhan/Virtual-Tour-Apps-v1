const Joi = require('joi');
const path = require('path');
const sanitize = require('sanitize-filename');
const { 
    ALLOWED_IMAGE_EXTENSIONS, 
    ALLOWED_VIDEO_EXTENSIONS,
    ALLOWED_PROJECT_EXTENSIONS,
    ALLOWED_ICON_EXTENSIONS,
    ERROR_CODES
} = require('./constants');

/**
 * Custom Error Classes
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = ERROR_CODES.SERVER_ERROR) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, code = ERROR_CODES.VALIDATION_ERROR) {
        super(message, 400, code);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource tidak ditemukan', code = ERROR_CODES.PROJECT_NOT_FOUND) {
        super(message, 404, code);
    }
}

/**
 * Sanitasi nama file untuk mencegah path traversal
 */
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw new ValidationError('Nama file tidak valid');
    }
    
    // Hapus karakter path traversal
    const cleaned = filename.replace(/[/\\]/g, '_');
    const sanitized = sanitize(cleaned);
    
    if (!sanitized || sanitized.length === 0) {
        throw new ValidationError('Nama file tidak valid setelah sanitasi');
    }
    
    return sanitized;
}

/**
 * Validasi ekstensi file
 */
function validateFileExtension(filename, allowedExtensions) {
    const ext = path.extname(filename).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
        throw new ValidationError(
            `Ekstensi file tidak diizinkan. Yang diperbolehkan: ${allowedExtensions.join(', ')}`,
            ERROR_CODES.INVALID_FILE_TYPE
        );
    }
    return ext;
}

/**
 * Validasi safe path (mencegah path traversal)
 */
function validateSafePath(baseDir, userInput) {
    const resolvedPath = path.resolve(baseDir, userInput);
    const normalizedBase = path.resolve(baseDir);
    
    if (!resolvedPath.startsWith(normalizedBase)) {
        throw new ValidationError(
            'Path tidak diizinkan (path traversal attempt)',
            ERROR_CODES.PATH_TRAVERSAL
        );
    }
    
    return resolvedPath;
}

/**
 * Schema validasi untuk project data
 */
const projectDataSchema = Joi.object({
    version: Joi.string().required(),
    projectName: Joi.string().max(100).required(),
    firstSceneId: Joi.string().allow(null, ''),
    scenes: Joi.array().items(
        Joi.object({
            id: Joi.string().required(),
            title: Joi.string().max(200).allow(''),
            imagePath: Joi.string().allow(''),
            previewPath: Joi.string().allow(''),
            pitch: Joi.number().allow(null),
            yaw: Joi.number().allow(null),
            zoomLvl: Joi.number().allow(null),
            defaultViewThumb: Joi.string().allow(null, ''),
            author: Joi.string().allow(''),
            hotSpots: Joi.array().items(
                Joi.object({
                    pitch: Joi.number().required(),
                    yaw: Joi.number().required(),
                    type: Joi.string().valid('scene', 'video', 'url', 'info').required(),
                    text: Joi.string().max(500).allow(''),
                    targetScene: Joi.string().allow(null, ''),
                    targetVideo: Joi.string().allow(null, ''),
                    url: Joi.string().max(2000).allow(''),
                    iconStyle: Joi.string().allow(''),
                    customIconPath: Joi.string().allow(''),
                    size: Joi.number().min(10).max(200)
                })
            ).default([])
        })
    ).default([]),
    mediaVideo360: Joi.array().default([]),
    introVideo: Joi.object({
        desktop: Joi.string().allow(null, ''),
        mobile: Joi.string().allow(null, '')
    }).default({ desktop: null, mobile: null }),
    skinConfig: Joi.object().default({}),
    tourSettings: Joi.object().default({}),
    welcomeText: Joi.string().max(5000).allow('')
});

/**
 * Schema validasi untuk save project request
 */
const saveProjectSchema = Joi.object({
    filename: Joi.string()
        .min(1)
        .max(100)
        .pattern(/^[a-zA-Z0-9\s_-]+(\.govp)?$/)
        .required()
        .messages({
            'string.pattern.base': 'Nama file hanya boleh mengandung huruf, angka, spasi, underscore, dan dash'
        }),
    data: projectDataSchema.required()
});

module.exports = {
    AppError,
    ValidationError,
    NotFoundError,
    sanitizeFilename,
    validateFileExtension,
    validateSafePath,
    projectDataSchema,
    saveProjectSchema,
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_VIDEO_EXTENSIONS,
    ALLOWED_PROJECT_EXTENSIONS,
    ALLOWED_ICON_EXTENSIONS
};