import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { EquirectangularVideoAdapter } from '@photo-sphere-viewer/equirectangular-video-adapter';
import { VideoPlugin } from '@photo-sphere-viewer/video-plugin'; 

const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, options) {
    if (type === 'webgl' || type === 'experimental-webgl') { options = options || {}; options.preserveDrawingBuffer = true; }
    return originalGetContext.call(this, type, options);
};

if (!document.getElementById('govirtual-hs-styles')) {
    const style = document.createElement('style'); style.id = 'govirtual-hs-styles';
    style.innerHTML = `
        .gov-hs-icon { width: 35px; height: 35px; border-radius: 50%; border: 2px solid white; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 10px rgba(0,0,0,0.5); font-weight: bold; color: white; transition: transform 0.2s; cursor: grab; z-index: 1000; position: relative; touch-action: none; }
        .gov-hs-icon:active { cursor: grabbing; transform: scale(0.95) !important; }
        .gov-hs-icon:hover { transform: scale(1.1); }
        .gov-hs-scene { background-color: rgba(40, 167, 69, 0.8); }
        .gov-hs-video { background-color: rgba(220, 53, 69, 0.8); animation: pulse-vid 2s infinite; }
        .gov-hs-url { background-color: rgba(0, 123, 255, 0.8); }
        .gov-hs-info { background-color: rgba(108, 117, 125, 0.8); }
        @keyframes pulse-vid { 0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(220, 53, 69, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); } }
    `;
    document.head.appendChild(style);
}

const themeToggleBtn = document.getElementById('themeToggleBtn'); const themeIcon = document.getElementById('themeIcon');
const savedTheme = localStorage.getItem('govirtual_theme') || 'dark';
if (savedTheme === 'light') { document.body.classList.add('light-mode'); if(themeIcon) themeIcon.innerText = '🌙'; }
themeToggleBtn?.addEventListener('click', () => { document.body.classList.toggle('light-mode'); const isLight = document.body.classList.contains('light-mode'); localStorage.setItem('govirtual_theme', isLight ? 'light' : 'dark'); if(themeIcon) themeIcon.innerText = isLight ? '🌙' : '☀️'; });

let scenes = []; let mediaVideo360 = []; let currentSceneId = null; let viewer = null; let markersPlugin = null; let videoViewer = null;
let activeTool = 'nav'; let pendingCoords = { yaw: 0, pitch: 0 }; let introVideo = { desktop: null, mobile: null };
let skinConfig = { template: 'default', customDesktop: null, customMobile: null, uiElements: [] }; 
let tourSettings = { autorotate: false, gallery: false, compass: false, resolution: false, map: false, navbar: true };
let currentProjectName = null; let firstSceneId = null; let selectedSceneIds = []; let lastClickedSceneId = null; let currentFileHandle = null;
let activeSkinElementId = null; let historyStack = []; let historyIndex = -1;
let activeHotspotIndex = null; let isDraggingHs = false; let dragHsIndex = null;
let autoSaveTimer = null; let isAutoSaving = false;

window.triggerAutoSave = function() {
    if (!currentFileHandle) return; 
    if (!document.title.includes('•')) document.title = `• GoVirtual - ${currentProjectName}`;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
        if (isAutoSaving) return; isAutoSaving = true;
        try {
            const stateData = getApplicationState(); const jsonString = JSON.stringify(stateData, null, 2);
            const writable = await currentFileHandle.createWritable(); await writable.write(jsonString); await writable.close();
            document.title = `GoVirtual - ${currentProjectName}`; 
        } catch (err) { console.error(err); } finally { isAutoSaving = false; }
    }, 1500); 
};

window.saveHistoryState = function() {
    if (historyIndex < historyStack.length - 1) historyStack = historyStack.slice(0, historyIndex + 1);
    const snap = { skin: JSON.parse(JSON.stringify(skinConfig)), scenes: JSON.parse(JSON.stringify(scenes)) };
    historyStack.push(JSON.stringify(snap));
    if (historyStack.length > 50) historyStack.shift(); else historyIndex++;
    window.triggerAutoSave();
};

window.undoHistory = function() {
    if (historyIndex > 0) {
        historyIndex--; const snap = JSON.parse(historyStack[historyIndex]);
        skinConfig = snap.skin; scenes = snap.scenes;
        activeSkinElementId = null; activeHotspotIndex = null; document.getElementById('hotspotDetailForm')?.classList.add('d-none');
        renderSkinElements(); updateSkinPropertiesPanel(); if(currentSceneId) loadSceneToViewer(currentSceneId);
        showToast("Undo", "normal");
    }
};

window.redoHistory = function() {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++; const snap = JSON.parse(historyStack[historyIndex]);
        skinConfig = snap.skin; scenes = snap.scenes;
        activeSkinElementId = null; activeHotspotIndex = null; document.getElementById('hotspotDetailForm')?.classList.add('d-none');
        renderSkinElements(); updateSkinPropertiesPanel(); if(currentSceneId) loadSceneToViewer(currentSceneId);
        showToast("Redo", "normal");
    }
};

