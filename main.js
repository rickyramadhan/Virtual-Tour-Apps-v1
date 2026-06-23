// main.js - Entry point untuk Electron
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let backendProcess;

// ============================================
// FUNGSI: Membuat Window Aplikasi
// ============================================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, 'assets/icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true, // Sembunyikan menu bar
        show: false // Sembunyikan window dulu sampai server siap
    });

    // Arahkan window ke server lokal (port 3000)
    mainWindow.loadURL('http://localhost:3000');

    // Tampilkan window setelah halaman selesai dimuat
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Bersihkan memory saat window ditutup
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============================================
// FUNGSI: Menjalankan Server Backend
// ============================================
function startBackend() {
    console.log(' Memulai server backend...');
    
    // Jalankan server.js menggunakan node
    backendProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    // Tampilkan output dari server di console
    backendProcess.stdout.on('data', (data) => {
        console.log(`[Server]: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`[Server Error]: ${data}`);
    });

    backendProcess.on('close', (code) => {
        console.log(`[Server] Berhenti dengan kode: ${code}`);
    });
}

// ============================================
// FUNGSI: Mengecek Apakah Server Sudah Siap
// ============================================
function waitForServer(url, timeout = 15000, interval = 500) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            const req = http.get(url, (res) => {
                resolve();
            });
            req.on('error', () => {
                if (Date.now() - start >= timeout) {
                    reject(new Error('Server timeout - tidak bisa diakses'));
                } else {
                    setTimeout(check, interval);
                }
            });
        };
        check();
    });
}

// ============================================
// SAAT ELECTRON SIAP
// ============================================
app.whenReady().then(async () => {
    startBackend(); // Nyalakan server backend dulu
    
    try {
        console.log('⏳ Menunggu server siap...');
        await waitForServer('http://localhost:3000', 15000); // Tunggu max 15 detik
        console.log('✅ Server siap! Membuka aplikasi...');
        createWindow(); // Baru buka window aplikasi
    } catch (error) {
        console.error('❌ Gagal memulai server:', error.message);
        app.quit();
    }
});

// ============================================
// MATIKAN SERVER SAAT WINDOW DITUTUP
// ============================================
app.on('window-all-closed', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Pastikan server ikut mati saat aplikasi di-quit
app.on('quit', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
});