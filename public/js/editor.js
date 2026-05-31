// =====================================================================
// FIX: WEBGL PRESERVE DRAWING BUFFER
// =====================================================================
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, options) {
    if (type === 'webgl' || type === 'experimental-webgl') {
        options = options || {};
        options.preserveDrawingBuffer = true; 
    }
    return originalGetContext.call(this, type, options);
};

// --- INJEKSI CSS HOTSPOT (AGAR VISUAL TERLIHAT DI EDITOR) ---
if (!document.getElementById('govirtual-hs-styles')) {
    const style = document.createElement('style');
    style.id = 'govirtual-hs-styles';
    style.innerHTML = `
        .editor-hs-icon { width: 35px; height: 35px; border-radius: 50%; border: 2px solid white; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 10px rgba(0,0,0,0.5); font-weight: bold; color: white; }
        .editor-hs-video { background-color: rgba(220, 53, 69, 0.8); animation: pulse-vid 2s infinite; }
        .editor-hs-video::after { content: "▶"; font-size: 16px; margin-left: 3px; }
        .editor-hs-url { background-color: rgba(0, 123, 255, 0.8); }
        .editor-hs-url::after { content: "🌐"; font-size: 16px; }
        .editor-hs-info { background-color: rgba(108, 117, 125, 0.8); }
        .editor-hs-info::after { content: "i"; font-size: 16px; font-family: serif; font-style: italic; }
        @keyframes pulse-vid { 0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(220, 53, 69, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); } }
    `;
    document.head.appendChild(style);
}

// --- STATE MANAGEMENT ---
let scenes = [];
let mediaVideo360 = []; 
let currentSceneId = null;
let viewer = null;
let activeTool = 'nav'; 
let pendingCoords = { yaw: 0, pitch: 0 };
let isDraggingPanorama = false;
let startMouseX = 0, startMouseY = 0;
let introVideo = { desktop: null, mobile: null };
let skinConfig = { template: 'default', customDesktop: null, customMobile: null };
let currentProjectName = null; 
let firstSceneId = null; 
let selectedSceneIds = []; 
let lastClickedSceneId = null; 
let currentFileHandle = null;

