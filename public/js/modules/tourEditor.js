// =========================================================================
// FILE: public/js/modules/tourEditor.js
// =========================================================================
window.loadSceneToViewer = function(sceneId) { 
    const scene = window.scenes.find(s => s.id === sceneId); if (!scene) return; 
    document.getElementById('emptyState').style.display = 'none'; document.getElementById('toolbar').style.display = 'flex'; 
    
    const psvMarkers = (scene.hotSpots || []).map((hs, idx) => { 
        let tooltipText = hs.text; let markerHtml = ''; let customTemplateHtml = ''; const hsSize = hs.size || 40; 
        const isSelectedClass = (window.activeHotspotIndex === idx) ? ' gov-hs-selected' : '';
        const activeStyle = (window.activeHotspotIndex === idx) ? 'box-shadow: 0 0 0 4px var(--warning) !important; border-color: var(--warning) !important;' : '';

        if (hs.iconStyle === 'template2') { customTemplateHtml = `<div class="gov-hs-icon${isSelectedClass}" data-index="${idx}" style="width:${hsSize}px; height:${hsSize}px; background:radial-gradient(circle, rgba(255,0,0,1) 30%, rgba(255,255,255,0.8) 70%); border-radius:50%; border:2px solid red; ${activeStyle}"></div>`; } 
        else if (hs.iconStyle === 'template3') { customTemplateHtml = `<div class="gov-hs-icon${isSelectedClass}" data-index="${idx}" style="width:${hsSize}px; height:${hsSize*1.3}px; background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 384 512%22 fill=%22%23007bff%22><path d=%22M172.3 501.7C27 291 0 269.4 0 192 0 86 86 0 192 0s192 86 192 192c0 77.4-27 99-172.3 309.7-9.5 13.8-29.9 13.8-39.5 0zM192 272c44.2 0 80-35.8 80-80s-35.8-80-80-80-80 35.8-80 80 35.8 80 80 80z%22/></svg>'); background-size:cover; background-position:center; background-repeat:no-repeat; border:none; border-radius:0; box-shadow:none; filter:${window.activeHotspotIndex===idx?'drop-shadow(0 0 5px yellow)':'none'};"></div>`; } 
        else if (hs.iconStyle === 'custom' && hs.customIconPath) { customTemplateHtml = `<div class="gov-hs-icon${isSelectedClass}" data-index="${idx}" style="width:${hsSize}px; height:${hsSize}px; background-image:url('${hs.customIconPath}'); background-size:contain; background-repeat:no-repeat; background-position:center; border:none; border-radius:0; box-shadow:none; filter:${window.activeHotspotIndex===idx?'drop-shadow(0 0 5px yellow)':'none'};"></div>`; } 

        if (hs.type === 'scene') { markerHtml = customTemplateHtml || `<div class="gov-hs-icon gov-hs-scene${isSelectedClass}" data-index="${idx}" style="width:${hsSize}px; height:${hsSize}px; ${activeStyle}"><div style="font-size:${hsSize/1.8}px; transform:translateY(-2px); text-shadow:0 2px 4px #000;">⇧</div></div>`; tooltipText = `${hs.text} <br><small>Menuju: ${window.scenes.find(s=>s.id===hs.targetScene)?.title || '?'}</small>`; } 
        else if (hs.type === 'video') { markerHtml = customTemplateHtml || `<div class="gov-hs-icon gov-hs-video${isSelectedClass}" data-index="${idx}" style="width:${hsSize}px; height:${hsSize}px; ${activeStyle}"><div style="font-size:${hsSize/2.2}px; margin-left:4px;">▶</div></div>`; tooltipText = `${hs.text} <br><small>Video: ${window.mediaVideo360.find(v=>v.id===hs.targetVideo)?.title || '?'}</small>`; } 
        else if (hs.type === 'url') { markerHtml = customTemplateHtml || `<div class="gov-hs-icon gov-hs-url${isSelectedClass}" data-index="${idx}" style="width:${hsSize}px; height:${hsSize}px; ${activeStyle}"><div style="font-size:${hsSize/2.2}px;">🌐</div></div>`; } 
        else { markerHtml = customTemplateHtml || `<div class="gov-hs-icon gov-hs-info${isSelectedClass}" data-index="${idx}" style="width:${hsSize}px; height:${hsSize}px; ${activeStyle}"><div style="font-size:${hsSize/2.2}px; font-family:serif; font-style:italic;">i</div></div>`; } 
        return { id: `hs_${idx}`, position: { pitch: hs.pitch, yaw: hs.yaw }, html: markerHtml, anchor: 'center center', size: { width: hsSize, height: hsSize }, tooltip: { content: tooltipText, position: 'top center' }, data: { type: hs.type, index: idx } }; 
    }); 

    if (window.viewer && window.currentSceneId === sceneId) { if (window.markersPlugin) window.markersPlugin.setMarkers(psvMarkers); window.renderHotspotListUI(); return; } 
    if (window.viewer) { window.viewer.destroy(); window.viewer = null; window.markersPlugin = null; } 
    
    window.currentSceneId = sceneId; 
    window.viewer = new PhotoSphereViewer.Viewer({ 
        container: document.querySelector('#panorama'), panorama: scene.previewPath || scene.imagePath, 
        defaultPitch: scene.pitch || 0, defaultYaw: scene.yaw || 0, defaultZoomLvl: scene.zoomLvl || 50, 
        navbar: false, rendererParameters: { preserveDrawingBuffer: true }, plugins: [ [PhotoSphereViewer.MarkersPlugin, { markers: psvMarkers }] ] 
    }); 
    window.markersPlugin = window.viewer.getPlugin(PhotoSphereViewer.MarkersPlugin); 
    window.viewer.addEventListener('click', ({ data }) => { if (window.activeTool === 'nav') return; if (!data || typeof data.pitch !== 'number') return; window.pendingCoords.pitch = data.pitch; window.pendingCoords.yaw = data.yaw; window.openHotspotModal(); }); 
    window.renderSceneList(); window.renderHotspotListUI(); window.renderPropertiesUI(); 
};

