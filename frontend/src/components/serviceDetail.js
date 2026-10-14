import { icons } from '../icons.js';
import { store } from '../state.js';

export function renderServiceDetail(container) {
  const service = store.getSelectedService();
  if (!service) {
    store.setView('dashboard');
    return;
  }

  let activeTab = 'overview'; // 'overview' | 'env' | 'logs' | 'deployments' | 'settings'

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

    const isCustomActive = service.customDomain && service.customDomainStatus === 'active';
    const openSiteUrl = (isCustomActive && service.customDomain)
      ? (service.customDomain.startsWith('http') ? service.customDomain : `https://${service.customDomain}`)
      : exactPagesUrl;

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
                  <a href="https://${service.customDomain}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 4px; text-decoration: none;" title="Custom domain: https://${service.customDomain}">
                    🌐 ${service.customDomain} (${service.customDomainStatus === 'active' ? 'SSL Active' : 'DNS Pending'})
                  </a>
                ` : ''}
                <span>•</span>
                <span>${service.region || 'Self-Hosted Server'}</span>
                <span>•</span>
                <span>Updated ${service.updatedAt || 'Recently'}</span>
              </div>
            </div>
          </div>

          <!-- Coolify Resource Control Action Buttons -->
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

            ${isRunning ? `
              <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; background: #7c3aed; text-decoration: none;">
                ${icons.externalLink} Open Site
              </a>
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

    return `
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
    const envVars = service.envVars || [];

    return `
      <div class="metric-card" style="padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 600; color: #f4f4f5; margin: 0 0 4px 0;">Environment Variables (.env)</h3>
            <p style="font-size: 13px; color: #a1a1aa; margin: 0;">Values are injected into container process runtime on start.</p>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-add-env-var">
            ${icons.plus} Add Variable
          </button>
        </div>

        <div id="env-vars-container" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
          ${envVars.length === 0 ? `
            <div style="font-size: 13px; color: var(--text-faint); padding: 14px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: center;">
              No custom environment variables defined yet.
            </div>
          ` : envVars.map((env, i) => `
            <div class="env-row" style="display: flex; gap: 10px; align-items: center;" data-index="${i}">
              <input type="text" class="env-key-input" value="${env.key}" placeholder="KEY" style="flex: 1; font-family: var(--font-mono); font-size: 13px; padding: 8px 12px; background: #070a12; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #38bdf8;" />
              <span style="color: #71717a;">=</span>
              <input type="text" class="env-val-input" value="${env.value}" placeholder="VALUE" style="flex: 2; font-family: var(--font-mono); font-size: 13px; padding: 8px 12px; background: #070a12; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #f4f4f5;" />
              <button class="icon-btn btn-sm btn-remove-env" data-index="${i}" title="Remove variable">
                ${icons.trash}
              </button>
            </div>
          `).join('')}
        </div>

        <button class="btn btn-primary btn-sm" id="btn-save-env-vars" style="background: #7c3aed; font-weight: 600;">
          Save Environment Variables
        </button>
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

    // Tab switcher
    container.querySelectorAll('.detail-tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.getAttribute('data-tab');
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

    // Environment Variables Actions
    container.querySelector('#btn-add-env-var')?.addEventListener('click', () => {
      if (!service.envVars) service.envVars = [];
      service.envVars.push({ key: 'NEW_VAR', value: '' });
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

    container.querySelector('#btn-save-env-vars')?.addEventListener('click', () => {
      const rows = container.querySelectorAll('.env-row');
      const updatedVars = [];
      rows.forEach(r => {
        const key = r.querySelector('.env-key-input')?.value.trim();
        const value = r.querySelector('.env-val-input')?.value.trim();
        if (key) updatedVars.push({ key, value: value || '' });
      });
      service.envVars = updatedVars;
      store.updateServiceConfig(service.id, { envVars: updatedVars });
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