// --- UTILITIES ---
function showToast(message, type = 'normal') {
    const container = document.getElementById('toastContainer');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (type === 'error') toast.style.borderLeftColor = 'var(--danger)';
    if (type === 'success') toast.style.borderLeftColor = 'var(--success)';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// --- ENGINE VIEWER (PANNELLUM) ---
function loadSceneToViewer(sceneId) {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    currentSceneId = sceneId;

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('toolbar').style.display = 'flex';

    if (viewer) { viewer.destroy(); viewer = null; }

    const nativeHotSpots = (scene.hotSpots || []).map(hs => {
        if (hs.type === 'scene') {
            const targetSceneData = scenes.find(s => s.id === hs.targetScene);
            if (!targetSceneData) return null; 
            const clickAction = () => loadSceneToViewer(hs.targetScene);
            const createCustomTooltipFunc = (hotSpotDiv) => {
                if(hotSpotDiv.querySelector('.pnlm-custom-tooltip-scene')) return; 
                const tooltipWrapper = document.createElement('div');
                tooltipWrapper.className = 'pnlm-tooltip pnlm-custom-tooltip-scene';
                const bubbleRect = document.createElement('div');
                bubbleRect.className = 'pnlm-bubble-rect';
                bubbleRect.onclick = clickAction; 
                const thumb = document.createElement('img');
                thumb.className = 'pnlm-hs-thumb';
                thumb.src = targetSceneData.previewPath || targetSceneData.imagePath; 
                bubbleRect.appendChild(thumb);
                const titleSpan = document.createElement('span');
                titleSpan.className = 'pnlm-hs-title';
                titleSpan.innerText = targetSceneData.title || "Tujuan Berikutnya";
                bubbleRect.appendChild(titleSpan);
                tooltipWrapper.appendChild(bubbleRect);
                hotSpotDiv.appendChild(tooltipWrapper); 
            };
            return { pitch: hs.pitch, yaw: hs.yaw, type: 'info', cssClass: 'pnlm-hotspot-base pnlm-custom-base-icon', createTooltipFunc: createCustomTooltipFunc, clickHandlerFunc: clickAction };
        }

        let cssIconClass = 'editor-hs-info';
        if (hs.type === 'url') cssIconClass = 'editor-hs-url';
        else if (hs.type === 'video') cssIconClass = 'editor-hs-video';

        return {
            pitch: hs.pitch, yaw: hs.yaw, text: hs.text, type: 'info', 
            cssClass: `pnlm-hotspot-base editor-hs-icon ${cssIconClass}`,
            clickHandlerFunc: function() { showToast(`Simulasi Klik: ${hs.text}`); }
        };
    }).filter(Boolean); 

    viewer = pannellum.viewer('panorama', {
        type: 'equirectangular', panorama: scene.previewPath || scene.imagePath, autoLoad: true,
        showZoomCtrl: false, showFullscreenCtrl: false, compass: false, mouseZoom: true,
        pitch: scene.pitch || 0, yaw: scene.yaw || 0, hfov: scene.hfov || 100, hotSpots: nativeHotSpots
    });

    viewer.on('load', () => {
        const canvas = document.querySelector('.pnlm-container');
        if(!canvas) return;
        canvas.addEventListener('mousedown', (e) => { isDraggingPanorama = false; startMouseX = e.clientX; startMouseY = e.clientY; });
        canvas.addEventListener('mousemove', (e) => { if (Math.abs(e.clientX - startMouseX) > 5 || Math.abs(e.clientY - startMouseY) > 5) isDraggingPanorama = true; });
        canvas.addEventListener('mouseup', (e) => {
            if (activeTool === 'nav' || isDraggingPanorama) return;
            const coords = viewer.mouseEventToCoords(e);
            if (coords) { pendingCoords.pitch = coords[0]; pendingCoords.yaw = coords[1]; openHotspotModal(); }
        });
    });

    renderSceneList(); renderHotspotListUI(); renderPropertiesUI(); 
}

function renderSceneList() {
    const container = document.getElementById('sceneList');
    if (!container) return;
    container.innerHTML = scenes.map(scene => {
        const isActive = scene.id === currentSceneId; const isSelected = selectedSceneIds.includes(scene.id); const isFirst = scene.id === firstSceneId; 
        return `
            <div class="scene-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}" data-id="${scene.id}">
                <div class="scene-thumb" style="background-image: url('${scene.previewPath || scene.imagePath}')">
                    <div class="scene-checkbox ${isSelected ? 'checked' : ''}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                    ${isFirst ? `<div class="first-scene-badge">⭐ START</div>` : ''}
                </div>
                <div class="scene-title">${scene.title}</div>
                <button class="scene-delete" onclick="event.stopPropagation(); deleteSingleScene('${scene.id}')" title="Hapus Panorama">❌</button>
            </div>
        `;
    }).join('');
    container.querySelectorAll('.scene-item').forEach(item => { item.addEventListener('click', (e) => handleSceneSelection(item.getAttribute('data-id'), e)); });
}

function handleSceneSelection(sceneId, e) {
    if (e.target.closest('.scene-checkbox')) { e.stopPropagation(); selectedSceneIds.includes(sceneId) ? selectedSceneIds = selectedSceneIds.filter(id => id !== sceneId) : selectedSceneIds.push(sceneId); lastClickedSceneId = sceneId; renderSceneList(); return; }
    if (e.ctrlKey || e.metaKey) { selectedSceneIds.includes(sceneId) ? selectedSceneIds = selectedSceneIds.filter(id => id !== sceneId) : selectedSceneIds.push(sceneId); lastClickedSceneId = sceneId; } 
    else if (e.shiftKey && lastClickedSceneId) {
        const start = Math.min(scenes.findIndex(s => s.id === lastClickedSceneId), scenes.findIndex(s => s.id === sceneId));
        const end = Math.max(scenes.findIndex(s => s.id === lastClickedSceneId), scenes.findIndex(s => s.id === sceneId));
        scenes.slice(start, end + 1).forEach(s => { if (!selectedSceneIds.includes(s.id)) selectedSceneIds.push(s.id); }); lastClickedSceneId = sceneId;
    } else { selectedSceneIds = [sceneId]; lastClickedSceneId = sceneId; loadSceneToViewer(sceneId); return; }
    renderSceneList();
}

function renderHotspotListUI() {
    const container = document.getElementById('hotspotList'); if(!container) return;
    const scene = scenes.find(s => s.id === currentSceneId);
    if (!scene || !scene.hotSpots || scene.hotSpots.length === 0) { container.innerHTML = `<p style="color: var(--text-muted); font-size: 12px; text-align: center; margin-top: 20px;">Belum ada hotspot di scene ini.</p>`; return; }
    container.innerHTML = scene.hotSpots.map((hs, index) => {
        let dotClass = hs.type === 'scene' ? 'type-scene-dot' : (hs.type === 'video' ? 'type-video-dot' : 'type-info-dot');
        let targetText = hs.type === 'scene' ? `Target: ${scenes.find(s => s.id === hs.targetScene)?.title || '?'}` : (hs.type === 'video' ? `Target: ${mediaVideo360.find(v => v.id === hs.targetVideo)?.title || '?'}` : hs.text);
        return `<div class="hotspot-item"><div class="hotspot-header"><div class="hotspot-title"><span class="${dotClass}"></span> ${hs.text}</div><button class="btn-del-hs" onclick="deleteHotspot(${index})">X</button></div><div class="hs-detail">Type: ${hs.type}</div><div class="hs-detail">${targetText}</div></div>`;
    }).join('');
}

function deleteSingleScene(id) { selectedSceneIds = [id]; executeBulkDelete(); }
function executeBulkDelete() {
    if (selectedSceneIds.length === 0) return;
    if (confirm(`Hapus ${selectedSceneIds.length} panorama?`)) {
        const isActiveDeleted = selectedSceneIds.includes(currentSceneId);
        scenes = scenes.filter(s => !selectedSceneIds.includes(s.id));
        if (selectedSceneIds.includes(firstSceneId)) firstSceneId = scenes.length > 0 ? scenes[0].id : null;
        selectedSceneIds = []; lastClickedSceneId = null;
        if (scenes.length > 0) { if (isActiveDeleted) loadSceneToViewer(scenes[0].id); else { renderSceneList(); renderHotspotListUI(); } } 
        else { currentSceneId = null; if (viewer) { viewer.destroy(); viewer = null; } document.getElementById('emptyState').style.display = 'flex'; document.getElementById('toolbar').style.display = 'none'; renderSceneList(); renderHotspotListUI(); }
        showToast("Dihapus!", "success");
    }
}
window.deleteHotspot = function(index) { const scene = scenes.find(s => s.id === currentSceneId); if (scene) { scene.hotSpots.splice(index, 1); loadSceneToViewer(currentSceneId); } };

// --- TOOLBAR ---
const tools = ['nav', 'scene', 'info', 'url', 'video'];
tools.forEach(tool => {
    document.getElementById(`tool-${tool}`)?.addEventListener('click', (e) => {
        tools.forEach(t => document.getElementById(`tool-${t}`)?.classList.remove('active'));
        e.currentTarget.classList.add('active'); activeTool = tool; 
        tool === 'nav' ? document.body.classList.remove('mode-add-hotspot') : document.body.classList.add('mode-add-hotspot');
    });
});

// --- UPLOAD PANORAMA ---
document.getElementById('addSceneBtn')?.addEventListener('click', () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png'; input.multiple = true;
    input.onchange = (e) => { if (e.target.files.length > 0) processPanoramaFiles(e.target.files); }; input.click();
});
async function processPanoramaFiles(files) {
    if (files.length === 0) return; showToast(`Memulai upload...`, "normal");
    for (let i = 0; i < files.length; i++) {
        const formData = new FormData(); formData.append('image', files[i]);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData }); const data = await res.json();
            if (data.success) {
                const newId = 'scene_' + Date.now() + '_' + i; 
                scenes.push({ id: newId, title: files[i].name.replace(/\.[^/.]+$/, ""), imagePath: data.file.path, previewPath: data.file.previewPath, fileSize: data.file.size, fileDimensions: data.file.dimensions, fileType: data.file.type, author: "", hotSpots: [] });
                if (!firstSceneId) firstSceneId = newId; 
                if (!currentSceneId) { selectedSceneIds = [newId]; loadSceneToViewer(newId); } else renderSceneList();
            }
        } catch(err) { showToast(`Error: ${err.message}`, "error"); }
    }
}