// Logika SMART DRAG untuk Hotspot 3D
document.addEventListener('mousedown', (e) => {
    const markerEl = e.target.closest('.gov-hs-icon');
    if (markerEl && document.getElementById('panorama')?.contains(markerEl)) {
        const idx = parseInt(markerEl.getAttribute('data-index'));
        if (window.activeHotspotIndex !== idx) { window.selectHotspot(idx); } else { window.isDraggingHs = true; window.dragHsIndex = idx; e.stopPropagation(); }
    } else if (e.target.closest('#panorama') && !e.target.closest('.gov-hs-icon')) {
        window.activeHotspotIndex = null; document.querySelectorAll('.gov-hs-icon').forEach(el => el.classList.remove('gov-hs-selected'));
        document.getElementById('hotspotDetailForm')?.classList.add('d-none'); window.renderHotspotListUI();
    }
}, true);

document.addEventListener('mousemove', (e) => {
    if (window.isDraggingHs && window.dragHsIndex !== null && window.viewer) {
        e.stopPropagation(); const rect = document.querySelector('#panorama').getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            const pos = window.viewer.dataHelper.viewerCoordsToSphericalCoords({ x, y });
            if (pos) {
                const scene = window.scenes.find(s => s.id === window.currentSceneId);
                if (scene && scene.hotSpots[window.dragHsIndex]) {
                    scene.hotSpots[window.dragHsIndex].pitch = pos.pitch; scene.hotSpots[window.dragHsIndex].yaw = pos.yaw;
                    window.markersPlugin.updateMarker({ id: `hs_${window.dragHsIndex}`, position: { pitch: pos.pitch, yaw: pos.yaw } });
                }
            }
        }
    }
}, true);

document.addEventListener('mouseup', (e) => { if (window.isDraggingHs) { window.isDraggingHs = false; window.dragHsIndex = null; if(typeof window.saveHistoryState==='function') window.saveHistoryState(); e.stopPropagation(); } }, true);

window.selectHotspot = function(index) {
    window.activeHotspotIndex = index; const scene = window.scenes.find(s => s.id === window.currentSceneId); if (!scene || !scene.hotSpots[index]) return;
    const hs = scene.hotSpots[index]; document.getElementById('hotspotDetailForm')?.classList.remove('d-none');
    document.getElementById('editHsLabel').value = hs.text || ''; document.getElementById('editHsSizeSlider').value = hs.size || 40; document.getElementById('editHsSizeNumber').value = hs.size || 40;
    window.renderHotspotListUI();
};

window.deleteHotspot = function(index) { const scene = window.scenes.find(s => s.id === window.currentSceneId); if (scene) { scene.hotSpots.splice(index, 1); if(window.activeHotspotIndex === index) { window.activeHotspotIndex = null; document.getElementById('hotspotDetailForm')?.classList.add('d-none'); } window.loadSceneToViewer(window.currentSceneId); if(typeof window.saveHistoryState==='function') window.saveHistoryState(); } };

