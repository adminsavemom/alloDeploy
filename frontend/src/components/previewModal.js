import { icons } from '../icons.js';
import { store } from '../state.js';

export function renderPreviewModal(container) {
  if (!store.isPreviewModalOpen || !store.previewData) {
    container.innerHTML = '';
    return;
  }

  const srv = store.previewData;
  let deviceMode = 'desktop'; // 'desktop' | 'tablet' | 'mobile'
  let activeTab = 'preview'; // 'preview' | 'telemetry' | 'console'

  // Prepare iframe HTML content
  const htmlToRender = srv.htmlContent || getDefaultMockHtml(srv);

  function render() {
    container.innerHTML = `
      <div class="modal-backdrop" id="preview-backdrop-overlay">
        <div class="preview-modal" role="dialog" aria-modal="true">
          <!-- Browser Navigation & Control Bar -->
          <div class="preview-browser-bar">
            <!-- Mac style traffic light dots -->
            <div class="terminal-dots">
              <span class="t-dot red" id="btn-close-browser" title="Close Preview"></span>
              <span class="t-dot yellow"></span>
              <span class="t-dot green"></span>
            </div>

            <!-- Responsive Device Mode Switcher -->
            <div style="display: flex; gap: 4px; background: rgba(255, 255, 255, 0.05); padding: 2px 4px; border-radius: var(--radius-sm);">
              <button class="icon-btn btn-sm ${deviceMode === 'desktop' ? 'active' : ''}" id="btn-view-desktop" title="Desktop View (100% Full Width)">
                ${icons.monitor}
              </button>
              <button class="icon-btn btn-sm ${deviceMode === 'tablet' ? 'active' : ''}" id="btn-view-tablet" title="Tablet View (768px iPad)">
                ${icons.server}
              </button>
              <button class="icon-btn btn-sm ${deviceMode === 'mobile' ? 'active' : ''}" id="btn-view-mobile" title="Mobile View (375px iPhone)">
                ${icons.smartphone}
              </button>
            </div>

            <!-- URL Address Bar -->
            <div class="browser-url-pill">
              <span class="status-dot live"></span>
              <span style="color: #64748b; font-size: 11px;">https://</span>
              <span style="font-weight: 500;">${srv.url.replace('https://', '')}</span>
              <span class="badge badge-tag" style="margin-left: auto; font-size: 10px; padding: 2px 6px;">HTTP/3</span>
            </div>

            <!-- Tab switchers (Preview / Telemetry / Console) -->
            <div style="display: flex; gap: 4px; background: rgba(255,255,255,0.05); padding: 2px 4px; border-radius: var(--radius-sm);">
              <button class="btn btn-sm ${activeTab === 'preview' ? 'btn-primary' : 'btn-secondary'}" id="btn-tab-site-preview" style="font-size: 11.5px; padding: 4px 10px;">
                Live Site
              </button>
              <button class="btn btn-sm ${activeTab === 'telemetry' ? 'btn-primary' : 'btn-secondary'}" id="btn-tab-telemetry" style="font-size: 11.5px; padding: 4px 10px;">
                Response Headers
              </button>
            </div>

            <!-- Browser actions -->
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="icon-btn btn-sm" id="btn-refresh-preview" title="Reload Frame">
                ${icons.refresh}
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-copy-preview-link" title="Copy Live URL">
                ${icons.copy}
                <span>Copy URL</span>
              </button>
              <a href="${srv.url}" target="_blank" rel="noopener noreferrer" class="icon-btn btn-sm" title="Open in New Window">
                ${icons.externalLink}
              </a>
              <button class="icon-btn btn-sm" id="btn-close-preview-x" title="Close Preview">
                ${icons.close}
              </button>
            </div>
          </div>

          <!-- Browser Viewport Frame -->
          <div class="preview-content-frame" style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: ${deviceMode === 'desktop' ? '0' : '24px'}; background: #04070e; overflow-y: auto;">
            ${activeTab === 'preview' ? `
              <div class="mock-device-viewport ${deviceMode}" style="position: relative; ${deviceMode === 'desktop' ? 'width: 100%; height: 100%; border: none; border-radius: 0;' : deviceMode === 'tablet' ? 'width: 768px; height: 96%; border: 8px solid #1e293b; border-radius: 20px; box-shadow: 0 25px 60px rgba(0,0,0,0.8);' : 'width: 375px; height: 96%; border: 10px solid #1e293b; border-radius: 36px; box-shadow: 0 25px 60px rgba(0,0,0,0.8);'}">
                ${deviceMode === 'mobile' ? `
                  <!-- Dynamic Island Notch -->
                  <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 90px; height: 18px; background: #000; border-radius: 12px; z-index: 100; pointer-events: none;"></div>
                ` : ''}

                <iframe
                  id="preview-sandboxed-frame"
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  style="width: 100%; height: 100%; border: none; background: #fff; display: block;"
                  title="Live Preview of ${srv.name}"
                ></iframe>
              </div>
            ` : `
              <!-- Headers & Telemetry View -->
              <div style="width: 100%; max-width: 820px; background: #0a0e17; border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: 24px; color: #e2e8f0; display: flex; flex-direction: column; gap: 18px; margin: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
                  <div>
                    <h3 style="font-size: 16px; font-weight: 700;">Network Telemetry</h3>
                    <p style="font-size: 12px; color: var(--text-faint);">Diagnostic probe responses from network</p>
                  </div>
                  <span class="badge badge-live">HTTP/3 200 OK</span>
                </div>

                <div class="config-grid">
                  <div class="metric-card" style="padding: 12px;">
                    <div style="font-size: 11px; color: var(--text-faint);">ANYCAST POP</div>
                    <div style="font-size: 14px; font-weight: 600; color: #38bdf8;">${srv.region}</div>
                  </div>
                  <div class="metric-card" style="padding: 12px;">
                    <div style="font-size: 11px; color: var(--text-faint);">CACHE STATUS</div>
                    <div style="font-size: 14px; font-weight: 600; color: #34d399;">HIT (Age: 42s)</div>
                  </div>
                  <div class="metric-card" style="padding: 12px;">
                    <div style="font-size: 11px; color: var(--text-faint);">TTFB (TIME TO FIRST BYTE)</div>
                    <div style="font-size: 14px; font-weight: 600; color: #a855f7;">14.2 ms</div>
                  </div>
                  <div class="metric-card" style="padding: 12px;">
                    <div style="font-size: 11px; color: var(--text-faint);">COMPRESSION</div>
                    <div style="font-size: 14px; font-weight: 600; color: #f59e0b;">Brotli 11 (br)</div>
                  </div>
                </div>

                <div>
                  <div style="font-size: 12.5px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">
                    Raw Response Headers
                  </div>
                  <pre style="background: #04060a; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; font-family: var(--font-mono); font-size: 11.5px; color: #93c5fd; overflow-x: auto; line-height: 1.6;"><code>HTTP/3 200 OK
Date: ${new Date().toUTCString()}
Content-Type: text/html; charset=utf-8
Content-Encoding: br
Vary: Accept-Encoding
Server: AlloDeploy-Proxy/4.0
CF-Cache-Status: HIT
Age: 42
Cache-Control: public, max-age=31536000, immutable
Alt-Svc: h3=":443"; ma=86400
X-Origin-Region: ${srv.region}
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload</code></pre>
                </div>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    bindEvents();

    // Inject iframe content if preview tab is active
    if (activeTab === 'preview') {
      setTimeout(() => {
        const frame = container.querySelector('#preview-sandboxed-frame');
        if (frame) {
          frame.srcdoc = htmlToRender;
        }
      }, 50);
    }
  }

  function bindEvents() {
    // Close modal
    const closeBtns = [
      container.querySelector('#btn-close-browser'),
      container.querySelector('#btn-close-preview-x')
    ];
    closeBtns.forEach(btn => {
      if (btn) btn.addEventListener('click', () => store.closePreview());
    });

    const backdrop = container.querySelector('#preview-backdrop-overlay');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) store.closePreview();
      });
    }

    // Responsive mode toggles
    container.querySelector('#btn-view-desktop')?.addEventListener('click', () => { deviceMode = 'desktop'; render(); });
    container.querySelector('#btn-view-tablet')?.addEventListener('click', () => { deviceMode = 'tablet'; render(); });
    container.querySelector('#btn-view-mobile')?.addEventListener('click', () => { deviceMode = 'mobile'; render(); });

    // Tab toggles
    container.querySelector('#btn-tab-site-preview')?.addEventListener('click', () => { activeTab = 'preview'; render(); });
    container.querySelector('#btn-tab-telemetry')?.addEventListener('click', () => { activeTab = 'telemetry'; render(); });

    // Refresh simulation
    container.querySelector('#btn-refresh-preview')?.addEventListener('click', () => {
      store.showToast('Reloading preview...', 'info');
      const frame = container.querySelector('#preview-sandboxed-frame');
      if (frame) {
        frame.srcdoc = '';
        setTimeout(() => { frame.srcdoc = htmlToRender; }, 100);
      }
    });

    // Copy URL
    container.querySelector('#btn-copy-preview-link')?.addEventListener('click', () => {
      navigator.clipboard.writeText(srv.url);
      store.showToast('Copied live service URL to clipboard!', 'info');
    });
  }

  // Fallback interactive HTML when no custom html is provided
  function getDefaultMockHtml(service) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${service.name} · AlloDeploy Container</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #07090e; color: #f8fafc; line-height: 1.6; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 18px 28px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(14,18,26,0.85); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 10; }
    .logo { font-weight: 700; font-size: 16px; display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #6366f1, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero { max-width: 800px; margin: 50px auto 30px; text-align: center; padding: 0 20px; }
    h1 { font-size: 34px; font-weight: 700; color: #f8fafc; margin-bottom: 14px; }
    p { font-size: 15px; color: #94a3b8; max-width: 580px; margin: 0 auto 24px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 4px; font-size: 12px; color: #a5b4fc; margin-bottom: 14px; }
    .btn { padding: 9px 18px; border-radius: 6px; font-weight: 600; font-size: 13.5px; cursor: pointer; border: none; transition: all 0.2s; }
    .btn-primary { background: #6366f1; color: white; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.12); margin-left: 8px; }
    .demo-widget { background: #0e1322; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 22px; max-width: 420px; margin: 30px auto; text-align: center; }
    .counter-display { font-size: 34px; font-weight: 800; color: #38bdf8; font-family: monospace; margin: 10px 0; }
  </style>
</head>
<body>
  <header>
    <div class="logo">${service.name}</div>
    <div style="font-size: 12.5px; color: #34d399; display: flex; align-items: center; gap: 6px;">
      <span>● Live (${service.region})</span>
    </div>
  </header>
  <div class="hero">
    <div class="badge">Static Site Deployment</div>
    <h1>${service.name}</h1>
    <p>Deployed from ${service.source} with automated Brotli pre-compression, Anycast DNS, and Let's Encrypt Wildcard SSL.</p>
    <div>
      <button class="btn btn-primary" onclick="alert('Action triggered on server node!')">Deploy Endpoint</button>
      <button class="btn btn-secondary" onclick="alert('Viewing logs...')">Inspect Logs</button>
    </div>
    <div class="demo-widget">
      <div style="font-size: 13px; font-weight: 600; color: #cbd5e1;">Live State Counter</div>
      <div class="counter-display" id="cnt">84</div>
      <div style="display: flex; gap: 8px; justify-content: center;">
        <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 12px;" onclick="document.getElementById('cnt').innerText = parseInt(document.getElementById('cnt').innerText) - 1">- Decrement</button>
        <button class="btn btn-primary" style="padding: 6px 14px; font-size: 12px;" onclick="document.getElementById('cnt').innerText = parseInt(document.getElementById('cnt').innerText) + 1">+ Increment</button>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  render();
}