// --- FITUR BARU: MEDIA VIDEO 360 ---
document.getElementById('btnUploadVideo360')?.addEventListener('click', () => document.getElementById('inputVideo360')?.click());
document.getElementById('inputVideo360')?.addEventListener('change', async (e) => {
    const files = e.target.files; if (!files || files.length === 0) return;
    showToast(`Mengupload video 360...`, "normal");
    for (let i = 0; i < files.length; i++) {
        const formData = new FormData(); formData.append('image', files[i]); 
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData }); const data = await res.json();
            if (data.success) {
                mediaVideo360.push({ id: 'vid360_' + Date.now() + '_' + i, title: files[i].name, path: data.file.path });
            } else showToast(`Gagal: ${data.error}`, "error");
        } catch(err) { console.error(err); }
    }
    renderVideo360List(); e.target.value = ''; showToast("Upload Video 360 selesai!", "success");
});

function renderVideo360List() {
    const container = document.getElementById('video360List'); if (!container) return;
    if (mediaVideo360.length === 0) { container.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; grid-column: 1/-1;">Belum ada video 360.</div>`; return; }
    container.innerHTML = mediaVideo360.map(vid => `
        <div class="scene-item" style="flex-direction: column; align-items: flex-start; padding: 10px; background: #222; border-radius: 6px; border: 1px solid var(--border);">
            <div style="width: 100%; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 30px;">🎥</div>
            <div style="font-size: 11px; color: white; margin-bottom: 10px; word-break: break-all;">${vid.title}</div>
            <button class="btn btn-danger" style="width: 100%; padding: 5px; font-size: 11px;" onclick="deleteVideo360('${vid.id}')">Hapus</button>
        </div>`).join('');
}
window.deleteVideo360 = function(id) { if(confirm("Hapus video 360 ini?")) { mediaVideo360 = mediaVideo360.filter(v => v.id !== id); renderVideo360List(); } }

// --- MODAL HOTSPOT ---
const modal = document.getElementById('hotspotModal');
function openHotspotModal() {
    document.getElementById('hsLabel').value = ''; document.getElementById('hsUrl').value = ''; 
    document.getElementById('selectedTargetSceneId').value = ''; document.getElementById('selectedTargetVideoId').value = '';
    
    const otherScenes = scenes.filter(s => s.id !== currentSceneId);
    document.getElementById('sceneSelectorGrid').innerHTML = otherScenes.length === 0 ? `<p style="grid-column: 1/-1; font-size: 12px;">Kosong.</p>` : otherScenes.map(s => `<div class="scene-card" id="card-${s.id}" onclick="selectSceneCard('${s.id}')"><div class="scene-card-thumb" style="background-image: url('${s.previewPath || s.imagePath}')"><div class="selected-badge">✓</div></div><div class="scene-card-title">${s.title}</div></div>`).join('');
    
    document.getElementById('videoSelectorGrid').innerHTML = mediaVideo360.length === 0 ? `<p style="grid-column: 1/-1; font-size: 12px;">Belum ada Video 360 diupload.</p>` : mediaVideo360.map(v => `<div class="scene-card" id="card-vid-${v.id}" onclick="selectVideoCard('${v.id}')"><div class="scene-card-thumb" style="background: #333; display: flex; align-items: center; justify-content: center; font-size: 24px;">🎥<div class="selected-badge">✓</div></div><div class="scene-card-title" style="font-size: 10px;">${v.title}</div></div>`).join('');

    const titles = { 'scene': '🔗 Tambah Hotspot Panorama', 'info': '💬 Tambah Elemen Web / Teks', 'url': '🌐 Tambah Hotspot Link URL', 'video': '🎥 Tambah Hotspot Video 360' };
    document.getElementById('hsModalTitle').innerText = titles[activeTool];
    document.getElementById('groupTargetScene').style.display = activeTool === 'scene' ? 'block' : 'none';
    document.getElementById('groupTargetVideo').style.display = activeTool === 'video' ? 'block' : 'none';
    document.getElementById('groupUrl').style.display = activeTool === 'url' ? 'block' : 'none'; 
    modal.classList.add('active');
}

window.selectSceneCard = function(sceneId) { document.querySelectorAll('#sceneSelectorGrid .scene-card').forEach(c => c.classList.remove('selected')); document.getElementById(`card-${sceneId}`).classList.add('selected'); document.getElementById('selectedTargetSceneId').value = sceneId; };
window.selectVideoCard = function(vidId) { document.querySelectorAll('#videoSelectorGrid .scene-card').forEach(c => c.classList.remove('selected')); document.getElementById(`card-vid-${vidId}`).classList.add('selected'); document.getElementById('selectedTargetVideoId').value = vidId; };

document.getElementById('btnCancelModal')?.addEventListener('click', () => modal.classList.remove('active'));
document.getElementById('btnSaveModal')?.addEventListener('click', () => {
    const label = document.getElementById('hsLabel').value.trim() || 'Titik Hotspot';
    const type = activeTool; let targetScene = null, url = null, targetVideo = null;
    
    if (type === 'scene') { targetScene = document.getElementById('selectedTargetSceneId').value; if (!targetScene) return showToast('Pilih tujuan!', 'error'); }
    else if (type === 'video') { targetVideo = document.getElementById('selectedTargetVideoId').value; if (!targetVideo) return showToast('Pilih Video 360!', 'error'); }
    else if (type === 'url') { url = document.getElementById('hsUrl').value.trim(); if (!url) return showToast('Isi URL!', 'error'); if (!url.startsWith('http')) url = 'https://' + url; }

    scenes.find(s => s.id === currentSceneId).hotSpots.push({ pitch: pendingCoords.pitch, yaw: pendingCoords.yaw, type, text: label, targetScene, targetVideo, url });
    modal.classList.remove('active'); showToast("Hotspot tersimpan!", "success"); loadSceneToViewer(currentSceneId); document.getElementById('tool-nav')?.click(); 
});

// --- MENU NAVIGASI ---
const menuHotspot = document.getElementById('menu-hotspot'); const menuIntro = document.getElementById('menu-intro'); const menuSkin = document.getElementById('menu-skin'); const menuVideo360 = document.getElementById('menu-video360');
const workHotspot = document.getElementById('workspace-hotspot'); const workIntro = document.getElementById('workspace-intro'); const workSkin = document.getElementById('workspace-skin'); const workVideo360 = document.getElementById('workspace-video360');
function switchWorkspace(activeMenu, activeWork) {
    [menuHotspot, menuIntro, menuSkin, menuVideo360].forEach(m => m?.classList.remove('active')); [workHotspot, workIntro, workSkin, workVideo360].forEach(w => { if(w) w.style.display = 'none'; });
    if(activeMenu) activeMenu.classList.add('active'); if(activeWork) activeWork.style.display = 'flex';
}
menuHotspot?.addEventListener('click', (e) => { e.preventDefault(); switchWorkspace(menuHotspot, workHotspot); });
menuIntro?.addEventListener('click', (e) => { e.preventDefault(); switchWorkspace(menuIntro, workIntro); });
menuSkin?.addEventListener('click', (e) => { e.preventDefault(); switchWorkspace(menuSkin, workSkin); });
menuVideo360?.addEventListener('click', (e) => { e.preventDefault(); switchWorkspace(menuVideo360, workVideo360); });

// --- UPLOAD LAINNYA ---
document.getElementById('uploadVideoDesktop')?.addEventListener('change', () => handleGenericUpload('uploadVideoDesktop', 'statusVideoDesktop', 'desktop', introVideo));
document.getElementById('uploadVideoMobile')?.addEventListener('change', () => handleGenericUpload('uploadVideoMobile', 'statusVideoMobile', 'mobile', introVideo));
async function handleGenericUpload(inputId, statusId, objectKey, targetObject) {
    const file = document.getElementById(inputId).files[0]; if (!file) return;
    const formData = new FormData(); formData.append('image', file); 
    const res = await fetch('/api/upload', { method: 'POST', body: formData }); const data = await res.json();
    if (data.success) { targetObject[objectKey] = data.file.path; document.getElementById(statusId).style.display = 'block'; }
}

// --- EXPORT VIRTUAL TOUR ---
document.getElementById('generateBtn')?.addEventListener('click', async () => {
    if (scenes.length === 0) return showToast('Belum ada scene.', 'error'); 
    const folderName = prompt("Nama folder Export:", currentProjectName ? currentProjectName.replace('.govp', '') : 'Proyek_Baru'); if (!folderName) return;
    const progModal = document.getElementById('progressModal'); const progBar = document.getElementById('progressBar'); const progText = document.getElementById('progressText'); const logBox = document.getElementById('progressLog');
    if(progModal) progModal.classList.add('active'); if(progBar) progBar.style.width = '0%'; if(progText) progText.innerText = 'Menyiapkan server...'; if(logBox) logBox.innerHTML = '[System] Memulai komputasi ekspor...<br>';
    
    try {
        const welcomeText = document.getElementById('welcomeTextInput') ? document.getElementById('welcomeTextInput').value.trim() : '';
        const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenes, folderName, introVideo, welcomeText, skinConfig, firstSceneId, mediaVideo360 }) });
        const reader = res.body.getReader(); const decoder = new TextDecoder('utf-8'); let buffer = '';
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop(); 
            for (const line of lines) {
                if (!line.trim()) continue; const data = JSON.parse(line);
                if (data.type === 'progress') { 
                    if(progBar) progBar.style.width = data.percent + '%'; if(progText) progText.innerText = `${data.message} (${data.percent}%)`; 
                    if (data.detail && logBox) { logBox.innerHTML += `> ${data.detail}<br>`; logBox.scrollTop = logBox.scrollHeight; }
                } else if (data.type === 'success') { 
                    if(progBar) progBar.style.width = '100%'; if(progText) progText.innerText = 'Export Selesai!'; 
                    if (logBox) logBox.innerHTML += `<span style="color: #00ff00;">> [System] 🎉 Selesai!</span><br>`;
                    setTimeout(() => { if(progModal) progModal.classList.remove('active'); alert(`Selesai!\nFolder: ${data.folderName}`); }, 1000); 
                } else if (data.type === 'error') { throw new Error(data.message); }
            }
        }
    } catch(err) { if(progModal) progModal.classList.remove('active'); alert('Terjadi kesalahan: ' + err.message); }
});

