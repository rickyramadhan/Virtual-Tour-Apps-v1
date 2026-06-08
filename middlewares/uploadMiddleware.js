const multer = require('multer');
const path = require('path');

// 1. Konfigurasi Tempat Penyimpanan Sementara
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: function (req, file, cb) {
        // Sanitasi Nama File Dasar (Hapus karakter aneh yang bisa membahayakan sistem path)
        const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, 'temp_' + Date.now() + '_' + safeOriginalName);
    }
});

// 2. Konfigurasi Mesin Multer dengan Keamanan Ekstra
const uploadMiddleware = multer({
    storage: storage,
    limits: {
        // 🛡️ SECURITY LAYER 2: FILE SIZE LIMIT
        // Batasi maksimal ukuran file adalah 100 MB (100 * 1024 * 1024 bytes)
        fileSize: 100 * 1024 * 1024 
    },
    fileFilter: function (req, file, cb) {
        // 🛡️ SECURITY LAYER 3: STRICT MIME TYPE & EXTENSION FILTER
        // Hanya izinkan gambar dan video untuk Panorama / Media 360
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm'];
        
        // Cek Ekstensi Asli (Huruf Kecil)
        const ext = path.extname(file.originalname).toLowerCase();
        
        const isExtValid = allowedExtensions.includes(ext);
        const isMimeValid = allowedMimeTypes.includes(file.mimetype);

        if (isExtValid && isMimeValid) {
            // Lolos pemeriksaan, izinkan masuk ke server
            cb(null, true);
        } else {
            // Tolak mentah-mentah! Server akan membuang file ini sebelum diproses
            cb(new Error('Bahaya Keamanan: Tipe file tidak diizinkan! Aplikasi ini hanya menerima format (JPG, PNG, WEBP, GIF, MP4, WEBM).'), false);
        }
    }
});

module.exports = uploadMiddleware;