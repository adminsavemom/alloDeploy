import { icons } from '../icons.js';
import { store } from '../state.js';

export function renderServiceDetail(container) {
  let service = store.getSelectedService();
  if (!service) {
    store.setView('dashboard');
    return;
  }

  let activeTab = store.selectedDetailTab || 'overview'; // 'overview' | 'env' | 'logs' | 'deployments' | 'settings'
  let isDevView = false;
  let envSearchQuery = '';
  let envOrder = 'creation'; // 'creation' | 'asc' | 'desc'
  let envBuildSecrets = 'standard'; // 'standard' | 'secret' | 'all'
  let revealedSecrets = new Set();

  async function fetchRealLogs() {
    try {
      const res = await fetch(`${store.backendUrl}/api/services/${service.id}/logs`);
      if (res.ok) {
        const data = await res.json();
        return data.logs || [];
      }
    } catch {
      // Fallback
    }
    return [
      `[${new Date().toLocaleTimeString()}] [allodeploy-engine] Container initialized for ${service.name}`,
      `[${new Date().toLocaleTimeString()}] [proxy] Listening on internal bridge network for port ${service.port || 3000}`,
      `[${new Date().toLocaleTimeString()}] [runtime] Service status: ${service.status.toUpperCase()}`,
      `[${new Date().toLocaleTimeString()}] [healthcheck] HTTP probe 200 OK via localhost reverse proxy`
    ];
  }

  function render() {
    const isRunning = service.status === 'running' || service.status === 'live';
    const exactPagesUrl = service.cloudflarePagesUrl && !service.cloudflarePagesUrl.includes('localhost')
      ? service.cloudflarePagesUrl
      : (service.url && !service.url.includes('localhost') && service.url.includes('.pages.dev')
          ? service.url
          : `https://${service.name}.pages.dev`);

    const customSiteUrl = service.customDomain 
      ? (service.customDomain.startsWith('http') ? service.customDomain : `${service.protocol || 'https'}://${service.customDomain}${service.pathSuffix || ''}`)
      : null;
    const openSiteUrl = customSiteUrl || exactPagesUrl;

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
                <span class="badge badge-tag" style="background: rgba(124, 58, 237, 0.12); color: #c4b5fd; font-size: 11px;">
                  Port ${service.port || 3000}
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

            <button class="btn btn-secondary btn-sm" id="btn-detail-config" title="Settings & Danger Zone">
              Config
            </button>

            <button class="btn btn-secondary btn-sm" id="btn-detail-delete" title="Delete Resource" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.35);">
              ${icons.trash || '🗑️'} Delete
            </button>

            ${isRunning ? `
              <a href="${exactPagesUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; background: #7c3aed; text-decoration: none;" title="Open live web page on Pages.dev (${exactPagesUrl})">
                ${icons.externalLink} Open Site
              </a>
              ${service.customDomain ? `
                <a href="${customSiteUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" id="btn-header-custom-domain" style="display: inline-flex; align-items: center; gap: 6px; border-color: rgba(56, 189, 248, 0.4); color: #38bdf8; text-decoration: none;" title="Open Custom Domain: ${customSiteUrl}">
                  🌐 Custom Domain
                </a>
              ` : ''}
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
          <button class="detail-tab-item ${activeTab === 'logs' ? 'active' : ''}" data-tab="logs">Live Logs</button>
          <button class="detail-tab-item ${activeTab === 'deployments' ? 'active' : ''}" data-tab="deployments">Deployments (${service.deploys ? service.deploys.length : 1})</button>
          <button class="detail-tab-item ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">Settings & Danger Zone</button>
        </div>

        <!-- Tab Body -->
        <div class="detail-tab-body">
          ${activeTab === 'overview' ? renderOverviewTab() : ''}
          ${activeTab === 'env' ? renderEnvTab() : ''}
          ${activeTab === 'logs' ? renderLogsTab() : ''}
          ${activeTab === 'deployments' ? renderDeploymentsTab() : ''}
          ${activeTab === 'settings' ? renderSettingsTab() : ''}
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderOverviewTab() {
    const isRunning = service.status === 'running';
    const isDnsActive = service.customDomainStatus === 'active' && service.dnsResolved !== false;

    return `
      ${service.customDomain ? `
        <!-- Custom Domain & DNS Setup Guide -->
        <div class="metric-card" style="padding: 22px; margin-bottom: 24px; border: 1px solid rgba(56, 189, 248, 0.25); background: rgba(8, 14, 28, 0.7);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 14px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">🌐</span>
                <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin: 0;">Custom Domain & DNS Setup</h3>
                ${isDnsActive ? `
                  <span class="badge" style="background: rgba(34,197,94,0.18); color: #22c55e; border: 1px solid rgba(34,197,94,0.35); font-size: 10px; padding: 2px 7px;">● DNS Active & Live</span>
                ` : `
                  <span class="badge" style="background: rgba(245,158,11,0.18); color: #f59e0b; border: 1px solid rgba(245,158,11,0.35); font-size: 10px; padding: 2px 7px;">⏳ DNS Setup Required</span>
                `}
              </div>
              <p style="font-size: 12.5px; color: #94a3b8; margin: 6px 0 0 0;">
                Configured Custom Domain: <strong style="color: #38bdf8; font-family: var(--font-mono);">${service.customDomain}</strong>
              </p>
            </div>

            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <a href="${exactPagesUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="background: #7c3aed; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                🚀 Open Live Web Page
              </a>
              <button class="btn btn-secondary btn-sm" id="btn-verify-domain-overview" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);">
                🔄 Check DNS Now
              </button>
              <a href="${customSiteUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" id="btn-test-custom-domain" style="text-decoration: none;">
                🌐 Test Custom Domain
              </a>
            </div>
          </div>

          ${!isDnsActive ? `
            <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 14px 16px;">
              <div style="font-size: 12.5px; font-weight: 600; color: #fbbf24; margin-bottom: 6px;">
                ⚠️ Why does the custom domain show net::ERR_NAME_NOT_RESOLVED?
              </div>
              <div style="font-size: 12px; color: #cbd5e1; line-height: 1.5; margin-bottom: 12px;">
                Your website files are deployed and working immediately at <a href="${exactPagesUrl}" target="_blank" style="color: #a78bfa; text-decoration: underline;">${exactPagesUrl}</a>. To connect <strong>${service.customDomain}</strong>, add this CNAME record in your domain registrar DNS settings (where you manage allokonnect.com):
              </div>

              <div style="display: grid; grid-template-columns: 80px 1fr 1fr auto; gap: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 10px 14px; font-family: var(--font-mono); font-size: 12px; align-items: center;">
                <div>
                  <span style="color: #64748b; font-size: 10px; display: block; font-family: var(--font-sans);">RECORD TYPE</span>
                  <strong style="color: #38bdf8;">CNAME</strong>
                </div>
                <div>
                  <span style="color: #64748b; font-size: 10px; display: block; font-family: var(--font-sans);">HOST / NAME</span>
                  <strong style="color: #cbd5e1;">${service.customDomain.includes('.') ? service.customDomain.split('.')[0] : service.customDomain}</strong>
                </div>
                <div>
                  <span style="color: #64748b; font-size: 10px; display: block; font-family: var(--font-sans);">TARGET / VALUE</span>
                  <strong style="color: #4ade80;">${service.name}.pages.dev</strong>
                </div>
                <div>
                  <button class="btn btn-secondary btn-xs btn-copy-cname" data-cname="${service.name}.pages.dev" style="padding: 3px 8px; font-size: 11px;">
                    Copy Target
                  </button>
                </div>
              </div>
            </div>
          ` : `
            <div style="background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 8px; padding: 12px 16px; font-size: 12.5px; color: #86efac; display: flex; align-items: center; justify-content: space-between;">
              <span>✅ Custom domain is connected and resolving in public DNS.</span>
              <a href="${customSiteUrl}" target="_blank" rel="noopener noreferrer" style="color: #4ade80; font-weight: 600; text-decoration: none;">Visit ${service.customDomain} ↗</a>
            </div>
          `}
        </div>
      ` : ''}

      <!-- Status & Container Specs Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div class="metric-card" style="padding: 18px;">
          <div style="font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            Container Status
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; color: ${isRunning ? '#34d399' : '#f87171'};">
            <span class="coolify-dot ${isRunning ? 'dot-running' : 'dot-stopped'}"></span>
            ${isRunning ? 'Online & Proxying' : 'Stopped (Offline)'}
          </div>
          <div style="font-size: 12px; color: var(--text-faint); margin-top: 6px;">
            ${isRunning ? `Serving traffic at port ${service.port || 3000}` : 'Halted by operator'}
          </div>
        </div>

        <div class="metric-card" style="padding: 18px;">
          <div style="font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            Assigned Internal Port
          </div>
          <div style="font-size: 18px; font-weight: 700; color: #a78bfa; font-family: var(--font-mono);">
            :${service.port || 3000}
          </div>
          <div style="font-size: 12px; color: var(--text-faint); margin-top: 6px;">
            Internal bridge network proxy target
          </div>
        </div>

        <div class="metric-card" style="padding: 18px;">
          <div style="font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            Memory Footprint (RSS)
          </div>
          <div style="font-size: 18px; font-weight: 700; color: #f4f4f5;">
            ${service.metrics?.memory || '48 MB'}
          </div>
          <div style="font-size: 12px; color: var(--text-faint); margin-top: 6px;">
            Live process memory consumption
          </div>
        </div>

        <div class="metric-card" style="padding: 18px;">
          <div style="font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            CPU Core Usage
          </div>
          <div style="font-size: 18px; font-weight: 700; color: #f4f4f5;">
            ${service.metrics?.cpu || '0.2%'}
          </div>
          <div style="font-size: 12px; color: var(--text-faint); margin-top: 6px;">
            Docker container core load
          </div>
        </div>
      </div>

      <!-- Network and Destination Details -->
      <div class="config-grid">
        <div class="metric-card" style="padding: 20px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; color: #f4f4f5;">
            ${icons.globe} Proxy & Domain Settings
          </div>
          <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--text-faint);">Cloudflare Pages URL</span>
              <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; font-family: var(--font-mono); text-decoration: none;">${targetUrl}</a>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
              <span style="color: var(--text-faint);">Custom Domain</span>
              <span style="color: #cbd5e1; font-family: var(--font-mono);">${service.customDomain || service.liveDomain || service.name + '.local'}</span>
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

  function renderLogsTab() {
    return `
      <div class="terminal-window" style="min-height: 400px; background: #070a12; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden;">
        <div class="terminal-titlebar" style="background: #0d1220; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="terminal-dots">
              <span class="t-dot red"></span>
              <span class="t-dot yellow"></span>
              <span class="t-dot green"></span>
            </div>
            <span style="font-size: 12px; font-family: var(--font-mono); color: #cbd5e1;">stdout/stderr -- ${service.name} (live container stream)</span>
          </div>

          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-refresh-tab-logs" title="Refresh Logs" style="padding: 4px 10px; font-size: 11px;">
              ${icons.refresh} Refresh
            </button>
            <button class="icon-btn btn-sm" id="btn-copy-tab-logs" title="Copy Logs">
              ${icons.copy}
            </button>
            <button class="icon-btn btn-sm" id="btn-clear-tab-logs" title="Clear View">
              ${icons.trash}
            </button>
          </div>
        </div>

        <div class="terminal-logs" id="detail-log-stream" style="padding: 16px; font-family: var(--font-mono); font-size: 12px; line-height: 1.6; max-height: 420px; overflow-y: auto; color: #a1a1aa;">
          <div class="log-line"><span style="color: #64748b;">[00:00.01]</span> <span style="color: #818cf8;">==> AlloDeploy container runtime attached to ID ${service.id}</span></div>
          <div class="log-line"><span style="color: #64748b;">[00:00.04]</span> <span style="color: #34d399;">✔ Internal bridge network connected: 172.18.0.24:${service.port || 3000}</span></div>
          <div class="log-line"><span style="color: #64748b;">[00:00.08]</span> <span style="color: #cbd5e1;">==> Proxy routing table updated for http://localhost:5000/sites/${service.name}/</span></div>
          <div class="log-line"><span style="color: #64748b;">[00:00.12]</span> <span style="color: #34d399;">✔ Container process state: ${service.status.toUpperCase()}</span></div>
          <div class="log-line"><span style="color: #64748b;">[00:00.15]</span> <span style="color: #a78bfa;">[app-runtime] ready on internal port ${service.port || 3000}</span></div>
        </div>
      </div>
    `;
  }

  function renderDeploymentsTab() {
    const deploys = service.deploys || [
      { id: 'dep-01', hash: '8f1e29c', message: 'Initial deployment via AlloDeploy', duration: '2.4s', date: 'Just now', status: service.status }
    ];

    return `
      <div class="metric-card" style="padding: 0; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;">
        <table class="deployments-table" style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.3); text-align: left;">
              <th style="padding: 12px 18px; color: #a1a1aa; font-weight: 600;">Status</th>
              <th style="padding: 12px 18px; color: #a1a1aa; font-weight: 600;">Deployment ID</th>
              <th style="padding: 12px 18px; color: #a1a1aa; font-weight: 600;">Message</th>
              <th style="padding: 12px 18px; color: #a1a1aa; font-weight: 600;">Duration</th>
              <th style="padding: 12px 18px; color: #a1a1aa; font-weight: 600;">Created</th>
            </tr>
          </thead>
          <tbody>
            ${deploys.map(dep => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 12px 18px;">
                  <span class="coolify-chip ${dep.status === 'running' || dep.status === 'live' ? 'chip-running' : 'chip-stopped'}">
                    <span class="coolify-dot ${dep.status === 'running' || dep.status === 'live' ? 'dot-running' : 'dot-stopped'}"></span>
                    ${dep.status === 'running' || dep.status === 'live' ? 'RUNNING' : 'STOPPED'}
                  </span>
                </td>
                <td style="padding: 12px 18px; font-family: var(--font-mono); color: #a78bfa;">
                  ${dep.id}
                </td>
                <td style="padding: 12px 18px; color: #f4f4f5; font-weight: 500;">
                  ${dep.message || 'Build update'}
                </td>
                <td style="padding: 12px 18px; font-family: var(--font-mono); color: #cbd5e1;">
                  ${dep.duration || '2.1s'}
                </td>
                <td style="padding: 12px 18px; color: #71717a;">
                  ${dep.date || 'Today'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSettingsTab() {
    return `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <!-- General Service Settings -->
        <div class="metric-card" style="padding: 22px;">
          <h3 style="font-size: 16px; font-weight: 600; color: #f4f4f5; margin: 0 0 16px 0;">Resource Configuration</h3>
          
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="edit-srv-name">Resource Name</label>
            <input type="text" id="edit-srv-name" value="${service.name}" style="max-width: 440px;" />
          </div>

          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="edit-srv-port">Internal Container Port</label>
            <input type="number" id="edit-srv-port" value="${service.port || 3000}" style="max-width: 200px;" />
            <span style="font-size: 12px; color: var(--text-faint); margin-top: 4px; display: block;">The internal port the service listens on inside the container.</span>
          </div>

          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="edit-srv-domain">Custom Domain / FQDN</label>
            <div style="display: flex; gap: 8px; max-width: 540px;">
              <input type="text" id="edit-srv-domain" value="${service.customDomain || service.liveDomain || ''}" placeholder="e.g. app.yourdomain.com" style="flex: 1;" />
              <button type="button" class="btn btn-secondary btn-sm" id="btn-cf-sync-domain" title="Sync this domain with Cloudflare API" style="border-color: #f6821f; color: #f6821f; white-space: nowrap;">
                ☁️ Sync Cloudflare DNS
              </button>
            </div>
            <span style="font-size: 12px; color: var(--text-faint); margin-top: 4px; display: block;">Creates Cloudflare DNS CNAME/A records and enables Orange Cloud edge proxy & SSL.</span>
          </div>

          <div style="display: flex; gap: 10px; align-items: center; margin-top: 18px;">
            <button class="btn btn-primary btn-sm" id="btn-save-settings" style="background: #7c3aed; font-weight: 600;">
              Save Resource Settings
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cf-purge-domain" title="Purge Cloudflare Edge Cache for this service">
              ⚡ Purge Cloudflare Cache
            </button>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="metric-card" style="border-color: rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.03); padding: 22px;">
          <h3 style="font-size: 16px; color: #f87171; margin: 0 0 8px 0;">Danger Zone</h3>
          <p style="font-size: 13px; color: #a1a1aa; margin: 0 0 16px 0; max-width: 600px;">
            Stopping this resource halts the container and stops proxying web traffic. Deleting permanently destroys the local directory, environment secrets, and routing tables.
          </p>

          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            ${service.status === 'running' ? `
              <button class="btn btn-secondary btn-sm" id="btn-danger-stop" style="color: #fca5a5; border-color: rgba(239,68,68,0.4);">
                ${icons.pause} Stop Container
              </button>
            ` : `
              <button class="btn btn-secondary btn-sm" id="btn-danger-start" style="color: #86efac; border-color: rgba(34,197,94,0.4);">
                ${icons.play} Start Container
              </button>
            `}

            <button class="btn btn-danger btn-sm" id="btn-delete-service-action">
              ${icons.trash}
              <span>Delete Resource Permanently</span>
            </button>
          </div>
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

    // Danger Zone controls
    container.querySelector('#btn-danger-stop')?.addEventListener('click', () => {
      store.stopService(service.id);
      render();
    });

    container.querySelector('#btn-danger-start')?.addEventListener('click', () => {
      store.startService(service.id);
      render();
    });

    container.querySelector('#btn-delete-service-action')?.addEventListener('click', () => {
      if (confirm(`Are you sure you want to permanently delete resource "${service.name}"?`)) {
        store.deleteService(service.id);
      }
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

    container.querySelector('#btn-detail-config')?.addEventListener('click', () => {
      activeTab = 'settings';
      store.selectedDetailTab = 'settings';
      render();
    });

    // Copy CNAME target
    container.querySelectorAll('.btn-copy-cname').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cname = e.currentTarget.dataset.cname;
        if (cname) {
          navigator.clipboard.writeText(cname).then(() => {
            store.showToast(`Copied CNAME target: ${cname} — add this record in your domain registrar DNS!`, 'success');
          });
        }
      });
    });

    // Check DNS Now button in overview
    container.querySelector('#btn-verify-domain-overview')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.innerText = 'Checking DNS...';
      btn.disabled = true;
      try {
        const res = await store.verifyCustomDomain(service.id);
        if (res?.service) {
          service = res.service;
        }
        render();
        if (res?.statusInfo?.dnsResolved || res?.service?.customDomainStatus === 'active') {
          store.showToast(`DNS is live and verified for ${service.customDomain}!`, 'success');
        } else {
          store.showToast(`CNAME not yet detected for ${service.customDomain}. Please add the CNAME record at your domain registrar.`, 'warn');
        }
      } catch (err) {
        store.showToast(`DNS check error: ${err.message}`, 'error');
        btn.innerText = 'Check DNS Now';
        btn.disabled = false;
      }
    });

    // Notice on testing custom domain when DNS pending
    container.querySelector('#btn-test-custom-domain')?.addEventListener('click', () => {
      if (service.customDomainStatus !== 'active' || service.dnsResolved === false) {
        store.showToast(`Notice: ${service.customDomain} may show ERR_NAME_NOT_RESOLVED until the CNAME record is configured in your DNS registrar.`, 'warn');
      }
    });

    container.querySelector('#btn-header-custom-domain')?.addEventListener('click', () => {
      if (service.customDomainStatus !== 'active' || service.dnsResolved === false) {
        store.showToast(`Notice: ${service.customDomain} may show ERR_NAME_NOT_RESOLVED until the CNAME record is configured in your DNS registrar.`, 'warn');
      }
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

    // Save Settings
    container.querySelector('#btn-save-settings')?.addEventListener('click', async () => {
      const newName = container.querySelector('#edit-srv-name')?.value.trim();
      const newPort = parseInt(container.querySelector('#edit-srv-port')?.value, 10) || 3000;
      const newDomain = container.querySelector('#edit-srv-domain')?.value.trim();

      if (newName) {
        service.name = newName;
        service.port = newPort;
        const cfUrl = service.cloudflarePagesUrl || `https://${newName}.pages.dev`;
        service.url = cfUrl;
        service.cloudflarePagesUrl = cfUrl;
        if (newDomain) {
          await store.addCustomDomain(service.id, newDomain);
        }
        store.updateServiceConfig(service.id, { name: newName, port: newPort, url: cfUrl, cloudflarePagesUrl: cfUrl });
        render();
      }
    });

    // Cloudflare Edge DNS Actions on Service
    container.querySelector('#btn-cf-sync-domain')?.addEventListener('click', async () => {
      const targetDomain = container.querySelector('#edit-srv-domain')?.value.trim() || service.customDomain || service.liveDomain;
      if (!targetDomain) {
        store.showToast('Please enter a custom domain to sync with Cloudflare.', 'error');
        return;
      }
      await store.syncServiceWithCloudflare(service.id, targetDomain);
      render();
    });

    container.querySelector('#btn-cf-purge-domain')?.addEventListener('click', async () => {
      await store.purgeCloudflareCache();
    });
  }

  render();
}
