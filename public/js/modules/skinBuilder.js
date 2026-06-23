// =========================================================================
// FILE: public/js/modules/skinBuilder.js
// =========================================================================
window.currentSkinPreviewMode = 'desktop'; 
window.currentZoomLevel = 'fit'; 
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

window.switchPreviewMode = function(mode) { 
    window.currentSkinPreviewMode = mode; window.currentZoomLevel = 'fit'; 
    const btns = { 'desktop': 'btnPreviewDesktop', 'tablet': 'btnPreviewTablet', 'fold': 'btnPreviewFold', 'mobile': 'btnPreviewMobile' };
    Object.keys(btns).forEach(k => { const btn = document.getElementById(btns[k]); if(btn) btn.style.background = (k === mode) ? 'var(--primary)' : '#444'; }); 
    const wrapper = document.getElementById('deviceMockupWrapper'); if(wrapper) wrapper.className = `device-wrapper device-${mode}`; 
    window.activeSkinElementId = null; window.resizeSkinCanvas(); window.renderSkinElements(); window.updateSkinPropertiesPanel(); 
};

document.getElementById('btnPreviewDesktop')?.addEventListener('click', () => window.switchPreviewMode('desktop'));
document.getElementById('btnPreviewTablet')?.addEventListener('click', () => window.switchPreviewMode('tablet'));
document.getElementById('btnPreviewFold')?.addEventListener('click', () => window.switchPreviewMode('fold'));
document.getElementById('btnPreviewMobile')?.addEventListener('click', () => window.switchPreviewMode('mobile'));

document.getElementById('btnZoomIn')?.addEventListener('click', () => { 
    const canvas = document.getElementById('skinEditorCanvas'); let currentScale = canvas?.getAttribute('data-scale') ? parseFloat(canvas.getAttribute('data-scale')) : 1; 
    if (window.currentZoomLevel === 'fit') window.currentZoomLevel = currentScale; 
    let nextZoom = ZOOM_STEPS.find(z => z > window.currentZoomLevel + 0.05) || ZOOM_STEPS[ZOOM_STEPS.length - 1]; 
    window.currentZoomLevel = nextZoom; window.resizeSkinCanvas(); 
});

document.getElementById('btnZoomOut')?.addEventListener('click', () => { 
    const canvas = document.getElementById('skinEditorCanvas'); let currentScale = canvas?.getAttribute('data-scale') ? parseFloat(canvas.getAttribute('data-scale')) : 1; 
    if (window.currentZoomLevel === 'fit') window.currentZoomLevel = currentScale; 
    let nextZoom = [...ZOOM_STEPS].reverse().find(z => z < window.currentZoomLevel - 0.05) || ZOOM_STEPS[0]; 
    window.currentZoomLevel = nextZoom; window.resizeSkinCanvas(); 
});

document.getElementById('zoomLevelDisplay')?.addEventListener('click', () => { window.currentZoomLevel = 'fit'; window.resizeSkinCanvas(); });

window.resizeSkinCanvas = function() { 
    const container = document.getElementById('skinCanvasContainer'); const wrapper = document.getElementById('deviceMockupWrapper'); const canvas = document.getElementById('skinEditorCanvas'); const spacer = document.getElementById('mockupSpacer'); 
    if (!container || !wrapper || !canvas || container.clientWidth === 0) return; 
    let baseW = 1280, baseH = 720; 
    if(window.currentSkinPreviewMode === 'tablet') { baseW = 800; baseH = 1180; } else if(window.currentSkinPreviewMode === 'fold') { baseW = 600; baseH = 800; } else if(window.currentSkinPreviewMode === 'mobile') { baseW = 375; baseH = 812; } 
    canvas.style.width = baseW + 'px'; canvas.style.height = baseH + 'px'; wrapper.style.transform = 'none'; 
    const wrapperRect = wrapper.getBoundingClientRect(); let scale = 1; 
    if (window.currentZoomLevel === 'fit') { 
        scale = Math.min((container.clientWidth - 80) / wrapperRect.width, (container.clientHeight - 80) / wrapperRect.height); 
        const displayEl = document.getElementById('zoomLevelDisplay'); if(displayEl) displayEl.innerText = 'Fit'; 
    } else { 
        scale = window.currentZoomLevel; const displayEl = document.getElementById('zoomLevelDisplay'); if(displayEl) displayEl.innerText = Math.round(scale * 100) + '%'; 
    } 
    wrapper.style.transform = `scale(${scale})`; canvas.setAttribute('data-scale', scale); 
    if (spacer) { spacer.style.minWidth = (wrapperRect.width * scale + 80) + 'px'; spacer.style.minHeight = (wrapperRect.height * scale + 80) + 'px'; } 
};

