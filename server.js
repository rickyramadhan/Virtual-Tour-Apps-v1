const express = require('express');
const fs = require('fs-extra');
const path = require('path');

// Import Semua Rute API
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = 3000;

// 1. Pastikan folder-folder utama sistem selalu ada saat server menyala
fs.ensureDirSync(path.join(__dirname, 'uploads'));
fs.ensureDirSync(path.join(__dirname, 'uploads', 'previews'));
fs.ensureDirSync(path.join(__dirname, 'projects'));
fs.ensureDirSync(path.join(__dirname, 'exports'));

// 2. Middleware Global
app.use(express.json({ limit: '50mb' })); // Limit JSON diperbesar untuk file save yang besar
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/exports', express.static(path.join(__dirname, 'exports')));

// 3. Sambungkan ke Router Modular
app.use('/api', apiRoutes);

// 4. Nyalakan Server
app.listen(PORT, () => {
    console.log(`Server GoVirtual Pro (Modular Enterprise) berjalan mulus di http://localhost:${PORT}`);
});