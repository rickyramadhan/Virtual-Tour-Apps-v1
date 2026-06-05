const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.join(__dirname, '..');

const generateVirtualTour = async (req, res) => {
    // Menerima parameter lengkap termasuk skinConfig (Shapes) dan tourSettings (Plugins)
    const { scenes, folderName, introVideo, welcomeText, skinConfig, firstSceneId, mediaVideo360, exportQuality, tourSettings } = req.body;

    if (!scenes || scenes.length === 0 || !folderName) { return res.status(400).json({ success: false, message: 'Data tidak valid.' }); }
    const imgQuality = exportQuality ? parseInt(exportQuality) : 75;

    res.setHeader('Content-Type', 'application/json'); res.setHeader('Transfer-Encoding', 'chunked');
    const sendData = (data) => res.write(JSON.stringify(data) + '\n');

    try {
        const exportDir = path.join(rootDir, 'exports', folderName); const tilesDir = path.join(exportDir, 'tiles');
        sendData({ type: 'progress', message: 'Membuat struktur folder...', detail: `[Setup] Master Folder | Quality: ${imgQuality}%`, percent: 2 });
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true }); if (!fs.existsSync(tilesDir)) fs.mkdirSync(tilesDir, { recursive: true });

        let desktopSrc = ''; let mobileSrc = '';
        if (introVideo && introVideo.desktop) { let dPath = decodeURIComponent(introVideo.desktop); if (dPath.startsWith('/') || dPath.startsWith('\\')) dPath = dPath.substring(1); desktopSrc = `intro_desktop${path.extname(dPath)}`; fs.copyFileSync(path.join(rootDir, dPath), path.join(exportDir, desktopSrc)); }
        if (introVideo && introVideo.mobile) { let mPath = decodeURIComponent(introVideo.mobile); if (mPath.startsWith('/') || mPath.startsWith('\\')) mPath = mPath.substring(1); mobileSrc = `intro_mobile${path.extname(mPath)}`; fs.copyFileSync(path.join(rootDir, mPath), path.join(exportDir, mobileSrc)); }

        if (mediaVideo360 && mediaVideo360.length > 0) {
            sendData({ type: 'progress', message: 'Menyiapkan Media Video 360...', detail: '[Setup] Menyalin file Video 360', percent: 5 });
            const mediaDir = path.join(exportDir, 'media'); if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
            mediaVideo360.forEach(vid => { let vPath = decodeURIComponent(vid.path); if (vPath.startsWith('/') || vPath.startsWith('\\')) vPath = vPath.substring(1); const fileName = `${vid.id}${path.extname(vPath)}`; fs.copyFileSync(path.join(rootDir, vPath), path.join(mediaDir, fileName)); vid.exportPath = `media/${fileName}`; });
        }

        sendData({ type: 'progress', message: 'Memproses Ikon Custom...', detail: '[Setup] Menyalin file Ikon Hotspot', percent: 6 });
        const customIconsDir = path.join(exportDir, 'icons'); let iconDirCreated = false;
        scenes.forEach(scene => { if (scene.hotSpots) { scene.hotSpots.forEach(hs => { if (hs.iconStyle === 'custom' && hs.customIconPath) { if (!iconDirCreated) { if (!fs.existsSync(customIconsDir)) fs.mkdirSync(customIconsDir, { recursive: true }); iconDirCreated = true; } let p = decodeURIComponent(hs.customIconPath); if (p.startsWith('/') || p.startsWith('\\')) p = p.substring(1); const fileName = path.basename(p); const destPath = path.join(customIconsDir, fileName); if (fs.existsSync(path.join(rootDir, p))) { fs.copyFileSync(path.join(rootDir, p), destPath); hs.exportIconPath = `icons/${fileName}`; } } }); } });

        const uiElementsDir = path.join(exportDir, 'ui_assets'); let uiElements = skinConfig.uiElements || [];
        if (uiElements.length > 0) {
            sendData({ type: 'progress', message: 'Memproses Elemen UI...', detail: '[Setup] Menyalin gambar Skin UI', percent: 7 }); let uiDirCreated = false;
            uiElements.forEach(el => { if (el.type === 'image' && el.content) { if (!uiDirCreated) { if (!fs.existsSync(uiElementsDir)) fs.mkdirSync(uiElementsDir, { recursive: true }); uiDirCreated = true; } let p = decodeURIComponent(el.content); if (p.startsWith('/') || p.startsWith('\\')) p = p.substring(1); const fileName = path.basename(p); if (fs.existsSync(path.join(rootDir, p))) { fs.copyFileSync(path.join(rootDir, p), path.join(uiElementsDir, fileName)); el.exportPath = `ui_assets/${fileName}`; } } });
        }

        let customDesktopSkin = ''; let customMobileSkin = '';
        if (skinConfig && skinConfig.template === 'custom') { if (skinConfig.customDesktop) { let p = decodeURIComponent(skinConfig.customDesktop); if (p.startsWith('/') || p.startsWith('\\')) p = p.substring(1); customDesktopSkin = `skin_desktop${path.extname(p)}`; fs.copyFileSync(path.join(rootDir, p), path.join(exportDir, customDesktopSkin)); } if (skinConfig.customMobile) { let p = decodeURIComponent(skinConfig.customMobile); if (p.startsWith('/') || p.startsWith('\\')) p = p.substring(1); customMobileSkin = `skin_mobile${path.extname(p)}`; fs.copyFileSync(path.join(rootDir, p), path.join(exportDir, customMobileSkin)); } }
        const defaultFrameSrc = 'welcome_desktop.webp'; if (fs.existsSync(path.join(rootDir, 'welcome_desktop.webp'))) { fs.copyFileSync(path.join(rootDir, 'welcome_desktop.webp'), path.join(exportDir, defaultFrameSrc)); }
        const desktopFrameUrl = (skinConfig && skinConfig.template === 'custom' && customDesktopSkin) ? customDesktopSkin : defaultFrameSrc; const mobileFrameUrl = (skinConfig && skinConfig.template === 'custom' && customMobileSkin) ? customMobileSkin : desktopFrameUrl;

        const psvConfig = { firstScene: firstSceneId || scenes[0].id, scenes: {} };
        const totalScenes = scenes.length; const scenePercentShare = 90 / totalScenes;

        for (let i = 0; i < totalScenes; i++) {
            const scene = scenes[i]; const sceneTilesDir = path.join(tilesDir, scene.id); const basePercent = 5 + (i * scenePercentShare);
            if (fs.existsSync(sceneTilesDir)) fs.removeSync(sceneTilesDir); fs.mkdirSync(sceneTilesDir, { recursive: true });
            let cleanImagePath = decodeURIComponent(scene.imagePath); if (cleanImagePath.startsWith('/') || cleanImagePath.startsWith('\\')) cleanImagePath = cleanImagePath.substring(1); const fullImagePath = path.join(rootDir, cleanImagePath);

            sendData({ type: 'progress', message: `Menganalisa Panorama ${i + 1}/${totalScenes}...`, detail: `[Setup] Membaca dimensi: ${scene.title}`, percent: Math.round(basePercent) });
            const metadata = await sharp(fullImagePath).metadata(); const origWidth = metadata.width; const origHeight = metadata.height;
            let cols = 1; while (cols * 512 < origWidth) cols *= 2; let rows = 1; while (rows * 512 < origHeight) rows *= 2; 
            const tileWidth = Math.ceil(origWidth / cols); const tileHeight = Math.ceil(origHeight / rows);

            sendData({ type: 'progress', message: `Membuat Fallback ${i + 1}/${totalScenes}...`, detail: `[Resize] Menurunkan kualitas fallback...`, percent: Math.round(basePercent + (scenePercentShare * 0.1)) });
            await sharp(fullImagePath).resize(2048).webp({ quality: imgQuality }).toFile(path.join(sceneTilesDir, 'fallback.webp'));

            const tileTasks = []; for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { tileTasks.push({ r, c }); } }
            const totalTiles = tileTasks.length; let converted = 0; const BATCH_SIZE = 15; const sharpShare = scenePercentShare * 0.8; 

            for (let j = 0; j < totalTiles; j += BATCH_SIZE) {
                const chunk = tileTasks.slice(j, j + BATCH_SIZE);
                await Promise.all(chunk.map(async (task) => { const extractLeft = task.c * tileWidth; const extractTop = task.r * tileHeight; const extractWidth = Math.min(tileWidth, origWidth - extractLeft); const extractHeight = Math.min(tileHeight, origHeight - extractTop); await sharp(fullImagePath).extract({ left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight }).webp({ quality: imgQuality, effort: 1 }).toFile(path.join(sceneTilesDir, `${task.c}_${task.r}.webp`)); }));
                converted += chunk.length; sendData({ type: 'progress', message: `Memecah Tiles (WebP) ${i + 1}/${totalScenes}...`, detail: `[Paralel] ${converted}/${totalTiles} Tiles dengan Kualitas ${imgQuality}%`, percent: Math.round(basePercent + (scenePercentShare * 0.1) + (sharpShare * (converted / totalTiles))) });
            }

            // FOKUS BARU: INJEKSI UKURAN SKALA HOTSPOT (hs.size) KE HTML FINAL
            const psvMarkers = (scene.hotSpots || []).map((hs, idx) => {
                let finalType = hs.type; let videoPath = undefined; let markerHtml = ''; let customTemplateHtml = '';
                const hsSize = hs.size || 40; // Menarik parameter ukuran dari JSON

                if (hs.iconStyle === 'template2') { 
                    customTemplateHtml = `<div class="editor-hs-icon" style="width: ${hsSize}px; height: ${hsSize}px; background: radial-gradient(circle, rgba(255,0,0,1) 30%, rgba(255,255,255,0.8) 70%); border-radius: 50%; border: 2px solid red; box-shadow: 0 0 10px rgba(255,0,0,0.8); cursor: pointer;"></div>`; 
                } else if (hs.iconStyle === 'template3') { 
                    customTemplateHtml = `<div class="editor-hs-icon" style="width: ${hsSize}px; height: ${hsSize*1.3}px; background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 384 512%22 fill=%22%23007bff%22><path d=%22M172.3 501.7C27 291 0 269.4 0 192 0 86 86 0 192 0s192 86 192 192c0 77.4-27 99-172.3 309.7-9.5 13.8-29.9 13.8-39.5 0zM192 272c44.2 0 80-35.8 80-80s-35.8-80-80-80-80 35.8-80 80 35.8 80 80 80z%22/></svg>'); background-size: cover; background-position: center; background-repeat: no-repeat; cursor: pointer; border:none; border-radius:0; box-shadow:none;"></div>`; 
                } else if (hs.iconStyle === 'custom' && hs.exportIconPath) { 
                    customTemplateHtml = `<div class="editor-hs-icon" style="width: ${hsSize}px; height: ${hsSize}px; background-image: url('${hs.exportIconPath}'); background-size: contain; background-repeat: no-repeat; background-position: center; cursor: pointer; border:none; border-radius:0; box-shadow:none;"></div>`; 
                }
                
                if (hs.type === 'video') { 
                    finalType = 'video360_custom'; 
                    markerHtml = customTemplateHtml || `<div class="editor-hs-icon editor-hs-video" style="width: ${hsSize}px; height: ${hsSize}px;"><div style="font-size: ${hsSize/2.2}px; margin-left: 4px;">▶</div></div>`; 
                    const vidObj = (mediaVideo360 || []).find(v => v.id === hs.targetVideo); videoPath = vidObj ? vidObj.exportPath : ''; 
                } else if (hs.type === 'scene') { 
                    finalType = 'scene'; 
                    markerHtml = customTemplateHtml || `<div class="editor-hs-icon editor-hs-scene" style="width: ${hsSize}px; height: ${hsSize}px;"><div style="font-size: ${hsSize/1.8}px; transform: translateY(-2px); text-shadow: 0 2px 4px #000;">⇧</div></div>`; 
                } else if (hs.type === 'url') { 
                    markerHtml = customTemplateHtml || `<div class="editor-hs-icon editor-hs-url" style="width: ${hsSize}px; height: ${hsSize}px;"><div style="font-size: ${hsSize/2.2}px;">🌐</div></div>`; 
                } else { 
                    markerHtml = customTemplateHtml || `<div class="editor-hs-icon editor-hs-info" style="width: ${hsSize}px; height: ${hsSize}px;"><div style="font-size: ${hsSize/2.2}px; font-family: serif; font-style: italic;">i</div></div>`; 
                }
                
                // Set ukuran dinamis di size { width, height }
                return { id: `hs_${idx}`, position: { pitch: hs.pitch, yaw: hs.yaw }, html: markerHtml, anchor: 'center center', size: { width: hsSize, height: hsSize }, tooltip: { content: hs.text, position: 'top center' }, data: { type: finalType, targetScene: hs.targetScene, videoPath: videoPath, url: hs.url } };
            });
            psvConfig.scenes[scene.id] = { id: scene.id, pitch: scene.pitch || 0, yaw: scene.yaw || 0, zoom: scene.zoomLvl || 50, markers: psvMarkers, panorama: { width: origWidth, cols: cols, rows: rows } };
        }

        sendData({ type: 'progress', message: 'Merakit antarmuka HTML...', detail: '[System] Menulis kode ES Modules', percent: 97 });
        
        let googleFontsLinks = ''; const usedFonts = new Set();
        uiElements.forEach(el => { if (el.type === 'text' && el.fontFamily && el.fontFamily !== 'Arial' && el.fontFamily !== 'Arial, sans-serif') { usedFonts.add(el.fontFamily); } });
        usedFonts.forEach(font => { googleFontsLinks += `<link href="https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}:wght@300;400;600;700;900&display=swap" rel="stylesheet">\n`; });

        let generatedUiHtml = `<div id="custom-ui-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 8000; overflow: hidden;">`;
        uiElements.forEach((el, index) => {
            let elContent = ''; let extraStyle = ''; let specificStyle = '';
            
            const shadowX = el.shadowX || 0; const shadowY = el.shadowY || 0; const shadowBlur = el.shadowBlur || 0; const shadowColor = el.shadowColor || '#000000';
            const shadowStyle = (shadowX !== 0 || shadowY !== 0 || shadowBlur > 0) ? `box-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowColor};` : '';
            const targetDev = el.targetDevice || 'desktop';

            const opc = el.opacity !== undefined ? el.opacity : 1;
            const bRad = el.type === 'circle' ? '50%' : `${el.borderRadius || 0}px`;
            const bStyle = `${el.borderWidth || 0}px solid ${el.borderColor || '#ffffff'}`;
            const bgCol = el.bgTransparent ? 'transparent' : (el.bgColor || 'transparent');
            const zIdx = 10 + index; 

            if (el.type === 'text') {
                elContent = el.content ? el.content.replace(/\n/g, '<br>') : '';
                const tAlign = el.textAlign || 'center'; const jContent = tAlign === 'left' ? 'flex-start' : (tAlign === 'right' ? 'flex-end' : 'center');
                const aItems = el.verticalAlign || 'center'; const wSpace = el.wordWrap !== false ? 'normal' : 'nowrap';
                const tOverflow = el.wordWrap !== false ? '' : 'text-overflow: ellipsis;'; const fFamily = el.fontFamily ? `'${el.fontFamily}', sans-serif` : 'sans-serif';
                const fWeight = el.fontWeight || 400;
                specificStyle = `color: ${el.color || '#ffffff'}; font-size: ${el.fontSize || 16}px; font-family: ${fFamily}; font-weight: ${fWeight}; display: flex; text-align: ${tAlign}; justify-content: ${jContent}; align-items: ${aItems}; white-space: ${wSpace}; ${tOverflow} word-break: break-word; overflow: hidden;`;
            } else if (el.type === 'image') {
                const bgUrl = el.exportPath ? el.exportPath : '';
                specificStyle = `background-image: url('${bgUrl}'); background-size: 100% 100%; background-position: center; background-repeat: no-repeat;`;
            }
            
            extraStyle = `opacity: ${opc}; border-radius: ${bRad}; border: ${bStyle}; background-color: ${bgCol}; z-index: ${zIdx}; ${shadowStyle} ${specificStyle}`;
            const cursorStyle = el.action !== 'none' ? 'cursor: pointer;' : '';
            
            generatedUiHtml += `
            <div class="custom-ui-el dev-${targetDev}" style="position: absolute; left: ${el.left}%; top: ${el.top}%; width: ${el.width}%; height: ${el.height}%; pointer-events: auto; box-sizing: border-box; ${extraStyle} ${cursorStyle}" data-action="${el.action}" data-target="${el.target}">
                ${elContent}
            </div>`;
        });
        generatedUiHtml += `</div>`;

        const settings = tourSettings || {};
        let extraImportsMap = ''; let extraCss = ''; let extraJsImports = ''; let extraPluginInit = ''; let navbarExtras = '';

        if (settings.autorotate) { extraImportsMap += `,\n                "@photo-sphere-viewer/autorotate-plugin": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/autorotate-plugin@5.7.1/index.module.js"`; extraJsImports += `\n        import { AutorotatePlugin } from '@photo-sphere-viewer/autorotate-plugin';`; extraPluginInit += `\n                pluginsArray.push([AutorotatePlugin, { autostartDelay: 2000, autostartOnIdle: true }]);`; navbarExtras += `, 'autorotate'`; }
        if (settings.compass) { extraImportsMap += `,\n                "@photo-sphere-viewer/compass-plugin": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/compass-plugin@5.7.1/index.module.js"`; extraCss += `\n    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/compass-plugin@5.7.1/index.min.css">`; extraJsImports += `\n        import { CompassPlugin } from '@photo-sphere-viewer/compass-plugin';`; extraPluginInit += `\n                pluginsArray.push([CompassPlugin, { hotspotColor: 'rgba(255, 255, 255, 0.8)', size: '120px', position: 'top right' }]);`; }
        if (settings.gallery) { extraImportsMap += `,\n                "@photo-sphere-viewer/gallery-plugin": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/gallery-plugin@5.7.1/index.module.js"`; extraCss += `\n    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/gallery-plugin@5.7.1/index.min.css">`; extraJsImports += `\n        import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';`; let galleryItemsStr = scenes.map(s => `{ id: '${s.id}', name: '${s.title ? s.title.replace(/'/g, "\\'") : 'Panorama'}', panorama: 'tiles/${s.id}/fallback.webp', thumbnail: 'tiles/${s.id}/fallback.webp' }`).join(', '); extraPluginInit += `\n                pluginsArray.push([GalleryPlugin, { items: [${galleryItemsStr}], visibleOnLoad: false }]);`; navbarExtras += `, 'gallery'`; }
        if (settings.map) { extraImportsMap += `,\n                "@photo-sphere-viewer/map-plugin": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/map-plugin@5.7.1/index.module.js"`; extraCss += `\n    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/map-plugin@5.7.1/index.min.css">`; extraJsImports += `\n        import { MapPlugin } from '@photo-sphere-viewer/map-plugin';`; extraPluginInit += `\n                pluginsArray.push([MapPlugin, { imageUrl: 'tiles/${scenes[0].id}/fallback.webp', center: {x: 0, y: 0}, size: '180px' }]);`; }
        if (settings.resolution) { extraImportsMap += `,\n                "@photo-sphere-viewer/resolution-plugin": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/resolution-plugin@5.7.1/index.module.js"`; extraJsImports += `\n        import { ResolutionPlugin } from '@photo-sphere-viewer/resolution-plugin';`; extraPluginInit += `\n                pluginsArray.push([ResolutionPlugin, { }]);`; }

        const navbarConfigStr = (settings.navbar === false) ? "false" : `['zoom', 'fullscreen'${navbarExtras}]`;
        const safeWelcomeText = welcomeText ? welcomeText.replace(/\n/g, '<br>') : '';

        let videoOverlayHtml = '';
        if (introVideo && (introVideo.desktop || introVideo.mobile)) {
            const dVid = desktopSrc || mobileSrc;
            const mVid = mobileSrc || desktopSrc;
            videoOverlayHtml = `
            <div id="intro-overlay">
                <button id="start-btn" class="start-btn">Mulai Virtual Tour</button>
                <video id="intro-video" playsinline preload="auto">
                    <source src="${dVid}" media="(min-width: 769px)" type="video/mp4">
                    <source src="${mVid}" media="(max-width: 768px)" type="video/mp4">
                </video>
                <button id="skip-btn" class="skip-btn">Skip Intro ⏭</button>
            </div>`;
        }

        const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${folderName} - Virtual Tour</title>
    ${googleFontsLinks}
    <script type="importmap">
        {
            "imports": {
                "three": "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js",
                "@photo-sphere-viewer/core": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@5.7.1/index.module.js",
                "@photo-sphere-viewer/markers-plugin": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/markers-plugin@5.7.1/index.module.js",
                "@photo-sphere-viewer/equirectangular-tiles-adapter": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/equirectangular-tiles-adapter@5.7.1/index.module.js",
                "@photo-sphere-viewer/equirectangular-video-adapter": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/equirectangular-video-adapter@5.7.1/index.module.js",
                "@photo-sphere-viewer/video-plugin": "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/video-plugin@5.7.1/index.module.js"${extraImportsMap}
            }
        }
    </script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@5.7.1/index.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/markers-plugin@5.7.1/index.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/video-plugin@5.7.1/index.min.css">${extraCss}

    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        #panorama { width: 100%; height: 100%; }
        #video360-container { display:none; position:absolute; top:0; left:0; width:100%; height:100%; z-index:8500; background:#000; }
        #video360-viewer { width: 100%; height: 100%; }
        #intro-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #000; z-index: 99999; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        #intro-video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
        .start-btn { position: absolute; padding: 15px 40px; font-size: 20px; font-weight: bold; color: #fff; background-color: #007bff; border: none; border-radius: 50px; cursor: pointer; z-index: 100000; box-shadow: 0 4px 15px rgba(0, 123, 255, 0.5); transition: all 0.3s ease; }
        .start-btn:hover { background-color: #0056b3; transform: scale(1.05); }
        .skip-btn { position: absolute; bottom: 30px; right: 30px; padding: 10px 25px; font-size: 16px; color: #fff; background-color: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5); border-radius: 30px; cursor: pointer; z-index: 100000; backdrop-filter: blur(5px); display: none; transition: background 0.3s; }
        .skip-btn:hover { background-color: rgba(255,255,255,0.4); }
        #welcome-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.3); z-index: 9000; display: none; cursor: pointer; transition: opacity 0.5s ease; }
        #welcome-panel { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 800px; max-width: 90%; min-height: 250px; background-image: url('${desktopFrameUrl}'); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; justify-content: center; align-items: center; padding: 60px 80px; box-sizing: border-box; text-align: center; }
        #welcome-panel p { font-size: 16px; color: #fff; line-height: 1.6; text-shadow: 1px 1px 4px #000; margin: 0; font-weight: 500; }
        .editor-hs-icon { border-radius: 50%; border: 2px solid white; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 10px rgba(0,0,0,0.5); font-weight: bold; color: white; transition: 0.2s; }
        .editor-hs-icon:hover { transform: scale(1.1); border-color: #007acc; }
        .editor-hs-scene { background-color: rgba(40, 167, 69, 0.8); }
        .editor-hs-video { background-color: rgba(220, 53, 69, 0.8); animation: pulse-vid 2s infinite; }
        .editor-hs-url { background-color: rgba(0, 123, 255, 0.8); }
        .editor-hs-info { background-color: rgba(108, 117, 125, 0.8); }
        @keyframes bounce-arrow { 0%, 100% { transform: translateY(0); box-shadow: 0 4px 10px rgba(0,0,0,0.5); } 50% { transform: translateY(-10px); box-shadow: 0 10px 20px rgba(0,0,0,0.6); } }
        @keyframes pulse-vid { 0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(220, 53, 69, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); } }

        @media (max-width: 479px) { .dev-desktop, .dev-tablet, .dev-fold { display: none !important; } #welcome-panel { background-image: url('${mobileFrameUrl}'); padding: 40px 30px; width: 95%; } #welcome-panel p { font-size: 14px; } }
        @media (min-width: 480px) and (max-width: 767px) { .dev-desktop, .dev-tablet, .dev-mobile { display: none !important; } #welcome-panel { background-image: url('${mobileFrameUrl}'); padding: 40px 30px; width: 95%; } #welcome-panel p { font-size: 14px; } }
        @media (min-width: 768px) and (max-width: 1024px) { .dev-desktop, .dev-fold, .dev-mobile { display: none !important; } #welcome-panel { padding: 50px 50px; } }
        @media (min-width: 1025px) { .dev-tablet, .dev-fold, .dev-mobile { display: none !important; } }
    </style>
</head>
<body>
    <div id="panorama"></div>
    ${generatedUiHtml}
    ${welcomeText ? `<div id="welcome-overlay"><div id="welcome-panel"><p>${safeWelcomeText}</p></div></div>` : ''}

    <div id="video360-container">
        <button id="btn-close-video360" style="position:absolute; top:20px; left:20px; z-index:8501; padding:12px 25px; font-size:16px; font-weight:bold; background:rgba(0,0,0,0.8); color:#fff; border:2px solid #fff; border-radius:30px; cursor:pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5); backdrop-filter: blur(5px); display: flex; align-items: center; gap: 8px;"><span style="font-size: 20px;">⬅</span> Kembali ke Panorama</button>
        <div id="video360-viewer"></div>
    </div>

    ${videoOverlayHtml}

    <script type="module">
        import { Viewer } from '@photo-sphere-viewer/core';
        import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
        import { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';
        import { EquirectangularVideoAdapter } from '@photo-sphere-viewer/equirectangular-video-adapter';
        import { VideoPlugin } from '@photo-sphere-viewer/video-plugin';${extraJsImports}

        const scenesData = ${JSON.stringify(psvConfig)};
        let viewer = null; let markersPlugin = null; let videoViewer = null;

        const introOverlay = document.getElementById('intro-overlay'); 
        const introVideo = document.getElementById('intro-video'); 
        const startBtn = document.getElementById('start-btn'); 
        const skipBtn = document.getElementById('skip-btn');
        const hasVideo = ${!!(introVideo && (introVideo.desktop || introVideo.mobile))}; 
        
        const welcomeOverlay = document.getElementById('welcome-overlay'); 
        const showWelcomeText = () => { if (welcomeOverlay) welcomeOverlay.style.display = 'block'; };
        if (welcomeOverlay) { welcomeOverlay.addEventListener('click', () => { welcomeOverlay.style.opacity = '0'; setTimeout(() => { welcomeOverlay.style.display = 'none'; }, 500); }); }

        if (hasVideo && startBtn) { 
            startBtn.addEventListener('click', () => { 
                startBtn.style.display = 'none'; skipBtn.style.display = 'block'; 
                introVideo.muted = false; introVideo.volume = 1.0; 
                const playPromise = introVideo.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.error("Error Autoplay Intro:", e);
                        finishIntro(); 
                    });
                }
            }); 
            const finishIntro = () => { introOverlay.style.transition = "opacity 0.8s"; introOverlay.style.opacity = "0"; setTimeout(() => { introOverlay.style.display = 'none'; introVideo.pause(); showWelcomeText(); }, 800); }; 
            skipBtn.addEventListener('click', finishIntro); introVideo.addEventListener('ended', finishIntro); 
        } else { if (introOverlay) introOverlay.style.display = 'none'; showWelcomeText(); }

        function loadScene(sceneId) {
            const sceneData = scenesData.scenes[sceneId];
            sceneData.panorama.baseUrl = 'tiles/' + sceneId + '/fallback.webp'; sceneData.panorama.tileUrl = function(col, row) { return 'tiles/' + sceneId + '/' + col + '_' + row + '.webp'; };
            if (!viewer) { 
                let pluginsArray = [ [MarkersPlugin, { markers: sceneData.markers }] ];${extraPluginInit}
                
                viewer = new Viewer({ 
                    container: 'panorama', adapter: EquirectangularTilesAdapter, panorama: sceneData.panorama, 
                    defaultPitch: sceneData.pitch, defaultYaw: sceneData.yaw, defaultZoomLvl: sceneData.zoom, 
                    navbar: ${navbarConfigStr}, plugins: pluginsArray 
                });
                markersPlugin = viewer.getPlugin(MarkersPlugin); 
                markersPlugin.addEventListener('select-marker', ({ marker }) => { const data = marker.config.data; if (data.type === 'scene') { loadScene(data.targetScene); } else if (data.type === 'video360_custom') { playVideo360(data.videoPath); } else if (data.type === 'url' && data.url) { window.open(data.url, '_blank'); } }); 
            } else { 
                markersPlugin.clearMarkers(); viewer.setPanorama(sceneData.panorama, { pitch: sceneData.pitch, yaw: sceneData.yaw, zoom: sceneData.zoom, transition: 200 }).then(() => { markersPlugin.setMarkers(sceneData.markers); }); 
            }
        }

        function playVideo360(videoPath) { document.getElementById('panorama').style.display = 'none'; document.getElementById('video360-container').style.display = 'block'; if (videoViewer) { videoViewer.destroy(); } setTimeout(() => { videoViewer = new Viewer({ container: 'video360-viewer', adapter: [EquirectangularVideoAdapter, { autoplay: true }], panorama: { source: videoPath }, navbar: ['videoPlay', 'videoTime', 'videoVolume', 'zoom', 'fullscreen'], plugins: [ [VideoPlugin] ] }); }, 100); }
        document.getElementById('btn-close-video360').addEventListener('click', () => { if (videoViewer) { videoViewer.destroy(); videoViewer = null; } document.getElementById('video360-container').style.display = 'none'; document.getElementById('panorama').style.display = 'block'; });
        document.querySelectorAll('.custom-ui-el').forEach(el => { el.addEventListener('click', () => { const action = el.getAttribute('data-action'); const target = el.getAttribute('data-target'); if (action === 'scene' && target) { loadScene(target); } else if (action === 'video' && target) { const vidObj = (scenesData.mediaVideo360 || []).find(v => v.id === target); if (vidObj) playVideo360(vidObj.exportPath); } else if (action === 'url' && target) { window.open(target.startsWith('http') ? target : 'https://' + target, '_blank'); } }); });

        try { loadScene(scenesData.firstScene); } catch(err) { console.error("Gagal memuat panorama:", err); }
    </script>
</body>
</html>`;

        fs.writeFileSync(path.join(exportDir, 'index.html'), htmlContent);
        sendData({ type: 'success', message: 'Virtual Tour Berhasil Dibuat!', folderName: folderName, percent: 100 }); res.end();

    } catch (error) { console.error(error); sendData({ type: 'error', message: 'Error: ' + error.message }); res.end(); }
};

module.exports = { generateVirtualTour };