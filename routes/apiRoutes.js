const express = require('express');
const router = express.Router();

// Import Middleware
const uploadMiddleware = require('../middlewares/uploadMiddleware');

// Import Controllers
const { uploadFile } = require('../controllers/uploadController');
const { getProjects, saveProject, loadProject, downloadFile } = require('../controllers/projectController');
const { generateVirtualTour } = require('../controllers/generateController');

// Rute Upload
router.post('/upload', uploadMiddleware.single('image'), uploadFile);

// Rute Manajemen Proyek
router.get('/projects', getProjects);
router.post('/projects/save', saveProject);
router.get('/projects/:filename', loadProject);
router.get('/download/:filename', downloadFile);

// Rute Eksekusi Tiling & Build
router.post('/generate', generateVirtualTour);

module.exports = router;