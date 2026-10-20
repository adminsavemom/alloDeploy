import { icons } from '../icons.js';
import { store } from '../state.js';

export function renderNavbar(target) {
  const user = store.user;
  if (!user) return;

  const topbarContainer = target?.topbar || document.getElementById('coolify-topbar-root');
  const activeNav = store.activeNav || 'projects';

  if (topbarContainer) {
    const navTitles = {
      'projects': 'Projects'
    };

    topbarContainer.innerHTML = `
      <div style="display: flex; align-items: center; gap: 18px;">
        <div class="coolify-brand-badge" id="btn-topbar-home" style="cursor: pointer; display: flex; align-items: center; gap: 10px;" title="alloDeploy">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="#7c3aed" />
            <path d="M7 8h10M7 12h10M7 16h6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <span class="coolify-title" style="font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.02em;">alloDeploy</span>
        </div>

        <div class="coolify-topbar-breadcrumb" style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #64748b;">
          <span class="bc-root" style="color: #94a3b8; font-weight: 500;">Root Team</span>
          <span class="bc-sep">/</span>
          <span class="bc-active" style="color: #cbd5e1; font-weight: 600;">${navTitles[activeNav] || 'Projects'}</span>
        </div>
      </div>

      <div class="coolify-topbar-actions" style="display: flex; align-items: center; gap: 12px;">
        <!-- User Profile Avatar, Name, Chevron & Logout Details (Matching Pic 1) -->
        <div class="topbar-user-section" style="position: relative; display: flex; align-items: center; gap: 8px;">
          <div class="topbar-profile-trigger" id="topbar-user-profile-trigger" style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 5px 8px; border-radius: 6px; user-select: none; transition: background 0.15s;" title="Account Profile">
            <div class="sidebar-avatar-circle" style="width: 26px; height: 26px; border-radius: 50%; background: #27272a; color: #f4f4f5; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;">
              ${(user.name || 'A').charAt(0).toUpperCase()}
            </div>
            <span class="sidebar-user-name" style="font-size: 13.5px; font-weight: 700; color: #f4f4f5; letter-spacing: -0.01em;">
              ${user.name || 'Alex Smith'}
            </span>
            <span style="color: #64748b; display: flex; align-items: center; margin-left: 2px;">
              ${icons.chevronDown}
            </span>
          </div>

          <button id="btn-topbar-logout" class="icon-btn-minimal" title="Sign Out" style="color: #64748b; padding: 6px; border-radius: 4px; display: inline-flex; align-items: center; cursor: pointer; transition: color 0.15s; background: transparent; border: none;">
            ${icons.logOut}
          </button>

          <!-- Profile & Login / Logout Dropdown -->
          <div id="topbar-profile-dropdown" style="display: none; position: absolute; top: calc(100% + 8px); right: 0; min-width: 220px; padding: 8px; background: #121624; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); z-index: 1000;">
            <div style="padding: 6px 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 6px;">
              <div style="font-weight: 700; color: #f4f4f5; font-size: 13.5px;">${user.name || 'Alex Smith'}</div>
              <div style="font-size: 11.5px; color: #94a3b8; font-family: var(--font-mono); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${user.email || 'alex.smith@example.com'}</div>
              <div style="font-size: 11px; color: #a855f7; margin-top: 4px; font-weight: 500;">● ${user.role || 'DevOps / Owner'}</div>
            </div>

            <button type="button" class="cf-menu-item" id="btn-dropdown-edit-profile" style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; width: 100%; border: none; background: transparent; color: #cbd5e1; font-size: 12.5px; cursor: pointer; border-radius: 5px; text-align: left;">
              <span>👤</span>
              <span>Edit Profile & Account</span>
            </button>

            <button type="button" class="cf-menu-item" id="btn-dropdown-switch-account" style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; width: 100%; border: none; background: transparent; color: #cbd5e1; font-size: 12.5px; cursor: pointer; border-radius: 5px; text-align: left;">
              <span>🔑</span>
              <span>Switch Account / Login</span>
            </button>

            <div style="border-top: 1px solid rgba(255,255,255,0.06); margin: 6px 0;"></div>

            <button type="button" class="cf-menu-item" id="btn-dropdown-logout" style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; width: 100%; border: none; background: transparent; color: #ef4444; font-size: 12.5px; cursor: pointer; border-radius: 5px; text-align: left;">
              <span>🚪</span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    `;

    topbarContainer.querySelector('#btn-topbar-home')?.addEventListener('click', () => {
      store.setNav('projects');
      store.setView('dashboard');
    });

    const profileTrigger = topbarContainer.querySelector('#topbar-user-profile-trigger');
    const profileDropdown = topbarContainer.querySelector('#topbar-profile-dropdown');

    profileTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!profileDropdown) return;
      const isOpen = profileDropdown.style.display === 'block';
      profileDropdown.style.display = isOpen ? 'none' : 'block';
    });

    document.addEventListener('click', () => {
      if (profileDropdown && profileDropdown.style.display === 'block') {
        profileDropdown.style.display = 'none';
      }
    });

    topbarContainer.querySelector('#btn-dropdown-edit-profile')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (profileDropdown) profileDropdown.style.display = 'none';
      openEditProfileModal();
    });

    topbarContainer.querySelector('#btn-dropdown-switch-account')?.addEventListener('click', (e) => {
      e.stopPropagation();
      store.logout();
    });

    topbarContainer.querySelector('#btn-dropdown-logout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      store.logout();
    });

    topbarContainer.querySelector('#btn-topbar-logout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      store.logout();
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