window.addEventListener('resize', () => { if (document.getElementById('workspace-skin')?.style.display === 'flex') { window.resizeSkinCanvas(); } });

window.initSkinCanvas = function() { 
    const canvas = document.getElementById('skinEditorCanvas'); if(!canvas) return; 
    const startScene = window.scenes.find(s => s.id === window.firstSceneId) || (window.scenes.length > 0 ? window.scenes[0] : null); let bgUrl = ''; 
    if (startScene) { if (startScene.defaultViewThumb) { bgUrl = startScene.defaultViewThumb; } else if (startScene.previewPath || startScene.imagePath) { bgUrl = startScene.previewPath || startScene.imagePath; } } 
    if (bgUrl) { canvas.style.backgroundImage = `url('${bgUrl}')`; const msg = document.getElementById('skinCanvasOverlayMsg'); if(msg) msg.style.display = 'none'; } else { canvas.style.backgroundImage = 'none'; const msg = document.getElementById('skinCanvasOverlayMsg'); if(msg) msg.style.display = 'block'; } 
    window.resizeSkinCanvas(); window.renderSkinElements(); 
};

window.selectSkinElement = function(id) { 
    window.activeSkinElementId = id; document.querySelectorAll('.skin-el').forEach(el => { if (el.id === id) el.classList.add('selected'); else el.classList.remove('selected'); }); 
    window.updateSkinPropertiesPanel(); window.renderSkinLayers(); 
};

window.deleteSkinElement = function(id) { 
    if (confirm("Hapus elemen ini?")) { 
        window.skinConfig.uiElements = window.skinConfig.uiElements.filter(e => e.id !== id); if (window.activeSkinElementId === id) window.activeSkinElementId = null; 
        window.renderSkinElements(); window.updateSkinPropertiesPanel(); if(typeof window.saveHistoryState === 'function') window.saveHistoryState(); 
    } 
};

document.getElementById('skinCanvasContainer')?.addEventListener('mousedown', (e) => { if (['skinCanvasContainer', 'mockupSpacer', 'deviceMockupWrapper', 'skinEditorCanvas', 'skinCanvasOverlayMsg'].includes(e.target.id)) { window.selectSkinElement(null); } });

window.renderSkinLayers = function() { 
    const container = document.getElementById('skinLayersContainer'); if(!container) return; 
    let deviceElements = window.skinConfig.uiElements.filter(e => (e.targetDevice || 'desktop') === window.currentSkinPreviewMode); 
    if(deviceElements.length === 0) { container.innerHTML = `<div class="props-empty-msg">Belum ada elemen di perangkat ini.</div>`; return; } 
    let html = ''; 
    for(let i = deviceElements.length - 1; i >= 0; i--) { 
        let el = deviceElements[i]; let isSelected = el.id === window.activeSkinElementId ? 'selected' : ''; 
        let icon = el.type === 'text' ? 'T' : (el.type === 'image' ? '🖼️' : (el.type === 'circle' ? '⭕' : (el.type === 'line' ? '➖' : '🔲'))); 
        let name = el.type === 'text' ? (el.content ? el.content.substring(0,12) + '...' : 'Text') : (el.type.charAt(0).toUpperCase() + el.type.slice(1)); 
        html += `<div class="layer-item ${isSelected}" onclick="window.selectSkinElement('${el.id}')"><div class="layer-left-content"><span class="layer-icon">${icon}</span><span class="layer-name">${name}</span></div><button class="btn-layer-action" onclick="event.stopPropagation(); window.deleteSkinElement('${el.id}')" title="Hapus Elemen">🗑️</button></div>`; 
    } 
    container.innerHTML = html; 
};