// --- MENYIMPAN ARAH KAMERA & CAPTURE THUMBNAIL ---
document.getElementById('btn-set-default-view')?.addEventListener('click', () => {
    if (!viewer || !currentSceneId) return;
    const currentPitch = viewer.getPitch(); const currentYaw = viewer.getYaw(); const currentHfov = viewer.getHfov(); const sceneIndex = scenes.findIndex(s => s.id === currentSceneId);
    if (sceneIndex !== -1) {
        scenes[sceneIndex].pitch = currentPitch; scenes[sceneIndex].yaw = currentYaw; scenes[sceneIndex].hfov = currentHfov;
        const canvas = document.querySelector('#panorama canvas');
        if (canvas) {
            viewer.setPitch(currentPitch);
            const thumbData = canvas.toDataURL('image/jpeg', 0.8); scenes[sceneIndex].defaultViewThumb = thumbData;
            document.getElementById('default-view-status').style.display = 'none'; document.getElementById('default-view-img').src = thumbData; document.getElementById('default-view-img').style.display = 'block';
            showToast("Default View & Thumbnail disimpan!", "success");
        }
    }
});

function renderPropertiesUI() {
    const scene = scenes.find(s => s.id === currentSceneId);
    document.getElementById('propertiesEmpty').style.display = scene ? 'none' : 'block'; document.getElementById('propertiesForm').style.display = scene ? 'block' : 'none';
    if (!scene) return;
    document.getElementById('propSceneTitle').value = scene.title || ''; document.getElementById('propAuthor').value = scene.author || '';
    document.getElementById('propIsFirstScene').checked = (currentSceneId === firstSceneId);
    if (scene.defaultViewThumb) { document.getElementById('default-view-status').style.display = 'none'; document.getElementById('default-view-img').src = scene.defaultViewThumb; document.getElementById('default-view-img').style.display = 'block'; } 
    else { document.getElementById('default-view-status').style.display = 'block'; document.getElementById('default-view-img').style.display = 'none'; }
}