window.renderHotspotListUI = function() { 
    const container = document.getElementById('hotspotList'); if(!container) return; const scene = window.scenes.find(s => s.id === window.currentSceneId); 
    if (!scene || !scene.hotSpots || scene.hotSpots.length === 0) { container.innerHTML = `<p style="color:var(--text-muted); font-size:12px; text-align:center; margin-top:20px;">Belum ada hotspot.</p>`; return; } 
    container.innerHTML = scene.hotSpots.map((hs, index) => { 
        let dotClass = hs.type === 'scene' ? 'type-scene-dot' : (hs.type === 'video' ? 'type-video-dot' : 'type-info-dot'); 
        let targetText = hs.type === 'scene' ? `Target: ${window.scenes.find(s => s.id === hs.targetScene)?.title || '?'}` : (hs.type === 'video' ? `Target: ${window.mediaVideo360.find(v => v.id === hs.targetVideo)?.title || '?'}` : hs.text); 
        let isSelected = window.activeHotspotIndex === index;
        return `<div class="hotspot-item" style="cursor:pointer; ${isSelected ? 'border:1px solid var(--accent); background:rgba(0,122,204,0.15);' : ''}" onclick="window.selectHotspot(${index})"><div class="hotspot-header"><div class="hotspot-title"><span class="${dotClass}"></span> ${hs.text}</div><button class="btn-del-hs" onclick="event.stopPropagation(); window.deleteHotspot(${index})">X</button></div><div class="hs-detail">Type: ${hs.type}</div><div class=\"hs-detail\">${targetText}</div></div>`; 
    }).join(''); 
};

window.renderSceneList = function() { const container = document.getElementById('sceneList'); if (!container) return; container.innerHTML = window.scenes.map(scene => { const isActive = scene.id === window.currentSceneId; const isSelected = window.selectedSceneIds.includes(scene.id); const isFirst = scene.id === window.firstSceneId; return `<div class="scene-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}" data-id="${scene.id}"><div class="scene-thumb" style="background-image: url('${scene.previewPath || scene.imagePath}')"><div class="scene-checkbox ${isSelected ? 'checked' : ''}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg></div>${isFirst ? `<div class="first-scene-badge">⭐ START</div>` : ''}</div><div class="scene-title">${scene.title}</div><button class="scene-delete" onclick="event.stopPropagation(); window.deleteSingleScene('${scene.id}')">❌</button></div>`; }).join(''); container.querySelectorAll('.scene-item').forEach(item => { item.addEventListener('click', (e) => window.handleSceneSelection(item.getAttribute('data-id'), e)); }); };

window.handleSceneSelection = function(sceneId, e) { if (e.target.closest('.scene-checkbox')) { e.stopPropagation(); window.selectedSceneIds.includes(sceneId) ? window.selectedSceneIds = window.selectedSceneIds.filter(id => id !== sceneId) : window.selectedSceneIds.push(sceneId); window.renderSceneList(); return; } window.selectedSceneIds = [sceneId]; window.loadSceneToViewer(sceneId); };

window.deleteSingleScene = function(id) { if(confirm("Hapus panorama ini?")) { window.scenes = window.scenes.filter(s => s.id !== id); if(window.currentSceneId === id) window.currentSceneId = null; if(window.firstSceneId === id) window.firstSceneId = window.scenes.length > 0 ? window.scenes[0].id : null; if(window.scenes.length > 0) window.loadSceneToViewer(window.scenes[0].id); else { document.getElementById('emptyState').style.display = 'flex'; document.getElementById('toolbar').style.display = 'none'; window.renderSceneList(); window.renderHotspotListUI(); } if(typeof window.saveHistoryState==='function') window.saveHistoryState(); } };

window.openHotspotModal = function() {
    document.getElementById('hsLabel').value = ''; document.getElementById('hsUrl').value = ''; document.getElementById('selectedTargetSceneId').value = ''; document.getElementById('selectedTargetVideoId').value = ''; document.getElementById('hotspotStyle').value = 'default';
    const titles = { 'scene': '🔗 Tambah Hotspot Panorama', 'info': '💬 Tambah Elemen Web / Teks', 'url': '🌐 Tambah Hotspot Link URL', 'video': '🎥 Tambah Hotspot Video 360' }; 
    document.getElementById('hsModalTitle').innerText = titles[window.activeTool];
    document.getElementById('groupTargetScene').style.display = window.activeTool === 'scene' ? 'block' : 'none'; 
    document.getElementById('groupTargetVideo').style.display = window.activeTool === 'video' ? 'block' : 'none'; 
    document.getElementById('groupUrl').style.display = window.activeTool === 'url' ? 'block' : 'none'; 
    window.renderSceneSelectorGrid(); document.getElementById('hotspotModal').classList.add('active');
};

