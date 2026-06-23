// =========================================================================
// FILE: public/js/core/state.js
// =========================================================================
window.scenes = []; 
window.mediaVideo360 = []; 
window.currentSceneId = null; 
window.viewer = null; 
window.markersPlugin = null; 
window.videoViewer = null;
window.activeTool = 'nav'; 
window.pendingCoords = { yaw: 0, pitch: 0 }; 
window.introVideo = { desktop: null, mobile: null };
window.skinConfig = { template: 'default', customDesktop: null, customMobile: null, uiElements: [] }; 
window.tourSettings = { autorotate: false, gallery: false, compass: false, resolution: false, map: false, navbar: true };
window.currentProjectName = null; 
window.firstSceneId = null; 
window.selectedSceneIds = []; 
window.lastClickedSceneId = null; 
window.currentFileHandle = null;
window.activeSkinElementId = null; 
window.activeHotspotIndex = null; 
window.isDraggingHs = false; 
window.dragHsIndex = null;
window.historyStack = []; 
window.historyIndex = -1;
window.autoSaveTimer = null;
window.isAutoSaving = false;

window.saveHistoryState = function() {
    if (window.historyIndex < window.historyStack.length - 1) {
        window.historyStack = window.historyStack.slice(0, window.historyIndex + 1);
    }
    const snap = { 
        skin: JSON.parse(JSON.stringify(window.skinConfig)), 
        scenes: JSON.parse(JSON.stringify(window.scenes)) 
    };
    window.historyStack.push(JSON.stringify(snap));
    if (window.historyStack.length > 50) window.historyStack.shift(); else window.historyIndex++;
    if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
};

window.undoHistory = function() {
    if (window.historyIndex > 0) {
        window.historyIndex--; 
        const snap = JSON.parse(window.historyStack[window.historyIndex]);
        window.skinConfig = snap.skin; window.scenes = snap.scenes;
        window.activeSkinElementId = null; window.activeHotspotIndex = null;
        document.getElementById('hotspotDetailForm')?.classList.add('d-none');
        if (typeof window.renderSkinElements === 'function') window.renderSkinElements(); 
        if (typeof window.updateSkinPropertiesPanel === 'function') window.updateSkinPropertiesPanel(); 
        if (window.currentSceneId && typeof window.loadSceneToViewer === 'function') window.loadSceneToViewer(window.currentSceneId);
        if (typeof window.showToast === 'function') window.showToast("Undo", "normal");
    }
};

window.redoHistory = function() {
    if (window.historyIndex < window.historyStack.length - 1) {
        window.historyIndex++; 
        const snap = JSON.parse(window.historyStack[window.historyIndex]);
        window.skinConfig = snap.skin; window.scenes = snap.scenes;
        window.activeSkinElementId = null; window.activeHotspotIndex = null;
        document.getElementById('hotspotDetailForm')?.classList.add('d-none');
        if (typeof window.renderSkinElements === 'function') window.renderSkinElements(); 
        if (typeof window.updateSkinPropertiesPanel === 'function') window.updateSkinPropertiesPanel(); 
        if (window.currentSceneId && typeof window.loadSceneToViewer === 'function') window.loadSceneToViewer(window.currentSceneId);
        if (typeof window.showToast === 'function') window.showToast("Redo", "normal");
    }
};

window.triggerAutoSave = function() {
    if (!window.currentFileHandle) return; 
    if (!document.title.includes('•')) document.title = `• GoVirtual - ${window.currentProjectName}`;
    if (window.autoSaveTimer) clearTimeout(window.autoSaveTimer);
    window.autoSaveTimer = setTimeout(async () => {
        if (window.isAutoSaving) return; window.isAutoSaving = true;
        try {
            if (typeof window.getApplicationState === 'function') {
                const stateData = window.getApplicationState();
                const jsonString = JSON.stringify(stateData, null, 2);
                const writable = await window.currentFileHandle.createWritable();
                await writable.write(jsonString); await writable.close();
                document.title = `GoVirtual - ${window.currentProjectName}`; 
            }
        } catch (err) { console.error(err); } finally { window.isAutoSaving = false; }
    }, 1500); 
};