const googleFontsList = [ "Arial, sans-serif", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Oswald", "Raleway", "Inter", "Playfair Display", "Ubuntu", "Nunito", "Merriweather", "Rubik", "Work Sans", "Fira Sans", "Barlow", "Mukta", "PT Sans", "Mulish", "Quicksand", "Inconsolata", "Titillium Web", "Josefin Sans", "Anton", "Dancing Script", "Bebas Neue", "Pacifico" ];
function populateFontSelect() { const select = document.getElementById('skinPropFontFamily'); if(!select) return; select.innerHTML = googleFontsList.map(font => { let val = font === "Arial, sans-serif" ? "Arial" : font; return `<option value="${val}" style="font-family: '${val}';">${val}</option>`; }).join(''); } populateFontSelect();
function loadGoogleFont(fontName) { if(!fontName || fontName === 'Arial') return; const fontId = 'font-' + fontName.replace(/\s+/g, '-').toLowerCase(); if (!document.getElementById(fontId)) { const link = document.createElement('link'); link.id = fontId; link.rel = 'stylesheet'; link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:wght@300;400;600;700&display=swap`; document.head.appendChild(link); } }
window.showToast = function(message, type = 'normal') { const container = document.getElementById('toastContainer'); if(!container) return; const toast = document.createElement('div'); toast.className = 'toast'; if (type === 'error') toast.style.borderLeftColor = 'var(--danger)'; if (type === 'success') toast.style.borderLeftColor = 'var(--success)'; toast.innerText = message; container.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000); };

let currentSkinPreviewMode = 'desktop'; let currentZoomLevel = 'fit'; const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const previewBtns = { 'desktop': document.getElementById('btnPreviewDesktop'), 'tablet': document.getElementById('btnPreviewTablet'), 'fold': document.getElementById('btnPreviewFold'), 'mobile': document.getElementById('btnPreviewMobile') };

function switchPreviewMode(mode) { currentSkinPreviewMode = mode; currentZoomLevel = 'fit'; Object.keys(previewBtns).forEach(k => { if(previewBtns[k]) previewBtns[k].style.background = (k === mode) ? 'var(--primary)' : '#444'; }); const wrapper = document.getElementById('deviceMockupWrapper'); if(wrapper) wrapper.className = `device-wrapper device-${mode}`; activeSkinElementId = null; resizeSkinCanvas(); renderSkinElements(); updateSkinPropertiesPanel(); }
Object.keys(previewBtns).forEach(k => { previewBtns[k]?.addEventListener('click', () => switchPreviewMode(k)); });
document.getElementById('btnZoomIn')?.addEventListener('click', () => { const canvas = document.getElementById('skinEditorCanvas'); let currentScale = canvas?.getAttribute('data-scale') ? parseFloat(canvas.getAttribute('data-scale')) : 1; if (currentZoomLevel === 'fit') currentZoomLevel = currentScale; let nextZoom = ZOOM_STEPS.find(z => z > currentZoomLevel + 0.05) || ZOOM_STEPS[ZOOM_STEPS.length - 1]; currentZoomLevel = nextZoom; resizeSkinCanvas(); });
document.getElementById('btnZoomOut')?.addEventListener('click', () => { const canvas = document.getElementById('skinEditorCanvas'); let currentScale = canvas?.getAttribute('data-scale') ? parseFloat(canvas.getAttribute('data-scale')) : 1; if (currentZoomLevel === 'fit') currentZoomLevel = currentScale; let nextZoom = [...ZOOM_STEPS].reverse().find(z => z < currentZoomLevel - 0.05) || ZOOM_STEPS[0]; currentZoomLevel = nextZoom; resizeSkinCanvas(); });
document.getElementById('zoomLevelDisplay')?.addEventListener('click', () => { currentZoomLevel = 'fit'; resizeSkinCanvas(); });

function resizeSkinCanvas() { const container = document.getElementById('skinCanvasContainer'); const wrapper = document.getElementById('deviceMockupWrapper'); const canvas = document.getElementById('skinEditorCanvas'); const spacer = document.getElementById('mockupSpacer'); if (!container || !wrapper || !canvas || container.clientWidth === 0) return; let baseW = 1280, baseH = 720; if(currentSkinPreviewMode === 'tablet') { baseW = 800; baseH = 1180; } else if(currentSkinPreviewMode === 'fold') { baseW = 600; baseH = 800; } else if(currentSkinPreviewMode === 'mobile') { baseW = 375; baseH = 812; } canvas.style.width = baseW + 'px'; canvas.style.height = baseH + 'px'; wrapper.style.transform = 'none'; const wrapperRect = wrapper.getBoundingClientRect(); let scale = 1; if (currentZoomLevel === 'fit') { scale = Math.min((container.clientWidth - 80) / wrapperRect.width, (container.clientHeight - 80) / wrapperRect.height); const displayEl = document.getElementById('zoomLevelDisplay'); if(displayEl) displayEl.innerText = 'Fit'; } else { scale = currentZoomLevel; const displayEl = document.getElementById('zoomLevelDisplay'); if(displayEl) displayEl.innerText = Math.round(scale * 100) + '%'; } wrapper.style.transform = `scale(${scale})`; canvas.setAttribute('data-scale', scale); if (spacer) { spacer.style.minWidth = (wrapperRect.width * scale + 80) + 'px'; spacer.style.minHeight = (wrapperRect.height * scale + 80) + 'px'; } }
window.addEventListener('resize', () => { if (document.getElementById('workspace-skin')?.style.display === 'flex') { resizeSkinCanvas(); } });

function initSkinCanvas() { const canvas = document.getElementById('skinEditorCanvas'); if(!canvas) return; const startScene = scenes.find(s => s.id === firstSceneId) || (scenes.length > 0 ? scenes[0] : null); let bgUrl = ''; if (startScene) { if (startScene.defaultViewThumb) { bgUrl = startScene.defaultViewThumb; } else if (startScene.previewPath || startScene.imagePath) { bgUrl = startScene.previewPath || startScene.imagePath; } } if (bgUrl) { canvas.style.backgroundImage = `url('${bgUrl}')`; const msg = document.getElementById('skinCanvasOverlayMsg'); if(msg) msg.style.display = 'none'; } else { canvas.style.backgroundImage = 'none'; const msg = document.getElementById('skinCanvasOverlayMsg'); if(msg) msg.style.display = 'block'; } resizeSkinCanvas(); renderSkinElements(); }

window.selectSkinElement = function(id) { activeSkinElementId = id; document.querySelectorAll('.skin-el').forEach(el => { if (el.id === id) el.classList.add('selected'); else el.classList.remove('selected'); }); updateSkinPropertiesPanel(); renderSkinLayers(); };
window.deleteSkinElement = function(id) { if (confirm("Hapus elemen ini?")) { skinConfig.uiElements = skinConfig.uiElements.filter(e => e.id !== id); if (activeSkinElementId === id) activeSkinElementId = null; renderSkinElements(); updateSkinPropertiesPanel(); window.saveHistoryState(); window.showToast("Elemen dihapus!", "success"); } };

document.getElementById('skinCanvasContainer')?.addEventListener('mousedown', (e) => { if (['skinCanvasContainer', 'mockupSpacer', 'deviceMockupWrapper', 'skinEditorCanvas', 'skinCanvasOverlayMsg'].includes(e.target.id)) { window.selectSkinElement(null); } });

function renderSkinLayers() { const container = document.getElementById('skinLayersContainer'); if(!container) return; let deviceElements = skinConfig.uiElements.filter(e => (e.targetDevice || 'desktop') === currentSkinPreviewMode); if(deviceElements.length === 0) { container.innerHTML = `<div class="props-empty-msg">Belum ada elemen di perangkat ini.</div>`; return; } let html = ''; for(let i = deviceElements.length - 1; i >= 0; i--) { let el = deviceElements[i]; let isSelected = el.id === activeSkinElementId ? 'selected' : ''; let icon = el.type === 'text' ? 'T' : (el.type === 'image' ? '🖼️' : (el.type === 'circle' ? '⭕' : (el.type === 'line' ? '➖' : '🔲'))); let name = el.type === 'text' ? (el.content ? el.content.substring(0,12) + '...' : 'Text') : (el.type.charAt(0).toUpperCase() + el.type.slice(1)); html += `<div class="layer-item ${isSelected}" onclick="window.selectSkinElement('${el.id}')"><div class="layer-left-content"><span class="layer-icon">${icon}</span><span class="layer-name">${name}</span></div><button class="btn-layer-action" onclick="event.stopPropagation(); window.deleteSkinElement('${el.id}')" title="Hapus Elemen">🗑️</button></div>`; } container.innerHTML = html; }
document.getElementById('btnLayerUp')?.addEventListener('click', () => { if(!activeSkinElementId) return window.showToast("Pilih elemen dulu", "error"); let idx = skinConfig.uiElements.findIndex(e => e.id === activeSkinElementId); let nextIdx = -1; for(let i = idx + 1; i < skinConfig.uiElements.length; i++) { if(skinConfig.uiElements[i].targetDevice === currentSkinPreviewMode) { nextIdx = i; break; } } if(nextIdx !== -1) { let temp = skinConfig.uiElements[idx]; skinConfig.uiElements[idx] = skinConfig.uiElements[nextIdx]; skinConfig.uiElements[nextIdx] = temp; renderSkinElements(); window.saveHistoryState(); } });
document.getElementById('btnLayerDown')?.addEventListener('click', () => { if(!activeSkinElementId) return window.showToast("Pilih elemen dulu", "error"); let idx = skinConfig.uiElements.findIndex(e => e.id === activeSkinElementId); let prevIdx = -1; for(let i = idx - 1; i >= 0; i--) { if(skinConfig.uiElements[i].targetDevice === currentSkinPreviewMode) { prevIdx = i; break; } } if(prevIdx !== -1) { let temp = skinConfig.uiElements[idx]; skinConfig.uiElements[idx] = skinConfig.uiElements[prevIdx]; skinConfig.uiElements[prevIdx] = temp; renderSkinElements(); window.saveHistoryState(); } });

function renderSkinElements() {
    const canvas = document.getElementById('skinEditorCanvas'); if(!canvas) return; Array.from(canvas.querySelectorAll('.skin-el')).forEach(el => el.remove());
    let deviceElements = skinConfig.uiElements.filter(e => (e.targetDevice || 'desktop') === currentSkinPreviewMode);
    deviceElements.forEach((elData, idx) => {
        const div = document.createElement('div'); div.id = elData.id; div.className = `skin-el ${elData.type === 'text' ? 'skin-el-text' : 'skin-el-img'}`;
        if(elData.id === activeSkinElementId) div.classList.add('selected');
        div.style.zIndex = 10 + idx; div.style.left = `${elData.left}%`; div.style.top = `${elData.top}%`; div.style.width = `${elData.width}%`; div.style.height = `${elData.height}%`;
        div.style.opacity = elData.opacity !== undefined ? elData.opacity : 1; div.style.borderRadius = elData.type === 'circle' ? '50%' : `${elData.borderRadius || 0}px`;
        div.style.border = `${elData.borderWidth || 0}px solid ${elData.borderColor || '#ffffff'}`; div.style.backgroundColor = elData.bgTransparent ? 'transparent' : (elData.bgColor || 'transparent');
        if (elData.shadowBlur > 0 || elData.shadowX !== 0 || elData.shadowY !== 0) { div.style.boxShadow = `${elData.shadowX || 0}px ${elData.shadowY || 0}px ${elData.shadowBlur || 0}px ${elData.shadowColor || '#000000'}`; } else { div.style.boxShadow = 'none'; }
        if (elData.type === 'text') {
            div.innerText = elData.content || 'Teks Baru'; div.style.color = elData.color || '#ffffff'; div.style.fontSize = `${elData.fontSize || 16}px`; div.style.fontWeight = elData.fontWeight || 400; 
            if (elData.fontFamily) { div.style.fontFamily = `'${elData.fontFamily}', sans-serif`; loadGoogleFont(elData.fontFamily); }
            div.style.textAlign = elData.textAlign || 'center'; div.style.justifyContent = elData.textAlign === 'left' ? 'flex-start' : (elData.textAlign === 'right' ? 'flex-end' : 'center'); div.style.alignItems = elData.verticalAlign || 'center'; div.style.whiteSpace = elData.wordWrap ? 'normal' : 'nowrap'; if(!elData.wordWrap) div.style.textOverflow = 'ellipsis';
            div.addEventListener('dblclick', (e) => { e.stopPropagation(); div.contentEditable = "true"; div.style.cursor = "text"; div.focus(); document.execCommand('selectAll', false, null); });
            div.addEventListener('blur', (e) => { div.contentEditable = "false"; div.style.cursor = "move"; saveElementStateToConfig(elData.id, 'content', div.innerText); if (activeSkinElementId === elData.id) { const txtInput = document.getElementById('skinPropText'); if (txtInput) txtInput.value = div.innerText; } window.saveHistoryState(); });
        } else if (elData.type === 'image') { if (elData.content) div.style.backgroundImage = `url('${elData.content}')`; else if(!elData.bgColor && !elData.borderWidth) div.style.backgroundColor = 'rgba(255,255,255,0.2)'; }
        div.addEventListener('mousedown', (e) => { if (div.isContentEditable) { e.stopPropagation(); return; } window.selectSkinElement(elData.id); });
        canvas.appendChild(div);
    });
    renderSkinLayers(); 
}

window.createNewSkinElement = function(type) {
    const newId = 'ui_' + Date.now(); let defWidth = 15; let defHeight = 15; let defBgColor = 'transparent'; let defBgTrans = true; let defContent = '';
    if(type === 'text') { defWidth = 25; defHeight = 10; defContent = 'Teks Baru'; } else if (type === 'rect') { defWidth = 20; defHeight = 20; defBgColor = '#007acc'; defBgTrans = false; } else if (type === 'circle') { defWidth = 15; defHeight = 15; defBgColor = '#e74c3c'; defBgTrans = false; } else if (type === 'line') { defWidth = 30; defHeight = 0.5; defBgColor = '#ffffff'; defBgTrans = false; }
    const newEl = { id: newId, type: type, targetDevice: currentSkinPreviewMode, left: 40, top: 40, width: defWidth, height: defHeight, content: defContent, color: '#ffffff', fontSize: 16, fontFamily: 'Roboto', fontWeight: 400, textAlign: 'center', verticalAlign: 'center', wordWrap: true, shadowX: 0, shadowY: 0, shadowBlur: 0, shadowColor: '#000000', opacity: 1, borderRadius: type === 'circle' ? 50 : 0, bgColor: defBgColor, bgTransparent: defBgTrans, borderWidth: 0, borderColor: '#ffffff', action: 'none', target: '' };
    if (!skinConfig.uiElements) skinConfig.uiElements = []; skinConfig.uiElements.push(newEl); window.selectSkinElement(newId); renderSkinElements(); window.saveHistoryState();
};

document.getElementById('btnSkinAddText')?.addEventListener('click', () => window.createNewSkinElement('text')); document.getElementById('btnSkinAddImage')?.addEventListener('click', () => window.createNewSkinElement('image')); document.getElementById('btnSkinAddRect')?.addEventListener('click', () => window.createNewSkinElement('rect')); document.getElementById('btnSkinAddCircle')?.addEventListener('click', () => window.createNewSkinElement('circle')); document.getElementById('btnSkinAddLine')?.addEventListener('click', () => window.createNewSkinElement('line'));

let copiedSkinElement = null;
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) window.redoHistory(); else window.undoHistory(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); window.redoHistory(); }
    if (document.getElementById('workspace-skin')?.style.display !== 'flex') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { if(activeSkinElementId) { copiedSkinElement = JSON.parse(JSON.stringify(skinConfig.uiElements.find(el => el.id === activeSkinElementId))); window.showToast("Elemen UI Disalin (Copy)", "success"); } }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { if(copiedSkinElement) { let newEl = JSON.parse(JSON.stringify(copiedSkinElement)); newEl.id = 'ui_' + Date.now(); newEl.left += 2; newEl.top += 2; newEl.targetDevice = currentSkinPreviewMode; skinConfig.uiElements.push(newEl); renderSkinElements(); window.selectSkinElement(newEl.id); window.saveHistoryState(); window.showToast(`Elemen UI ditempel ke ${currentSkinPreviewMode}!`, "success"); } }
    if (e.key === 'Delete' || e.key === 'Backspace') { if(activeSkinElementId) { window.deleteSkinElement(activeSkinElementId); } }
});

if (typeof interact !== 'undefined') {
    interact('.skin-el').draggable({ ignoreFrom: '[contenteditable="true"]', modifiers: [ interact.modifiers.restrictRect({ restriction: 'parent' }) ], listeners: { move(event) {
        const target = event.target; const parent = target.parentElement; const scale = parseFloat(parent.getAttribute('data-scale')) || 1;
        const dx = event.dx / scale; const dy = event.dy / scale; const leftPx = (parseFloat(target.style.left) || 0) / 100 * parent.clientWidth; const topPx = (parseFloat(target.style.top) || 0) / 100 * parent.clientHeight; const newLeftPct = ((leftPx + dx) / parent.clientWidth) * 100; const newTopPct = ((topPx + dy) / parent.clientHeight) * 100;
        target.style.left = `${newLeftPct}%`; target.style.top = `${newTopPct}%`; saveElementStateToConfig(target.id, 'left', newLeftPct); saveElementStateToConfig(target.id, 'top', newTopPct);
    }, end(event) { window.saveHistoryState(); } } }).resizable({ ignoreFrom: '[contenteditable="true"]', edges: { left: true, right: true, bottom: true, top: true }, modifiers: [ interact.modifiers.restrictEdges({ outer: 'parent' }), interact.modifiers.restrictSize({ min: { width: 1, height: 0.1 } }) ], listeners: { move(event) {
        const target = event.target; const parent = target.parentElement; const scale = parseFloat(parent.getAttribute('data-scale')) || 1;
        let dw = event.deltaRect.width / scale; let dh = event.deltaRect.height / scale; let dLeft = event.deltaRect.left / scale; let dTop = event.deltaRect.top / scale;
        let currentWidthPx = (parseFloat(target.style.width) || 0) / 100 * parent.clientWidth; let currentHeightPx = (parseFloat(target.style.height) || 0) / 100 * parent.clientHeight;
        if (event.shiftKey && currentHeightPx > 0) { const ratio = currentWidthPx / currentHeightPx; if (Math.abs(dw) > Math.abs(dh)) { dh = dw / ratio; if (event.edges.top) dTop = event.deltaRect.top / scale - (dh - event.deltaRect.height / scale); } else { dw = dh * ratio; if (event.edges.left) dLeft = event.deltaRect.left / scale - (dw - event.deltaRect.width / scale); } }
        const currentLeftPx = (parseFloat(target.style.left) || 0) / 100 * parent.clientWidth; const currentTopPx = (parseFloat(target.style.top) || 0) / 100 * parent.clientHeight;
        const widthPct = ((currentWidthPx + dw) / parent.clientWidth) * 100; const heightPct = ((currentHeightPx + dh) / parent.clientHeight) * 100; const newLeftPct = ((currentLeftPx + dLeft) / parent.clientWidth) * 100; const newTopPct = ((currentTopPx + dTop) / parent.clientHeight) * 100;
        target.style.width = `${widthPct}%`; target.style.height = `${heightPct}%`; target.style.left = `${newLeftPct}%`; target.style.top = `${newTopPct}%`;
        saveElementStateToConfig(target.id, 'width', widthPct); saveElementStateToConfig(target.id, 'height', heightPct); saveElementStateToConfig(target.id, 'left', newLeftPct); saveElementStateToConfig(target.id, 'top', newTopPct);
        if(activeSkinElementId === target.id) { const wInput = document.getElementById('skinPropWidth'); if(wInput) wInput.value = widthPct.toFixed(2); const hInput = document.getElementById('skinPropHeight'); if(hInput) hInput.value = heightPct.toFixed(2); }
    }, end(event) { window.saveHistoryState(); } } });
}

function saveElementStateToConfig(id, key, value) { if (!skinConfig.uiElements) return; const el = skinConfig.uiElements.find(e => e.id === id); if (el) el[key] = value; }

function updateSkinPropertiesPanel() {
    const el = skinConfig.uiElements?.find(e => e.id === activeSkinElementId);
    if (!el) { const emptyEl = document.getElementById('skinElementPropsEmpty'); if(emptyEl) emptyEl.style.display = 'block'; const formEl = document.getElementById('skinElementPropsForm'); if(formEl) formEl.style.display = 'none'; return; }
    const emptyEl = document.getElementById('skinElementPropsEmpty'); if(emptyEl) emptyEl.style.display = 'none'; const formEl = document.getElementById('skinElementPropsForm'); if(formEl) formEl.style.display = 'block';
    
    const wInput = document.getElementById('skinPropWidth'); if(wInput) wInput.value = el.width ? el.width.toFixed(2) : 20; 
    const hInput = document.getElementById('skinPropHeight'); if(hInput) hInput.value = el.height ? el.height.toFixed(2) : 20;
    const opInput = document.getElementById('skinPropOpacity'); if(opInput) opInput.value = el.opacity !== undefined ? el.opacity : 1;
    const brInput = document.getElementById('skinPropBorderRadius'); if(brInput) brInput.value = el.borderRadius || 0;
    const bgColInput = document.getElementById('skinPropBgColor'); if(bgColInput) bgColInput.value = el.bgColor || '#000000';
    const bgTransInput = document.getElementById('skinPropBgTransparent'); if(bgTransInput) bgTransInput.checked = el.bgTransparent || false;
    const bwInput = document.getElementById('skinPropBorderWidth'); if(bwInput) bwInput.value = el.borderWidth || 0;
    const bcInput = document.getElementById('skinPropBorderColor'); if(bcInput) bcInput.value = el.borderColor || '#ffffff';

    const groupText = document.getElementById('propGroupText'); const groupImage = document.getElementById('propGroupImage'); const groupApp = document.getElementById('propGroupAppearance');

    if (el.type === 'text') {
        if(groupText) groupText.style.display = 'block'; if(groupImage) groupImage.style.display = 'none'; if(groupApp) groupApp.style.display = 'block';
        const txtInput = document.getElementById('skinPropText'); if(txtInput) txtInput.value = el.content || ''; const colInput = document.getElementById('skinPropColor'); if(colInput) colInput.value = el.color || '#ffffff'; const sizeInput = document.getElementById('skinPropFontSize'); if(sizeInput) sizeInput.value = el.fontSize || 16; const famSelect = document.getElementById('skinPropFontFamily'); if(famSelect) famSelect.value = el.fontFamily || 'Arial'; const weightSelect = document.getElementById('skinPropFontWeight'); if(weightSelect) weightSelect.value = el.fontWeight || 400; const alignSelect = document.getElementById('skinPropTextAlign'); if(alignSelect) alignSelect.value = el.textAlign || 'center'; const vAlignSelect = document.getElementById('skinPropVerticalAlign'); if(vAlignSelect) vAlignSelect.value = el.verticalAlign || 'center'; const wrapCheck = document.getElementById('skinPropWordWrap'); if(wrapCheck) wrapCheck.checked = el.wordWrap !== false;
    } else if (el.type === 'image') {
        if(groupText) groupText.style.display = 'none'; if(groupImage) groupImage.style.display = 'block'; if(groupApp) groupApp.style.display = 'block';
        const imgPrev = document.getElementById('skinPropImagePreview'); if(imgPrev) { imgPrev.src = el.content || ''; imgPrev.style.display = el.content ? 'block' : 'none'; }
    } else {
        if(groupText) groupText.style.display = 'none'; if(groupImage) groupImage.style.display = 'none'; if(groupApp) groupApp.style.display = 'block';
    }
    const shX = document.getElementById('skinPropShadowX'); if(shX) shX.value = el.shadowX || 0; const shY = document.getElementById('skinPropShadowY'); if(shY) shY.value = el.shadowY || 0; const shBlur = document.getElementById('skinPropShadowBlur'); if(shBlur) shBlur.value = el.shadowBlur || 0; const shCol = document.getElementById('skinPropShadowColor'); if(shCol) shCol.value = el.shadowColor || '#000000'; const actSelect = document.getElementById('skinPropAction'); if(actSelect) actSelect.value = el.action || 'none'; buildActionTargetOptions(el.action, el.target);
}

function buildActionTargetOptions(actionType, currentTarget) { const container = document.getElementById('skinActionTargetContainer'); const groupWrapper = document.getElementById('groupSkinActionTarget'); if(!container || !groupWrapper) return; if (actionType === 'none') { groupWrapper.style.display = 'none'; return; } groupWrapper.style.display = 'block'; if (actionType === 'url') { container.innerHTML = `<input type="text" id="skinPropTargetInput" class="form-control" placeholder="https://..." value="${currentTarget || ''}">`; } else if (actionType === 'scene') { let options = scenes.map(s => `<option value="${s.id}" ${currentTarget === s.id ? 'selected' : ''}>${s.title}</option>`).join(''); container.innerHTML = `<select id="skinPropTargetInput" class="form-control">${options}</select>`; } else if (actionType === 'video') { if(mediaVideo360.length === 0) { container.innerHTML = `<small style="color:#ff6b6b;">Upload video 360 dulu.</small>`; } else { let options = mediaVideo360.map(v => `<option value="${v.id}" ${currentTarget === v.id ? 'selected' : ''}>${v.title}</option>`).join(''); container.innerHTML = `<select id="skinPropTargetInput" class="form-control">${options}</select>`; } } const targetInput = document.getElementById('skinPropTargetInput'); if (targetInput) { targetInput.addEventListener('change', (e) => { saveElementStateToConfig(activeSkinElementId, 'target', e.target.value); }); } }

['skinPropWidth', 'skinPropHeight', 'skinPropOpacity', 'skinPropBorderRadius', 'skinPropBorderWidth'].forEach(id => document.getElementById(id)?.addEventListener('input', (e) => { saveElementStateToConfig(activeSkinElementId, id.replace('skinProp', '').charAt(0).toLowerCase() + id.replace('skinProp', '').slice(1), parseFloat(e.target.value)); renderSkinElements(); }));
document.getElementById('skinPropText')?.addEventListener('input', (e) => { saveElementStateToConfig(activeSkinElementId, 'content', e.target.value); renderSkinElements(); });
['skinPropColor', 'skinPropBgColor', 'skinPropBorderColor'].forEach(id => document.getElementById(id)?.addEventListener('input', (e) => { saveElementStateToConfig(activeSkinElementId, id.replace('skinProp', '').charAt(0).toLowerCase() + id.replace('skinProp', '').slice(1), e.target.value); renderSkinElements(); }));
['skinPropFontSize', 'skinPropShadowX', 'skinPropShadowY', 'skinPropShadowBlur'].forEach(id => document.getElementById(id)?.addEventListener('input', (e) => { saveElementStateToConfig(activeSkinElementId, id.replace('skinProp', '').charAt(0).toLowerCase() + id.replace('skinProp', '').slice(1), parseInt(e.target.value)); renderSkinElements(); }));
['skinPropFontFamily', 'skinPropFontWeight', 'skinPropTextAlign', 'skinPropVerticalAlign'].forEach(id => document.getElementById(id)?.addEventListener('change', (e) => { saveElementStateToConfig(activeSkinElementId, id.replace('skinProp', '').charAt(0).toLowerCase() + id.replace('skinProp', '').slice(1), e.target.value); renderSkinElements(); }));
['skinPropWordWrap', 'skinPropBgTransparent'].forEach(id => document.getElementById(id)?.addEventListener('change', (e) => { saveElementStateToConfig(activeSkinElementId, id.replace('skinProp', '').charAt(0).toLowerCase() + id.replace('skinProp', '').slice(1), e.target.checked); renderSkinElements(); }));
document.getElementById('skinPropShadowColor')?.addEventListener('input', (e) => { saveElementStateToConfig(activeSkinElementId, 'shadowColor', e.target.value); renderSkinElements(); });
document.getElementById('skinPropAction')?.addEventListener('change', (e) => { saveElementStateToConfig(activeSkinElementId, 'action', e.target.value); saveElementStateToConfig(activeSkinElementId, 'target', ''); buildActionTargetOptions(e.target.value, ''); });
document.getElementById('btnSkinDeleteElement')?.addEventListener('click', () => { if(confirm("Hapus elemen ini?")) { skinConfig.uiElements = skinConfig.uiElements.filter(e => e.id !== activeSkinElementId); activeSkinElementId = null; renderSkinElements(); updateSkinPropertiesPanel(); window.saveHistoryState(); window.showToast("Elemen dihapus!", "success"); } });
document.getElementById('skinPropImageUpload')?.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('image', file); try { const res = await fetch('/api/upload', { method: 'POST', body: formData }); const data = await res.json(); if (data.success) { saveElementStateToConfig(activeSkinElementId, 'content', data.file.path); renderSkinElements(); updateSkinPropertiesPanel(); window.saveHistoryState(); } } catch(err) { window.showToast('Gagal upload gambar skin', 'error'); } });
['skinPropWidth', 'skinPropHeight', 'skinPropOpacity', 'skinPropBorderRadius', 'skinPropBorderWidth', 'skinPropText', 'skinPropColor', 'skinPropBgColor', 'skinPropBorderColor', 'skinPropFontSize', 'skinPropShadowX', 'skinPropShadowY', 'skinPropShadowBlur'].forEach(id => { document.getElementById(id)?.addEventListener('change', () => { window.saveHistoryState(); }); });


// =========================================================================
// SISTEM PANORAMA & DRAG/DROP HOTSPOT 3D (MONOLITHIC)
// =========================================================================
window.loadSceneToViewer = function(sceneId) { 
    const scene = scenes.find(s => s.id === sceneId); if (!scene) return; 
    const emptyState = document.getElementById('emptyState'); if(emptyState) emptyState.style.display = 'none'; 
    const toolbar = document.getElementById('toolbar'); if(toolbar) toolbar.style.display = 'flex'; 
    
    const psvMarkers = (scene.hotSpots || []).map((hs, idx) => { 
        let tooltipText = hs.text; let markerHtml = ''; let customTemplateHtml = ''; 
        const hsSize = hs.size || 40; 
        const isSelectedClass = (activeHotspotIndex === idx) ? ' gov-hs-selected' : '';
        const activeStyle = (activeHotspotIndex === idx) ? 'box-shadow: 0 0 0 4px var(--warning) !important; border-color: var(--warning) !important;' : '';

        if (hs.iconStyle === 'template2') { 
            customTemplateHtml = `<div class="gov-hs-icon${isSelectedClass}" data-index="${idx}" style="width: ${hsSize}px; height: ${hsSize}px; background: radial-gradient(circle, rgba(255,0,0,1) 30%, rgba(255,255,255,0.8) 70%); border-radius: 50%; border: 2px solid red; ${activeStyle}"></div>`; 
        } else if (hs.iconStyle === 'template3') { 
            customTemplateHtml = `<div class="gov-hs-icon${isSelectedClass}" data-index="${idx}" style="width: ${hsSize}px; height: ${hsSize*1.3}px; background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 384 512%22 fill=%22%23007bff%22><path d=%22M172.3 501.7C27 291 0 269.4 0 192 0 86 86 0 192 0s192 86 192 192c0 77.4-27 99-172.3 309.7-9.5 13.8-29.9 13.8-39.5 0zM192 272c44.2 0 80-35.8 80-80s-35.8-80-80-80-80 35.8-80 80 35.8 80 80 80z%22/></svg>'); background-size: cover; background-position: center; background-repeat: no-repeat; border:none; border-radius:0; box-shadow:none; filter: ${activeHotspotIndex === idx ? 'drop-shadow(0 0 5px yellow)' : 'none'};"></div>`; 
        } else if (hs.iconStyle === 'custom' && hs.customIconPath) { 
            customTemplateHtml = `<div class="gov-hs-icon${isSelectedClass}" data-index="${idx}" style="width: ${hsSize}px; height: ${hsSize}px; background-image: url('${hs.customIconPath}'); background-size: contain; background-repeat: no-repeat; background-position: center; border:none; border-radius:0; box-shadow:none; filter: ${activeHotspotIndex === idx ? 'drop-shadow(0 0 5px yellow)' : 'none'};"></div>`; 
        } 

        if (hs.type === 'scene') { 
            markerHtml = customTemplateHtml || `<div class="gov-hs-icon gov-hs-scene${isSelectedClass}" data-index="${idx}" style="width: ${hsSize}px; height: ${hsSize}px; ${activeStyle}"><div style="font-size: ${hsSize/1.8}px; transform: translateY(-2px); text-shadow: 0 2px 4px #000;">⇧</div></div>`; 
            tooltipText = `${hs.text} <br><small>Menuju: ${scenes.find(s => s.id === hs.targetScene)?.title || '?'}</small>`; 
        } else if (hs.type === 'video') { 
            markerHtml = customTemplateHtml || `<div class="gov-hs-icon gov-hs-video${isSelectedClass}" data-index="${idx}" style="width: ${hsSize}px; height: ${hsSize}px; ${activeStyle}"><div style="font-size: ${hsSize/2.2}px; margin-left: 4px;">▶</div></div>`; 
            tooltipText = `${hs.text} <br><small>Video: ${mediaVideo360.find(v => v.id === hs.targetVideo)?.title || '?'}</small>`; 
        } else if (hs.type === 'url') { 
            markerHtml = customTemplateHtml || `<div class="gov-hs-icon gov-hs-url${isSelectedClass}" data-index="${idx}" style="width: ${hsSize}px; height: ${hsSize}px; ${activeStyle}"><div style="font-size: ${hsSize/2.2}px;">🌐</div></div>`; 
        } else { 
            markerHtml = customTemplateHtml || `<div class="gov-hs-icon gov-hs-info${isSelectedClass}" data-index="${idx}" style="width: ${hsSize}px; height: ${hsSize}px; ${activeStyle}"><div style="font-size: ${hsSize/2.2}px; font-family: serif; font-style: italic;">i</div></div>`; 
        } 
        
        return { id: `hs_${idx}`, position: { pitch: hs.pitch, yaw: hs.yaw }, html: markerHtml, anchor: 'center center', size: { width: hsSize, height: hsSize }, tooltip: { content: tooltipText, position: 'top center' }, data: { type: hs.type, index: idx } }; 
    }); 

    if (viewer && currentSceneId === sceneId) { 
        if (markersPlugin) markersPlugin.setMarkers(psvMarkers); 
        window.renderHotspotListUI(); 
        return; 
    } 
    if (viewer) { viewer.destroy(); viewer = null; markersPlugin = null; } 
    
    currentSceneId = sceneId; 
    viewer = new Viewer({ 
        container: document.querySelector('#panorama'), panorama: scene.previewPath || scene.imagePath, 
        defaultPitch: scene.pitch || 0, defaultYaw: scene.yaw || 0, defaultZoomLvl: scene.zoomLvl || 50, 
        navbar: false, rendererParameters: { preserveDrawingBuffer: true }, 
        plugins: [ [MarkersPlugin, { markers: psvMarkers }] ] 
    }); 
    markersPlugin = viewer.getPlugin(MarkersPlugin); 
    
    viewer.addEventListener('click', ({ data }) => { 
        if (activeTool === 'nav') return; 
        if (!data || typeof data.pitch !== 'number') return; 
        pendingCoords.pitch = data.pitch; pendingCoords.yaw = data.yaw; window.openHotspotModal(); 
    }); 
    
    window.renderSceneList(); window.renderHotspotListUI(); window.renderPropertiesUI(); 
};

// Logika SMART DRAG untuk Hotspot 3D
document.addEventListener('mousedown', (e) => {
    const markerEl = e.target.closest('.gov-hs-icon');
    if (markerEl && document.getElementById('panorama').contains(markerEl)) {
        const idx = parseInt(markerEl.getAttribute('data-index'));
        if (activeHotspotIndex !== idx) {
            window.selectHotspot(idx);
        } else {
            isDraggingHs = true; dragHsIndex = idx; e.stopPropagation();
        }
    } else if (e.target.closest('#panorama') && !e.target.closest('.gov-hs-icon')) {
        activeHotspotIndex = null;
        document.querySelectorAll('.gov-hs-icon').forEach(el => el.classList.remove('gov-hs-selected'));
        document.getElementById('hotspotDetailForm')?.classList.add('d-none');
        window.renderHotspotListUI();
    }
}, true);

document.addEventListener('mousemove', (e) => {
    if (isDraggingHs && dragHsIndex !== null && viewer) {
        e.stopPropagation();
        const viewerContainer = document.querySelector('#panorama');
        const viewerRect = viewerContainer.getBoundingClientRect();
        const x = e.clientX - viewerRect.left; const y = e.clientY - viewerRect.top;
        if (x >= 0 && x <= viewerRect.width && y >= 0 && y <= viewerRect.height) {
            const pos = viewer.dataHelper.viewerCoordsToSphericalCoords({ x, y });
            if (pos) {
                const scene = scenes.find(s => s.id === currentSceneId);
                if (scene && scene.hotSpots[dragHsIndex]) {
                    scene.hotSpots[dragHsIndex].pitch = pos.pitch; scene.hotSpots[dragHsIndex].yaw = pos.yaw;
                    markersPlugin.updateMarker({ id: `hs_${dragHsIndex}`, position: { pitch: pos.pitch, yaw: pos.yaw } });
                }
            }
        }
    }
}, true);

document.addEventListener('mouseup', (e) => {
    if (isDraggingHs) { isDraggingHs = false; dragHsIndex = null; window.saveHistoryState(); e.stopPropagation(); }
}, true);

document.addEventListener('dblclick', (e) => {
    const markerEl = e.target.closest('.gov-hs-icon');
    if (markerEl && document.getElementById('panorama').contains(markerEl)) {
        const idx = parseInt(markerEl.getAttribute('data-index'));
        const scene = scenes.find(s => s.id === currentSceneId);
        if(scene && scene.hotSpots[idx]) {
            const hs = scene.hotSpots[idx];
            if (hs.type === 'scene' && hs.targetScene) window.loadSceneToViewer(hs.targetScene);
            else if (hs.type === 'video' && hs.targetVideo) { const vidObj = mediaVideo360.find(v => v.id === hs.targetVideo); if(vidObj) window.playVideo360(vidObj.path); } 
            else if (hs.type === 'url' && hs.url) window.open(hs.url.startsWith('http') ? hs.url : 'https://'+hs.url, '_blank');
        }
    }
});

window.selectHotspot = function(index) {
    activeHotspotIndex = index; const scene = scenes.find(s => s.id === currentSceneId); if (!scene || !scene.hotSpots[index]) return;
    const hs = scene.hotSpots[index];
    document.getElementById('hotspotDetailForm')?.classList.remove('d-none');
    document.getElementById('editHsLabel').value = hs.text || ''; document.getElementById('editHsSizeSlider').value = hs.size || 40; document.getElementById('editHsSizeNumber').value = hs.size || 40;
    window.renderHotspotListUI(); 
    document.querySelectorAll('.gov-hs-icon').forEach(el => {
        if(parseInt(el.getAttribute('data-index')) === index) el.classList.add('gov-hs-selected');
        else el.classList.remove('gov-hs-selected');
    });
};

document.getElementById('editHsSizeSlider')?.addEventListener('input', (e) => { 
    const val = parseInt(e.target.value); document.getElementById('editHsSizeNumber').value = val; 
    if (activeHotspotIndex !== null) {
        const scene = scenes.find(s => s.id === currentSceneId);
        if(scene && scene.hotSpots[activeHotspotIndex]) {
            scene.hotSpots[activeHotspotIndex].size = val;
            const markerEl = document.querySelector(`.gov-hs-icon[data-index="${activeHotspotIndex}"]`);
            if(markerEl) { markerEl.style.width = `${val}px`; markerEl.style.height = `${val}px`; const innerDiv = markerEl.querySelector('div'); if(innerDiv) innerDiv.style.fontSize = `${val/2}px`; }
        }
    }
});
document.getElementById('editHsSizeSlider')?.addEventListener('change', () => window.saveHistoryState());
document.getElementById('editHsSizeNumber')?.addEventListener('change', (e) => { const val = parseInt(e.target.value); document.getElementById('editHsSizeSlider').value = val; if(activeHotspotIndex !== null) { scenes.find(s=>s.id===currentSceneId).hotSpots[activeHotspotIndex].size = val; window.loadSceneToViewer(currentSceneId); window.saveHistoryState(); } });
document.getElementById('editHsLabel')?.addEventListener('input', (e) => { if(activeHotspotIndex !== null) { const scene = scenes.find(s => s.id === currentSceneId); if(scene && scene.hotSpots[activeHotspotIndex]) { scene.hotSpots[activeHotspotIndex].text = e.target.value; markersPlugin.updateMarker({ id: `hs_${activeHotspotIndex}`, tooltip: { content: e.target.value, position: 'top center' } }); } } });
document.getElementById('editHsLabel')?.addEventListener('change', () => window.saveHistoryState());
document.getElementById('btnDeleteSelectedHs')?.addEventListener('click', () => { if(activeHotspotIndex !== null) window.deleteHotspot(activeHotspotIndex); });

window.renderHotspotListUI = function() { 
    const container = document.getElementById('hotspotList'); if(!container) return; 
    const scene = scenes.find(s => s.id === currentSceneId); 
    if (!scene || !scene.hotSpots || scene.hotSpots.length === 0) { container.innerHTML = `<p style=\"color: var(--text-muted); font-size: 12px; text-align: center; margin-top: 20px;\">Belum ada hotspot.</p>`; return; } 
    container.innerHTML = scene.hotSpots.map((hs, index) => { 
        let dotClass = hs.type === 'scene' ? 'type-scene-dot' : (hs.type === 'video' ? 'type-video-dot' : 'type-info-dot'); 
        let targetText = hs.type === 'scene' ? `Target: ${scenes.find(s => s.id === hs.targetScene)?.title || '?'}` : (hs.type === 'video' ? `Target: ${mediaVideo360.find(v => v.id === hs.targetVideo)?.title || '?'}` : hs.text); 
        let isSelected = activeHotspotIndex === index;
        return `<div class=\"hotspot-item\" style=\"cursor: pointer; ${isSelected ? 'border: 1px solid var(--accent); background: rgba(0, 122, 204, 0.15);' : ''}\" onclick=\"window.selectHotspot(${index})\"><div class=\"hotspot-header\"><div class=\"hotspot-title\"><span class=\"${dotClass}\"></span> ${hs.text}</div><button class=\"btn-del-hs\" onclick=\"event.stopPropagation(); window.deleteHotspot(${index})\">X</button></div><div class=\"hs-detail\">Type: ${hs.type}</div><div class=\"hs-detail\">${targetText}</div></div>`; 
    }).join(''); 
};

window.deleteHotspot = function(index) { const scene = scenes.find(s => s.id === currentSceneId); if (scene) { scene.hotSpots.splice(index, 1); if(activeHotspotIndex === index) { activeHotspotIndex = null; document.getElementById('hotspotDetailForm')?.classList.add('d-none'); } window.loadSceneToViewer(currentSceneId); window.saveHistoryState(); } };

window.playVideo360 = function(videoPath) { let container = document.getElementById('video360-container'); if (!container) { container = document.createElement('div'); container.id = 'video360-container'; container.style.cssText = 'display:none; position:absolute; top:0; left:0; width:100%; height:100%; z-index:8500; background:#000;'; container.innerHTML = `<button id="btn-close-video360" style="position:absolute; top:20px; left:20px; z-index:8501; padding:12px 25px; font-size:16px; font-weight:bold; background:rgba(0,0,0,0.8); color:#fff; border:2px solid #fff; border-radius:30px; cursor:pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5); backdrop-filter: blur(5px); display: flex; align-items: center; gap: 8px;"><span style="font-size: 20px;">⬅</span> Kembali ke Panorama</button><div id="video360-viewer" style="width: 100%; height: 100%;"></div>`; document.querySelector('.main-view').appendChild(container); document.getElementById('btn-close-video360').addEventListener('click', () => { if (videoViewer) { videoViewer.destroy(); videoViewer = null; } document.getElementById('video360-container').style.display = 'none'; document.getElementById('panorama').style.display = 'block'; }); } document.getElementById('panorama').style.display = 'none'; container.style.display = 'block'; if (videoViewer) { videoViewer.destroy(); } setTimeout(() => { videoViewer = new Viewer({ container: 'video360-viewer', adapter: [EquirectangularVideoAdapter, { autoplay: true }], panorama: { source: videoPath }, navbar: ['videoPlay', 'videoTime', 'videoVolume', 'zoom', 'fullscreen'], plugins: [ [VideoPlugin] ] }); }, 100); };
window.deleteSingleScene = function(id) { selectedSceneIds = [id]; window.executeBulkDelete(); };
window.executeBulkDelete = function() { if (selectedSceneIds.length === 0) return; if (confirm(`Hapus ${selectedSceneIds.length} panorama?`)) { const isActiveDeleted = selectedSceneIds.includes(currentSceneId); scenes = scenes.filter(s => !selectedSceneIds.includes(s.id)); if (selectedSceneIds.includes(firstSceneId)) firstSceneId = scenes.length > 0 ? scenes[0].id : null; selectedSceneIds = []; lastClickedSceneId = null; if (scenes.length > 0) { if (isActiveDeleted) window.loadSceneToViewer(scenes[0].id); else { window.renderSceneList(); window.renderHotspotListUI(); } } else { currentSceneId = null; if (viewer) { viewer.destroy(); viewer = null; } const emptyState = document.getElementById('emptyState'); if(emptyState) emptyState.style.display = 'flex'; const toolbar = document.getElementById('toolbar'); if(toolbar) toolbar.style.display = 'none'; window.renderSceneList(); window.renderHotspotListUI(); } window.saveHistoryState(); window.showToast("Dihapus!", "success"); } };
window.deleteVideo360 = function(id) { if(confirm("Hapus video 360 ini?")) { mediaVideo360 = mediaVideo360.filter(v => v.id !== id); window.renderVideo360List(); window.saveHistoryState(); } };
window.selectSceneCard = function(sceneId) { document.querySelectorAll('#sceneSelectorGrid .scene-card').forEach(c => c.classList.remove('selected')); const card = document.getElementById(`card-${sceneId}`); if(card) card.classList.add('selected'); const inputId = document.getElementById('selectedTargetSceneId'); if(inputId) inputId.value = sceneId; };
window.selectVideoCard = function(vidId) { document.querySelectorAll('#videoSelectorGrid .scene-card').forEach(c => c.classList.remove('selected')); const card = document.getElementById(`card-vid-${vidId}`); if(card) card.classList.add('selected'); const inputId = document.getElementById('selectedTargetVideoId'); if(inputId) inputId.value = vidId; };
window.renderSceneSelectorGrid = function(filterText = '') { const grid = document.getElementById('sceneSelectorGrid'); if(!grid) return; const otherScenes = scenes.filter(s => s.id !== currentSceneId && s.title.toLowerCase().includes(filterText.toLowerCase())); grid.innerHTML = otherScenes.length === 0 ? `<p style="grid-column: 1/-1; font-size: 12px;">Tidak ditemukan.</p>` : otherScenes.map(s => `<div class="scene-card" id="card-${s.id}" onclick="window.selectSceneCard('${s.id}')"><div class="scene-card-thumb" style="background-image: url('${s.previewPath || s.imagePath}')"><div class="selected-badge">✓</div></div><div class="scene-card-title">${s.title}</div></div>`).join(''); const currentSelected = document.getElementById('selectedTargetSceneId')?.value; if (currentSelected) { const card = document.getElementById(`card-${currentSelected}`); if (card) card.classList.add('selected'); } };

window.renderSceneList = function() { const container = document.getElementById('sceneList'); if (!container) return; container.innerHTML = scenes.map(scene => { const isActive = scene.id === currentSceneId; const isSelected = selectedSceneIds.includes(scene.id); const isFirst = scene.id === firstSceneId; return `<div class="scene-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}" data-id="${scene.id}"><div class="scene-thumb" style="background-image: url('${scene.previewPath || scene.imagePath}')"><div class="scene-checkbox ${isSelected ? 'checked' : ''}"><svg width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\"><polyline points=\"20 6 9 17 4 12\"></polyline></svg></div>${isFirst ? `<div class=\"first-scene-badge\">⭐ START</div>` : ''}</div><div class=\"scene-title\">${scene.title}</div><button class=\"scene-delete\" onclick=\"event.stopPropagation(); window.deleteSingleScene('${scene.id}')\" title=\"Hapus Panorama\">❌</button></div>`; }).join(''); container.querySelectorAll('.scene-item').forEach(item => { item.addEventListener('click', (e) => window.handleSceneSelection(item.getAttribute('data-id'), e)); }); };
window.handleSceneSelection = function(sceneId, e) { if (e.target.closest('.scene-checkbox')) { e.stopPropagation(); selectedSceneIds.includes(sceneId) ? selectedSceneIds = selectedSceneIds.filter(id => id !== sceneId) : selectedSceneIds.push(sceneId); lastClickedSceneId = sceneId; window.renderSceneList(); return; } if (e.ctrlKey || e.metaKey) { selectedSceneIds.includes(sceneId) ? selectedSceneIds = selectedSceneIds.filter(id => id !== sceneId) : selectedSceneIds.push(sceneId); lastClickedSceneId = sceneId; } else if (e.shiftKey && lastClickedSceneId) { const start = Math.min(scenes.findIndex(s => s.id === lastClickedSceneId), scenes.findIndex(s => s.id === sceneId)); const end = Math.max(scenes.findIndex(s => s.id === lastClickedSceneId), scenes.findIndex(s => s.id === sceneId)); scenes.slice(start, end + 1).forEach(s => { if (!selectedSceneIds.includes(s.id)) selectedSceneIds.push(s.id); }); lastClickedSceneId = sceneId; } else { selectedSceneIds = [sceneId]; lastClickedSceneId = sceneId; window.loadSceneToViewer(sceneId); return; } window.renderSceneList(); };

const tools = ['nav', 'scene', 'info', 'url', 'video']; tools.forEach(tool => { document.getElementById(`tool-${tool}`)?.addEventListener('click', (e) => { tools.forEach(t => document.getElementById(`tool-${t}`)?.classList.remove('active')); e.currentTarget.classList.add('active'); activeTool = tool; tool === 'nav' ? document.body.classList.remove('mode-add-hotspot') : document.body.classList.add('mode-add-hotspot'); }); });

// Mencegah blokir window file explorer
document.getElementById('addSceneBtn')?.addEventListener('click', () => { 
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png'; input.multiple = true; input.style.display = 'none'; 
    document.body.appendChild(input); 
    input.onchange = async (e) => { if (e.target.files.length > 0) await window.processPanoramaFiles(e.target.files); document.body.removeChild(input); }; 
    input.click(); 
});

window.processPanoramaFiles = async function(files) { if (files.length === 0) return window.showToast(`Pilih setidaknya 1 gambar.`, "error"); window.showToast(`Memulai upload...`, "normal"); for (let i = 0; i < files.length; i++) { const formData = new FormData(); formData.append('image', files[i]); try { const res = await fetch('/api/upload', { method: 'POST', body: formData }); const data = await res.json(); if (data.success) { const newId = 'scene_' + Date.now() + '_' + i; scenes.push({ id: newId, title: files[i].name.replace(/\.[^/.]+$/, ""), imagePath: data.file.path, previewPath: data.file.previewPath, fileSize: data.file.size, fileDimensions: data.file.dimensions, fileType: data.file.type, author: "", hotSpots: [] }); if (!firstSceneId) firstSceneId = newId; if (!currentSceneId) { selectedSceneIds = [newId]; window.loadSceneToViewer(newId); } else window.renderSceneList(); window.saveHistoryState(); } } catch(err) { window.showToast(`Error: ${err.message}`, "error"); } } };
document.getElementById('btnUploadVideo360')?.addEventListener('click', () => document.getElementById('inputVideo360')?.click());
document.getElementById('inputVideo360')?.addEventListener('change', async (e) => { const files = e.target.files; if (!files || files.length === 0) return; window.showToast(`Mengupload video 360...`, "normal"); for (let i = 0; i < files.length; i++) { const formData = new FormData(); formData.append('image', files[i]); try { const res = await fetch('/api/upload', { method: 'POST', body: formData }); const data = await res.json(); if (data.success) { mediaVideo360.push({ id: 'vid360_' + Date.now() + '_' + i, title: files[i].name, path: data.file.path }); window.saveHistoryState(); } } catch(err) {} } window.renderVideo360List(); e.target.value = ''; window.showToast("Upload Video 360 selesai!", "success"); });
window.renderVideo360List = function() { const container = document.getElementById('video360List'); if (!container) return; if (mediaVideo360.length === 0) { container.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; grid-column: 1/-1;">Belum ada video 360.</div>`; return; } container.innerHTML = mediaVideo360.map(vid => `<div class="scene-item" style="flex-direction: column; align-items: flex-start; padding: 10px; background: #222; border-radius: 6px; border: 1px solid var(--border);"><div style="width: 100%; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 30px;">🎥</div><div style="font-size: 11px; color: white; margin-bottom: 10px; word-break: break-all;">${vid.title}</div><button class="btn btn-danger" style="width: 100%; padding: 5px; font-size: 11px;" onclick="window.deleteVideo360('${vid.id}')">Hapus</button></div>`).join(''); };

window.openHotspotModal = function() { 
    const lInput = document.getElementById('hsLabel'); if(lInput) lInput.value = ''; const uInput = document.getElementById('hsUrl'); if(uInput) uInput.value = ''; const sInput = document.getElementById('selectedTargetSceneId'); if(sInput) sInput.value = ''; const vInput = document.getElementById('selectedTargetVideoId'); if(vInput) vInput.value = '';
    const hStyle = document.getElementById('hotspotStyle'); if (hStyle) { hStyle.value = 'default'; const upGroup = document.getElementById('customHotspotUploadGroup'); if(upGroup) upGroup.style.display = 'none'; const upFile = document.getElementById('customHotspotFile'); if(upFile) upFile.value = ''; const savedPath = document.getElementById('customHotspotSavedPath'); if(savedPath) savedPath.value = ''; const upStatus = document.getElementById('statusCustomHotspot'); if(upStatus) upStatus.style.display = 'none'; const prevImg = document.getElementById('customHotspotPreview'); if(prevImg) { prevImg.style.display = 'none'; prevImg.src = ''; } } 
    const searchInput = document.getElementById('searchTargetScene'); if(searchInput) searchInput.value = ''; window.renderSceneSelectorGrid(); 
    const vGrid = document.getElementById('videoSelectorGrid'); if(vGrid) vGrid.innerHTML = mediaVideo360.length === 0 ? `<p style=\"grid-column: 1/-1; font-size: 12px;\">Belum ada Video 360 diupload.</p>` : mediaVideo360.map(v => `<div class=\"scene-card\" id=\"card-vid-${v.id}\" onclick=\"window.selectVideoCard('${v.id}')\"><div class=\"scene-card-thumb\" style=\"background: #333; display: flex; align-items: center; justify-content: center; font-size: 24px;\">🎥<div class=\"selected-badge\">✓</div></div><div class=\"scene-card-title\" style=\"font-size: 10px;\">${v.title}</div></div>`).join(''); 
    const titles = { 'scene': '🔗 Tambah Hotspot Panorama', 'info': '💬 Tambah Elemen Web / Teks', 'url': '🌐 Tambah Hotspot Link URL', 'video': '🎥 Tambah Hotspot Video 360' }; 
    const modalTitle = document.getElementById('hsModalTitle'); if(modalTitle) modalTitle.innerText = titles[activeTool];
    const groupScene = document.getElementById('groupTargetScene'); if(groupScene) groupScene.style.display = activeTool === 'scene' ? 'block' : 'none'; 
    const groupVideo = document.getElementById('groupTargetVideo'); if(groupVideo) groupVideo.style.display = activeTool === 'video' ? 'block' : 'none'; 
    const groupUrl = document.getElementById('groupUrl'); if(groupUrl) groupUrl.style.display = activeTool === 'url' ? 'block' : 'none'; 
    const modalEl = document.getElementById('hotspotModal'); if(modalEl) modalEl.classList.add('active'); 
};
document.getElementById('hotspotStyle')?.addEventListener('change', (e) => { const group = document.getElementById('customHotspotUploadGroup'); if(group) group.style.display = e.target.value === 'custom' ? 'block' : 'none'; });
document.getElementById('customHotspotFile')?.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('image', file); try { window.showToast("Mengupload ikon...", "normal"); const res = await fetch('/api/upload', { method: 'POST', body: formData }); const data = await res.json(); if (data.success) { document.getElementById('customHotspotSavedPath').value = data.file.path; document.getElementById('statusCustomHotspot').style.display = 'block'; document.getElementById('customHotspotPreview').src = data.file.path; document.getElementById('customHotspotPreview').style.display = 'block'; window.showToast("Ikon custom berhasil diupload!", "success"); } else window.showToast("Gagal upload ikon", "error"); } catch(err) { window.showToast("Error upload ikon", "error"); } });
document.getElementById('btnCancelModal')?.addEventListener('click', () => document.getElementById('hotspotModal')?.classList.remove('active'));
document.getElementById('btnSaveModal')?.addEventListener('click', () => { const label = document.getElementById('hsLabel')?.value.trim() || 'Titik Hotspot'; const type = activeTool; let targetScene = null, url = null, targetVideo = null; if (type === 'scene') { targetScene = document.getElementById('selectedTargetSceneId')?.value; if (!targetScene) return window.showToast('Pilih tujuan!', 'error'); } else if (type === 'video') { targetVideo = document.getElementById('selectedTargetVideoId')?.value; if (!targetVideo) return window.showToast('Pilih Video 360!', 'error'); } else if (type === 'url') { url = document.getElementById('hsUrl')?.value.trim(); if (!url) return window.showToast('Isi URL!', 'error'); if (!url.startsWith('http')) url = 'https://' + url; } const iconStyle = document.getElementById('hotspotStyle') ? document.getElementById('hotspotStyle').value : 'default'; const customIconPath = document.getElementById('customHotspotSavedPath') ? document.getElementById('customHotspotSavedPath').value : ''; if (iconStyle === 'custom' && !customIconPath) return window.showToast('Upload ikon custom terlebih dahulu!', 'error'); scenes.find(s => s.id === currentSceneId).hotSpots.push({ pitch: pendingCoords.pitch, yaw: pendingCoords.yaw, type, text: label, targetScene, targetVideo, url, iconStyle, customIconPath, size: 40 }); document.getElementById('hotspotModal')?.classList.remove('active'); window.showToast("Hotspot tersimpan!", "success"); window.loadSceneToViewer(currentSceneId); document.getElementById('tool-nav')?.click(); window.saveHistoryState(); });

['Autorotate', 'Gallery', 'Compass', 'Resolution', 'Map', 'Navbar'].forEach(key => { const cb = document.getElementById('setting' + key); if (cb) cb.addEventListener('change', (e) => { tourSettings[key.toLowerCase()] = e.target.checked; window.saveHistoryState(); }); });

const menuHotspot = document.getElementById('menu-hotspot'); const menuIntro = document.getElementById('menu-intro'); const menuSkin = document.getElementById('menu-skin'); const menuVideo360 = document.getElementById('menu-video360'); const menuSettings = document.getElementById('menu-settings');
const workHotspot = document.getElementById('workspace-hotspot'); const workIntro = document.getElementById('workspace-intro'); const workSkin = document.getElementById('workspace-skin'); const workVideo360 = document.getElementById('workspace-video360'); const workSettings = document.getElementById('workspace-settings');

window.switchWorkspace = function(activeMenu, activeWork) { [menuHotspot, menuIntro, menuSkin, menuVideo360, menuSettings].forEach(m => m?.classList.remove('active')); [workHotspot, workIntro, workSkin, workVideo360, workSettings].forEach(w => { if(w) w.style.display = 'none'; }); if(activeMenu) activeMenu.classList.add('active'); if(activeWork === workSkin) { activeWork.style.display = 'flex'; initSkinCanvas(); } else if(activeWork) { activeWork.style.display = 'flex'; } };
menuHotspot?.addEventListener('click', (e) => { e.preventDefault(); window.switchWorkspace(menuHotspot, workHotspot); }); menuIntro?.addEventListener('click', (e) => { e.preventDefault(); window.switchWorkspace(menuIntro, workIntro); }); menuSkin?.addEventListener('click', (e) => { e.preventDefault(); window.switchWorkspace(menuSkin, workSkin); }); menuVideo360?.addEventListener('click', (e) => { e.preventDefault(); window.switchWorkspace(menuVideo360, workVideo360); }); menuSettings?.addEventListener('click', (e) => { e.preventDefault(); window.switchWorkspace(menuSettings, workSettings); });

document.querySelectorAll('.panel-tabs .tab-btn').forEach(btn => { 
    btn.addEventListener('click', () => { 
        const parentTabs = btn.closest('.panel-tabs'); if (!parentTabs) return; parentTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
        const container = btn.closest('.panel-right') || btn.closest('.props-panel-wrapper') || btn.closest('.workspace');
        if(container) {
             let paneId = btn.getAttribute('data-tab'); if (!paneId.startsWith('tab-')) paneId = 'tab-' + paneId; 
             const pane = container.querySelector('#' + paneId) || document.getElementById(paneId);
             if(pane) {
                 const siblings = pane.parentElement.children;
                 for (let i = 0; i < siblings.length; i++) { if(siblings[i].classList.contains('tab-pane')) { siblings[i].classList.remove('active'); siblings[i].style.display = 'none'; } }
                 pane.classList.add('active'); pane.style.display = (paneId === 'tab-skin-layers' || paneId === 'tab-skin-custom' || paneId === 'tab-hotspots') ? 'flex' : 'block';
                 if (paneId === 'tab-skin-custom') setTimeout(() => { resizeSkinCanvas(); }, 50);
             }
        }
    }); 
});

document.getElementById('uploadVideoDesktop')?.addEventListener('change', () => handleGenericUpload('uploadVideoDesktop', 'statusVideoDesktop', 'desktop', introVideo)); document.getElementById('uploadVideoMobile')?.addEventListener('change', () => handleGenericUpload('uploadVideoMobile', 'statusVideoMobile', 'mobile', introVideo)); async function handleGenericUpload(inputId, statusId, objectKey, targetObject) { const file = document.getElementById(inputId).files[0]; if (!file) return; const formData = new FormData(); formData.append('image', file); const res = await fetch('/api/upload', { method: 'POST', body: formData }); const data = await res.json(); if (data.success) { targetObject[objectKey] = data.file.path; const statusEl = document.getElementById(statusId); if(statusEl) statusEl.style.display = 'block'; window.saveHistoryState(); } }

// Export System (Aman dan Langsung Akses Variabel Global)
document.getElementById('generateBtn')?.addEventListener('click', () => { if (scenes.length === 0) return window.showToast('Belum ada scene.', 'error'); const nameInput = document.getElementById('exportFolderName'); if(nameInput) nameInput.value = currentProjectName ? currentProjectName.replace('.govp', '') : 'Proyek_Baru'; const qLabel = document.getElementById('qualityLabel'); if(qLabel) qLabel.innerText = '75%'; const slider = document.getElementById('exportQualitySlider'); if(slider) slider.value = 75; document.getElementById('exportModal')?.classList.add('active'); }); document.getElementById('exportQualitySlider')?.addEventListener('input', (e) => { const qLabel = document.getElementById('qualityLabel'); if(qLabel) qLabel.innerText = e.target.value + '%'; });

document.getElementById('btnStartExport')?.addEventListener('click', async () => {
    document.getElementById('exportModal')?.classList.remove('active');
    const folderName = document.getElementById('exportFolderName')?.value.trim() || 'Proyek_Baru'; const exportQuality = parseInt(document.getElementById('exportQualitySlider')?.value) || 75;
    const progModal = document.getElementById('progressModal'); const progBar = document.getElementById('progressBar'); const progText = document.getElementById('progressText'); const logBox = document.getElementById('progressLog');
    if(progModal) progModal.classList.add('active'); if(progBar) progBar.style.width = '0%'; if(progText) progText.innerText = 'Menyiapkan server...'; if(logBox) logBox.innerHTML = '[System] Memulai komputasi ekspor...<br>'; 
    try { 
        const welcomeText = document.getElementById('welcomeTextInput') ? document.getElementById('welcomeTextInput').value.trim() : ''; 
        // MEMASTIKAN skinConfig IKUT TERBAWA!
        const payload = { scenes, folderName, introVideo, welcomeText, skinConfig, firstSceneId, mediaVideo360, exportQuality, tourSettings }; 
        const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const reader = res.body.getReader(); const decoder = new TextDecoder('utf-8'); let buffer = ''; while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop(); for (const line of lines) { if (!line.trim()) continue; const data = JSON.parse(line); if (data.type === 'progress') { if(progBar) progBar.style.width = data.percent + '%'; if(progText) progText.innerText = `${data.message} (${data.percent}%)`; if (data.detail && logBox) { logBox.innerHTML += `> ${data.detail}<br>`; logBox.scrollTop = logBox.scrollHeight; } } else if (data.type === 'success') { if(progBar) progBar.style.width = '100%'; if(progText) progText.innerText = 'Export Selesai!'; if (logBox) logBox.innerHTML += `<span style="color: #00ff00;">> [System] 🎉 Selesai!</span><br>`; setTimeout(() => { if(progModal) progModal.classList.remove('active'); alert(`Selesai!\\nFolder: ${data.folderName}`); }, 1000); } else if (data.type === 'error') { throw new Error(data.message); } } } 
    } catch(err) { if(progModal) progModal.classList.remove('active'); alert('Terjadi kesalahan: ' + err.message); } 
});

document.getElementById('btn-set-default-view')?.addEventListener('click', () => { if (!viewer || !currentSceneId) return; const position = viewer.getPosition(); const zoom = viewer.getZoomLevel(); const sceneIndex = scenes.findIndex(s => s.id === currentSceneId); if (sceneIndex !== -1) { scenes[sceneIndex].pitch = position.pitch; scenes[sceneIndex].yaw = position.yaw; scenes[sceneIndex].zoomLvl = zoom; const canvas = document.querySelector('#panorama canvas'); if (canvas) { const thumbData = canvas.toDataURL('image/jpeg', 0.8); scenes[sceneIndex].defaultViewThumb = thumbData; const statusEl = document.getElementById('default-view-status'); if(statusEl) statusEl.style.display = 'none'; const imgEl = document.getElementById('default-view-img'); if(imgEl) { imgEl.src = thumbData; imgEl.style.display = 'block'; } window.saveHistoryState(); window.showToast("Default View & Thumbnail disimpan!", "success"); } } }); 
window.renderPropertiesUI = function() { const scene = scenes.find(s => s.id === currentSceneId); const emptyProp = document.getElementById('propertiesEmpty'); if(emptyProp) emptyProp.style.display = scene ? 'none' : 'block'; const formProp = document.getElementById('propertiesForm'); if(formProp) formProp.style.display = scene ? 'block' : 'none'; if (!scene) return; const titleInp = document.getElementById('propSceneTitle'); if(titleInp) titleInp.value = scene.title || ''; const authorInp = document.getElementById('propAuthor'); if(authorInp) authorInp.value = scene.author || ''; const firstCheck = document.getElementById('propIsFirstScene'); if(firstCheck) firstCheck.checked = (currentSceneId === firstSceneId); if (scene.defaultViewThumb) { const statusEl = document.getElementById('default-view-status'); if(statusEl) statusEl.style.display = 'none'; const imgEl = document.getElementById('default-view-img'); if(imgEl) { imgEl.src = scene.defaultViewThumb; imgEl.style.display = 'block'; } } else { const statusEl = document.getElementById('default-view-status'); if(statusEl) statusEl.style.display = 'block'; const imgEl = document.getElementById('default-view-img'); if(imgEl) imgEl.style.display = 'none'; } };
document.getElementById('propSceneTitle')?.addEventListener('input', (e) => { if (!currentSceneId) return; scenes.find(s => s.id === currentSceneId).title = e.target.value; const titleText = document.querySelector(`.scene-item[data-id=\"${currentSceneId}\"] .scene-title`); if(titleText) titleText.innerText = e.target.value || 'Untitled'; }); document.getElementById('propSceneTitle')?.addEventListener('change', () => window.saveHistoryState());
document.getElementById('propAuthor')?.addEventListener('input', (e) => { if (!currentSceneId) return; scenes.find(s => s.id === currentSceneId).author = e.target.value; }); document.getElementById('propAuthor')?.addEventListener('change', () => window.saveHistoryState());
document.getElementById('propIsFirstScene')?.addEventListener('change', (e) => { if (!currentSceneId) return; if (e.target.checked) firstSceneId = currentSceneId; else { if (scenes.length > 1) { alert("Harus ada 1 panorama awal."); e.target.checked = true; return; } else firstSceneId = null; } window.renderSceneList(); window.saveHistoryState(); });
const skinSelect = document.getElementById('skinTemplateSelect'); const customSkinGroup = document.getElementById('customSkinUploadGroup'); if (skinSelect) { skinSelect.addEventListener('change', (e) => { skinConfig.template = e.target.value; if(customSkinGroup) customSkinGroup.style.display = e.target.value === 'custom' ? 'block' : 'none'; window.saveHistoryState(); }); } document.getElementById('uploadSkinDesktop')?.addEventListener('change', () => handleGenericUpload('uploadSkinDesktop', 'statusSkinDesktop', 'customDesktop', skinConfig)); document.getElementById('uploadSkinMobile')?.addEventListener('change', () => handleGenericUpload('uploadSkinMobile', 'statusSkinMobile', 'customMobile', skinConfig));

window.getApplicationState = function() { return { version: "3.5", projectName: currentProjectName || "Untitled_Project", firstSceneId: firstSceneId, scenes: scenes, mediaVideo360: mediaVideo360, introVideo: introVideo, skinConfig: skinConfig, tourSettings: tourSettings, welcomeText: document.getElementById('welcomeTextInput') ? document.getElementById('welcomeTextInput').value : '' }; };

window.applyApplicationState = function(data) { 
    firstSceneId = data.firstSceneId || (data.scenes && data.scenes.length > 0 ? data.scenes[0].id : null); scenes = data.scenes || []; mediaVideo360 = data.mediaVideo360 || []; introVideo = data.introVideo || { desktop: null, mobile: null }; skinConfig = data.skinConfig || { template: 'default', customDesktop: null, customMobile: null, uiElements: [] }; if (!skinConfig.uiElements) skinConfig.uiElements = []; 
    tourSettings = data.tourSettings || { autorotate: false, gallery: false, compass: false, resolution: false, map: false, navbar: true };
    ['Autorotate', 'Gallery', 'Compass', 'Resolution', 'Map', 'Navbar'].forEach(key => { const cb = document.getElementById('setting' + key); if (cb) { if(key==='Navbar' && data.tourSettings?.navbar === undefined) cb.checked = true; else cb.checked = tourSettings[key.toLowerCase()] || false; } });
    if (document.getElementById('skinTemplateSelect')) { document.getElementById('skinTemplateSelect').value = skinConfig.template; if(customSkinGroup) customSkinGroup.style.display = skinConfig.template === 'custom' ? 'block' : 'none'; } 
    ['statusSkinDesktop', 'statusSkinMobile'].forEach(id => { const el = document.getElementById(id); if (el) { if (id === 'statusSkinDesktop') el.style.display = skinConfig.customDesktop ? 'block' : 'none'; if (id === 'statusSkinMobile') el.style.display = skinConfig.customMobile ? 'block' : 'none'; } }); 
    if (document.getElementById('welcomeTextInput')) document.getElementById('welcomeTextInput').value = data.welcomeText || ''; 
    ['statusVideoDesktop', 'statusVideoMobile'].forEach(id => { const el = document.getElementById(id); if (el) { if (id === 'statusVideoDesktop') el.style.display = introVideo.desktop ? 'block' : 'none'; if (id === 'statusVideoMobile') el.style.display = introVideo.mobile ? 'block' : 'none'; } }); 
    currentSceneId = null; selectedSceneIds = []; lastClickedSceneId = null; if (viewer) { viewer.destroy(); viewer = null; } 
    if (scenes.length > 0) { selectedSceneIds = [scenes[0].id]; window.loadSceneToViewer(scenes[0].id); } else { const emptyEl = document.getElementById('emptyState'); if(emptyEl) emptyEl.style.display = 'flex'; const toolEl = document.getElementById('toolbar'); if(toolEl) toolEl.style.display = 'none'; window.renderSceneList(); window.renderHotspotListUI(); } window.renderVideo360List(); 
    historyStack = []; historyIndex = -1; window.saveHistoryState();
};

window.quickSaveProject = async function() { if (scenes.length === 0) return window.showToast("Proyek kosong!", "error"); try { const stateData = window.getApplicationState(); const jsonString = JSON.stringify(stateData, null, 2); if (!currentFileHandle) { currentFileHandle = await window.showSaveFilePicker({ suggestedName: currentProjectName || 'Proyek_Baru.govp', types: [{ description: 'GoVirtual Project', accept: { 'application/json': ['.govp'] } }] }); } const writable = await currentFileHandle.createWritable(); await writable.write(jsonString); await writable.close(); currentProjectName = currentFileHandle.name; document.title = `GoVirtual - ${currentProjectName}`; window.showToast(`💾 Tersimpan!`, "success"); } catch (err) { if (err.name !== 'AbortError') alert("Gagal menyimpan: " + err.message); } }
window.addEventListener('keydown', function(e) { if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); document.getElementById('menu-new-project')?.click(); } if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); document.getElementById('menu-open-project')?.click(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); window.quickSaveProject(); } if (e.key === 'Delete') window.executeBulkDelete(); }, true); const menuSaveProjectBtn = document.getElementById('menu-save-project'); if (menuSaveProjectBtn) { const newSaveBtn = menuSaveProjectBtn.cloneNode(true); menuSaveProjectBtn.parentNode.replaceChild(newSaveBtn, menuSaveProjectBtn); newSaveBtn.addEventListener('click', (e) => { e.preventDefault(); window.quickSaveProject(); }); } const menuSaveAsProjectBtn = document.getElementById('menu-save-as-project'); if (menuSaveAsProjectBtn) { const newSaveAsBtn = menuSaveAsProjectBtn.cloneNode(true); menuSaveAsProjectBtn.parentNode.replaceChild(newSaveAsBtn, menuSaveAsProjectBtn); newSaveAsBtn.addEventListener('click', async (e) => { e.preventDefault(); try { currentFileHandle = await window.showSaveFilePicker({ suggestedName: currentProjectName || 'Proyek_Copy.govp', types: [{ description: 'GoVirtual Project', accept: { 'application/json': ['.govp'] } }] }); window.quickSaveProject(); } catch (err) { } }); } document.getElementById('menu-new-project')?.addEventListener('click', (e) => { e.preventDefault(); if (confirm("Buat Proyek Baru?")) { window.applyApplicationState({}); currentProjectName = null; currentFileHandle = null; document.title = "GoVirtual - Untitled Project"; window.showToast("Dikosongkan!", "success"); } }); document.getElementById('menu-open-project')?.addEventListener('click', async (e) => { e.preventDefault(); try { const [fileHandle] = await window.showOpenFilePicker({ types: [{ description: 'GoVirtual Project', accept: { 'application/json': ['.govp'] } }] }); const file = await fileHandle.getFile(); const text = await file.text(); const parsedData = JSON.parse(text); if (parsedData.version && parsedData.scenes) { currentFileHandle = fileHandle; currentProjectName = file.name; window.applyApplicationState(parsedData); document.title = `GoVirtual - ${currentProjectName}`; window.showToast(`Project dimuat!`, "success"); } } catch(err) { if (err.name !== 'AbortError') alert("Gagal membaca: " + err.message); } }); document.getElementById('menu-exit')?.addEventListener('click', (e) => { e.preventDefault(); if (confirm("Keluar dari Editor?")) { window.close(); } });

document.getElementById('menu-undo')?.addEventListener('click', (e) => { e.preventDefault(); window.undoHistory(); });
document.getElementById('menu-redo')?.addEventListener('click', (e) => { e.preventDefault(); window.redoHistory(); });