window.renderSceneSelectorGrid = function() {
    const grid = document.getElementById('sceneSelectorGrid'); if(!grid) return;
    grid.innerHTML = window.scenes.filter(s => s.id !== window.currentSceneId).map(s => `<div class="scene-card" id="card-${s.id}" onclick="window.selectSceneCard('${s.id}')"><div class="scene-card-thumb" style="background-image: url('${s.previewPath || s.imagePath}')"></div><div class="scene-card-title">${s.title}</div></div>`).join('');
};

window.selectSceneCard = function(id) { document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('selected')); document.getElementById(`card-${id}`)?.classList.add('selected'); document.getElementById('selectedTargetSceneId').value = id; };

window.renderPropertiesUI = function() { const scene = window.scenes.find(s => s.id === window.currentSceneId); if(!scene) return; document.getElementById('propSceneTitle').value = scene.title || ''; document.getElementById('propIsFirstScene').checked = (window.currentSceneId === window.firstSceneId); };

document.getElementById('propSceneTitle')?.addEventListener('input', (e) => { if(window.currentSceneId) { window.scenes.find(s=>s.id===window.currentSceneId).title = e.target.value; window.renderSceneList(); } });
document.getElementById('propIsFirstScene')?.addEventListener('change', (e) => { if(window.currentSceneId) { window.firstSceneId = e.target.checked ? window.currentSceneId : null; window.renderSceneList(); } });
// ==========================================
// FIX: FUNGSI UPLOAD PANORAMA
// ==========================================
window.processPanoramaFiles = async function(files) {
    if (files.length === 0) {
        if(typeof window.showToast === 'function') window.showToast(`Pilih setidaknya 1 gambar.`, "error");
        return;
    }
    if(typeof window.showToast === 'function') window.showToast(`Memulai upload...`, "normal");
    
    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                const newId = 'scene_' + Date.now() + '_' + i;
                window.scenes.push({ id: newId, title: files[i].name.replace(/\.[^/.]+$/, ""), imagePath: data.file.path, previewPath: data.file.previewPath, fileSize: data.file.size, fileDimensions: data.file.dimensions, fileType: data.file.type, author: "", hotSpots: [] });
                
                if (!window.firstSceneId) window.firstSceneId = newId;
                if (!window.currentSceneId) { 
                    window.selectedSceneIds = [newId]; 
                    window.loadSceneToViewer(newId); 
                } else {
                    window.renderSceneList();
                }
                if(typeof window.saveHistoryState === 'function') window.saveHistoryState();
            }
        } catch(err) { 
            if(typeof window.showToast === 'function') window.showToast(`Error: ${err.message}`, "error"); 
        }
    }
};

document.getElementById('addSceneBtn')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png';
    input.multiple = true;
    input.style.display = 'none'; // Sembunyikan input
    document.body.appendChild(input); // Trik Bypass Browser agar mau memunculkan window pilih file
    
    input.onchange = (e) => {
        if (e.target.files.length > 0) {
            // FIX: Tambahkan window. di depan pemanggilannya
            window.processPanoramaFiles(e.target.files); 
        }
        document.body.removeChild(input); // Bersihkan kembali setelah selesai
    };
    input.click();
});

document.getElementById('btnSaveModal')?.addEventListener('click', () => {
    const scene = window.scenes.find(s => s.id === window.currentSceneId); if(!scene) return;
    const label = document.getElementById('hsLabel').value || 'Hotspot';
    const targetScene = document.getElementById('selectedTargetSceneId').value;
    const url = document.getElementById('hsUrl').value;
    scene.hotSpots.push({ pitch: window.pendingCoords.pitch, yaw: window.pendingCoords.yaw, type: window.activeTool, text: label, targetScene, url, size: 40 });
    document.getElementById('hotspotModal').classList.remove('active'); window.loadSceneToViewer(window.currentSceneId); if(typeof window.saveHistoryState==='function') window.saveHistoryState();
});