const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const { spawn } = require('child_process');

const rootDir = path.join(__dirname, '..');

const generateVirtualTour = async (req, res) => {
    const { scenes, folderName, introVideo, welcomeText, skinTemplate, firstSceneId, mediaVideo360 } = req.body;

    if (!scenes || scenes.length === 0 || !folderName) {
        return res.status(400).json({ success: false, message: 'Data tidak valid.' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    const sendData = (data) => res.write(JSON.stringify(data) + '\n');

    try {
        const exportDir = path.join(rootDir, 'exports', folderName);
        const targetLibDir = path.join(exportDir, 'lib');
        const tilesDir = path.join(exportDir, 'tiles');
        
        sendData({ type: 'progress', message: 'Membuat struktur folder...', detail: '[Setup] Membuat folder master', percent: 2 });
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
        if (!fs.existsSync(tilesDir)) fs.mkdirSync(tilesDir, { recursive: true });
        if (!fs.existsSync(targetLibDir)) fs.cpSync(path.join(rootDir, 'public', 'lib'), targetLibDir, { recursive: true });

        let desktopSrc = ''; let mobileSrc = '';
        if (introVideo && introVideo.desktop) { desktopSrc = `intro_desktop${path.extname(introVideo.desktop)}`; fs.copyFileSync(path.join(rootDir, introVideo.desktop), path.join(exportDir, desktopSrc)); }
        if (introVideo && introVideo.mobile) { mobileSrc = `intro_mobile${path.extname(introVideo.mobile)}`; fs.copyFileSync(path.join(rootDir, introVideo.mobile), path.join(exportDir, mobileSrc)); }

        if (mediaVideo360 && mediaVideo360.length > 0) {
            sendData({ type: 'progress', message: 'Menyiapkan Media Video 360...', detail: '[Setup] Menyalin file Video 360', percent: 5 });
            const mediaDir = path.join(exportDir, 'media');
            if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
            
            mediaVideo360.forEach(vid => {
                const ext = path.extname(vid.path);
                const fileName = `${vid.id}${ext}`;
                fs.copyFileSync(path.join(rootDir, vid.path), path.join(mediaDir, fileName));
                vid.exportPath = `media/${fileName}`; 
            });
        }

        const tourConfig = { "default": { "firstScene": firstSceneId || scenes[0].id, "sceneFadeDuration": 1000, "autoLoad": true }, "scenes": {} };
        const totalScenes = scenes.length; const scenePercentShare = 90 / totalScenes;

        for (let i = 0; i < totalScenes; i++) {
            const scene = scenes[i];
            const sceneTilesDir = path.join(tilesDir, scene.id);
            const basePercent = 5 + (i * scenePercentShare);
            const pythonShare = scenePercentShare * 0.4;
            const sharpShare = scenePercentShare * 0.6;

            if (fs.existsSync(sceneTilesDir)) fs.removeSync(sceneTilesDir); 
            let cleanImagePath = decodeURIComponent(scene.imagePath); if (cleanImagePath.startsWith('/') || cleanImagePath.startsWith('\\')) cleanImagePath = cleanImagePath.substring(1);
            
            sendData({ type: 'progress', message: `Memecah Panorama ${i + 1}/${totalScenes}...`, detail: `[Tiling] Memproses: ${scene.title}`, percent: Math.round(basePercent) });

            const command = `py -u "${path.join(rootDir, 'utils', 'generate.py')}" -n "${path.join('C:', 'Program Files', 'Hugin', 'bin', 'nona.exe')}" -q 100 -o "${sceneTilesDir}" "${path.join(rootDir, cleanImagePath)}"`;
            
            await new Promise((resolve, reject) => {
                const process = spawn(command, { shell: true }); let errorLog = '';
                process.stdout.on('data', (data) => { data.toString().split('\n').forEach(line => { if(line.trim()) sendData({ type: 'progress', message: `Memecah Panorama ${i + 1}/${totalScenes}...`, detail: `[Py] ${line.trim()}`, percent: Math.round(basePercent + (pythonShare * 0.5)) }); }); });
                process.stderr.on('data', (data) => errorLog += data.toString());
                process.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Python Error ${code}. Detail: ${errorLog}`)));
            });

            const pyConfigPath = path.join(sceneTilesDir, 'config.json'); let dynMax = 4, dynCube = 4096;
            if (fs.existsSync(pyConfigPath)) { const pyC = fs.readJsonSync(pyConfigPath); if (pyC && pyC.multiRes) { dynMax = pyC.multiRes.maxLevel || 4; dynCube = pyC.multiRes.cubeResolution || 4096; } fs.removeSync(pyConfigPath); }

            const hotSpots = (scene.hotSpots || []).map(hs => {
                let finalType = hs.type; let videoPath = undefined;
                if (hs.type === 'video') {
                    finalType = 'video360_custom';
                    const vidObj = (mediaVideo360 || []).find(v => v.id === hs.targetVideo);
                    videoPath = vidObj ? vidObj.exportPath : '';
                } else if (hs.type === 'scene') { finalType = 'scene'; } 
                else { finalType = 'info'; }

                return { "pitch": hs.pitch, "yaw": hs.yaw, "type": finalType, "text": hs.text, "sceneId": hs.type === 'scene' ? hs.targetScene : undefined, "URL": hs.type === 'url' ? hs.url : undefined, "videoPath": videoPath };
            });

            tourConfig.scenes[scene.id] = { "title": scene.title, "type": "multires", "pitch": scene.pitch || 0, "yaw": scene.yaw || 0, "hfov": scene.hfov || 100, "multiRes": { "basePath": `tiles/${scene.id}`, "path": "/%l/%s%y_%x", "fallbackPath": "/fallback/%s", "extension": "webp", "tileResolution": 512, "maxLevel": dynMax, "cubeResolution": dynCube }, "hotSpots": hotSpots };

            const filesToConvert = [];
            const collectJpgs = (dir) => { fs.readdirSync(dir).forEach(item => { const full = path.join(dir, item); if (fs.statSync(full).isDirectory()) collectJpgs(full); else if (full.endsWith('.jpg')) filesToConvert.push(full); }); };
            collectJpgs(sceneTilesDir);

            const totalTiles = filesToConvert.length; let converted = 0; const BATCH_SIZE = 15; 
            for (let j = 0; j < totalTiles; j += BATCH_SIZE) {
                const chunk = filesToConvert.slice(j, j + BATCH_SIZE);
                await Promise.all(chunk.map(async (fullPath) => { await sharp(fullPath).webp({ quality: 75, effort: 1, smartSubsample: true }).toFile(fullPath.replace('.jpg', '.webp')); fs.unlinkSync(fullPath); }));
                converted += chunk.length;
                sendData({ type: 'progress', message: `Optimasi Multi-Core (WebP) ${i + 1}/${totalScenes}...`, detail: `[Paralel] ${converted}/${totalTiles} Tiles`, percent: Math.round(basePercent + pythonShare + (sharpShare * (converted / totalTiles))) });
            }
        }

        sendData({ type: 'progress', message: 'Merakit antarmuka HTML...', detail: '[System] Menulis kode Video.js 360 Player', percent: 97 });
        
        // ==============================================================
        // UPGRADE BESAR: IMPLEMENTASI VIDEO.JS + PANNELLUM PLUGIN
        // ==============================================================
        const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${folderName} - Virtual Tour</title>
    
    <link rel="stylesheet" href="lib/pannellum.css">
    <script src="lib/pannellum.js"></script>

    <link href="https://vjs.zencdn.net/7.1.0/video-js.css" rel="stylesheet" type="text/css">
    <script src="https://vjs.zencdn.net/7.1.0/video.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/videojs-pannellum-plugin.js"></script>

    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        #panorama { width: 100%; height: 100%; }
        #intro-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #000; z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        #intro-video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
        .start-btn { position: absolute; padding: 15px 40px; font-size: 20px; font-weight: bold; color: #fff; background-color: #007bff; border: none; border-radius: 50px; cursor: pointer; z-index: 10000; box-shadow: 0 4px 15px rgba(0, 123, 255, 0.5); transition: all 0.3s ease; }
        .start-btn:hover { background-color: #0056b3; transform: scale(1.05); }
        .skip-btn { position: absolute; bottom: 30px; right: 30px; padding: 10px 25px; font-size: 16px; color: #fff; background-color: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); border-radius: 30px; cursor: pointer; z-index: 10000; backdrop-filter: blur(5px); display: none; transition: background 0.3s; }
        .skip-btn:hover { background-color: rgba(255,255,255,0.4); }
        
        .editor-hs-icon { width: 35px; height: 35px; border-radius: 50%; border: 2px solid white; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 10px rgba(0,0,0,0.5); font-weight: bold; color: white; }
        .editor-hs-video { background-color: rgba(220, 53, 69, 0.8); animation: pulse-vid 2s infinite; }
        .editor-hs-video::after { content: "▶"; font-size: 16px; margin-left: 3px; }
        .editor-hs-url { background-color: rgba(0, 123, 255, 0.8); }
        .editor-hs-url::after { content: "🌐"; font-size: 16px; }
        .editor-hs-info { background-color: rgba(108, 117, 125, 0.8); }
        .editor-hs-info::after { content: "i"; font-size: 16px; font-family: serif; font-style: italic; }
        @keyframes pulse-vid { 0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(220, 53, 69, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); } }
    </style>
</head>
<body>
    <div id="panorama"></div>

    <div id="video360-container" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; z-index:8500; background:#000;">
        </div>

    ${introVideo && (introVideo.desktop || introVideo.mobile) ? `<div id="intro-overlay"><button id="start-btn" class="start-btn">Mulai Virtual Tour</button><video id="intro-video" playsinline><source id="video-source" src="" type="video/mp4"></video><button id="skip-btn" class="skip-btn">Skip Intro ⏭</button></div>` : ''}

    <script>
        const tourConfigData = ${JSON.stringify(tourConfig)};
        
        let vjsPlayer = null;

        // FUNGSI MEMANGGIL VIDEO.JS SAAT HOTSPOT DIKLIK
        function playVideo360(videoPath) {
            document.getElementById('panorama').style.display = 'none';
            const container = document.getElementById('video360-container');
            container.style.display = 'block';

            // Kita harus merender ulang tag <video> setiap kali diputar
            // karena Video.js men-destroy tag ini saat ditutup
            container.innerHTML = \`
                <button id="btn-close-video360" style="position:absolute; top:20px; right:20px; z-index:8501; padding:10px 25px; font-size:16px; font-weight:bold; background:rgba(220,53,69,0.9); color:#fff; border:2px solid #fff; border-radius:30px; cursor:pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">✖ KEMBALI KE TUR</button>
                <video id="video360-player" class="video-js vjs-default-skin vjs-big-play-centered" controls crossorigin="anonymous" style="width:100%; height:100%;">
                    <source src="\${videoPath}" type="video/mp4"/>
                </video>
            \`;

            document.getElementById('btn-close-video360').addEventListener('click', closeVideo360);

            // Inisialisasi Video.js dengan Plugin Pannellum
            vjsPlayer = videojs('video360-player', {
                plugins: {
                    pannellum: {}
                }
            });
            
            // Otomatis mainkan
            vjsPlayer.play();
        }

        // FUNGSI MENUTUP VIDEO DAN KEMBALI KE PANORAMA FOTO
        function closeVideo360() {
            if (vjsPlayer) {
                vjsPlayer.dispose(); // Hancurkan mesin Video.js secara bersih
                vjsPlayer = null;
            }
            document.getElementById('video360-container').style.display = 'none';
            document.getElementById('video360-container').innerHTML = ''; // Bersihkan container
            document.getElementById('panorama').style.display = 'block';
        }

        // MENGUBAH HOTSPOT VIDEO MENJADI FUNGSI KLIK
        for (let sceneId in tourConfigData.scenes) {
            let scene = tourConfigData.scenes[sceneId];
            if (scene.hotSpots) {
                scene.hotSpots.forEach(hs => {
                    if (hs.type === 'video360_custom') {
                        hs.type = 'info'; 
                        hs.cssClass = 'editor-hs-icon editor-hs-video'; 
                        hs.clickHandlerFunc = function() { playVideo360(hs.videoPath); }; 
                    } else if (hs.type === 'info') {
                        if (hs.URL) { hs.cssClass = 'editor-hs-icon editor-hs-url'; } 
                        else { hs.cssClass = 'editor-hs-icon editor-hs-info'; }
                    }
                });
            }
        }
        
        const viewer = pannellum.viewer('panorama', tourConfigData);

        const introOverlay = document.getElementById('intro-overlay'); const introVideo = document.getElementById('intro-video'); const startBtn = document.getElementById('start-btn'); const skipBtn = document.getElementById('skip-btn'); const videoSource = document.getElementById('video-source');
        const hasVideo = ${!!(introVideo && (introVideo.desktop || introVideo.mobile))}; const desktopVideo = "${desktopSrc}"; const mobileVideo = "${mobileSrc}";
        if (hasVideo) {
            startBtn.addEventListener('click', () => { startBtn.style.display = 'none'; skipBtn.style.display = 'block'; const isMobile = window.innerWidth <= 768; let selectedVideo = isMobile && mobileVideo ? mobileVideo : desktopVideo; if (!selectedVideo) selectedVideo = mobileVideo; videoSource.src = selectedVideo; introVideo.load(); introVideo.muted = false; introVideo.volume = 1.0; introVideo.play(); });
            const finishIntro = () => { introOverlay.style.transition = "opacity 0.8s"; introOverlay.style.opacity = "0"; setTimeout(() => { introOverlay.style.display = 'none'; introVideo.pause(); }, 800); };
            skipBtn.addEventListener('click', finishIntro); introVideo.addEventListener('ended', finishIntro);
        }
    </script>
</body>
</html>`;

        fs.writeFileSync(path.join(exportDir, 'index.html'), htmlContent);
        sendData({ type: 'success', message: 'Virtual Tour Berhasil Dibuat!', folderName: folderName, percent: 100 }); res.end();

    } catch (error) { console.error(error); sendData({ type: 'error', message: 'Error: ' + error.message }); res.end(); }
};

module.exports = { generateVirtualTour };