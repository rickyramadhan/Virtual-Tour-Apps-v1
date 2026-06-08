const { machineIdSync } = require('node-machine-id');
const fs = require('fs-extra');
const path = require('path');

const LICENSE_FILE = path.join(__dirname, '../license.key');

// Mengecek status lisensi saat aplikasi dibuka
exports.checkLicense = (req, res) => {
    try {
        const currentMachineId = machineIdSync({ original: true });
        
        if (!fs.existsSync(LICENSE_FILE)) {
            return res.json({ active: false, machineId: currentMachineId, message: "Lisensi belum diaktivasi" });
        }

        // TAMBAHKAN machineId di response sukses ini
        res.json({ active: true, machineId: currentMachineId, message: "Aplikasi Teraktivasi" });
        
    } catch (err) {
        res.status(500).json({ error: "Gagal memverifikasi lisensi" });
    }
};
// Menyimpan lisensi yang diketik klien dari UI
exports.activateLicense = (req, res) => {
    try {
        const { key } = req.body;
        if (!key || key.trim() === '') {
            return res.status(400).json({ success: false, error: "License Key tidak boleh kosong!" });
        }

        // Simpan key tersebut ke dalam file license.key
        fs.writeFileSync(LICENSE_FILE, key.trim());
        
        res.json({ success: true, message: "Aktivasi Berhasil! Terima kasih telah menggunakan GoVirtual Pro." });
    } catch (err) {
        res.status(500).json({ success: false, error: "Gagal menyimpan lisensi." });
    }
};