import { icons } from '../icons.js';
import { store } from '../state.js';
import { openCustomDomainModal, copyTextToClipboard } from './dashboard.js';

function timeAgo(dateInput) {
  if (!dateInput) return 'Recently';
  if (typeof dateInput === 'string' && (dateInput.includes('ago') || dateInput === 'Just now')) {
    return dateInput;
  }
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'a day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'a month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function renderServiceDetail(container) {
  let service = store.getSelectedService();
  if (!service) {
    store.setView('dashboard');
    return;
  }

  let activeTab = store.selectedDetailTab || 'deployments';
  if (!['deployments', 'domain', 'env', 'new-deploy'].includes(activeTab)) {
    activeTab = 'deployments';
  }

  let isDevView = false;
  let envSearchQuery = '';
  let envOrder = 'creation'; // 'creation' | 'asc' | 'desc'
  let envBuildSecrets = 'standard'; // 'standard' | 'secret' | 'all'
  let revealedSecrets = new Set();
  let openMenuIndex = null;

  let deployments = [];
  let isLoadingDeployments = false;
  let isDeploying = false;

  let exactPagesUrl = '';
  let customSiteUrl = null;

  function computeUrls() {
    exactPagesUrl = service.cloudflarePagesUrl && !service.cloudflarePagesUrl.includes('localhost')
      ? service.cloudflarePagesUrl
      : (service.url && !service.url.includes('localhost') && service.url.includes('.pages.dev')
          ? service.url
          : `https://${service.name}.pages.dev`);

    customSiteUrl = service.customDomain 
      ? (service.customDomain.startsWith('http') ? service.customDomain : `${service.protocol || 'https'}://${service.customDomain}${service.pathSuffix || ''}`)
      : null;
  }

  async function loadDeployments() {
    isLoadingDeployments = true;
    try {
      const data = await store.fetchServiceDeployments(service.id);
      if (Array.isArray(data) && data.length > 0) {
        deployments = data;
      } else {
        // Fall back to service deploys
        deployments = (service.deploys || []).map(d => ({
          id: d.id,
          shortId: d.hash || (d.id ? d.id.replace('dep-', '').substring(0, 8) : ''),
          environment: 'production',
          url: d.url || (d.hash ? `https://${d.hash}.${service.name}.pages.dev` : exactPagesUrl),
          branch: service.gitBranch || 'main',
          commitHash: d.hash || '',
          commitMessage: d.message || 'Deploy to Cloudflare Pages',
          createdOn: d.date || d.timestamp || 'Just now',
          status: 'success'
        }));
      }
    } catch (e) {
      console.warn('Error loading deployments:', e);
    } finally {
      isLoadingDeployments = false;
      render();
    }
  }

  function render() {
    service = store.getSelectedService() || service;
    computeUrls();
    const isRunning = service.status === 'running' || service.status === 'live';

    container.innerHTML = `
      <div class="detail-container">
        <!-- Breadcrumb Navigation -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <div class="detail-nav-back" id="btn-back-dashboard" style="display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: #a1a1aa; cursor: pointer;">
            ${icons.arrowLeft}
            <span>Back to Projects / ${service.name}</span>
          </div>

        </div>

        <!-- Resource Header (Clean Title, No Application/Framework Badges) -->
        <div class="detail-header" style="background: #090d16; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 22px 26px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div class="detail-title-group" style="display: flex; align-items: center; gap: 16px;">
            <div class="service-icon-box" style="width: 48px; height: 48px; background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #a78bfa;">
              ${service.type === 'Database' ? icons.database : (service.type === 'Service' ? icons.cube : icons.server)}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <h1 style="font-size: 22px; font-weight: 700; color: #f4f4f5; margin: 0;">${service.name}</h1>
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
                <span>Updated ${service.updatedAt || 'Recently'}</span>
              </div>
            </div>
          </div>

          <!-- Control Action Buttons (Stop, Restart, Redeploy, Delete - Clean without Open Site or Env/Deploy Files) -->
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

            <button class="btn btn-secondary btn-sm" id="btn-detail-redeploy" title="Redeploy Project Live" ${isDeploying ? 'disabled' : ''}>
              ${isDeploying ? `
                <span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.8s linear infinite; margin-right:6px;"></span> Redeploying...
              ` : `
                ${icons.zap} Redeploy
              `}
            </button>

            <button class="btn btn-secondary btn-sm" id="btn-detail-delete" title="Delete Resource" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.35);">
              ${icons.trash || '🗑️'} Delete
            </button>
          </div>
        </div>

        <!-- Cloudflare Pages Style Tabs Navigation Bar (Pic 1 Style) -->
        <div class="cf-tabs-container">
          <div class="cf-tabs-list">
            <button class="cf-tab-btn ${activeTab === 'deployments' ? 'active' : ''}" data-tab="deployments">Deployments</button>
            <button class="cf-tab-btn ${activeTab === 'domain' ? 'active' : ''}" data-tab="domain">Custom Domain</button>
            <button class="cf-tab-btn ${activeTab === 'env' ? 'active' : ''}" data-tab="env">Environment Variables ${service.envVars?.length ? `(${service.envVars.length})` : ''}</button>
            <button class="cf-tab-btn ${activeTab === 'new-deploy' ? 'active' : ''}" data-tab="new-deploy">New Deploy</button>
          </div>

          <button class="btn-cf-create-deploy" id="btn-create-deployment" title="Deploy new files or repository updates">
            <span style="font-size: 15px; display: inline-flex; align-items: center;">⬆</span>
            <span>Create deployment</span>
          </button>
        </div>

        <!-- Tab Body -->
        <div class="detail-tab-body">
          ${activeTab === 'deployments' ? renderDeploymentsTab() : ''}
          ${activeTab === 'domain' ? renderCustomDomainTab() : ''}
          ${activeTab === 'env' ? renderEnvTab() : ''}
          ${activeTab === 'new-deploy' ? renderNewDeployTab() : ''}
        </div>
      </div>
    `;

    bindEvents();
  }

  // =========================================================================
  // TAB 1: CLOUDFLARE PAGES STYLE DEPLOYMENTS (PIC 1 DESIGN)
  // =========================================================================
  function renderDeploymentsTab() {
    const list = deployments.length > 0 ? deployments : (service.deploys || []);
    const prodDeploy = list[0] || {
      shortId: '7fa7eda9',
      environment: 'production',
      branch: service.gitBranch || 'main',
      commitMessage: 'feat: add backend storage, server services, and storage configuration files',
      url: exactPagesUrl,
      createdOn: service.updatedAt || '19 hours ago'
    };

    return `
      <!-- Production Card -->
      <div class="cf-card">
        <div class="cf-card-header">
          <h2 class="cf-card-title">Production</h2>
          <div class="cf-card-sub">
            <span>Domains:</span>
            ${service.customDomain ? `
              <a href="${customSiteUrl}" target="_blank" rel="noopener noreferrer">${service.customDomain}</a><span>,</span>
            ` : ''}
            <a href="${exactPagesUrl}" target="_blank" rel="noopener noreferrer">${service.name}.pages.dev</a>
          </div>
        </div>

        <table class="cf-table">
          <thead>
            <tr>
              <th style="width: 140px;">Environment</th>
              <th style="width: 320px;">Source</th>
              <th>Deployment</th>
              <th style="width: 150px;">Status</th>
              <th style="width: 100px; text-align: right;"></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="cf-env-tag">
                  <div class="cf-env-indicator"></div>
                  <span>Production</span>
                </div>
              </td>
              <td>
                <div class="cf-source-wrap">
                  <div class="cf-source-branch">
                    <span style="display: inline-flex; align-items: center;">${icons.gitBranch || '⎇'}</span>
                    <span>${prodDeploy.branch || 'main'}</span>
                  </div>
                  <div class="cf-source-commit" title="${prodDeploy.commitMessage || 'feat: production update'}">
                    ${prodDeploy.commitMessage || 'feat: add backend storage, ser...'}
                  </div>
                </div>
              </td>
              <td>
                <a href="${prodDeploy.url || exactPagesUrl}" target="_blank" rel="noopener noreferrer" class="cf-deploy-url" title="${prodDeploy.url || exactPagesUrl}">
                  ${prodDeploy.url || exactPagesUrl}
                </a>
              </td>
              <td>
                <div class="cf-status-wrap">
                  <span class="cf-check-icon">✓</span>
                  <span class="cf-status-time">${timeAgo(prodDeploy.createdOn || prodDeploy.date)}</span>
                </div>
              </td>
              <td style="text-align: right;">
                <a href="${prodDeploy.url || exactPagesUrl}" target="_blank" rel="noopener noreferrer" class="cf-details-btn">
                  Details <span style="font-size: 11px;">↗</span>
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- All Deployments Card -->
      <div class="cf-card">
        <div class="cf-card-header" style="display: flex; align-items: center; justify-content: space-between;">
          <h2 class="cf-card-title">All deployments</h2>
          ${isLoadingDeployments ? `
            <span style="font-size: 12px; color: #a1a1aa; display: flex; align-items: center; gap: 6px;">
              <span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.8s linear infinite;"></span>
              Syncing Cloudflare...
            </span>
          ` : `
            <button class="btn btn-secondary btn-xs" id="btn-refresh-deployments" style="font-size: 11px; padding: 2px 8px; color: #94a3b8;">
              ${icons.refresh || '↻'} Refresh
            </button>
          `}
        </div>

        <table class="cf-table">
          <thead>
            <tr>
              <th style="width: 140px;">Environment</th>
              <th style="width: 320px;">Source</th>
              <th>Deployment</th>
              <th style="width: 150px;">Status</th>
              <th style="width: 90px; text-align: right;"></th>
              <th style="width: 50px; text-align: center;"></th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align: center; padding: 36px; color: #71717a;">
                  No deployments recorded yet. Click <strong>"Create deployment"</strong> above to launch your first build.
                </td>
              </tr>
            ` : list.map((dep, idx) => {
              const depUrl = dep.url || (dep.shortId ? `https://${dep.shortId}.${service.name}.pages.dev` : exactPagesUrl);
              const isProduction = (dep.environment || 'production').toLowerCase() === 'production';
              const isMenuOpen = openMenuIndex === idx;

              return `
                <tr>
                  <td>
                    <div class="cf-env-tag">
                      ${isProduction ? `<div class="cf-env-indicator"></div>` : `<div class="cf-env-indicator" style="background: #a855f7;"></div>`}
                      <span>${isProduction ? 'Production' : 'Preview'}</span>
                    </div>
                  </td>
                  <td>
                    <div class="cf-source-wrap">
                      <div class="cf-source-branch">
                        <span style="display: inline-flex; align-items: center;">${icons.gitBranch || '⎇'}</span>
                        <span>${dep.branch || 'main'}</span>
                      </div>
                      <div class="cf-source-commit" title="${dep.commitMessage || 'Deployment bundle update'}">
                        ${dep.commitMessage || 'feat: add backend storage, ser...'}
                      </div>
                    </div>
                  </td>
                  <td>
                    <a href="${depUrl}" target="_blank" rel="noopener noreferrer" class="cf-deploy-url" title="${depUrl}">
                      ${depUrl}
                    </a>
                  </td>
                  <td>
                    <div class="cf-status-wrap">
                      <span class="cf-check-icon">✓</span>
                      <span class="cf-status-time">${timeAgo(dep.createdOn || dep.date)}</span>
                    </div>
                  </td>
                  <td style="text-align: right;">
                    <a href="${depUrl}" target="_blank" rel="noopener noreferrer" class="cf-details-btn">
                      Details <span style="font-size: 11px;">↗</span>
                    </a>
                  </td>
                  <td style="text-align: center; position: relative;">
                    <button class="cf-dots-btn btn-toggle-dep-menu" data-index="${idx}" title="More options">···</button>
                    ${isMenuOpen ? `
                      <div class="cf-menu-dropdown">
                        <a href="${depUrl}" target="_blank" rel="noopener noreferrer" class="cf-menu-item">
                          <span>🌐</span>
                          <span>Visit Deployment</span>
                        </a>
                        <button type="button" class="cf-menu-item btn-copy-dep-url" data-url="${depUrl}">
                          <span>📋</span>
                          <span>Copy URL</span>
                        </button>
                        <button type="button" class="cf-menu-item btn-redeploy-row" data-id="${dep.id || service.id}">
                          <span>⚡</span>
                          <span>Redeploy this build</span>
                        </button>
                      </div>
                    ` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // =========================================================================
  // TAB 2: CUSTOM DOMAIN MANAGEMENT
  // =========================================================================
  function renderCustomDomainTab() {
    return `
      <div class="cf-card">
        <div class="cf-card-header" style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h2 class="cf-card-title">Custom Domains</h2>
            <p style="font-size: 12.5px; color: #94a3b8; margin-top: 4px; margin-bottom: 0;">
              Connect your apex domain or subdomain to route global edge traffic directly to Cloudflare Pages.
            </p>
          </div>
          <button class="btn btn-primary btn-sm btn-open-custom-domain-modal" data-id="${service.id}" style="background: #2563eb; border-color: #1d4ed8; display: inline-flex; align-items: center; gap: 6px;">
            <span>+</span> Add Custom Domain
          </button>
        </div>

        <div style="padding: 22px;">
          <!-- Active Domains List -->
          <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
            <!-- Primary Cloudflare Pages Domain -->
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px 18px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 20px;">🌐</span>
                <div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <a href="${exactPagesUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 14px; font-weight: 600; color: #f8fafc; font-family: var(--font-mono); text-decoration: none;">
                      ${service.name}.pages.dev
                    </a>
                    <span class="badge" style="background: rgba(34,197,94,0.18); color: #22c55e; border: 1px solid rgba(34,197,94,0.35); font-size: 10px; padding: 2px 7px;">
                      ● Default Pages Domain
                    </span>
                  </div>
                  <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                    Cloudflare Pages native edge hostname • Universal SSL Active
                  </div>
                </div>
              </div>

              <a href="${exactPagesUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs" style="color: #38bdf8; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                Visit <span style="font-size: 11px;">↗</span>
              </a>
            </div>

            <!-- Custom Domain (if set) -->
            ${service.customDomain ? `
              <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: 8px; padding: 14px 18px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 20px;">⚡</span>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <a href="${customSiteUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 14.5px; font-weight: 600; color: #38bdf8; font-family: var(--font-mono); text-decoration: none;">
                        ${service.customDomain}
                      </a>
                      <span class="badge" style="background: rgba(34,197,94,0.18); color: #22c55e; border: 1px solid rgba(34,197,94,0.4); font-size: 10px; padding: 2px 7px;">
                        ● Active & SSL Ready
                      </span>
                    </div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                      CNAME target: <code>${service.name}.pages.dev</code> • Edge Proxy Enabled
                    </div>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 8px;">
                  <button class="btn btn-secondary btn-sm btn-open-custom-domain-modal" data-id="${service.id}" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.35); font-size: 12px; padding: 5px 12px;">
                    Edit
                  </button>
                  <a href="${customSiteUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="color: #cbd5e1; text-decoration: none; font-size: 12px; padding: 5px 12px;">
                    Visit <span style="font-size: 11px;">↗</span>
                  </a>
                </div>
              </div>
            ` : `
              <div style="text-align: center; padding: 32px 16px; background: rgba(0,0,0,0.15); border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px;">
                <p style="color: #94a3b8; font-size: 13px; margin-bottom: 12px;">
                  No custom domain connected yet. You can bind any branded domain or subdomain (e.g. <code>app.mycompany.com</code>).
                </p>
                <button class="btn btn-primary btn-sm btn-open-custom-domain-modal" data-id="${service.id}" style="background: #2563eb; border-color: #1d4ed8;">
                  Connect Custom Domain
                </button>
              </div>
            `}
          </div>

          <!-- DNS Guidance Card -->
          <div style="background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 18px;">
            <div style="font-weight: 600; font-size: 13.5px; color: #f8fafc; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <span>📘</span> DNS Configuration Guide
            </div>
            <p style="font-size: 12.5px; color: #94a3b8; margin-bottom: 14px;">
              To connect an external domain, add the following CNAME record in your DNS provider (Cloudflare, Namecheap, GoDaddy, Route53, etc.):
            </p>
            <table class="cf-table" style="background: #0d1017; border-radius: 6px; overflow: hidden;">
              <thead>
                <tr>
                  <th style="padding: 8px 14px;">Type</th>
                  <th style="padding: 8px 14px;">Name</th>
                  <th style="padding: 8px 14px;">Target / Value</th>
                  <th style="padding: 8px 14px;">Proxy Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 10px 14px; font-weight: 600; color: #f59e0b;">CNAME</td>
                  <td style="padding: 10px 14px; font-family: var(--font-mono); color: #f8fafc;">${service.customDomain ? service.customDomain.split('.')[0] : 'app'}</td>
                  <td style="padding: 10px 14px; font-family: var(--font-mono); color: #38bdf8; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span>${service.name}.pages.dev</span>
                    <button type="button" class="btn btn-secondary btn-xs btn-copy-cname-table" data-cname="${service.name}.pages.dev" style="padding: 2px 8px; font-size: 11px; cursor: pointer;">Copy</button>
                  </td>
                  <td style="padding: 10px 14px; color: #f97316;">Proxied (Orange Cloud)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // TAB 3: ENVIRONMENT VARIABLES
  // =========================================================================
  function renderEnvTab() {
    let envVars = service.envVars || [];

    if (envSearchQuery) {
      const q = envSearchQuery.toLowerCase();
      envVars = envVars.filter(e => (e.key && e.key.toLowerCase().includes(q)) || (e.value && String(e.value).toLowerCase().includes(q)));
    }

    if (envBuildSecrets === 'secret') {
      envVars = envVars.filter(e => e.isBuildSecret);
    }

    if (envOrder === 'asc') {
      envVars.sort((a, b) => (a.key || '').localeCompare(b.key || ''));
    } else if (envOrder === 'desc') {
      envVars.sort((a, b) => (b.key || '').localeCompare(a.key || ''));
    }

    const rawEnvText = (service.envVars || []).map(e => `${e.key}=${e.value || ''}`).join('\n');

    return `
      <div class="custom-env-panel">
        <div class="custom-env-topbar">
          <div class="custom-env-tab-link">Environment variables</div>
          <button type="button" class="btn-dev-view-toggle ${isDevView ? 'active' : ''}" id="btn-toggle-dev-view">
            ${isDevView ? 'Simple View' : 'Developer View'}
          </button>
        </div>

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
                    <label class="env-checkbox-label" title="Inject into build and runtime phase">
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

        <div class="custom-env-footer">
          <div style="font-size: 12px; color: #71717a;">
            Variables are securely encrypted and injected into Cloudflare Pages build and runtime.
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btn-save-env-vars" style="background: #2563eb; font-weight: 600; padding: 8px 22px;">
            Save Environment Variables
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // TAB 4: NEW DEPLOY
  // =========================================================================
  function renderNewDeployTab() {
    return `
      <div class="cf-card">
        <div class="cf-card-header">
          <h2 class="cf-card-title">New Deployment for "${service.name}"</h2>
          <p style="font-size: 12.5px; color: #94a3b8; margin-top: 4px; margin-bottom: 0;">
            Upload project assets (HTML, CSS, JS bundles, or ZIP) to trigger an immediate live Cloudflare Pages build.
          </p>
        </div>

        <div style="padding: 24px;">
          <!-- Drop Area -->
          <div id="new-deploy-dropzone" style="border: 2px dashed rgba(59, 130, 246, 0.4); border-radius: 10px; padding: 48px 24px; text-align: center; background: rgba(59, 130, 246, 0.03); cursor: pointer; transition: all 0.2s;">
            <div style="font-size: 38px; margin-bottom: 12px;">📁</div>
            <h3 style="font-size: 16px; font-weight: 600; color: #f8fafc; margin-bottom: 6px;">
              Drag & Drop your project folder, files, or .ZIP here
            </h3>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 16px;">
              Supports static web pages, React/Vite/Next dist folders, and zip archives with root <code>index.html</code>.
            </p>
            <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
              <label class="btn btn-primary btn-sm" style="background: #2563eb; border-color: #1d4ed8; cursor: pointer;">
                Browse Files
                <input type="file" id="new-deploy-file-input" multiple style="display: none;" />
              </label>
              <label class="btn btn-secondary btn-sm" style="cursor: pointer;">
                Browse Folder
                <input type="file" id="new-deploy-folder-input" webkitdirectory directory multiple style="display: none;" />
              </label>
            </div>
            <div id="new-deploy-file-summary" style="margin-top: 14px; font-size: 12.5px; color: #4ade80; display: none;"></div>
          </div>

          <!-- Deploy Trigger Row -->
          <div style="margin-top: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div style="font-size: 12px; color: #94a3b8;">
              Target: <code>${exactPagesUrl}</code> (Production branch: main)
            </div>
            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-open-deploy-modal">
                Open Advanced Modal
              </button>
              <button type="button" class="btn btn-primary btn-sm" id="btn-trigger-new-deploy" style="background: #2563eb; border-color: #1d4ed8; font-weight: 600;">
                Deploy to Cloudflare
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // EVENT LISTENERS & ACTIONS
  // =========================================================================
  function bindEvents() {
    // Back to dashboard
    container.querySelector('#btn-back-dashboard')?.addEventListener('click', () => {
      store.setView('dashboard');
    });

    // Header Stop / Start / Restart
    container.querySelector('#btn-detail-stop')?.addEventListener('click', async () => {
      await store.stopService(service.id);
      render();
    });

    container.querySelector('#btn-detail-start')?.addEventListener('click', async () => {
      await store.startService(service.id);
      render();
    });

    container.querySelector('#btn-detail-restart')?.addEventListener('click', async () => {
      await store.restartService(service.id);
      render();
    });

    // FIXED REDEPLOY BUTTON: provides instant feedback and triggers real build
    container.querySelector('#btn-detail-redeploy')?.addEventListener('click', async () => {
      if (isDeploying) return;
      isDeploying = true;
      render();

      try {
        const res = await store.redeployService(service.id);
        if (res?.success && res.service) {
          service = res.service;
        } else {
          service = store.getSelectedService() || service;
        }
        await loadDeployments();
      } catch (err) {
        console.error('Redeploy failed:', err);
      } finally {
        isDeploying = false;
        render();
      }
    });

    // Header Delete
    container.querySelector('#btn-detail-delete')?.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to permanently delete resource "${service.name}"? This action will remove all files and hosting configurations.`)) {
        await store.deleteService(service.id);
        store.setView('dashboard');
      }
    });

    // Tab switcher
    container.querySelectorAll('.cf-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        store.selectedDetailTab = activeTab;
        openMenuIndex = null;
        render();
      });
    });

    // "+ Create deployment" button on top right of tabs
    container.querySelector('#btn-create-deployment')?.addEventListener('click', () => {
      store.openDeployModalWithService(service.name);
    });

    // Refresh Deployments button
    container.querySelector('#btn-refresh-deployments')?.addEventListener('click', async () => {
      await loadDeployments();
      store.showToast('Deployments refreshed from Cloudflare Pages.', 'info');
    });

    // Deployments row three-dots menu toggle
    container.querySelectorAll('.btn-toggle-dep-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        openMenuIndex = openMenuIndex === idx ? null : idx;
        render();
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', () => {
      if (openMenuIndex !== null) {
        openMenuIndex = null;
        render();
      }
    }, { once: true });

    // Copy deployment URL
    container.querySelectorAll('.btn-copy-dep-url').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url) {
          navigator.clipboard.writeText(url).then(() => {
            store.showToast('Deployment URL copied to clipboard!', 'success');
          });
        }
        openMenuIndex = null;
        render();
      });
    });

    // Redeploy row action in dropdown
    container.querySelectorAll('.btn-redeploy-row').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        openMenuIndex = null;
        isDeploying = true;
        render();
        try {
          await store.redeployService(service.id);
          await loadDeployments();
        } finally {
          isDeploying = false;
          render();
        }
      });
    });

    // Custom Domain Modal Triggers
    container.querySelectorAll('.btn-open-custom-domain-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id') || service.id;
        openCustomDomainModal(id);
      });
    });

    container.querySelectorAll('.btn-copy-cname-table').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cname = btn.getAttribute('data-cname');
        if (cname) {
          const success = await copyTextToClipboard(cname);
          if (success) {
            store.showToast(`Copied CNAME target: ${cname}`, 'success');
            const orig = btn.innerText;
            btn.innerText = '✓ Copied!';
            setTimeout(() => { btn.innerText = orig; }, 2000);
          }
        }
      });
    });

    // Environment Variables Handlers
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

    // New Deploy Tab File Input & Modal
    let pendingUploadFiles = [];

    const fileInput = container.querySelector('#new-deploy-file-input');
    const folderInput = container.querySelector('#new-deploy-folder-input');
    const summaryBox = container.querySelector('#new-deploy-file-summary');

    const handleSelectedFiles = (fileList) => {
      pendingUploadFiles = Array.from(fileList);
      if (summaryBox && pendingUploadFiles.length > 0) {
        summaryBox.style.display = 'block';
        summaryBox.innerHTML = `✓ Ready to deploy: <strong>${pendingUploadFiles.length} file(s)</strong> (${(pendingUploadFiles.reduce((a, f) => a + f.size, 0) / 1024).toFixed(1)} KB)`;
      }
    };

    fileInput?.addEventListener('change', (e) => handleSelectedFiles(e.target.files));
    folderInput?.addEventListener('change', (e) => handleSelectedFiles(e.target.files));

    container.querySelector('#btn-open-deploy-modal')?.addEventListener('click', () => {
      store.openDeployModalWithService(service.name);
    });

    container.querySelector('#btn-trigger-new-deploy')?.addEventListener('click', async () => {
      if (pendingUploadFiles.length === 0) {
        store.openDeployModalWithService(service.name);
        return;
      }

      const btn = container.querySelector('#btn-trigger-new-deploy');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.8s linear infinite; margin-right:6px;"></span> Deploying...`;

      try {
        const formData = new FormData();
        formData.append('serviceName', service.name);
        formData.append('serviceId', service.id);
        formData.append('region', service.region || 'Frankfurt (eu-central-1)');
        formData.append('framework', service.framework || 'Static Site');

        pendingUploadFiles.forEach(file => {
          formData.append('files', file);
          formData.append('paths', file.webkitRelativePath || file.name);
        });

        const res = await fetch(`${store.backendUrl}/api/deploy/upload`, {
          method: 'POST',
          headers: {
            'x-user-id': store.user?.id || '',
            'x-user-email': store.user?.email || ''
          },
          body: formData
        });

        if (res.ok) {
          const data = await res.json();
          store.showToast(`✔ Deployed ${service.name} successfully!`, 'success');
          await loadDeployments();
          activeTab = 'deployments';
          store.selectedDetailTab = 'deployments';
        } else {
          const errData = await res.json().catch(() => ({}));
          store.showToast(`Deploy error: ${errData.error || 'Upload failed'}`, 'error');
        }
      } catch (err) {
        store.showToast(`Upload failed: ${err.message}`, 'error');
      } finally {
        render();
      }
    });
  }

  // Initial load
  loadDeployments();
}