document.getElementById('btnLayerUp')?.addEventListener('click', () => { 
    if(!window.activeSkinElementId) return; let idx = window.skinConfig.uiElements.findIndex(e => e.id === window.activeSkinElementId); let nextIdx = -1; 
    for(let i = idx + 1; i < window.skinConfig.uiElements.length; i++) { if(window.skinConfig.uiElements[i].targetDevice === window.currentSkinPreviewMode) { nextIdx = i; break; } } 
    if(nextIdx !== -1) { let temp = window.skinConfig.uiElements[idx]; window.skinConfig.uiElements[idx] = window.skinConfig.uiElements[nextIdx]; window.skinConfig.uiElements[nextIdx] = temp; window.renderSkinElements(); if(typeof window.saveHistoryState === 'function') window.saveHistoryState(); } 
});

document.getElementById('btnLayerDown')?.addEventListener('click', () => { 
    if(!window.activeSkinElementId) return; let idx = window.skinConfig.uiElements.findIndex(e => e.id === window.activeSkinElementId); let prevIdx = -1; 
    for(let i = idx - 1; i >= 0; i--) { if(window.skinConfig.uiElements[i].targetDevice === window.currentSkinPreviewMode) { prevIdx = i; break; } } 
    if(prevIdx !== -1) { let temp = window.skinConfig.uiElements[idx]; window.skinConfig.uiElements[idx] = window.skinConfig.uiElements[prevIdx]; window.skinConfig.uiElements[prevIdx] = temp; window.renderSkinElements(); if(typeof window.saveHistoryState === 'function') window.saveHistoryState(); } 
});

window.renderSkinElements = function() {
    const canvas = document.getElementById('skinEditorCanvas'); if(!canvas) return; 
    Array.from(canvas.querySelectorAll('.skin-el')).forEach(el => el.remove());
    let deviceElements = window.skinConfig.uiElements.filter(e => (e.targetDevice || 'desktop') === window.currentSkinPreviewMode);
    deviceElements.forEach((elData, idx) => {
        const div = document.createElement('div'); div.id = elData.id; div.className = `skin-el ${elData.type === 'text' ? 'skin-el-text' : 'skin-el-img'}`;
        if(elData.id === window.activeSkinElementId) div.classList.add('selected');
        div.style.zIndex = 10 + idx; div.style.left = `${elData.left}%`; div.style.top = `${elData.top}%`; div.style.width = `${elData.width}%`; div.style.height = `${elData.height}%`;
        div.style.opacity = elData.opacity !== undefined ? elData.opacity : 1; div.style.borderRadius = elData.type === 'circle' ? '50%' : `${elData.borderRadius || 0}px`;
        div.style.border = `${elData.borderWidth || 0}px solid ${elData.borderColor || '#ffffff'}`; div.style.backgroundColor = elData.bgTransparent ? 'transparent' : (elData.bgColor || 'transparent');
        if (elData.shadowBlur > 0 || elData.shadowX !== 0 || elData.shadowY !== 0) { div.style.boxShadow = `${elData.shadowX || 0}px ${elData.shadowY || 0}px ${elData.shadowBlur || 0}px ${elData.shadowColor || '#000000'}`; } else { div.style.boxShadow = 'none'; }
        if (elData.type === 'text') {
            div.innerText = elData.content || 'Teks Baru'; div.style.color = elData.color || '#ffffff'; div.style.fontSize = `${elData.fontSize || 16}px`; div.style.fontWeight = elData.fontWeight || 400; 
            if (elData.fontFamily) { div.style.fontFamily = `'${elData.fontFamily}', sans-serif`; if(typeof window.loadGoogleFont === 'function') window.loadGoogleFont(elData.fontFamily); }
            div.style.textAlign = elData.textAlign || 'center'; div.style.justifyContent = elData.textAlign === 'left' ? 'flex-start' : (elData.textAlign === 'right' ? 'flex-end' : 'center'); div.style.alignItems = elData.verticalAlign || 'center'; div.style.whiteSpace = elData.wordWrap ? 'normal' : 'nowrap'; if(!elData.wordWrap) div.style.textOverflow = 'ellipsis';
            div.addEventListener('dblclick', (e) => { e.stopPropagation(); div.contentEditable = "true"; div.style.cursor = "text"; div.focus(); document.execCommand('selectAll', false, null); });
            div.addEventListener('blur', (e) => { div.contentEditable = "false"; div.style.cursor = "move"; window.saveElementStateToConfig(elData.id, 'content', div.innerText); if (window.activeSkinElementId === elData.id) { const txtInput = document.getElementById('skinPropText'); if (txtInput) txtInput.value = div.innerText; } if(typeof window.saveHistoryState === 'function') window.saveHistoryState(); });
        } else if (elData.type === 'image') { if (elData.content) div.style.backgroundImage = `url('${elData.content}')`; else if(!elData.bgColor && !elData.borderWidth) div.style.backgroundColor = 'rgba(255,255,255,0.2)'; }
        div.addEventListener('mousedown', (e) => { if (div.isContentEditable) { e.stopPropagation(); return; } window.selectSkinElement(elData.id); });
        canvas.appendChild(div);
    });
    window.renderSkinLayers(); 
};

