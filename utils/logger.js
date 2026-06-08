const winston = require('winston');
const fs = require('fs-extra');
const path = require('path');

// Pastikan folder log tersedia
fs.ensureDirSync(path.join(__dirname, '../logs'));

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(), // Tampilkan di Terminal
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }), // Catat error berat ke file
        new winston.transports.File({ filename: 'logs/combined.log' }) // Catat semua aktivitas (siapa nge-klik apa)
    ]
});

module.exports = logger;