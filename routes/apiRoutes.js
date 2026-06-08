const express = require('express');
const router = express.Router(); // <-- Router diciptakan di sini!
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const AppError = require('../utils/AppError'); 
const logger = require('../utils/logger'); 

const uploadMiddleware = require('../middlewares/uploadMiddleware');
const { uploadFile } = require('../controllers/uploadController');
const { getProjects, saveProject, loadProject, downloadFile } = require('../controllers/projectController');
const { generateVirtualTour } = require('../controllers/generateController');

// 1. Panggil Controller Lisensi di sini (SETELAH router diciptakan)
const { checkLicense, activateLicense } = require('../controllers/licenseController');

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 50, 
    message: { success: false, error: 'Terlalu banyak aktivitas upload. Silakan tunggu 15 menit.' }
});

router.post('/upload', uploadLimiter, function(req, res, next) {
    const upload = uploadMiddleware.single('image');
    upload(req, res, function(err) {
        if (err instanceof multer.MulterError) return next(new AppError(`Upload ditolak: File terlalu besar.`, 400));
        else if (err) return next(new AppError(err.message, 400));
        next(); 
    });
}, uploadFile);

router.post('/log', express.json(), (req, res) => {
    const { action, detail } = req.body;
    logger.info(`[FRONTEND-ACTION] IP: ${req.ip} | ACTION: ${action} | DETAIL: ${JSON.stringify(detail)}`);
    res.json({ success: true });
});

// ========================================================
// 2. DAFTARKAN RUTE LISENSI
// ========================================================
router.get('/check-license', checkLicense);
router.post('/activate-license', express.json(), activateLicense);

// ========================================================
// RUTE BAWAAN APLIKASI
// ========================================================
router.get('/projects', getProjects);
router.post('/projects/save', saveProject);
router.get('/projects/:filename', loadProject);
router.get('/download/:filename', downloadFile);
router.post('/generate', generateVirtualTour);

module.exports = router;