document.querySelectorAll('.panel-tabs .tab-btn').forEach(btn => { btn.addEventListener('click', () => { document.querySelectorAll('.panel-tabs .tab-btn').forEach(b => b.classList.remove('active')); document.querySelectorAll('#panelContentRight .tab-pane').forEach(p => p.style.display = 'none'); btn.classList.add('active'); document.getElementById('tab-' + btn.getAttribute('data-tab')).style.display = 'block'; }); });
document.getElementById('propSceneTitle')?.addEventListener('input', (e) => { if (!currentSceneId) return; scenes.find(s => s.id === currentSceneId).title = e.target.value; document.querySelector(`.scene-item[data-id="${currentSceneId}"] .scene-title`).innerText = e.target.value || 'Untitled'; });
document.getElementById('propAuthor')?.addEventListener('input', (e) => { if (!currentSceneId) return; scenes.find(s => s.id === currentSceneId).author = e.target.value; });
document.getElementById('propIsFirstScene')?.addEventListener('change', (e) => { if (!currentSceneId) return; if (e.target.checked) firstSceneId = currentSceneId; else { if (scenes.length > 1) { alert("Harus ada 1 panorama awal."); e.target.checked = true; return; } else firstSceneId = null; } renderSceneList(); });

// --- NATIVE FILE SYSTEM (SILENT SAVE) ---
function getApplicationState() { return { version: "1.0", projectName: currentProjectName || "Untitled_Project", firstSceneId: firstSceneId, scenes: scenes, mediaVideo360: mediaVideo360, introVideo: introVideo, skinConfig: skinConfig, welcomeText: document.getElementById('welcomeTextInput') ? document.getElementById('welcomeTextInput').value : '' }; }
function applyApplicationState(data) {
    firstSceneId = data.firstSceneId || (data.scenes && data.scenes.length > 0 ? data.scenes[0].id : null);
    scenes = data.scenes || []; mediaVideo360 = data.mediaVideo360 || []; introVideo = data.introVideo || { desktop: null, mobile: null };
    if (document.getElementById('welcomeTextInput')) document.getElementById('welcomeTextInput').value = data.welcomeText || ''; 
    ['statusVideoDesktop', 'statusVideoMobile'].forEach(id => { const el = document.getElementById(id); if (el) { if (id === 'statusVideoDesktop') el.style.display = introVideo.desktop ? 'block' : 'none'; if (id === 'statusVideoMobile') el.style.display = introVideo.mobile ? 'block' : 'none'; }});
    currentSceneId = null; selectedSceneIds = []; lastClickedSceneId = null; if (viewer) { viewer.destroy(); viewer = null; }
    if (scenes.length > 0) { selectedSceneIds = [scenes[0].id]; loadSceneToViewer(scenes[0].id); } else { document.getElementById('emptyState').style.display = 'flex'; document.getElementById('toolbar').style.display = 'none'; renderSceneList(); renderHotspotListUI(); }
    renderVideo360List();
}

