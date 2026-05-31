const fs = require('fs-extra');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const projectsDir = path.join(rootDir, 'projects');
fs.ensureDirSync(projectsDir);

const getProjects = (req, res) => {
    try {
        const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.govp'));
        res.json({ success: true, projects: files });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

const saveProject = (req, res) => {
    try {
        const { filename, data } = req.body;
        if (!filename) return res.status(400).json({ error: 'Nama file project dibutuhkan' });
        
        const safeName = filename.endsWith('.govp') ? filename : `${filename}.govp`;
        const filePath = path.join(projectsDir, safeName);
        
        fs.writeJsonSync(filePath, data, { spaces: 2 });
        res.json({ success: true, filename: safeName });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

const loadProject = (req, res) => {
    try {
        const filePath = path.join(projectsDir, req.params.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project tidak ditemukan' });
        
        const data = fs.readJsonSync(filePath);
        res.json({ success: true, data });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

const downloadFile = (req, res) => {
    const filePath = path.join(rootDir, 'tours', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File tidak ditemukan');
    }
};

module.exports = { getProjects, saveProject, loadProject, downloadFile };