window.createNewSkinElement = function(type) {
    const newId = 'ui_' + Date.now(); let defWidth = 15; let defHeight = 15; let defBgColor = 'transparent'; let defBgTrans = true; let defContent = '';
    if(type === 'text') { defWidth = 25; defHeight = 10; defContent = 'Teks Baru'; } else if (type === 'rect') { defWidth = 20; defHeight = 20; defBgColor = '#007acc'; defBgTrans = false; } else if (type === 'circle') { defWidth = 15; defHeight = 15; defBgColor = '#e74c3c'; defBgTrans = false; } else if (type === 'line') { defWidth = 30; defHeight = 0.5; defBgColor = '#ffffff'; defBgTrans = false; }
    const newEl = { id: newId, type: type, targetDevice: window.currentSkinPreviewMode, left: 40, top: 40, width: defWidth, height: defHeight, content: defContent, color: '#ffffff', fontSize: 16, fontFamily: 'Roboto', fontWeight: 400, textAlign: 'center', verticalAlign: 'center', wordWrap: true, shadowX: 0, shadowY: 0, shadowBlur: 0, shadowColor: '#000000', opacity: 1, borderRadius: type === 'circle' ? 50 : 0, bgColor: defBgColor, bgTransparent: defBgTrans, borderWidth: 0, borderColor: '#ffffff', action: 'none', target: '' };
    if (!window.skinConfig.uiElements) window.skinConfig.uiElements = []; window.skinConfig.uiElements.push(newEl); window.selectSkinElement(newId); window.renderSkinElements(); if(typeof window.saveHistoryState === 'function') window.saveHistoryState();
};

document.getElementById('btnSkinAddText')?.addEventListener('click', () => window.createNewSkinElement('text')); 
document.getElementById('btnSkinAddImage')?.addEventListener('click', () => window.createNewSkinElement('image')); 
document.getElementById('btnSkinAddRect')?.addEventListener('click', () => window.createNewSkinElement('rect')); 
document.getElementById('btnSkinAddCircle')?.addEventListener('click', () => window.createNewSkinElement('circle')); 
document.getElementById('btnSkinAddLine')?.addEventListener('click', () => window.createNewSkinElement('line'));

window.saveElementStateToConfig = function(id, key, value) { if (!window.skinConfig.uiElements) return; const el = window.skinConfig.uiElements.find(e => e.id === id); if (el) el[key] = value; };

