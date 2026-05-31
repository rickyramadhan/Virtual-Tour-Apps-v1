const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

// Arahkan ke folder root proyek, lalu ke folder uploads
const rootDir = path.join(__dirname, '..');
const uploadDir = path.join(rootDir, 'uploads');
fs.ensureDirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Beri nama temp_ agar kita tahu ini file yang sedang dicek
        cb(null, 'temp_' + Date.now() + '_' + file.originalname);
    }
});

const upload = multer({ storage: storage });

module.exports = upload;