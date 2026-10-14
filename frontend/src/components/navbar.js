import { icons } from '../icons.js';
import { store } from '../state.js';

export function renderNavbar(target) {
  const user = store.user;
  if (!user) return;

  const sidebarContainer = target?.sidebar || document.getElementById('coolify-sidebar-root') || target;
  const topbarContainer = target?.topbar || document.getElementById('coolify-topbar-root');

  const activeNav = store.activeNav || 'dashboard';
  const env = store.currentEnvironment || 'production';

  // 1. RENDER SIDEBAR (Matching Coolify v4.4.6 layout)
  if (sidebarContainer) {
    sidebarContainer.innerHTML = `
      <div class="coolify-brand-header">
        <div class="coolify-brand-badge" id="btn-sidebar-home" style="cursor: pointer;" title="alloDeploy v4.4.6">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="#7c3aed" />
            <path d="M7 8h10M7 12h10M7 16h6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <span class="coolify-title">alloDeploy</span>
        </div>
        <span class="coolify-version-tag">v4.4.6</span>
      </div>

      <div class="coolify-sidebar-search">
        <span style="color: #64748b; display: flex; align-items: center;">${icons.search}</span>
        <input type="text" id="global-search-input" placeholder="Search" />
        <span class="key-badge">Ctrl+K</span>
      </div>

      <div class="coolify-sidebar-nav">
        <div class="coolify-nav-section-title">Workspace</div>
        <button class="coolify-nav-item ${activeNav === 'projects' || activeNav === 'dashboard' ? 'active' : ''}" data-nav="projects">
          ${icons.layoutGrid}
          <span>Projects</span>
        </button>
      </div>

      <div class="coolify-sidebar-profile" id="user-profile-trigger">
        <div class="sidebar-avatar-circle">A</div>
        <div class="sidebar-user-text">
          <span class="sidebar-user-name">${user.name || 'Admin'}</span>
        </div>
        <div style="margin-left: auto; display: flex; align-items: center; gap: 6px; color: #64748b;">
          ${icons.chevronDown}
          <button id="btn-sidebar-logout" class="icon-btn-minimal" title="Sign Out">
            ${icons.logOut}
          </button>
        </div>
      </div>
    `;

    // Sidebar events
    sidebarContainer.querySelector('#btn-sidebar-home')?.addEventListener('click', () => {
      store.setNav('projects');
    });

    sidebarContainer.querySelectorAll('.coolify-nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const nav = e.currentTarget.dataset.nav;
        if (nav) {
          store.setNav(nav);
        }
      });
    });

    sidebarContainer.querySelector('#user-profile-trigger')?.addEventListener('click', (e) => {
      if (e.target.closest('#btn-sidebar-logout')) return;
      openEditProfileModal();
    });

    sidebarContainer.querySelector('#btn-sidebar-logout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      store.logout();
    });

    const searchInput = sidebarContainer.querySelector('#global-search-input');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = searchInput.value.trim().toLowerCase();
          if (!q) return;
          const found = store.services.find(s => s.name.toLowerCase().includes(q));
          if (found) {
            store.setView('service-detail', found.id);
            store.showToast(`Navigated to resource: ${found.name}`, 'info');
          } else {
            store.showToast(`No resource found matching "${q}".`, 'info');
          }
        }
      });
    }
  }

  // 2. RENDER TOPBAR
  if (topbarContainer) {
    const navTitles = {
      'projects': 'Projects'
    };

    topbarContainer.innerHTML = `
      <div class="coolify-topbar-breadcrumb">
        <span class="bc-root">Root Team</span>
        <span class="bc-sep">/</span>
        <span class="bc-active">${navTitles[activeNav] || 'Projects'}</span>
      </div>

      <div class="coolify-topbar-actions">
        <!-- New Web Project Deploy -->
        <button class="btn btn-coolify-primary btn-sm" id="btn-topbar-new-resource" title="Deploy New Web Project">
          ${icons.plus}
          <span>New Web Project Deploy</span>
        </button>
      </div>
    `;

    // Topbar bindings
    topbarContainer.querySelector('#btn-topbar-new-resource')?.addEventListener('click', () => {
      store.openDeployModal('drop');
    });
  }
}

function openEditProfileModal() {
  const existing = document.getElementById('edit-profile-modal-backdrop');
  if (existing) existing.remove();

  const user = store.user;
  if (!user) return;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'edit-profile-modal-backdrop';
  modal.innerHTML = `
    <div class="deploy-modal" style="max-width: 480px;">
      <div class="modal-header">
        <h2>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          Edit Profile & Administrator
        </h2>
        <button class="icon-btn" id="btn-close-edit-profile">${icons.close || '✕'}</button>
      </div>
      <div class="modal-body" style="gap: 16px;">
        <div class="form-group">
          <label class="form-label">Display Name / Full Name</label>
          <input type="text" id="edit-profile-name-input" class="auth-input" value="${user.name}" placeholder="e.g. Enterprise Admin" />
          <span style="font-size: 11.5px; color: var(--text-faint);">Administrator name displayed across projects.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Username / Handle</label>
          <div class="input-with-icon">
            <span style="position: absolute; left: 12px; color: var(--text-faint); font-family: var(--font-mono); font-size: 13px;">@</span>
            <input type="text" id="edit-profile-handle-input" class="auth-input" style="padding-left: 28px;" value="${user.handle || 'admin'}" placeholder="e.g. admin" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Account Email (Verified)</label>
          <input type="email" class="auth-input" value="${user.email}" readonly style="opacity: 0.7; cursor: not-allowed;" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm" id="btn-cancel-edit-profile">Cancel</button>
        <button class="btn btn-coolify-primary btn-sm" id="btn-save-edit-profile">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#btn-close-edit-profile').addEventListener('click', close);
  modal.querySelector('#btn-cancel-edit-profile').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelector('#btn-save-edit-profile').addEventListener('click', async () => {
    const nameVal = modal.querySelector('#edit-profile-name-input').value.trim();
    const handleVal = modal.querySelector('#edit-profile-handle-input').value.trim();
    if (!nameVal) {
      store.showToast('Please enter a display name.', 'error');
      return;
    }
    await store.updateProfile(nameVal, handleVal);
    close();
  });
}
