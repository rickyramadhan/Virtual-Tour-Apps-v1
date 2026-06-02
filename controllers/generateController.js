const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.join(__dirname, '..');

const generateVirtualTour = async (req, res) => {
    const { scenes, folderName, introVideo, welcomeText, skinConfig, firstSceneId, mediaVideo360 } = req.body;

    if (!scenes || scenes.length === 0 || !folderName) {
        return res.status(400).json({ success: false, message: 'Data tidak valid.' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    const sendData = (data) => res.write(JSON.stringify(data) + '\n');

    try {
        const exportDir = path.join(rootDir, 'exports', folderName);
        const tilesDir = path.join(exportDir, 'tiles');
        
        sendData({ type: 'progress', message: 'Membuat struktur folder...', detail: '[Setup] Membuat folder master', percent: 2 });
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
        if (!fs.existsSync(tilesDir)) fs.mkdirSync(tilesDir, { recursive: true });

        // COPY VIDEO INTRO
        let desktopSrc = ''; let mobileSrc = '';
        if (introVideo && introVideo.desktop) { 
            let dPath = decodeURIComponent(introVideo.desktop);
            if (dPath.startsWith('/') || dPath.startsWith('\\')) dPath = dPath.substring(1);
            desktopSrc = `intro_desktop${path.extname(dPath)}`; 
            fs.copyFileSync(path.join(rootDir, dPath), path.join(exportDir, desktopSrc)); 
        }
        if (introVideo && introVideo.mobile) { 
            let mPath = decodeURIComponent(introVideo.mobile);
            if (mPath.startsWith('/') || mPath.startsWith('\\')) mPath = mPath.substring(1);
            mobileSrc = `intro_mobile${path.extname(mPath)}`; 
            fs.copyFileSync(path.join(rootDir, mPath), path.join(exportDir, mobileSrc)); 
        }

        // COPY MEDIA VIDEO 360
        if (mediaVideo360 && mediaVideo360.length > 0) {
            sendData({ type: 'progress', message: 'Menyiapkan Media Video 360...', detail: '[Setup] Menyalin file Video 360', percent: 5 });
            const mediaDir = path.join(exportDir, 'media');
            if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
            
            mediaVideo360.forEach(vid => {
                let vPath = decodeURIComponent(vid.path);
                if (vPath.startsWith('/') || vPath.startsWith('\\')) vPath = vPath.substring(1);
                const ext = path.extname(vPath);
                const fileName = `${vid.id}${ext}`;
                fs.copyFileSync(path.join(rootDir, vPath), path.join(mediaDir, fileName));
                vid.exportPath = `media/${fileName}`; 
            });
        }

        // MANAJEMEN SKIN FRAME IMAGE (WELCOME TEXT)
        let customDesktopSkin = ''; let customMobileSkin = '';
        if (skinConfig && skinConfig.template === 'custom') {
            if (skinConfig.customDesktop) {
                let p = decodeURIComponent(skinConfig.customDesktop);
                if (p.startsWith('/') || p.startsWith('\\')) p = p.substring(1);
                customDesktopSkin = `skin_desktop${path.extname(p)}`;
                fs.copyFileSync(path.join(rootDir, p), path.join(exportDir, customDesktopSkin));
            }
            if (skinConfig.customMobile) {
                let p = decodeURIComponent(skinConfig.customMobile);
                if (p.startsWith('/') || p.startsWith('\\')) p = p.substring(1);
                customMobileSkin = `skin_mobile${path.extname(p)}`;
                fs.copyFileSync(path.join(rootDir, p), path.join(exportDir, customMobileSkin));
            }
        }
        
        const defaultFrameSrc = 'welcome_desktop.webp';
        if (fs.existsSync(path.join(rootDir, 'welcome_desktop.webp'))) {
            fs.copyFileSync(path.join(rootDir, 'welcome_desktop.webp'), path.join(exportDir, defaultFrameSrc));
        }

        const desktopFrameUrl = (skinConfig && skinConfig.template === 'custom' && customDesktopSkin) ? customDesktopSkin : defaultFrameSrc;
        const mobileFrameUrl = (skinConfig && skinConfig.template === 'custom' && customMobileSkin) ? customMobileSkin : desktopFrameUrl;

        const psvConfig = { firstScene: firstSceneId || scenes[0].id, scenes: {} };
        const totalScenes = scenes.length; 
        const scenePercentShare = 90 / totalScenes;

        // EQUIRECTANGULAR TILES GENERATION (PURE NODE.JS)
        for (let i = 0; i < totalScenes; i++) {
            const scene = scenes[i];
            const sceneTilesDir = path.join(tilesDir, scene.id);
            const basePercent = 5 + (i * scenePercentShare);

            if (fs.existsSync(sceneTilesDir)) fs.removeSync(sceneTilesDir); 
            fs.mkdirSync(sceneTilesDir, { recursive: true });

            let cleanImagePath = decodeURIComponent(scene.imagePath); 
            if (cleanImagePath.startsWith('/') || cleanImagePath.startsWith('\\')) cleanImagePath = cleanImagePath.substring(1);
            
            const fullImagePath = path.join(rootDir, cleanImagePath);

            sendData({ type: 'progress', message: `Menganalisa Panorama ${i + 1}/${totalScenes}...`, detail: `[Setup] Membaca dimensi: ${scene.title}`, percent: Math.round(basePercent) });

            const metadata = await sharp(fullImagePath).metadata();
            const origWidth = metadata.width;
            const origHeight = metadata.height;

            let cols = 1; while (cols * 512 < origWidth) cols *= 2; 
            let rows = 1; while (rows * 512 < origHeight) rows *= 2; 

            const tileWidth = Math.ceil(origWidth / cols);
            const tileHeight = Math.ceil(origHeight / rows);

            sendData({ type: 'progress', message: `Membuat Fallback ${i + 1}/${totalScenes}...`, detail: `[Resize] Base texture...`, percent: Math.round(basePercent + (scenePercentShare * 0.1)) });
            await sharp(fullImagePath).resize(2048).webp({ quality: 80 }).toFile(path.join(sceneTilesDir, 'fallback.webp'));

            const tileTasks = [];
            for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { tileTasks.push({ r, c }); } }

            const totalTiles = tileTasks.length; let converted = 0; const BATCH_SIZE = 15; const sharpShare = scenePercentShare * 0.8; 

            for (let j = 0; j < totalTiles; j += BATCH_SIZE) {
                const chunk = tileTasks.slice(j, j + BATCH_SIZE);
                await Promise.all(chunk.map(async (task) => {
                    const extractLeft = task.c * tileWidth;
                    const extractTop = task.r * tileHeight;
                    const extractWidth = Math.min(tileWidth, origWidth - extractLeft);
                    const extractHeight = Math.min(tileHeight, origHeight - extractTop);

                    await sharp(fullImagePath).extract({ left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight }).webp({ quality: 75, effort: 1 }).toFile(path.join(sceneTilesDir, `${task.c}_${task.r}.webp`));
                }));
                converted += chunk.length;
                sendData({ type: 'progress', message: `Memecah Tiles (WebP) ${i + 1}/${totalScenes}...`, detail: `[Paralel] ${converted}/${totalTiles} Tiles`, percent: Math.round(basePercent + (scenePercentShare * 0.1) + (sharpShare * (converted / totalTiles))) });
            }

            // PERUBAHAN TAMPILAN MARKER UNTUK HASIL EXPORT
            const psvMarkers = (scene.hotSpots || []).map((hs, idx) => {
                let finalType = hs.type; let videoPath = undefined;
                let markerHtml = '';

                if (hs.type === 'video') { 
                    finalType = 'video360_custom'; 
                    markerHtml = `<div style="width: 40px; height: 40px; background: rgba(220,53,69,0.9); border: 2px solid white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; animation: pulse-vid 2s infinite;"><div style="font-size: 18px; color: white; margin-left: 4px;">▶</div></div>`;
                    const vidObj = (mediaVideo360 || []).find(v => v.id === hs.targetVideo); videoPath = vidObj ? vidObj.exportPath : ''; 
                } else if (hs.type === 'scene') { 
                    finalType = 'scene'; 
                    markerHtml = `<div style="width: 40px; height: 40px; background: rgba(0,0,0,0.5); border: 2px solid white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; animation: bounce-arrow 1.5s infinite;"><div style="font-size: 24px; color: white; transform: translateY(-2px); text-shadow: 0 2px 4px #000;">⇧</div></div>`;
                } else if (hs.type === 'url') { 
                    markerHtml = `<div style="width: 40px; height: 40px; background: rgba(0,123,255,0.9); border: 2px solid white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer;"><div style="font-size: 18px; color: white;">🌐</div></div>`;
                } else {
                    markerHtml = `<div style="width: 40px; height: 40px; background: rgba(108,117,125,0.9); border: 2px solid white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer;"><div style="font-size: 18px; color: white; font-family: serif; font-style: italic;">i</div></div>`;
                }

                return { 
                    id: `hs_${idx}`, position: { pitch: hs.pitch, yaw: hs.yaw }, html: markerHtml, 
                    anchor: 'center center', size: { width: 40, height: 40 }, tooltip: { content: hs.text, position: 'top center' }, 
                    data: { type: finalType, targetScene: hs.targetScene, videoPath: videoPath, url: hs.url } 
                };
            });

            psvConfig.scenes[scene.id] = { id: scene.id, pitch: scene.pitch || 0, yaw: scene.yaw || 0, zoom: scene.zoomLvl || 50, markers: psvMarkers, panorama: { width: origWidth, cols: cols, rows: rows } };
        }

        sendData({ type: 'progress', message: 'Merakit antarmuka HTML...', detail: '[System] Menulis kode ES Modules', percent: 97 });
        
        const safeWelcomeText = welcomeText ? welcomeText.replace(/\n/g, '<br>') : '';
        
        const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${folderName} - Virtual Tour</title>

    <script type="importmap">
        {
            "imports": {
                "three": "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js",
                "@photo-sphere-viewer/core": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@5.7.1/index.module.js",
                "@photo-sphere-viewer/markers-plugin": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/markers-plugin@5.7.1/index.module.js",
                "@photo-sphere-viewer/equirectangular-tiles-adapter": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/equirectangular-tiles-adapter@5.7.1/index.module.js",
                "@photo-sphere-viewer/equirectangular-video-adapter": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/equirectangular-video-adapter@5.7.1/index.module.js"
            }
        }
    </script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@5.7.1/index.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/markers-plugin@5.7.1/index.min.css">

    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        #panorama { width: 100%; height: 100%; }
        #video360-container { display:none; position:absolute; top:0; left:0; width:100%; height:100%; z-index:8500; background:#000; }
        #video360-viewer { width: 100%; height: 100%; }
        
        #intro-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #000; z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        #intro-video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
        .start-btn { position: absolute; padding: 15px 40px; font-size: 20px; font-weight: bold; color: #fff; background-color: #007bff; border: none; border-radius: 50px; cursor: pointer; z-index: 10000; box-shadow: 0 4px 15px rgba(0, 123, 255, 0.5); transition: all 0.3s ease; }
        .start-btn:hover { background-color: #0056b3; transform: scale(1.05); }
        .skip-btn { position: absolute; bottom: 30px; right: 30px; padding: 10px 25px; font-size: 16px; color: #fff; background-color: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); border-radius: 30px; cursor: pointer; z-index: 10000; backdrop-filter: blur(5px); display: none; transition: background 0.3s; }
        .skip-btn:hover { background-color: rgba(255,255,255,0.4); }
        
        /* CSS UNTUK WELCOME TEXT DENGAN IMAGE FRAME & FULL SCREEN CLICK */
        #welcome-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.3); z-index: 9000; display: none; cursor: pointer; transition: opacity 0.5s ease; }
        #welcome-panel {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 800px; max-width: 90%; min-height: 250px;
            background-image: url('${desktopFrameUrl}');
            background-size: 100% 100%; background-position: center; background-repeat: no-repeat;
            display: flex; justify-content: center; align-items: center; 
            padding: 60px 80px; box-sizing: border-box; text-align: center;
        }
        #welcome-panel p { font-size: 16px; color: #fff; line-height: 1.6; text-shadow: 1px 1px 4px #000; margin: 0; font-weight: 500; }

        @media (max-width: 768px) {
            #welcome-panel { background-image: url('${mobileFrameUrl}'); padding: 40px 30px; width: 95%; }
            #welcome-panel p { font-size: 14px; }
        }

        /* ANIMASI BARU UNTUK HOTSPOT */
        @keyframes bounce-arrow { 0%, 100% { transform: translateY(0); box-shadow: 0 4px 10px rgba(0,0,0,0.5); } 50% { transform: translateY(-10px); box-shadow: 0 10px 20px rgba(0,0,0,0.6); } }
        @keyframes pulse-vid { 0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(220, 53, 69, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); } }
    </style>
</head>
<body>
    <div id="panorama"></div>

    ${welcomeText ? `
    <div id="welcome-overlay">
        <div id="welcome-panel">
            <p>${safeWelcomeText}</p>
        </div>
    </div>` : ''}

    <div id="video360-container">
        <button id="btn-close-video360" style="position:absolute; top:20px; right:20px; z-index:8501; padding:10px 25px; font-size:16px; font-weight:bold; background:rgba(220,53,69,0.9); color:#fff; border:2px solid #fff; border-radius:30px; cursor:pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">✖ KEMBALI KE TUR</button>
        <div id="video360-viewer"></div>
    </div>

    ${introVideo && (introVideo.desktop || introVideo.mobile) ? `<div id="intro-overlay"><button id="start-btn" class="start-btn">Mulai Virtual Tour</button><video id="intro-video" playsinline><source id="video-source" src="" type="video/mp4"></video><button id="skip-btn" class="skip-btn">Skip Intro ⏭</button></div>` : ''}

    <script type="module">
        import { Viewer } from '@photo-sphere-viewer/core';
        import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
        import { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';
        import { EquirectangularVideoAdapter } from '@photo-sphere-viewer/equirectangular-video-adapter';

        const scenesData = ${JSON.stringify(psvConfig)};
        let viewer = null;
        let markersPlugin = null;
        let videoViewer = null;

        const introOverlay = document.getElementById('intro-overlay'); const introVideo = document.getElementById('intro-video'); const startBtn = document.getElementById('start-btn'); const skipBtn = document.getElementById('skip-btn'); const videoSource = document.getElementById('video-source');
        const hasVideo = ${!!(introVideo && (introVideo.desktop || introVideo.mobile))}; const desktopVideo = "${desktopSrc}"; const mobileVideo = "${mobileSrc}";
        
        const welcomeOverlay = document.getElementById('welcome-overlay');
        const showWelcomeText = () => {
            if (welcomeOverlay) welcomeOverlay.style.display = 'block';
        };

        if (welcomeOverlay) {
            welcomeOverlay.addEventListener('click', () => {
                welcomeOverlay.style.opacity = '0';
                setTimeout(() => { welcomeOverlay.style.display = 'none'; }, 500);
            });
        }

        if (hasVideo && startBtn) {
            startBtn.addEventListener('click', () => { 
                startBtn.style.display = 'none'; skipBtn.style.display = 'block'; const isMobile = window.innerWidth <= 768; let selectedVideo = isMobile && mobileVideo ? mobileVideo : desktopVideo; if (!selectedVideo) selectedVideo = mobileVideo; videoSource.src = selectedVideo; introVideo.load(); introVideo.muted = false; introVideo.volume = 1.0; 
                introVideo.play().catch(e => console.log(e)); 
            });
            const finishIntro = () => { 
                introOverlay.style.transition = "opacity 0.8s"; introOverlay.style.opacity = "0"; 
                setTimeout(() => { 
                    introOverlay.style.display = 'none'; introVideo.pause(); 
                    showWelcomeText(); 
                }, 800); 
            };
            skipBtn.addEventListener('click', finishIntro); introVideo.addEventListener('ended', finishIntro);
        } else {
            if (introOverlay) introOverlay.style.display = 'none'; 
            showWelcomeText(); 
        }

        function loadScene(sceneId) {
            const sceneData = scenesData.scenes[sceneId];
            
            sceneData.panorama.baseUrl = 'tiles/' + sceneId + '/fallback.webp';
            sceneData.panorama.tileUrl = function(col, row) {
                return 'tiles/' + sceneId + '/' + col + '_' + row + '.webp';
            };

            if (!viewer) {
                viewer = new Viewer({
                    container: 'panorama',
                    adapter: EquirectangularTilesAdapter,
                    panorama: sceneData.panorama,
                    defaultPitch: sceneData.pitch, 
                    defaultYaw: sceneData.yaw, 
                    defaultZoomLvl: sceneData.zoom,
                    navbar: ['zoom', 'fullscreen'],
                    plugins: [ [MarkersPlugin, { markers: sceneData.markers }] ]
                });
                
                markersPlugin = viewer.getPlugin(MarkersPlugin);
                
                markersPlugin.addEventListener('select-marker', ({ marker }) => {
                    const data = marker.config.data;
                    if (data.type === 'scene') { loadScene(data.targetScene); } 
                    else if (data.type === 'video360_custom') { playVideo360(data.videoPath); } 
                    else if (data.type === 'url' && data.url) { window.open(data.url, '_blank'); }
                });
            } else {
                viewer.setPanorama(sceneData.panorama, { pitch: sceneData.pitch, yaw: sceneData.yaw, zoom: sceneData.zoom, transition: 1000 }).then(() => { markersPlugin.setMarkers(sceneData.markers); });
            }
        }

        function playVideo360(videoPath) {
            document.getElementById('panorama').style.display = 'none';
            document.getElementById('video360-container').style.display = 'block';
            if (videoViewer) { videoViewer.destroy(); }
            
            videoViewer = new Viewer({
                container: 'video360-viewer',
                adapter: EquirectangularVideoAdapter,
                panorama: { source: videoPath },
                navbar: ['video', 'zoom', 'fullscreen']
            });
        }
        
        document.getElementById('btn-close-video360').addEventListener('click', () => {
            if (videoViewer) { videoViewer.destroy(); videoViewer = null; }
            document.getElementById('video360-container').style.display = 'none';
            document.getElementById('panorama').style.display = 'block';
        });

        try { loadScene(scenesData.firstScene); } catch(err) { console.error("Gagal memuat panorama:", err); }
    </script>
</body>
</html>`;

        fs.writeFileSync(path.join(exportDir, 'index.html'), htmlContent);
        sendData({ type: 'success', message: 'Virtual Tour Berhasil Dibuat!', folderName: folderName, percent: 100 }); res.end();

    } catch (error) { console.error(error); sendData({ type: 'error', message: 'Error: ' + error.message }); res.end(); }
};

module.exports = { generateVirtualTour };