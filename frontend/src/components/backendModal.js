import { icons } from '../icons.js';
import { store } from '../state.js';

export function renderBackendModal(container) {
  if (!store.isBackendModalOpen) {
    container.innerHTML = '';
    return;
  }

  const isConnected = store.backendConnected;
  const metrics = store.backendMetrics?.metrics;

  container.innerHTML = `
    <div class="modal-backdrop" id="backend-backdrop-overlay">
      <div class="deploy-modal" style="max-width: 680px;" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="service-icon-box" style="width: 36px; height: 36px; background: rgba(99, 102, 241, 0.15); color: #818cf8;">
              ${icons.server}
            </div>
            <div>
              <h2 style="font-size: 17px; font-weight: 700; color: #fff;">
                Standalone Backend Architecture
              </h2>
              <div style="font-size: 12px; color: var(--text-faint);">
                Dedicated folder: <code style="color: #38bdf8;">../backend</code> (completely separate from frontend)
              </div>
            </div>
          </div>

          <button class="icon-btn" id="btn-close-backend-modal" title="Close">
            ${icons.close}
          </button>
        </div>

        <!-- Body -->
        <div class="modal-body" style="padding: 24px; display: flex; flex-direction: column; gap: 18px;">
          <!-- Status Banner -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-radius: var(--radius-md); background: ${isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; border: 1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'};">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="status-dot ${isConnected ? 'live' : 'building'}" style="width: 10px; height: 10px;"></span>
              <div>
                <div style="font-weight: 700; font-size: 14px; color: ${isConnected ? '#34d399' : '#fbbf24'};">
                  ${isConnected ? 'Backend Server Connected (Port 5000)' : 'Standalone Mode Active'}
                </div>
                <div style="font-size: 12px; color: var(--text-muted);">
                  ${isConnected ? `Database: ${store.backendHealth?.database || 'Connected'} · Live REST API operational.` : 'Separate backend folder created. Run "npm start" in ../backend to bridge live.'}
                </div>
              </div>
            </div>

            <button class="btn btn-secondary btn-sm" id="btn-ping-backend" style="flex-shrink: 0;">
              ${icons.refresh} Ping Server
            </button>
          </div>

          ${isConnected && metrics ? `
            <!-- Live Metrics -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
              <div class="metric-card" style="padding: 10px 14px;">
                <div style="font-size: 11px; color: var(--text-faint);">UPTIME</div>
                <div style="font-size: 15px; font-weight: 700; color: #fff;">${metrics.uptimeSeconds}s</div>
              </div>
              <div class="metric-card" style="padding: 10px 14px;">
                <div style="font-size: 11px; color: var(--text-faint);">MEMORY USAGE</div>
                <div style="font-size: 15px; font-weight: 700; color: #38bdf8;">${metrics.memoryUsedMB} MB (${metrics.memoryUsagePercent}%)</div>
              </div>
              <div class="metric-card" style="padding: 10px 14px;">
                <div style="font-size: 11px; color: var(--text-faint);">EDGE LATENCY</div>
                <div style="font-size: 15px; font-weight: 700; color: #34d399;">${metrics.averageLatencyMs} ms</div>
              </div>
            </div>
          ` : ''}

          <!-- Directory & Folder Structure Overview -->
          <div style="background: #090c13; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px;">
            <div style="font-size: 12.5px; font-weight: 700; color: #cbd5e1; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
              ${icons.folder} Separate Backend Folder Structure (<code>New folder/backend</code>)
            </div>
            <pre style="margin: 0; font-family: var(--font-mono); font-size: 11.5px; color: #94a3b8; line-height: 1.6;">
📁 backend/
  ├── 📄 server.js             <span style="color: #6366f1;"># Express server on port 5000</span>
  ├── 📁 routes/
  │   ├── 📄 deployRoutes.js    <span style="color: #38bdf8;"># Multer ZIP upload & GitHub deploy</span>
  │   ├── 📄 githubRoutes.js    <span style="color: #34d399;"># GitHub repos & CI/CD webhooks</span>
  │   ├── 📄 servicesRoutes.js  <span style="color: #fbbf24;"># Service CRUD & redeploy</span>
  │   └── 📄 metricsRoutes.js   <span style="color: #a855f7;"># Server health & telemetry</span>
  ├── 📁 services/
  │   ├── 📄 storageService.js  <span style="color: #cbd5e1;"># Zip extraction & static hosting</span>
  │   └── 📄 githubService.js   <span style="color: #cbd5e1;"># GitHub API parser & mock catalog</span>
  ├── 📁 storage/sites/         <span style="color: #ef4444;"># Deployed site files served at /sites/</span>
  ├── 📄 package.json           <span style="color: #64748b;"># express, multer, jszip, cors, dotenv</span>
  └── 📄 README.md              <span style="color: #64748b;"># Full cURL and API documentation</span></pre>
          </div>

          <!-- API Endpoints Table -->
          <div>
            <div style="font-size: 12.5px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px;">
              Available REST API Endpoints
            </div>
            <div style="border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; background: #06090e;">
              <table class="endpoint-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Route</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span class="method-tag get">GET</span></td>
                    <td><code>/api/health</code></td>
                    <td>Server health and edge platform status</td>
                  </tr>
                  <tr>
                    <td><span class="method-tag post">POST</span></td>
                    <td><code>/api/deploy/upload</code></td>
                    <td>Upload .zip or bundle for instant unpacking</td>
                  </tr>
                  <tr>
                    <td><span class="method-tag post">POST</span></td>
                    <td><code>/api/deploy/github</code></td>
                    <td>Deploy project from GitHub repository URL</td>
                  </tr>
                  <tr>
                    <td><span class="method-tag get">GET</span></td>
                    <td><code>/api/github/repos</code></td>
                    <td>Fetch GitHub repositories for import</td>
                  </tr>
                  <tr>
                    <td><span class="method-tag post">POST</span></td>
                    <td><code>/api/github/webhook</code></td>
                    <td>Continuous deployment webhook for git push</td>
                  </tr>
                  <tr>
                    <td><span class="method-tag get">GET</span></td>
                    <td><code>/sites/:subdomain/*</code></td>
                    <td>Direct static site hosting from disk</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer" style="justify-content: space-between;">
          <div style="font-size: 12px; color: var(--text-faint); display: flex; align-items: center; gap: 6px;">
            ${icons.info}
            <span>Run <code>node server.js</code> inside <code>../backend</code> anytime</span>
          </div>

          <button class="btn btn-secondary" id="btn-done-backend-modal">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  // Bind events
  const closeBtn = container.querySelector('#btn-close-backend-modal');
  if (closeBtn) closeBtn.addEventListener('click', () => store.closeBackendModal());

  const doneBtn = container.querySelector('#btn-done-backend-modal');
  if (doneBtn) doneBtn.addEventListener('click', () => store.closeBackendModal());

  const backdrop = container.querySelector('#backend-backdrop-overlay');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) store.closeBackendModal();
    });
  }

  const pingBtn = container.querySelector('#btn-ping-backend');
  if (pingBtn) {
    pingBtn.addEventListener('click', async () => {
      store.showToast(`Pinging backend server at ${store.backendUrl}...`, 'info');
      await store.checkBackendConnection();
      if (store.backendConnected) {
        store.showToast(`Backend is online and responding at ${store.backendUrl}!`, 'success');
      } else {
        store.showToast('Backend is not running. Please check server container or run "npm start" in backend.', 'warn');
      }
    });
  }
}