window.updateSkinPropertiesPanel = function() {
    const el = window.skinConfig.uiElements?.find(e => e.id === window.activeSkinElementId);
    if (!el) { document.getElementById('skinElementPropsEmpty').style.display = 'block'; document.getElementById('skinElementPropsForm').style.display = 'none'; return; }
    document.getElementById('skinElementPropsEmpty').style.display = 'none'; document.getElementById('skinElementPropsForm').style.display = 'block';
    document.getElementById('skinPropWidth').value = el.width ? el.width.toFixed(2) : 20; document.getElementById('skinPropHeight').value = el.height ? el.height.toFixed(2) : 20;
    document.getElementById('skinPropOpacity').value = el.opacity !== undefined ? el.opacity : 1; document.getElementById('skinPropBorderRadius').value = el.borderRadius || 0;
    document.getElementById('skinPropBgColor').value = el.bgColor || '#000000'; document.getElementById('skinPropBgTransparent').checked = el.bgTransparent || false;
    document.getElementById('skinPropBorderWidth').value = el.borderWidth || 0; document.getElementById('skinPropBorderColor').value = el.borderColor || '#ffffff';
    if (el.type === 'text') {
        document.getElementById('propGroupText').style.display = 'block'; document.getElementById('propGroupImage').style.display = 'none';
        document.getElementById('skinPropText').value = el.content || ''; document.getElementById('skinPropColor').value = el.color || '#ffffff';
        document.getElementById('skinPropFontSize').value = el.fontSize || 16; document.getElementById('skinPropFontFamily').value = el.fontFamily || 'Arial';
        document.getElementById('skinPropFontWeight').value = el.fontWeight || 400; document.getElementById('skinPropTextAlign').value = el.textAlign || 'center';
        document.getElementById('skinPropVerticalAlign').value = el.verticalAlign || 'center'; document.getElementById('skinPropWordWrap').checked = el.wordWrap !== false;
    } else if (el.type === 'image') {
        document.getElementById('propGroupText').style.display = 'none'; document.getElementById('propGroupImage').style.display = 'block';
        document.getElementById('skinPropImagePreview').src = el.content || ''; document.getElementById('skinPropImagePreview').style.display = el.content ? 'block' : 'none';
    } else { document.getElementById('propGroupText').style.display = 'none'; document.getElementById('propGroupImage').style.display = 'none'; }
    document.getElementById('skinPropShadowX').value = el.shadowX || 0; document.getElementById('skinPropShadowY').value = el.shadowY || 0;
    document.getElementById('skinPropShadowBlur').value = el.shadowBlur || 0; document.getElementById('skinPropShadowColor').value = el.shadowColor || '#000000';
    document.getElementById('skinPropAction').value = el.action || 'none'; window.buildActionTargetOptions(el.action, el.target);
};

window.buildActionTargetOptions = function(actionType, currentTarget) { 
    const container = document.getElementById('skinActionTargetContainer'); const groupWrapper = document.getElementById('groupSkinActionTarget'); 
    if(!container || !groupWrapper) return; if (actionType === 'none') { groupWrapper.style.display = 'none'; return; } groupWrapper.style.display = 'block'; 
    if (actionType === 'url') { container.innerHTML = `<input type="text" id="skinPropTargetInput" class="form-control" placeholder="https://..." value="${currentTarget || ''}">`; } 
    else if (actionType === 'scene') { let options = window.scenes.map(s => `<option value="${s.id}" ${currentTarget === s.id ? 'selected' : ''}>${s.title}</option>`).join(''); container.innerHTML = `<select id="skinPropTargetInput" class="form-control">${options}</select>`; } 
    else if (actionType === 'video') { let options = window.mediaVideo360.map(v => `<option value="${v.id}" ${currentTarget === v.id ? 'selected' : ''}>${v.title}</option>`).join(''); container.innerHTML = `<select id="skinPropTargetInput" class="form-control">${options}</select>`; } 
    document.getElementById('skinPropTargetInput')?.addEventListener('change', (e) => { window.saveElementStateToConfig(window.activeSkinElementId, 'target', e.target.value); }); 
};

