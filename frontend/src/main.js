import './style.css';
import { store } from './state.js';
import { renderAuth } from './components/auth.js';
import { renderNavbar } from './components/navbar.js';
import { renderDashboard } from './components/dashboard.js';
import { renderDeployModal } from './components/deployModal.js';
import { renderPreviewModal } from './components/previewModal.js';
import { renderServiceDetail } from './components/serviceDetail.js';
import { renderBackendModal } from './components/backendModal.js';
import { renderToasts } from './components/toast.js';

let currentLayoutState = null; // 'auth' | 'app'
let lastRenderedUserId = null;

function renderApp() {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;
  const modalContainer = document.getElementById('modal-container');
  const backendContainer = document.getElementById('backend-container');
  const previewContainer = document.getElementById('preview-container');
  const toastContainer = document.getElementById('toast-container');

  try {
    // If user is not authenticated, show Auth Page
    if (!store.user) {
      currentLayoutState = 'auth';
      lastRenderedUserId = null;
      appContainer.innerHTML = '<div id="auth-root"></div>';
      renderAuth(document.getElementById('auth-root'));
      if (modalContainer) modalContainer.innerHTML = '';
      if (backendContainer) backendContainer.innerHTML = '';
      if (previewContainer) previewContainer.innerHTML = '';
      if (toastContainer) renderToasts(toastContainer);
      return;
    }

    // If authenticated, construct full layout only if not already mounted (prevents full-page blinking)
    const existingLayout = document.getElementById('coolify-app-layout');
    const userChanged = lastRenderedUserId !== store.user.id;
    if (!existingLayout || currentLayoutState !== 'app' || userChanged) {
      currentLayoutState = 'app';
      lastRenderedUserId = store.user.id;
      appContainer.innerHTML = `
        <div id="coolify-app-layout" class="coolify-app-layout">
          <div id="coolify-main-col" class="coolify-main-col">
            <header id="coolify-topbar-root" class="coolify-topbar"></header>
            <main id="main-content" class="coolify-main-content"></main>
          </div>
        </div>
      `;
    }

    const topbarRoot = document.getElementById('coolify-topbar-root');
    if (topbarRoot) {
      renderNavbar({ topbar: topbarRoot });
    }

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      if (store.activeView === 'service-detail') {
        renderServiceDetail(mainContent);
      } else {
        renderDashboard(mainContent);
      }
    }

    // Modals and Toasts
    if (modalContainer) renderDeployModal(modalContainer);
    if (backendContainer) renderBackendModal(backendContainer);
    if (previewContainer) renderPreviewModal(previewContainer);
    if (toastContainer) renderToasts(toastContainer);
  } catch (err) {
    console.error('Fatal renderApp error:', err);
    appContainer.innerHTML = `
      <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #08090b; color: #fff; padding: 24px; font-family: -apple-system, sans-serif;">
        <div style="background: #14171f; border: 1px solid rgba(239,68,68,0.4); border-radius: 12px; padding: 28px; max-width: 520px; text-align: center;">
          <div style="margin-bottom: 16px; color: #ef4444; display: flex; justify-content: center;">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h2 style="margin: 0 0 8px; font-size: 18px;">Application Render Notice</h2>
          <p style="color: #94a3b8; font-size: 13.5px; margin-bottom: 20px;">${err.message || 'Error initializing alloDeploy layout.'}</p>
          <button onclick="localStorage.clear(); window.location.reload();" style="background: #7c3aed; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">
            Clear Cache & Reload
          </button>
        </div>
      </div>
    `;
  }
}

// Global hotkeys
window.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + K focuses search
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const searchInput = document.querySelector('#global-search-input');
    if (searchInput) searchInput.focus();
  }

  // Esc closes modals
  if (e.key === 'Escape') {
    if (store.isDeployModalOpen) store.closeDeployModal();
    if (store.isBackendModalOpen) store.closeBackendModal();
    if (store.isPreviewModalOpen) store.closePreview();
  }
});

// Window-level Drag & Drop detection for instant deployment
let dragCounter = 0;
const dragOverlay = document.getElementById('drag-overlay');

window.addEventListener('dragenter', (e) => {
  if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
    dragCounter++;
    if (dragOverlay) dragOverlay.style.display = 'flex';
  }
});

window.addEventListener('dragleave', (e) => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    if (dragOverlay) dragOverlay.style.display = 'none';
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
});

window.addEventListener('drop', (e) => {
  dragCounter = 0;
  if (dragOverlay) dragOverlay.style.display = 'none';
  e.preventDefault();

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    // If deploy modal isn't open, open it with drop tab
    if (!store.isDeployModalOpen) {
      store.openDeployModal('drop');
      // Pass dropped event after short tick so modal DOM exists
      setTimeout(() => {
        const dropzone = document.querySelector('#active-dropzone');
        if (dropzone) {
          const fakeDropEvent = new DragEvent('drop', {
            dataTransfer: e.dataTransfer,
            bubbles: true,
            cancelable: true
          });
          dropzone.dispatchEvent(fakeDropEvent);
        }
      }, 80);
    }
  }
});

// Subscribe to state updates
store.subscribe(() => {
  renderApp();
});

// Dedicated Toast listener (updates only toast-container, prevents UI blinking)
store.subscribeToasts(() => {
  const toastContainer = document.getElementById('toast-container');
  if (toastContainer) renderToasts(toastContainer);
});

// Initial boot
renderApp();
