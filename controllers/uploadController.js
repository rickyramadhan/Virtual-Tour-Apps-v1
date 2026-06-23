const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const rootDir = path.join(__dirname, '..');
const uploadDir = path.join(rootDir, 'uploads');

const uploadFile = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file yang diupload' });
    
    try {
        const tempPath = req.file.path;
        
        // 1. Ekstrak Ukuran File (Size)
        const stats = fs.statSync(tempPath);
        const fileSize = stats.size;
        const sizeInMB = ( fileSize / (1024 * 1024)).toFixed(2) + ' MB'; 

        const safeOriginalName = req.file.originalname.replace(/\s+/g, '_');
        const finalFilename = `${fileSize}_${safeOriginalName}`;
        const finalPathLocal = path.join(uploadDir, finalFilename);

        // Folder untuk Preview Besar (Existing)
        const previewDir = path.join(uploadDir, 'previews');
        fs.ensureDirSync(previewDir);
        const previewFilename = 'preview_' + finalFilename;
        const previewPathLocal = path.join(previewDir, previewFilename);

        // 📚 Folder untuk Thumbnail Kecil (BARU - Untuk Media Library)
        const thumbDir = path.join(uploadDir, 'thumbnails');
        fs.ensureDirSync(thumbDir);
        const thumbFilename = 'thumb_' + finalFilename.replace(/\.[^/.]+$/, "") + '.webp';
        const thumbPathLocal = path.join(thumbDir, thumbFilename);

        const isImage = req.file.mimetype.startsWith('image/');
        const fileTypeExt = req.file.mimetype.split('/').pop().toUpperCase(); 

        // 2. Fungsi Bantuan untuk Ekstrak Dimensi Pixel
        const getDimensions = async (imagePath) => {
            try {
                if (isImage) {
                    const meta = await sharp(imagePath).metadata();
                    return `${meta.width} x ${meta.height}`;
                }
            } catch(e) { console.warn("Gagal membaca dimensi"); }
            return "N/A";
        };

        // 3. LOGIKA DEDUPLIKASI (Jika file sudah ada)
        if (fs.existsSync(finalPathLocal)) {
            fs.unlinkSync(tempPath);
            const dimensions = await getDimensions(finalPathLocal);
            
            return res.json({
                success: true,
                file: {
                    filename: finalFilename, 
                    originalName: req.file.originalname,
                    path: `/uploads/${finalFilename}`,
                    previewPath: isImage && fs.existsSync(previewPathLocal) ? `/uploads/previews/${previewFilename}` : `/uploads/${finalFilename}`,
                    thumbnailPath: isImage && fs.existsSync(thumbPathLocal) ? `/uploads/thumbnails/${thumbFilename}` : null,
                    size: sizeInMB, 
                    dimensions: dimensions, 
                    type: fileTypeExt
                }
            });
        }

        // 4. Jika file belum ada, simpan dan kompres proxy
        fs.renameSync(tempPath, finalPathLocal);
        const dimensions = await getDimensions(finalPathLocal);

        if (isImage) {
            // Preview Besar (untuk 3D Viewer / Canvas)
            await sharp(finalPathLocal, { limitInputPixels: false }).resize({ width: 4096 }).jpeg({ quality: 80 }).toFile(previewPathLocal);
            // Thumbnail Kecil (untuk Grid Media Library)
            await sharp(finalPathLocal, { limitInputPixels: false }).resize({ width: 300 }).webp({ quality: 60 }).toFile(thumbPathLocal);
        }

        res.json({
            success: true,
            file: {
                filename: finalFilename, 
                originalName: req.file.originalname,
                path: `/uploads/${finalFilename}`,
                previewPath: isImage ? `/uploads/previews/${previewFilename}` : `/uploads/${finalFilename}`,
                thumbnailPath: isImage ? `/uploads/thumbnails/${thumbFilename}` : null,
                size: sizeInMB, 
                dimensions: dimensions, 
                type: fileTypeExt
            }
        });

    } catch (err) {
        console.error("Gagal memproses upload:", err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { uploadFile };