/* --- SHORTCUT SKIN & INTERACT --- */
let copiedSkinElement = null;
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (document.getElementById('workspace-skin')?.style.display !== 'flex') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && window.activeSkinElementId) { copiedSkinElement = JSON.parse(JSON.stringify(window.skinConfig.uiElements.find(el => el.id === window.activeSkinElementId))); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && copiedSkinElement) { let newEl = JSON.parse(JSON.stringify(copiedSkinElement)); newEl.id = 'ui_' + Date.now(); newEl.left += 2; newEl.top += 2; window.skinConfig.uiElements.push(newEl); window.renderSkinElements(); window.selectSkinElement(newEl.id); if(typeof window.saveHistoryState === 'function') window.saveHistoryState(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && window.activeSkinElementId) { window.deleteSkinElement(window.activeSkinElementId); }
});

if (typeof interact !== 'undefined') {
    interact('.skin-el').draggable({ ignoreFrom: '[contenteditable="true"]', modifiers: [ interact.modifiers.restrictRect({ restriction: 'parent' }) ], listeners: { move(event) { const target = event.target; const parent = target.parentElement; const scale = parseFloat(parent.getAttribute('data-scale')) || 1; const dx = event.dx / scale; const dy = event.dy / scale; const leftPx = (parseFloat(target.style.left) || 0) / 100 * parent.clientWidth; const topPx = (parseFloat(target.style.top) || 0) / 100 * parent.clientHeight; const newLeftPct = ((leftPx + dx) / parent.clientWidth) * 100; const newTopPct = ((topPx + dy) / parent.clientHeight) * 100; target.style.left = `${newLeftPct}%`; target.style.top = `${newTopPct}%`; window.saveElementStateToConfig(target.id, 'left', newLeftPct); window.saveElementStateToConfig(target.id, 'top', newTopPct); }, end() { if(typeof window.saveHistoryState === 'function') window.saveHistoryState(); } } }).resizable({ ignoreFrom: '[contenteditable="true"]', edges: { left: true, right: true, bottom: true, top: true }, modifiers: [ interact.modifiers.restrictEdges({ outer: 'parent' }) ], listeners: { move(event) { const target = event.target; const parent = target.parentElement; const scale = parseFloat(parent.getAttribute('data-scale')) || 1; let dw = event.deltaRect.width / scale; let dh = event.deltaRect.height / scale; let dLeft = event.deltaRect.left / scale; let dTop = event.deltaRect.top / scale; const currentLeftPx = (parseFloat(target.style.left) || 0) / 100 * parent.clientWidth; const currentTopPx = (parseFloat(target.style.top) || 0) / 100 * parent.clientHeight; const widthPct = (((parseFloat(target.style.width)||0)/100*parent.clientWidth + dw)/parent.clientWidth)*100; const heightPct = (((parseFloat(target.style.height)||0)/100*parent.clientHeight + dh)/parent.clientHeight)*100; const newLeftPct = ((currentLeftPx + dLeft)/parent.clientWidth)*100; const newTopPct = ((currentTopPx + dTop)/parent.clientHeight)*100; target.style.width = `${widthPct}%`; target.style.height = `${heightPct}%`; target.style.left = `${newLeftPct}%`; target.style.top = `${newTopPct}%`; window.saveElementStateToConfig(target.id, 'width', widthPct); window.saveElementStateToConfig(target.id, 'height', heightPct); window.saveElementStateToConfig(target.id, 'left', newLeftPct); window.saveElementStateToConfig(target.id, 'top', newTopPct); if(window.activeSkinElementId === target.id) { document.getElementById('skinPropWidth').value = widthPct.toFixed(2); document.getElementById('skinPropHeight').value = heightPct.toFixed(2); } }, end() { if(typeof window.saveHistoryState === 'function') window.saveHistoryState(); } } });
}