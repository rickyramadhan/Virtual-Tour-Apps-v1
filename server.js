require('dotenv').config(); 

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet'); 
// xss-clean SUDAH KITA HAPUS KARENA TIDAK KOMPATIBEL DENGAN EXPRESS 5

const logger = require('./utils/logger');
const AppError = require('./utils/AppError');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000; 

// A. Pelindung HTTP Header
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

// Pastikan folder-folder utama sistem selalu ada
fs.ensureDirSync(path.join(__dirname, 'uploads'));
fs.ensureDirSync(path.join(__dirname, 'uploads', 'previews'));
fs.ensureDirSync(path.join(__dirname, 'projects'));
fs.ensureDirSync(path.join(__dirname, 'exports'));

// Pencatat lalu-lintas
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

app.use(express.json({ limit: '50mb' })); 
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/exports', express.static(path.join(__dirname, 'exports')));

// ========================================================
// 🛡️ B. CUSTOM XSS SANITIZER (KOMPATIBEL EXPRESS 5)
// ========================================================
app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        // Menyapu bersih tag <script> jahat dari JSON tanpa merusak Express 5
        let bodyStr = JSON.stringify(req.body);
        if (bodyStr.toLowerCase().includes('<script')) {
            bodyStr = bodyStr.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            req.body = JSON.parse(bodyStr);
        }
    }
    next();
});

// Sambungkan ke Router Modular
app.use('/api', apiRoutes);

// Penanganan URL 404 Not Found
app.use((req, res, next) => {
    next(new AppError(`Halaman atau rute ${req.originalUrl} tidak ditemukan!`, 404));
});

// Global Error Handler
app.use((err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    logger.error(`${err.statusCode} - ${err.status} - ${err.message} - ${req.originalUrl} - ${req.ip}`);

    res.status(err.statusCode).json({
        success: false,
        error: err.isOperational ? err.message : 'Terjadi kesalahan sistem di server. Tim kami sedang menanganinya.'
    });
});

// Nyalakan Server
app.listen(PORT, () => {
    logger.info(`Server GoVirtual berjalan di mode [${process.env.NODE_ENV}] pada port ${PORT}`);
});