async function quickSaveProject() {
    if (scenes.length === 0) return showToast("Proyek kosong!", "error");
    try {
        const stateData = getApplicationState(); const jsonString = JSON.stringify(stateData, null, 2);
        if (!currentFileHandle) { currentFileHandle = await window.showSaveFilePicker({ suggestedName: currentProjectName || 'Proyek_Baru.govp', types: [{ description: 'GoVirtual Project', accept: { 'application/json': ['.govp'] } }] }); }
        const writable = await currentFileHandle.createWritable(); await writable.write(jsonString); await writable.close();
        currentProjectName = currentFileHandle.name; document.title = `GoVirtual - ${currentProjectName}`; showToast(`💾 Tersimpan!`, "success");
    } catch (err) { if (err.name !== 'AbortError') alert("Gagal menyimpan: " + err.message); }
}

window.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); document.getElementById('menu-new-project')?.click(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); document.getElementById('menu-open-project')?.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); quickSaveProject(); }
    if (e.key === 'Delete') executeBulkDelete();
}, true); 

const menuSaveProjectBtn = document.getElementById('menu-save-project'); if (menuSaveProjectBtn) { const newSaveBtn = menuSaveProjectBtn.cloneNode(true); menuSaveProjectBtn.parentNode.replaceChild(newSaveBtn, menuSaveProjectBtn); newSaveBtn.addEventListener('click', (e) => { e.preventDefault(); quickSaveProject(); }); }
const menuSaveAsProjectBtn = document.getElementById('menu-save-as-project'); if (menuSaveAsProjectBtn) { const newSaveAsBtn = menuSaveAsProjectBtn.cloneNode(true); menuSaveAsProjectBtn.parentNode.replaceChild(newSaveAsBtn, menuSaveAsProjectBtn); newSaveAsBtn.addEventListener('click', async (e) => { e.preventDefault(); try { currentFileHandle = await window.showSaveFilePicker({ suggestedName: currentProjectName || 'Proyek_Copy.govp', types: [{ description: 'GoVirtual Project', accept: { 'application/json': ['.govp'] } }] }); quickSaveProject(); } catch (err) { } }); }
document.getElementById('menu-new-project')?.addEventListener('click', (e) => { e.preventDefault(); if (confirm("Buat Proyek Baru?")) { applyApplicationState({}); currentProjectName = null; currentFileHandle = null; document.title = "GoVirtual - Untitled Project"; showToast("Dikosongkan!", "success"); } });
document.getElementById('menu-open-project')?.addEventListener('click', async (e) => { e.preventDefault(); try { const [fileHandle] = await window.showOpenFilePicker({ types: [{ description: 'GoVirtual Project', accept: { 'application/json': ['.govp'] } }] }); const file = await fileHandle.getFile(); const text = await file.text(); const parsedData = JSON.parse(text); if (parsedData.version && parsedData.scenes) { currentFileHandle = fileHandle; currentProjectName = file.name; applyApplicationState(parsedData); document.title = `GoVirtual - ${currentProjectName}`; showToast(`Project dimuat!`, "success"); } } catch(err) { if (err.name !== 'AbortError') alert("Gagal membaca: " + err.message); } });
document.getElementById('menu-exit')?.addEventListener('click', (e) => { e.preventDefault(); if (confirm("Keluar dari Editor?")) { window.close(); } });