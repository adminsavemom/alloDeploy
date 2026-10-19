import { icons } from '../icons.js';
import { store } from '../state.js';
import { openCustomDomainModal } from './dashboard.js';

export function renderServiceDetail(container) {
  let service = store.getSelectedService();
  if (!service) {
    store.setView('dashboard');
    return;
  }

  let activeTab = store.selectedDetailTab || 'overview'; // 'overview' | 'env'
  if (!['overview', 'env'].includes(activeTab)) {
    activeTab = 'overview';
  }
  let isDevView = false;
  let envSearchQuery = '';
  let envOrder = 'creation'; // 'creation' | 'asc' | 'desc'
  let envBuildSecrets = 'standard'; // 'standard' | 'secret' | 'all'
  let revealedSecrets = new Set();

  let exactPagesUrl = '';
  let customSiteUrl = null;
  let openSiteUrl = '';

  function computeUrls() {
    exactPagesUrl = service.cloudflarePagesUrl && !service.cloudflarePagesUrl.includes('localhost')
      ? service.cloudflarePagesUrl
      : (service.url && !service.url.includes('localhost') && service.url.includes('.pages.dev')
          ? service.url
          : `https://${service.name}.pages.dev`);

    customSiteUrl = service.customDomain 
      ? (service.customDomain.startsWith('http') ? service.customDomain : `${service.protocol || 'https'}://${service.customDomain}${service.pathSuffix || ''}`)
      : null;

    openSiteUrl = customSiteUrl || exactPagesUrl;
  }

  function render() {
    computeUrls();
    const isRunning = service.status === 'running' || service.status === 'live';

    container.innerHTML = `
      <div class="detail-container">
        <!-- Coolify Breadcrumb Navigation -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <div class="detail-nav-back" id="btn-back-dashboard" style="display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: #a1a1aa; cursor: pointer;">
            ${icons.arrowLeft}
            <span>Back to Projects / ${service.name}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-faint);">
            <span style="font-family: var(--font-mono);">UUID: ${service.id}</span>
            <span>•</span>
            <span class="coolify-chip ${isRunning ? 'chip-running' : 'chip-stopped'}">
              <span class="coolify-dot ${isRunning ? 'dot-running' : 'dot-stopped'}"></span>
              ${isRunning ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>
        </div>

        <!-- Coolify Resource Header -->
        <div class="detail-header" style="background: #090d16; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 22px 26px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div class="detail-title-group" style="display: flex; align-items: center; gap: 16px;">
            <div class="service-icon-box" style="width: 48px; height: 48px; background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #a78bfa;">
              ${service.type === 'Database' ? icons.database : (service.type === 'Service' ? icons.cube : icons.server)}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <h1 style="font-size: 22px; font-weight: 700; color: #f4f4f5; margin: 0;">${service.name}</h1>
                <span class="badge badge-tag" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 11px;">
                  ${service.type || 'Application'}
                </span>
                <span class="badge badge-tag" style="background: rgba(16, 185, 129, 0.12); color: #6ee7b7; font-size: 11px;">
                  ${service.framework || 'React / Vite'}
                </span>
              </div>

              <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px; font-size: 13px; color: #a1a1aa; flex-wrap: wrap;">
                <a href="${exactPagesUrl}" target="_blank" rel="noopener noreferrer" style="color: #a78bfa; font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 4px; text-decoration: none;" title="${exactPagesUrl}">
                  ${exactPagesUrl} ${icons.externalLink}
                </a>
                ${service.customDomain ? `
                  <span>•</span>
                  <a href="${customSiteUrl}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 4px; text-decoration: none;" title="Custom domain: ${customSiteUrl}">
                    🌐 ${service.customDomain} (${service.customDomainStatus === 'active' ? 'SSL Active' : 'Active'})
                  </a>
                ` : ''}
                <span>•</span>
                <span>${service.region || 'Self-Hosted Server'}</span>
                <span>•</span>
                <span>Updated ${service.updatedAt || 'Recently'}</span>
              </div>
            </div>
          </div>

          <!-- Coolify Resource Control Action Buttons (Stop, Restart, Redeploy, Deploy Files, Env, Config, Delete, Open Site) -->
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${isRunning ? `
              <button class="btn btn-secondary btn-sm" id="btn-detail-stop" style="color: #fca5a5; border-color: rgba(239, 68, 68, 0.3);">
                ${icons.pause} Stop
              </button>
            ` : `
              <button class="btn btn-primary btn-sm" id="btn-detail-start" style="background: #10b981; border-color: #059669;">
                ${icons.play} Start
              </button>
            `}

            <button class="btn btn-secondary btn-sm" id="btn-detail-restart" title="Restart Resource">
              ${icons.refresh} Restart
            </button>

            <button class="btn btn-secondary btn-sm" id="btn-detail-redeploy" title="Redeploy Container">
              ${icons.zap} Redeploy
            </button>

            <button class="btn btn-secondary btn-sm" id="btn-detail-upload" title="Deploy or upload new web page files directly into this project" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); display: inline-flex; align-items: center; gap: 6px;">
              ${icons.cloudUpload || '⬆️'} Deploy Files
            </button>

            <button class="btn btn-secondary btn-sm" id="btn-detail-env" title="Environment Variables" style="color: #c084fc; border-color: rgba(192, 132, 252, 0.35);">
              Env
            </button>


            <button class="btn btn-secondary btn-sm" id="btn-detail-delete" title="Delete Resource" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.35);">
              ${icons.trash || '🗑️'} Delete
            </button>

            ${isRunning ? `
              <a href="${exactPagesUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; background: #7c3aed; text-decoration: none;" title="Open live web page on Pages.dev (${exactPagesUrl})">
                ${icons.externalLink} Open Site
              </a>
            <button class="btn btn-secondary btn-sm btn-open-custom-domain-modal" data-id="${service.id}" style="display: inline-flex; align-items: center; gap: 6px; border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;" title="Configure & Edit Custom Domain">
              🌐 Edit Custom Domain
            </button>
            ` : `
              <button class="btn btn-secondary btn-sm" disabled style="opacity: 0.6; cursor: not-allowed; display: inline-flex; align-items: center; gap: 6px;">
                ⏹ Site Stopped
              </button>
            `}
          </div>
        </div>

        <!-- Coolify Detail Tabs Navigation -->
        <div class="detail-tabs-nav" style="display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 22px;">
          <button class="detail-tab-item ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">General</button>
          <button class="detail-tab-item ${activeTab === 'env' ? 'active' : ''}" data-tab="env">Environment Variables (${service.envVars ? service.envVars.length : 0})</button>
        </div>

        <!-- Tab Body -->
        <div class="detail-tab-body">
          ${activeTab === 'overview' ? renderOverviewTab() : ''}
          ${activeTab === 'env' ? renderEnvTab() : ''}
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderOverviewTab() {
    return `
      <!-- Network and Destination Details -->
      <div class="config-grid">
        <div class="metric-card" style="padding: 20px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; color: #f4f4f5;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${icons.globe} Proxy & Domain Settings
            </div>
            <button class="btn btn-secondary btn-xs btn-open-custom-domain-modal" data-id="${service.id}" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; font-size: 11px;">
              ${icons.edit || '✏️'} Edit Custom Domain
            </button>
          </div>
          <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--text-faint);">Cloudflare Pages URL</span>
              <a href="${exactPagesUrl}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; font-family: var(--font-mono); text-decoration: none;">${exactPagesUrl}</a>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--text-faint);">Custom Domain</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #cbd5e1; font-family: var(--font-mono); font-weight: 600;">${service.customDomain || service.liveDomain || 'Not set'}</span>
                ${service.customDomain ? `
                  <span class="badge" style="background: rgba(34,197,94,0.18); color: #22c55e; border: 1px solid rgba(34,197,94,0.35); font-size: 9.5px; padding: 1px 6px;">● Active</span>
                ` : ''}
                <button class="btn btn-secondary btn-xs btn-open-custom-domain-modal" data-id="${service.id}" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.35); padding: 1px 7px; font-size: 10.5px;">
                  Edit
                </button>
              </div>
            </div>
            ${service.customDomain || service.cloudflareProxied ? `
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <span style="color: var(--text-faint);">Cloudflare Edge Proxy</span>
                <span style="display: inline-flex; align-items: center; gap: 6px; color: #f6821f; font-weight: 600; font-size: 12px;">
                  ☁️ ${service.cloudflareProxied !== false ? 'Active (Orange Cloud)' : 'DNS Only (Grey Cloud)'}
                </span>
              </div>
            ` : ''}
            ${service.customOriginServer ? `
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <span style="color: var(--text-faint);">Custom Origin Server</span>
                <span style="color: #c084fc; font-family: var(--font-mono); font-weight: 600;">⚡ ${service.customOriginServer}</span>
              </div>
            ` : ''}
            ${service.customOriginSni ? `
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <span style="color: var(--text-faint);">Custom Origin SNI</span>
                <span style="color: #38bdf8; font-family: var(--font-mono);">${service.customOriginSni}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--text-faint);">Host Engine</span>
              <span style="color: #cbd5e1;">Docker Engine (Standalone)</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--text-faint);">Restart Policy</span>
              <span style="color: #34d399;">unless-stopped</span>
            </div>
          </div>
        </div>

        <div class="metric-card" style="padding: 20px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; color: #f4f4f5;">
            ${icons.cpu} Build & Environment Specs
          </div>
          <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--text-faint);">Deployment Source</span>
              <span style="color: #cbd5e1;">${service.source || 'Local Upload'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--text-faint);">Framework / Engine</span>
              <span style="color: #cbd5e1;">${service.framework || 'Node.js / Docker'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--text-faint);">Bundle / Disk Size</span>
              <span style="color: #cbd5e1;">${service.size || '1.8 MB'}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--text-faint);">Created</span>
              <span style="color: #cbd5e1;">${service.createdAt || '2026-10-12'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEnvTab() {
    let envVars = service.envVars || [];

    // Filter by search query
    if (envSearchQuery) {
      const q = envSearchQuery.toLowerCase();
      envVars = envVars.filter(e => (e.key && e.key.toLowerCase().includes(q)) || (e.value && String(e.value).toLowerCase().includes(q)));
    }

    // Filter by build secrets dropdown
    if (envBuildSecrets === 'secret') {
      envVars = envVars.filter(e => e.isBuildSecret);
    }

    // Apply ordering
    if (envOrder === 'asc') {
      envVars.sort((a, b) => (a.key || '').localeCompare(b.key || ''));
    } else if (envOrder === 'desc') {
      envVars.sort((a, b) => (b.key || '').localeCompare(a.key || ''));
    }

    const rawEnvText = (service.envVars || []).map(e => `${e.key}=${e.value || ''}`).join('\n');

    return `
      <div class="custom-env-panel">
        <!-- Topbar: Tab underline on left, Developer View on right -->
        <div class="custom-env-topbar">
          <div class="custom-env-tab-link">Environment variables</div>
          <button type="button" class="btn-dev-view-toggle ${isDevView ? 'active' : ''}" id="btn-toggle-dev-view">
            ${isDevView ? 'Simple View' : 'Developer View'}
          </button>
        </div>

        <!-- Subbar: Environment variable order & Build secrets -->
        <div class="custom-env-subbar">
          <div class="env-dropdown-group">
            <label class="env-dropdown-label">
              Environment variable order
              <span class="domain-info-icon" title="Choose the sorting criteria for environment variables">ⓘ</span>
            </label>
            <select id="env-order-select" class="env-dropdown-select">
              <option value="creation" ${envOrder === 'creation' ? 'selected' : ''}>Creation order</option>
              <option value="asc" ${envOrder === 'asc' ? 'selected' : ''}>Alphabetical (A-Z)</option>
              <option value="desc" ${envOrder === 'desc' ? 'selected' : ''}>Alphabetical (Z-A)</option>
            </select>
          </div>

          <div class="env-dropdown-group">
            <label class="env-dropdown-label">
              Build secrets
              <span class="domain-info-icon" title="Configure how build-time arguments and secrets are passed to build containers">ⓘ</span>
            </label>
            <select id="env-build-secrets-select" class="env-dropdown-select">
              <option value="standard" ${envBuildSecrets === 'standard' ? 'selected' : ''}>Standard build arguments</option>
              <option value="secret" ${envBuildSecrets === 'secret' ? 'selected' : ''}>Secret build arguments</option>
              <option value="all" ${envBuildSecrets === 'all' ? 'selected' : ''}>All runtime & build</option>
            </select>
          </div>
        </div>

        <!-- Action Row: Search input on left, Filter, Sort, + Add on right -->
        <div class="custom-env-action-row">
          <div class="env-search-wrapper">
            <span class="env-search-icon">🔍</span>
            <input 
              type="text" 
              id="env-search-input" 
              class="env-search-input" 
              placeholder="Search environment variables" 
              value="${envSearchQuery}" 
            />
          </div>

          <div class="env-action-buttons">
            <button type="button" class="btn-env-filter" id="btn-env-filter" title="Toggle Secret Filter">
              <span style="display: flex; align-items: center;">${icons.filter || '⚲'}</span>
              <span>Filter</span>
            </button>
            <button type="button" class="btn-env-sort" id="btn-env-sort" title="Toggle Sort Order">
              <span style="display: flex; align-items: center;">${icons.arrowUpDown || '↓↑'}</span>
              <span>Sort</span>
            </button>
            <button type="button" class="btn-env-add" id="btn-add-env-var">
              <span>+</span> Add
            </button>
          </div>
        </div>

        <!-- Content Area: Developer View (.env) or UI View (Cards) -->
        ${isDevView ? `
          <div class="env-dev-editor-wrap">
            <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 4px;">
              Developer Raw <code>.env</code> Editor (bulk paste or edit variables):
            </div>
            <textarea id="env-dev-raw-text" class="env-dev-textarea" placeholder="PORT=5000\nNODE_ENV=production\nDATABASE_URL=postgres://...">${rawEnvText}</textarea>
          </div>
        ` : `
          <div class="env-list-body" id="env-vars-container">
            ${envVars.length === 0 ? `
              <div style="text-align: center; padding: 36px 16px; color: #71717a; font-size: 13px;">
                ${envSearchQuery ? 'No environment variables match your search query.' : 'No custom environment variables defined yet. Click <strong>"+ Add"</strong> above or switch to <strong>"Developer View"</strong>.'}
              </div>
            ` : envVars.map((env, i) => {
              const isRevealed = revealedSecrets.has(env.key);
              return `
                <div class="env-item-row" data-index="${i}">
                  <input 
                    type="text" 
                    class="env-key-field" 
                    value="${env.key}" 
                    placeholder="KEY" 
                    spellcheck="false" 
                  />
                  <div class="env-val-field-wrapper">
                    <input 
                      type="${isRevealed ? 'text' : 'password'}" 
                      class="env-val-field" 
                      value="${env.value || ''}" 
                      placeholder="VALUE" 
                      spellcheck="false" 
                    />
                    <button type="button" class="btn-env-toggle-eye" data-key="${env.key}" title="${isRevealed ? 'Hide secret' : 'Show secret'}">
                      ${isRevealed ? icons.eyeOff : icons.eye}
                    </button>
                  </div>
                  <div class="env-badges-wrap">
                    <label class="env-checkbox-label" title="Inject into Docker / Cloudflare build phase">
                      <input type="checkbox" class="env-build-checkbox" ${env.isBuildSecret ? 'checked' : ''} />
                      <span>Build secret</span>
                    </label>
                    <button type="button" class="icon-btn btn-sm btn-copy-single-env" data-key="${env.key}" title="Copy KEY=VALUE">
                      ${icons.copy}
                    </button>
                    <button type="button" class="icon-btn btn-sm btn-remove-env" data-index="${i}" title="Delete variable" style="color: #ef4444;">
                      ${icons.trash}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}

        <!-- Footer Bar with Save Button -->
        <div class="custom-env-footer">
          <div style="font-size: 12px; color: #71717a;">
            Variables are securely encrypted and injected at runtime via AlloDeploy API.
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btn-save-env-vars" style="background: #7c3aed; font-weight: 600; padding: 8px 22px;">
            Save Environment Variables
          </button>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    // Back to dashboard
    container.querySelector('#btn-back-dashboard')?.addEventListener('click', () => {
      store.setView('dashboard');
    });

    // Control buttons in header
    container.querySelector('#btn-detail-stop')?.addEventListener('click', () => {
      store.stopService(service.id);
      render();
    });

    container.querySelector('#btn-detail-start')?.addEventListener('click', () => {
      store.startService(service.id);
      render();
    });

    container.querySelector('#btn-detail-restart')?.addEventListener('click', () => {
      store.restartService(service.id);
      render();
    });

    container.querySelector('#btn-detail-upload')?.addEventListener('click', () => {
      store.openDeployModalWithService(service.name);
    });

    container.querySelector('#btn-detail-redeploy')?.addEventListener('click', () => {
      store.redeployService(service.id);
      render();
    });

    container.querySelector('#btn-detail-delete')?.addEventListener('click', () => {
      if (confirm(`Are you sure you want to permanently delete resource "${service.name}"?`)) {
        store.deleteService(service.id);
      }
    });

    // Env & Config quick buttons in header
    container.querySelector('#btn-detail-env')?.addEventListener('click', () => {
      activeTab = 'env';
      store.selectedDetailTab = 'env';
      render();
    });


    // Custom Domain modal triggers
    container.querySelectorAll('.btn-open-custom-domain-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id') || service.id;
        openCustomDomainModal(id);
      });
    });

    // Tab switcher
    container.querySelectorAll('.detail-tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.getAttribute('data-tab');
        store.selectedDetailTab = activeTab;
        render();
      });
    });

    // Logs actions
    container.querySelector('#btn-refresh-tab-logs')?.addEventListener('click', async () => {
      const logs = await fetchRealLogs();
      const logBox = container.querySelector('#detail-log-stream');
      if (logBox && logs.length > 0) {
        logBox.innerHTML = logs.map(l => `<div class="log-line">${l}</div>`).join('');
      }
      store.showToast('Container logs refreshed.', 'info');
    });

    container.querySelector('#btn-copy-tab-logs')?.addEventListener('click', () => {
      const logBox = container.querySelector('#detail-log-stream');
      if (logBox) {
        navigator.clipboard.writeText(logBox.innerText);
        store.showToast('Container logs copied to clipboard!', 'info');
      }
    });

    container.querySelector('#btn-clear-tab-logs')?.addEventListener('click', () => {
      const logBox = container.querySelector('#detail-log-stream');
      if (logBox) {
        logBox.innerHTML = '<div class="log-line"><span style="color: #71717a;">Log display cleared.</span></div>';
        store.showToast('Log stream cleared.', 'info');
      }
    });

    // Custom Environment Variables Actions
    container.querySelector('#btn-toggle-dev-view')?.addEventListener('click', () => {
      isDevView = !isDevView;
      render();
    });

    container.querySelector('#env-order-select')?.addEventListener('change', (e) => {
      envOrder = e.target.value;
      render();
    });

    container.querySelector('#env-build-secrets-select')?.addEventListener('change', (e) => {
      envBuildSecrets = e.target.value;
      render();
    });

    container.querySelector('#env-search-input')?.addEventListener('input', (e) => {
      envSearchQuery = e.target.value.trim();
      render();
      const input = container.querySelector('#env-search-input');
      if (input) {
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
      }
    });

    container.querySelector('#btn-env-sort')?.addEventListener('click', () => {
      if (envOrder === 'creation') envOrder = 'asc';
      else if (envOrder === 'asc') envOrder = 'desc';
      else envOrder = 'creation';
      render();
    });

    container.querySelector('#btn-env-filter')?.addEventListener('click', () => {
      if (envBuildSecrets === 'standard') envBuildSecrets = 'secret';
      else if (envBuildSecrets === 'secret') envBuildSecrets = 'all';
      else envBuildSecrets = 'standard';
      render();
    });

    container.querySelector('#btn-add-env-var')?.addEventListener('click', () => {
      if (!service.envVars) service.envVars = [];
      const newVarName = `VARIABLE_${(service.envVars.length + 1).toString().padStart(2, '0')}`;
      service.envVars.push({ key: newVarName, value: '', isSecret: false, isBuildSecret: false });
      if (isDevView) isDevView = false;
      render();
    });

    container.querySelectorAll('.btn-remove-env').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (service.envVars && service.envVars[idx] !== undefined) {
          service.envVars.splice(idx, 1);
          render();
        }
      });
    });

    container.querySelectorAll('.btn-env-toggle-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        if (revealedSecrets.has(key)) {
          revealedSecrets.delete(key);
        } else {
          revealedSecrets.add(key);
        }
        render();
      });
    });

    container.querySelectorAll('.btn-copy-single-env').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        const ev = (service.envVars || []).find(e => e.key === key);
        if (ev) {
          navigator.clipboard.writeText(`${ev.key}=${ev.value || ''}`).then(() => {
            store.showToast(`Copied ${ev.key} to clipboard!`, 'success');
          });
        }
      });
    });

    container.querySelector('#btn-save-env-vars')?.addEventListener('click', async () => {
      if (isDevView) {
        const rawEnv = container.querySelector('#env-dev-raw-text')?.value || '';
        await store.saveServiceEnv(service.id, { rawEnv, order: envOrder, buildSecrets: envBuildSecrets });
      } else {
        const rows = container.querySelectorAll('.env-item-row');
        const updatedVars = [];
        rows.forEach(r => {
          const key = r.querySelector('.env-key-field')?.value.trim().toUpperCase();
          const value = r.querySelector('.env-val-field')?.value || '';
          const isBuildSecret = r.querySelector('.env-build-checkbox')?.checked || false;
          if (key) {
            updatedVars.push({ key, value, isSecret: false, isBuildSecret });
          }
        });
        service.envVars = updatedVars;
        await store.saveServiceEnv(service.id, { envVars: updatedVars, order: envOrder, buildSecrets: envBuildSecrets });
      }
      render();
    });
  }

  render();
}
