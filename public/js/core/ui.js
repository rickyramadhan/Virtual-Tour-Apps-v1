// =========================================================================
// FILE: public/js/core/ui.js
// =========================================================================
window.showToast = function(message, type = 'normal') { 
    const container = document.getElementById('toastContainer'); if(!container) return; 
    const toast = document.createElement('div'); toast.className = 'toast'; 
    if (type === 'error') toast.style.borderLeftColor = 'var(--danger)'; 
    if (type === 'success') toast.style.borderLeftColor = 'var(--success)'; 
    toast.innerText = message; container.appendChild(toast); 
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000); 
};

const themeToggleBtn = document.getElementById('themeToggleBtn'); 
const themeIcon = document.getElementById('themeIcon');
const savedTheme = localStorage.getItem('govirtual_theme') || 'dark';
if (savedTheme === 'light') { document.body.classList.add('light-mode'); if(themeIcon) themeIcon.innerText = '🌙'; }
themeToggleBtn?.addEventListener('click', () => { 
    document.body.classList.toggle('light-mode'); 
    const isLight = document.body.classList.contains('light-mode'); 
    localStorage.setItem('govirtual_theme', isLight ? 'light' : 'dark'); 
    if(themeIcon) themeIcon.innerText = isLight ? '🌙' : '☀️'; 
});

window.switchWorkspace = function(activeMenu, activeWorkId) { 
    const menus = ['menu-hotspot', 'menu-intro', 'menu-skin', 'menu-video360', 'menu-settings'];
    const works = ['workspace-hotspot', 'workspace-intro', 'workspace-skin', 'workspace-video360', 'workspace-settings'];
    menus.forEach(m => document.getElementById(m)?.classList.remove('active'));
    works.forEach(w => { const el = document.getElementById(w); if(el) el.style.display = 'none'; });
    
    if(activeMenu) activeMenu.classList.add('active'); 
    const activeWork = document.getElementById(activeWorkId);
    if(activeWork) {
        if(activeWorkId === 'workspace-skin') {
            activeWork.style.display = 'flex'; if(typeof window.initSkinCanvas === 'function') window.initSkinCanvas();
        } else {
            activeWork.style.display = 'flex';
        }
    }
};

document.getElementById('menu-hotspot')?.addEventListener('click', function(e) { e.preventDefault(); window.switchWorkspace(this, 'workspace-hotspot'); }); 
document.getElementById('menu-intro')?.addEventListener('click', function(e) { e.preventDefault(); window.switchWorkspace(this, 'workspace-intro'); }); 
document.getElementById('menu-skin')?.addEventListener('click', function(e) { e.preventDefault(); window.switchWorkspace(this, 'workspace-skin'); }); 
document.getElementById('menu-video360')?.addEventListener('click', function(e) { e.preventDefault(); window.switchWorkspace(this, 'workspace-video360'); }); 
document.getElementById('menu-settings')?.addEventListener('click', function(e) { e.preventDefault(); window.switchWorkspace(this, 'workspace-settings'); });

document.querySelectorAll('.panel-tabs .tab-btn').forEach(btn => { 
    btn.addEventListener('click', () => { 
        const parentTabs = btn.closest('.panel-tabs'); if (!parentTabs) return;
        parentTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const container = btn.closest('.panel-right') || btn.closest('.props-panel-wrapper') || btn.closest('.workspace');
        if(container) {
             let paneId = btn.getAttribute('data-tab');
             if (!paneId.startsWith('tab-')) { paneId = 'tab-' + paneId; } 
             const pane = container.querySelector('#' + paneId) || document.getElementById(paneId);
             if(pane) {
                 const siblings = pane.parentElement.children;
                 for (let i = 0; i < siblings.length; i++) {
                     if(siblings[i].classList.contains('tab-pane')) {
                         siblings[i].classList.remove('active'); siblings[i].style.display = 'none';
                     }
                 }
                 pane.classList.add('active');
                 pane.style.display = (paneId === 'tab-skin-layers' || paneId === 'tab-skin-custom' || paneId === 'tab-hotspots') ? 'flex' : 'block';
                 if (paneId === 'tab-skin-custom' && typeof window.resizeSkinCanvas === 'function') {
                     setTimeout(() => { window.resizeSkinCanvas(); }, 50);
                 }
             }
        }
    }); 
});

document.getElementById('btnCancelModal')?.addEventListener('click', () => { document.getElementById('hotspotModal')?.classList.remove('active'); });