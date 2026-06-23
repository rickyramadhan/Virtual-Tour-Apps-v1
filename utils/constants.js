// Konstanta aplikasi - tidak ada lagi magic numbers
module.exports = {
    // File validation
    ALLOWED_IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
    ALLOWED_VIDEO_EXTENSIONS: ['.mp4', '.webm'],
    ALLOWED_PROJECT_EXTENSIONS: ['.govp'],
    ALLOWED_ICON_EXTENSIONS: ['.png', '.gif', '.svg'],
    
    // MIME types
    IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
    VIDEO_MIME_TYPES: ['video/mp4', 'video/webm'],
    
    // Size limits (dalam bytes)
    MAX_IMAGE_SIZE: 20 * 1024 * 1024,    // 20MB
    MAX_VIDEO_SIZE: 500 * 1024 * 1024,   // 500MB
    MAX_ICON_SIZE: 5 * 1024 * 1024,      // 5MB
    MAX_PROJECT_SIZE: 100 * 1024 * 1024, // 100MB
    
    // History
    MAX_HISTORY_STACK: 50,
    
    // Auto-save
    AUTO_SAVE_DELAY: 1500,
    
    // Export quality
    MIN_QUALITY: 10,
    MAX_QUALITY: 100,
    DEFAULT_QUALITY: 75,
    
    // Error codes
    ERROR_CODES: {
        INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
        FILE_TOO_LARGE: 'FILE_TOO_LARGE',
        PATH_TRAVERSAL: 'PATH_TRAVERSAL',
        INVALID_PROJECT_NAME: 'INVALID_PROJECT_NAME',
        PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
        SERVER_ERROR: 'SERVER_ERROR',
        VALIDATION_ERROR: 'VALIDATION_ERROR'
    }
};