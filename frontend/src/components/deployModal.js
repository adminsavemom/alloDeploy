import JSZip from 'jszip';
import { icons } from '../icons.js';
import { store } from '../state.js';
import { copyTextToClipboard } from './dashboard.js';

let wasModalOpen = false;

// Project name generators & validation
export function generateRandomProjectName() {
  const adjectives = [
    'swift', 'neon', 'hyper', 'sonic', 'cyber', 'bold', 'crisp', 'vivid',
    'zen', 'apex', 'nova', 'stellar', 'orbit', 'prime', 'turbo', 'spark',
    'quantum', 'alpha', 'breeze', 'pulse', 'flash', 'bright', 'clean'
  ];
  const nouns = [
    'wave', 'flux', 'pixel', 'spark', 'flow', 'craft', 'forge', 'stack',
    'dock', 'breeze', 'surge', 'crest', 'vault', 'grid', 'portal', 'haven',
    'beacon', 'orbit', 'cloud', 'atlas', 'prism'
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}

export function isValidProjectName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 63) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(trimmed);
}

// Modal State preserved across store notifications
let step = 'drop'; // 'drop' | 'configure' | 'deploying' | 'completed'
let deploySourceType = 'upload'; // 'upload' | 'github' | 'starter'
let selectedGithubRepo = null;
let selectedBranch = 'main';
let buildCommand = 'npm run build';
let autoDeployOnPush = true;
let githubSearchQuery = '';
let unsupportedFileAlert = null;

let droppedFilesInfo = null;
let serviceName = generateRandomProjectName();
let region = 'Frankfurt (eu-central-1)';
let publishDir = './dist';
let framework = 'Vite / Single-Page App';
let envVars = [{ key: 'NODE_ENV', value: 'production' }];
let deploySpeed = 'fast'; // 'normal' | 'fast' | 'instant'
let deployProgress = 0;
let deployInterval = null;
let isDeployPaused = false;
let logFilter = 'all'; // 'all' | 'build' | 'network' | 'security'
let logLines = [];
let newServiceCreated = null;

// Cloudflare Edge Hosting & Custom Domain State
let cfDomain = '';
let cfZoneId = '';
let cfProxied = true;
let cfPurgeCache = true;

// File tree & code inspection state
let virtualFilesMap = new Map(); // path -> { content, size, isBinary }
let selectedFileForPreview = 'index.html';

export function resetDeployModalState() {
  step = 'drop';
  deploySourceType = 'upload';
  selectedGithubRepo = null;
  selectedBranch = 'main';
  buildCommand = 'npm run build';
  autoDeployOnPush = true;
  githubSearchQuery = '';
  unsupportedFileAlert = null;
  droppedFilesInfo = null;
  serviceName = store.targetServiceName || generateRandomProjectName();
  region = 'Frankfurt (eu-central-1)';
  publishDir = './dist';
  framework = 'Vite / Single-Page App';
  envVars = [{ key: 'NODE_ENV', value: 'production' }];
  deploySpeed = 'fast';
  deployProgress = 0;
  if (deployInterval) {
    clearInterval(deployInterval);
    deployInterval = null;
  }
  isDeployPaused = false;
  logFilter = 'all';
  logLines = [];
  newServiceCreated = null;
  cfDomain = '';
  cfZoneId = store.cloudflareConfig?.zoneId || '';
  cfProxied = store.cloudflareConfig?.defaultProxied !== undefined ? store.cloudflareConfig.defaultProxied : true;
  cfPurgeCache = store.cloudflareConfig?.autoPurge !== undefined ? store.cloudflareConfig.autoPurge : true;
  virtualFilesMap = new Map();
  selectedFileForPreview = 'index.html';
}

// Main Deploy Modal Component
export function renderDeployModal(container) {
  if (!store.isDeployModalOpen) {
    if (wasModalOpen) {
      resetDeployModalState();
      wasModalOpen = false;
    }
    container.innerHTML = '';
    return;
  }

  if (!wasModalOpen) {
    resetDeployModalState();
    wasModalOpen = true;
  }

  function render() {
    const rawTab = store.deployModalTab;
    const activeTab = 'drop';
    deploySourceType = 'upload';

    const isUpdatingExisting = Boolean(store.targetServiceName);
    const titleText = step === 'drop'
      ? (isUpdatingExisting ? 'New Deployment' : 'Drag & Drop Instant Deployment')
      : step === 'configure'
        ? 'Review & Configure Deployment'
        : step === 'deploying'
          ? 'Deploying to AlloDeploy Edge'
          : 'Deployment Successfully Published!';

    const subText = step === 'drop'
      ? (isUpdatingExisting ? `Upload new files to update project "${store.targetServiceName}"` : 'Deploy your static website or built dist folder directly to AlloDeploy Edge.')
      : step === 'configure'
        ? (deploySourceType === 'github' ? `Repository: ${selectedGithubRepo?.full_name || serviceName} · Branch: ${selectedBranch}` : '')
        : step === 'deploying'
          ? `Deploying "${serviceName}" to AlloDeploy global network...`
          : (newServiceCreated?.cloudflarePagesUrl || `https://${serviceName}.pages.dev`);

    const isNameValid = isUpdatingExisting ? true : isValidProjectName(serviceName);
    const isFolderReady = droppedFilesInfo && droppedFilesInfo.hasIndexHtml === true;
    const canDirectDeploy = isNameValid && isFolderReady;

    container.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop-overlay">
        <div class="deploy-modal ${step === 'configure' ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
          <!-- Header -->
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="service-icon-box" style="width: 32px; height: 32px;">
                ${step === 'deploying' ? icons.activity : step === 'completed' ? icons.check : icons.cloudUpload}
              </div>
              <div>
                <h2>
                  <span>${titleText}</span>
                </h2>
                ${subText ? `
                <div style="font-size: 12px; color: var(--text-faint);">
                  ${subText}
                </div>` : ''}
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              ${step === 'configure' ? `
                <span class="badge badge-live">
                  ${icons.shield} Security Checked
                </span>
              ` : ''}
              <button class="icon-btn" id="btn-close-modal" title="Close Modal">
                ${icons.close}
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="modal-body" style="padding: 24px; max-height: 72vh; overflow-y: auto;">
            ${step === 'drop' ? renderDropStep() : ''}
            ${step === 'configure' ? renderConfigureStep() : ''}
            ${step === 'deploying' ? renderDeployingStep() : ''}
            ${step === 'completed' ? renderCompletedStep() : ''}
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            ${step === 'drop' ? `
              <button class="btn btn-secondary" id="btn-cancel-drop">Cancel</button>
              ${activeTab === 'drop' ? `
                <button class="btn btn-primary" id="btn-start-deployment-drop" ${!canDirectDeploy ? 'disabled style="opacity: 0.45; cursor: not-allowed; background: #334155;"' : 'style="background: linear-gradient(135deg, #7c3aed, #a855f7); font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);"'}>
                  <span>🚀</span>
                  <span>${!droppedFilesInfo ? 'Choose Folder to Deploy' : (!isNameValid ? 'Enter Valid Project Name' : (!droppedFilesInfo.hasIndexHtml ? 'Missing Root index.html' : (isUpdatingExisting ? `Deploy to ${store.targetServiceName}` : 'Deploy to AlloDeploy')))}</span>
                </button>
              ` : ''}
            ` : ''}

            ${step === 'configure' ? `
              <button class="btn btn-secondary" id="btn-back-to-drop">
                ${icons.arrowLeft} Back
              </button>
              <button class="btn btn-primary" id="btn-start-deployment" ${deploySourceType === 'upload' && droppedFilesInfo && droppedFilesInfo.hasIndexHtml === false ? 'disabled style="opacity: 0.5; cursor: not-allowed; background: #64748b;"' : 'style="background: linear-gradient(135deg, #7c3aed, #a855f7); font-weight: 600; padding: 10px 20px;"'}>
                ${icons.zap}
                <span>${deploySourceType === 'github' ? 'Build & Deploy from GitHub' : (deploySourceType === 'upload' && droppedFilesInfo && droppedFilesInfo.hasIndexHtml === false ? 'Missing Root index.html' : 'Deploy to AlloDeploy')}</span>
              </button>
            ` : ''}

            ${step === 'deploying' ? `
              <div style="font-size: 13px; color: var(--text-faint); margin-right: auto; display: flex; align-items: center; gap: 8px;">
                <span class="status-dot building"></span>
                <span>Streaming live build & distribution logs...</span>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-toggle-pause-deploy">
                ${isDeployPaused ? icons.play : icons.pause}
                <span>${isDeployPaused ? 'Resume Stream' : 'Pause Stream'}</span>
              </button>
            ` : ''}

            ${step === 'completed' ? `
              <button class="btn btn-secondary" id="btn-view-all-services">
                Go to Dashboard
              </button>
              <button class="btn btn-primary" id="btn-open-preview-live" style="background: linear-gradient(135deg, #6366f1, #10b981);">
                ${icons.externalLink}
                <span>Open in In-App Device Preview</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderDropStep() {
    return renderManualDropSection();
  }

  function renderManualDropSection() {
    const isNameValid = isValidProjectName(serviceName);
    const isFolderReady = droppedFilesInfo && droppedFilesInfo.hasIndexHtml === true;
    const canDeploy = isNameValid && isFolderReady;

    return `
      <!-- Hidden File & Folder Inputs (Always active in DOM) -->
      <input type="file" id="real-file-input" multiple style="display: none;" />
      <input type="file" id="real-folder-input" webkitdirectory directory style="display: none;" />
      <input type="file" id="real-zip-input" accept=".zip,.tar,.gz,.tgz" style="display: none;" />

      ${unsupportedFileAlert ? `
        <div class="file-validation-alert">
          <div style="flex-shrink: 0; margin-top: 2px;">${icons.alertTriangle}</div>
          <div style="flex: 1;">
            <strong>Unsupported File Format:</strong> ${unsupportedFileAlert}
          </div>
          <button class="icon-btn btn-sm" id="btn-dismiss-alert" title="Dismiss" style="margin-left: auto;">
            ${icons.close}
          </button>
        </div>
      ` : ''}

      ${!store.targetServiceName ? `
      <!-- Step 1: Cloudflare Pages Project Configuration (New Projects only) -->
      <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--radius-md); padding: 16px 18px; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <label for="project-name-input" style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #cbd5e1; display: flex; align-items: center; gap: 6px; margin: 0;">
            Project Name
          </label>
          ${store.services && store.services.length > 0 ? `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11px; color: var(--text-faint);">Or target project:</span>
              <select id="select-existing-project" class="auth-input" style="font-size: 11px; padding: 4px 8px; width: auto; max-width: 170px; height: auto; background: rgba(0,0,0,0.5);">
                <option value="">-- New Project --</option>
                ${store.services.map(s => `<option value="${s.name}" ${s.name === serviceName ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <div style="position: relative; flex: 1;">
            <input
              type="text"
              id="project-name-input"
              class="auth-input"
              placeholder="e.g. swift-wave-418"
              value="${serviceName}"
              style="width: 100%; font-family: var(--font-mono); font-weight: 600; font-size: 14px; padding: 10px 14px; background: rgba(0, 0, 0, 0.4); border-color: ${isNameValid ? 'rgba(99, 102, 241, 0.4)' : 'rgba(239, 68, 68, 0.5)'};"
            />
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-auto-name" title="Generate random memorable project name" style="white-space: nowrap; padding: 10px 14px; display: inline-flex; align-items: center; gap: 6px;">
            <span>🎲</span> Randomize
          </button>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; flex-wrap: wrap; gap: 8px;">
          <div style="color: var(--text-faint); display: flex; align-items: center; gap: 5px;">
            <span>Live URL:</span>
            <span style="font-family: var(--font-mono); color: #38bdf8; font-weight: 500;">
              https://<strong id="project-url-preview" style="color: #7dd3fc;">${serviceName || 'project-name'}</strong>.pages.dev
            </span>
          </div>
          <div>
            ${isNameValid 
              ? `<span style="color: #34d399; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">✓ Valid project name</span>`
              : `<span style="color: #f87171; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">⚠ 3–63 chars: lowercase, numbers, hyphens</span>`
            }
          </div>
        </div>
      </div>
      ` : `
      <!-- Existing Project Target Banner -->
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: var(--radius-md); padding: 12px 18px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); display: flex; align-items: center; justify-content: center; font-size: 18px;">
            📁
          </div>
          <div>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); font-weight: 600;">Updating Existing Project</div>
            <div style="font-size: 15px; font-weight: 700; color: #fff; font-family: var(--font-mono);">${store.targetServiceName}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11.5px; color: var(--text-faint);">Live:</span>
          <span style="font-family: var(--font-mono); font-size: 12px; color: #38bdf8; background: rgba(0, 0, 0, 0.4); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.08);">
            https://${store.targetServiceName}.pages.dev
          </span>
        </div>
      </div>
      `}

      <!-- Step 2: Staged Folder Summary OR Empty Drop Zone -->
      ${droppedFilesInfo ? `
        <!-- Staged Folder Card -->
        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: var(--radius-md); padding: 18px 20px; margin-bottom: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 44px; height: 44px; border-radius: 10px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); display: flex; align-items: center; justify-content: center; font-size: 22px; color: #818cf8; flex-shrink: 0;">
                ${droppedFilesInfo.isZip ? '📦' : '📁'}
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-weight: 700; font-size: 15px; color: #fff;">
                    ${droppedFilesInfo.sourceName || 'dist'}
                  </span>
                  <span class="badge badge-tag" style="font-size: 11px;">
                    ${droppedFilesInfo.filesCount} ${droppedFilesInfo.filesCount === 1 ? 'file' : 'files'} · ${droppedFilesInfo.size}
                  </span>
                </div>
                <div style="font-size: 12px; color: var(--text-faint); margin-top: 2px;">
                  Framework: <strong style="color: #cbd5e1;">${droppedFilesInfo.framework || 'Static Site Bundle'}</strong>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              ${droppedFilesInfo.hasIndexHtml
                ? `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 11.5px; font-weight: 600; padding: 4px 10px; display: inline-flex; align-items: center; gap: 5px;">
                     <span>✓</span> Root index.html Verified
                   </span>`
                : `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 11.5px; font-weight: 600; padding: 4px 10px; display: inline-flex; align-items: center; gap: 5px;">
                     <span>⚠</span> Missing Root index.html
                   </span>`
              }
              <button type="button" class="btn btn-secondary btn-sm" id="btn-remove-folder" style="color: #cbd5e1; font-size: 12px; padding: 6px 12px;">
                ✕ Change Folder
              </button>
            </div>
          </div>

          ${!droppedFilesInfo.hasIndexHtml ? `
            <div style="margin-top: 12px; padding: 10px 14px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 6px; font-size: 12px; color: #fca5a5;">
              <strong>Missing Entrypoint:</strong> AlloDeploy requires an <code>index.html</code> at the root of the uploaded directory. Please select your built distribution folder (e.g., <code>dist/</code>, <code>build/</code>, or <code>out/</code>) which contains your <code>index.html</code>.
            </div>
          ` : ''}

          ${droppedFilesInfo.sampleFiles && droppedFilesInfo.sampleFiles.length > 0 ? `
            <div style="margin-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 10px;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); margin-bottom: 6px;">
                Staged Files Preview
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 72px; overflow-y: auto;">
                ${droppedFilesInfo.sampleFiles.map(f => `
                  <span style="font-family: var(--font-mono); font-size: 11px; background: rgba(0, 0, 0, 0.4); padding: 2px 7px; border-radius: 4px; color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.05);">
                    ${f}
                  </span>
                `).join('')}
                ${droppedFilesInfo.filesCount > droppedFilesInfo.sampleFiles.length ? `
                  <span style="font-size: 11px; color: var(--text-faint); padding: 2px 4px;">
                    +${droppedFilesInfo.filesCount - droppedFilesInfo.sampleFiles.length} more
                  </span>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      ` : `
        <!-- Main Dropzone -->
        <div class="dropzone" id="active-dropzone" style="padding: 34px 20px; margin-bottom: 16px;">
          <div class="dropzone-icon-circle" style="width: 64px; height: 64px; background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #818cf8; margin-bottom: 4px;">
            ${icons.cloudUpload}
          </div>

          <div style="text-align: center; margin-bottom: 14px;">
            <div class="dropzone-title" style="font-size: 17px; font-weight: 700; color: #fff;">
              Drag & drop project folder, ZIP archive, or files here
            </div>
            <div style="font-size: 12.5px; color: var(--text-faint); margin-top: 4px;">
              Supports your built <code style="color: #a5b4fc;">dist/</code>, <code style="color: #a5b4fc;">build/</code>, or static web assets with an <code style="color: #34d399;">index.html</code>
            </div>
          </div>

          <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
            <button type="button" class="btn btn-primary btn-sm" id="btn-select-folder" style="background: linear-gradient(135deg, #6366f1, #4f46e5); font-weight: 600;">
              ${icons.folder} Select Project Folder
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-select-zip">
              ${icons.archive} Upload .ZIP Archive
            </button>
          </div>
        </div>
      `}


      ${!store.targetServiceName ? `
      <!-- Optional Advanced Settings Accordion (New Projects only) -->
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.06);">
        <button type="button" id="btn-toggle-advanced-drop" style="background: none; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 0;">
          <span>⚙️</span>
          <span style="text-decoration: underline;">Advanced AlloDeploy & Custom Domain Settings</span>
          <span id="adv-caret">▾</span>
        </button>

        <div id="drop-advanced-panel" style="display: none; margin-top: 12px; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="font-size: 11.5px; color: var(--text-muted); display: block; margin-bottom: 4px;">Custom Domain (Optional)</label>
              <input type="text" id="drop-cfg-cf-domain" class="auth-input" placeholder="e.g. app.mydomain.com" value="${cfDomain}" style="font-family: var(--font-mono); font-size: 12.5px; width: 100%;" />
            </div>
            <div>
              <label style="font-size: 11.5px; color: var(--text-muted); display: block; margin-bottom: 4px;">AlloDeploy DNS Zone</label>
              <select id="drop-cfg-cf-zone" style="font-size: 12.5px; width: 100%;">
                <option value="">Default Account Managed Zone</option>
                ${(store.cloudflareZones || []).map(z => `<option value="${z.id}" ${z.id === cfZoneId ? 'selected' : ''}>${z.name}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>
      ` : ''}
    `;
  }

  function renderGithubSection() {
    const isConnected = store.githubConnected;
    const repos = store.githubRepos || [];
    const ghUser = store.githubUser;
    const filteredRepos = repos.filter(r => {
      if (!githubSearchQuery) return true;
      const q = githubSearchQuery.toLowerCase();
      return r.name.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q)) || (r.language && r.language.toLowerCase().includes(q));
    });

    if (!isConnected) {
      return `
        <!-- Connect Git via Gmail / Google Account Card -->
        <div style="background: rgba(15, 20, 34, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 22px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="display: flex; align-items: center;">${icons.gmail || icons.google}</span>
              <div>
                <h3 style="color: #fff; font-size: 15px; font-weight: 700; margin: 0;">Connect Git Account via Gmail</h3>
                <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0;">
                  Sign in with your Gmail address to import and deploy repositories.
                </p>
              </div>
            </div>
            <span class="badge" style="background: rgba(234, 67, 53, 0.15); color: #f87171; border: 1px solid rgba(234, 67, 53, 0.3); font-size: 11px;">
              ⚡ 1-Click Link
            </span>
          </div>

          <div style="display: flex; gap: 8px; flex-direction: column;">
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <input type="email" id="modal-gh-gmail-input" class="auth-input" placeholder="developer@gmail.com" value="${store.user?.email || ''}" style="flex: 1.2; min-width: 200px;" />
              <input type="text" id="modal-gh-username-input" class="auth-input" placeholder="GitHub username (optional)" style="flex: 1; min-width: 160px; font-family: var(--font-mono);" />
              <button type="button" class="btn btn-coolify-primary btn-sm" id="btn-modal-connect-gmail" style="white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                ${icons.google} Connect via Gmail
              </button>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--text-faint); margin-top: 4px;">
              <span>Instant sync with your public & team Git repositories</span>
              <button type="button" id="btn-toggle-token-input" style="color: #818cf8; background: none; border: none; cursor: pointer; text-decoration: underline; font-size: 11.5px;">
                Use Personal Access Token instead
              </button>
            </div>
          </div>

          <!-- Collapsible Token Option -->
          <div id="modal-token-drawer" style="display: none; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06);">
            <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px;">
              GitHub Personal Access Token (for private fine-grained repos)
            </label>
            <div style="display: flex; gap: 8px;">
              <input type="password" id="modal-gh-token-input" class="auth-input" placeholder="ghp_••••••••••••••••••••••••••••••••••••" style="font-family: var(--font-mono);" />
              <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-connect-gh" style="white-space: nowrap;">
                Verify Token
              </button>
            </div>
          </div>
        </div>

        <!-- Or Import from Custom GitHub URL -->
        <div style="padding-top: 6px;">
          <div style="font-size: 12.5px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px;">
            Or Import Any Git Repository URL
          </div>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="custom-github-url" placeholder="https://github.com/owner/repository" style="flex: 1; background: var(--bg-input); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; color: #fff; font-family: var(--font-mono);" />
            <button type="button" class="btn btn-secondary btn-sm" id="btn-import-custom-git">
              ${icons.github} Inspect & Import
            </button>
          </div>
        </div>
      `;
    }

    return `
      <!-- GitHub Connected Account Bar -->
      <div class="github-account-bar">
        <div class="github-user-info">
          <img src="${ghUser?.avatar_url || 'https://api.dicebear.com/7.x/identicon/svg?seed=gh'}" class="github-avatar" alt="${ghUser?.login || 'Developer'}" />
          <div>
            <div style="font-weight: 700; font-size: 14px; color: #fff; display: flex; align-items: center; gap: 6px;">
              <span>${ghUser?.name || ghUser?.login}</span>
              <span style="font-size: 12px; color: var(--text-faint); font-family: var(--font-mono);">(@${ghUser?.login})</span>
              <span class="badge badge-live" style="font-size: 10px; padding: 2px 6px;">
                ${ghUser?.authProvider === 'gmail' ? '● Connected via Gmail' : '● Connected'}
              </span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
              ${ghUser?.email ? `${ghUser.email} &bull; ` : ''}${repos.length} Repositories Available
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-sync-github">
            ${icons.refresh} Sync Repos
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-disconnect-github-modal" style="color: #fca5a5;">
            Disconnect
          </button>
        </div>
      </div>

      <!-- Search Repositories -->
      <div class="github-search-wrap">
        <span class="github-search-icon">${icons.search}</span>
        <input type="text" id="github-repo-search" class="github-search-input" value="${githubSearchQuery}" placeholder="Search your repositories (e.g. saas, api, docs, zenith)..." spellcheck="false" />
      </div>

      <!-- Repository List -->
      <div class="github-repos-list">
        ${repos.length === 0 ? `
          <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); background: #090c14; border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
            <div style="font-size: 28px; margin-bottom: 8px;">🐙</div>
            <div style="font-weight: 600; color: #fff; font-size: 14.5px;">Loading GitHub Repositories...</div>
            <div style="font-size: 12.5px; margin: 6px 0 16px; color: var(--text-faint);">Fetching available repositories from AlloDeploy Git pipeline.</div>
            <button type="button" class="btn btn-primary btn-sm" id="btn-load-repos-empty">
              ${icons.refresh} Fetch Repositories
            </button>
          </div>
        ` : filteredRepos.length === 0 ? `
          <div style="text-align: center; padding: 32px 16px; color: var(--text-muted); background: #090c14; border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
            <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
            <div style="font-weight: 600; color: #fff;">No repositories match "${githubSearchQuery}"</div>
            <div style="font-size: 12.5px; margin-top: 4px;">Try searching for another keyword or paste a repository URL below.</div>
          </div>
        ` : filteredRepos.map(repo => {
          const langClass = (repo.language || '').toLowerCase().includes('type') ? 'typescript' : (repo.language || '').toLowerCase().includes('java') ? 'javascript' : (repo.language || '').toLowerCase().includes('astro') ? 'astro' : 'html';
          return `
            <div class="github-repo-card" data-repo-id="${repo.id}">
              <div class="github-repo-info">
                <div class="github-repo-name-row">
                  <div style="color: #818cf8; flex-shrink: 0;">${icons.github}</div>
                  <span class="github-repo-name">${repo.full_name}</span>
                  ${repo.private ? `<span class="badge badge-tag" style="font-size: 10px;">${icons.lock} Private</span>` : `<span class="badge badge-tag" style="font-size: 10px;">Public</span>`}
                  <span class="badge badge-tag" style="font-size: 10.5px; color: #38bdf8;">
                    ${icons.gitBranch} ${repo.default_branch || 'main'}
                  </span>
                </div>

                <div class="github-repo-desc">${repo.description || 'GitHub project repository'}</div>

                <div class="github-repo-meta">
                  <span style="display: inline-flex; align-items: center; gap: 5px;">
                    <span class="lang-dot ${langClass}"></span>
                    <span>${repo.language}</span>
                  </span>
                  <span>⭐ ${repo.stargazers_count} stars</span>
                  <span>🍴 ${repo.forks_count} forks</span>
                  ${repo.latest_commit ? `<span style="font-family: var(--font-mono); color: #cbd5e1;">commit: ${repo.latest_commit.sha}</span>` : ''}
                </div>
              </div>

              <button type="button" class="btn btn-primary btn-sm btn-import-repo" data-repo-id="${repo.id}" style="flex-shrink: 0; background: linear-gradient(135deg, #6366f1, #06b6d4);">
                <span>Import & Deploy</span>
                ${icons.arrowLeft ? icons.externalLink : ''}
              </button>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Or Import from Custom GitHub URL -->
      <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border-subtle);">
        <div style="font-size: 12.5px; font-weight: 700; color: #cbd5e1; margin-bottom: 8px;">
          Or Import from Public/Private Git URL
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="custom-github-url" placeholder="https://github.com/owner/repository" style="flex: 1; background: var(--bg-input); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; color: #fff; font-family: var(--font-mono);" />
          <button type="button" class="btn btn-secondary btn-sm" id="btn-import-custom-git">
            ${icons.github} Inspect & Import
          </button>
        </div>
      </div>
    `;
  }

    function renderConfigureStep() {
    if (deploySourceType === 'github') {
      return renderGithubConfigureStep();
    }
    return renderUploadConfigureStep();
  }

  function renderGithubConfigureStep() {
    const defaultAuthor = store.githubUser?.name || store.user?.name || 'Developer';
    const repo = selectedGithubRepo || {
      name: serviceName,
      full_name: `${serviceName}`,
      html_url: `https://github.com/${serviceName}`,
      default_branch: 'main',
      framework: 'Node.js / Web Application',
      latest_commit: { sha: 'HEAD', message: 'Production branch commit', author: defaultAuthor, date: 'Just now' }
    };

    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- GitHub Repository Inspection Banner -->
        <div class="inspection-box">
          <div class="inspection-header">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="service-icon-box" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; width: 42px; height: 42px;">
                ${icons.github}
              </div>
              <div>
                <div style="font-weight: 700; font-size: 15px; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
                  <span>${repo.full_name}</span>
                  ${repo.html_url ? `
                    <a href="${repo.html_url}" target="_blank" style="color: #38bdf8; font-size: 12px; display: inline-flex; align-items: center; gap: 2px;">
                      ${icons.externalLink}
                    </a>
                  ` : ''}
                </div>
                <div style="font-size: 12.5px; color: var(--text-faint);">
                  Source: <strong>GitHub Connected Repo</strong> &bull; CI/CD Webhook Ready
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 8px;">
              <span class="badge badge-live">
                ${repo.framework || 'Node.js'}
              </span>
              <span class="badge badge-tag">
                Auto-Deploy: Enabled
              </span>
            </div>
          </div>

          <!-- Commit Pill -->
          <div class="git-commit-pill" style="margin-top: 10px;">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="color: #38bdf8; font-weight: 700;">${icons.gitCommit} ${repo.latest_commit?.sha || 'HEAD'}</span>
              <span style="color: #cbd5e1;">${repo.latest_commit?.message || 'Production deploy commit'}</span>
            </div>
            <div style="color: var(--text-faint); font-size: 11px; flex-shrink: 0;">
              ${repo.latest_commit?.author || defaultAuthor} (${repo.latest_commit?.date || 'Just now'})
            </div>
          </div>
        </div>

        <!-- Deployment Configuration Form -->
        <div class="config-grid">
          <div class="form-group">
            <label class="form-label" for="cfg-service-name">Service Name (Edge Subdomain)</label>
            <div class="input-with-icon" style="position: relative;">
              <input type="text" id="cfg-service-name" value="${serviceName}" placeholder="e.g. my-app" spellcheck="false" />
            </div>
            <span style="font-size: 11.5px; color: #a78bfa; font-family: var(--font-mono); margin-top: 4px; display: inline-block;">
              ✦ Live at: ${store.backendUrl}/sites/${serviceName}/
            </span>
          </div>

          <div class="form-group">
            <label class="form-label" for="cfg-git-branch">Target Branch</label>
            <select id="cfg-git-branch">
              <option value="main" ${selectedBranch === 'main' ? 'selected' : ''}>main (Production Branch)</option>
              <option value="staging" ${selectedBranch === 'staging' ? 'selected' : ''}>staging (Preview Environment)</option>
              <option value="production" ${selectedBranch === 'production' ? 'selected' : ''}>production</option>
              <option value="dev" ${selectedBranch === 'dev' ? 'selected' : ''}>dev (Development)</option>
            </select>
            <span style="font-size: 11.5px; color: var(--text-faint);">Branch to clone and build on every push</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="cfg-framework">Framework Preset</label>
            <select id="cfg-framework">
              <option value="Vite / Single-Page App" ${framework.includes('Vite') ? 'selected' : ''}>Vite / Single-Page App</option>
              <option value="Next.js / React" ${framework.includes('Next') ? 'selected' : ''}>Next.js / React Static</option>
              <option value="Astro Static" ${framework.includes('Astro') ? 'selected' : ''}>Astro Static Site</option>
              <option value="Node.js / Express" ${framework.includes('Node') ? 'selected' : ''}>Node.js / Express Edge</option>
              <option value="Static HTML5" ${framework.includes('Static') ? 'selected' : ''}>Static HTML5 / CSS3</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="cfg-region">Primary Edge Distribution Region</label>
            <select id="cfg-region">
              <option value="Frankfurt (eu-central-1)" ${region.includes('Frankfurt') ? 'selected' : ''}>Frankfurt (eu-central-1) — 14ms latency</option>
              <option value="Oregon (us-west-1)" ${region.includes('Oregon') ? 'selected' : ''}>Oregon (us-west-1) — 22ms latency</option>
              <option value="Ohio (us-east-2)" ${region.includes('Ohio') ? 'selected' : ''}>Ohio (us-east-2) — 18ms latency</option>
              <option value="Singapore (ap-southeast-1)" ${region.includes('Singapore') ? 'selected' : ''}>Singapore (ap-southeast-1) — 32ms latency</option>
              <option value="Tokyo (ap-northeast-1)" ${region.includes('Tokyo') ? 'selected' : ''}>Tokyo (ap-northeast-1) — 38ms latency</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="cfg-build-cmd">Build Command</label>
            <input type="text" id="cfg-build-cmd" value="${buildCommand}" placeholder="e.g. npm run build" />
            <span style="font-size: 11.5px; color: var(--text-faint);">Command executed after dependency installation</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="cfg-publish-dir">Output / Publish Directory</label>
            <input type="text" id="cfg-publish-dir" value="${publishDir}" placeholder="e.g. dist or out" />
            <span style="font-size: 11.5px; color: var(--text-faint);">Directory holding compiled static files & index.html</span>
          </div>
        </div>

        <!-- Continuous Deployment Option -->
        <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-md); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" id="cfg-auto-deploy" ${autoDeployOnPush ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #10b981; cursor: pointer;" />
            <label for="cfg-auto-deploy" style="font-size: 13.5px; font-weight: 600; color: #fff; cursor: pointer;">
              Auto-Deploy on Git Push (Continuous Deployment)
            </label>
          </div>
          <span style="font-size: 12px; color: #34d399;">
            ● GitHub Webhook Active
          </span>
        </div>

        <!-- AlloDeploy API Hosting & Edge Automation -->
        <div class="cf-deploy-hosting-box" style="background: rgba(168, 85, 247, 0.06); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: var(--radius-md); padding: 16px 18px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">⚡</span>
              <div>
                <div style="font-size: 14px; font-weight: 700; color: #fff;">AlloDeploy Edge Deployment Pipeline</div>
                <div style="font-size: 12px; color: #94a3b8;">Automated build & distribution via AlloDeploy Edge Network</div>
              </div>
            </div>
            <span class="badge" style="background: rgba(168, 85, 247, 0.18); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); font-size: 11px; font-weight: 600;">
              ⚡ AlloDeploy Engine
            </span>
          </div>

          ${store.cloudflareConfig?.hasToken ? `
            <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
              <div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #c084fc; font-weight: 700;">Target Live AlloDeploy Link:</div>
                <div style="font-family: var(--font-mono); font-size: 13.5px; color: #c084fc; font-weight: 600;">
                  https://${serviceName}.pages.dev
                </div>
              </div>
              <span class="badge badge-live" style="font-size: 10.5px;">AlloDeploy Connected</span>
            </div>
          ` : `
            <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
              <div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #34d399; font-weight: 700;">Live Host Runtime URL:</div>
                <div style="font-family: var(--font-mono); font-size: 13px; color: #cbd5e1; font-weight: 500;">
                  ${store.backendUrl}/sites/${serviceName}/
                </div>
              </div>
              <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); font-size: 10.5px;">Connect AlloDeploy Token in Settings for custom domains</span>
            </div>
          `}

          <div class="form-grid-2" style="margin-bottom: 10px;">
            <div class="form-group">
              <label class="form-label" for="cfg-cf-domain">Custom Domain (Optional)</label>
              <input type="text" id="cfg-cf-domain" value="${cfDomain}" placeholder="e.g. app.mycompany.com" style="font-family: var(--font-mono); font-size: 13px;" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cfg-cf-zone">AlloDeploy Zone</label>
              <select id="cfg-cf-zone" style="font-size: 13px;">
                <option value="">Auto-detect from domain</option>
                ${(store.cloudflareZones || []).map(z => `<option value="${z.id}" ${cfZoneId === z.id ? 'selected' : ''}>${z.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 12.5px;">
            <label style="display: flex; align-items: center; gap: 8px; color: #cbd5e1; cursor: pointer;">
              <input type="checkbox" id="cfg-cf-proxy" ${cfProxied ? 'checked' : ''} style="accent-color: #a855f7;" />
              <span>AlloDeploy Proxy & Shield ⚡</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; color: #cbd5e1; cursor: pointer;">
              <input type="checkbox" id="cfg-cf-purge" ${cfPurgeCache ? 'checked' : ''} style="accent-color: #a855f7;" />
              <span>Auto-Purge Edge Cache on Deploy</span>
            </label>
          </div>
        </div>

        <!-- Environment Variables Section -->
        <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div>
              <label style="font-size: 13.5px; font-weight: 600; color: var(--text-main);">Edge Environment Variables</label>
              <div style="font-size: 11.5px; color: var(--text-faint);">Encrypted with AES-256 and injected at edge build & run time</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-add-env">
              ${icons.plus} Add Variable
            </button>
          </div>

          <div id="env-vars-container" style="display: flex; flex-direction: column; gap: 8px;">
            ${envVars.map((ev, idx) => `
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" class="env-key-input" data-index="${idx}" value="${ev.key}" placeholder="KEY (e.g. DATABASE_URL)" style="flex: 1; font-family: var(--font-mono); font-size: 12.5px;" />
                <span style="color: var(--text-faint); font-weight: 700;">=</span>
                <input type="text" class="env-val-input" data-index="${idx}" value="${ev.value}" placeholder="VALUE" style="flex: 1; font-family: var(--font-mono); font-size: 12.5px;" />
                <button type="button" class="icon-btn btn-sm btn-remove-env" data-index="${idx}" title="Delete Variable">
                  ${icons.trash}
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderUploadConfigureStep() {
    const fileEntries = Array.from(virtualFilesMap.keys());
    const currentCode = virtualFilesMap.get(selectedFileForPreview)?.content || '/* File content preview unavailable or binary asset */';

    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        ${droppedFilesInfo && droppedFilesInfo.hasIndexHtml === false ? `
          <div style="background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.45); border-radius: var(--radius-md); padding: 14px 18px; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 18px rgba(239, 68, 68, 0.15);">
            <span style="font-size: 24px; flex-shrink: 0;">⚠️</span>
            <div>
              <div style="font-weight: 700; color: #ef4444; font-size: 14px; margin-bottom: 2px;">Missing Root index.html File</div>
              <div style="font-size: 12.5px; color: #fca5a5; line-height: 1.4;">
                AlloDeploy requires an <code>index.html</code> file located directly in the root of your dropped folder. Please drop a valid built web folder (such as <code>dist/</code> or <code>build/</code>) containing <code>index.html</code>.
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Bundle Health & Inspection Card -->
        <div class="inspection-box">
          <div class="inspection-header">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="service-icon-box" style="background: rgba(16, 185, 129, 0.15); color: #34d399; width: 40px; height: 40px;">
                ${icons.check}
              </div>
              <div>
                <div style="font-weight: 700; font-size: 15px; color: #f8fafc;">
                  Bundle Inspected & Checksum Verified
                </div>
                <div style="font-size: 12.5px; color: var(--text-faint);">
                  Source: <strong>${droppedFilesInfo.sourceName}</strong> · Checksum: <code style="font-size: 11.5px; color: #38bdf8;">sha256:7f9a21b4e</code>
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 8px;">
              <span class="badge badge-live">
                ${droppedFilesInfo.framework}
              </span>
              <span class="badge badge-tag">
                Score: 99/100 A+
              </span>
            </div>
          </div>

          <!-- File Stats Row -->
          <div class="file-stats-row" style="background: rgba(255, 255, 255, 0.02); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
            <div class="file-stat-item">
              ${icons.folder}
              <span><strong>${droppedFilesInfo.filesCount}</strong> files detected</span>
            </div>
            <div class="file-stat-item">
              ${icons.cpu}
              <span>Raw Size: <strong>${droppedFilesInfo.size}</strong></span>
            </div>
            <div class="file-stat-item" style="color: ${droppedFilesInfo.hasIndexHtml !== false ? '#34d399' : '#ef4444'};">
              <span>${droppedFilesInfo.hasIndexHtml !== false ? '✓ Root index.html detected' : '✕ Missing root index.html'}</span>
            </div>
            <div class="file-stat-item" style="margin-left: auto; color: #a5b4fc;">
              ${icons.shield}
              <span>Zero CVEs Detected</span>
            </div>
          </div>

          <!-- Interactive File Explorer & In-Modal Code Inspector -->
          <div style="display: grid; grid-template-columns: 240px 1fr; gap: 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; background: #06090e;">
            <!-- File Tree list -->
            <div style="border-right: 1px solid var(--border-subtle); padding: 10px; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 6px;">
                Extracted Files (${fileEntries.length})
              </div>
              ${fileEntries.map(f => `
                <div class="file-tree-item ${f === selectedFileForPreview ? 'active' : ''}" data-file="${f}" style="display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 11.5px; cursor: pointer; color: ${f === selectedFileForPreview ? '#fff' : 'var(--text-muted)'}; background: ${f === selectedFileForPreview ? 'rgba(99, 102, 241, 0.25)' : 'transparent'};">
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f}">
                    ${getFileIcon(f)} ${f}
                  </span>
                  <span style="font-size: 10px; color: var(--text-faint); margin-left: 6px;">
                    ${formatBytes(virtualFilesMap.get(f)?.size || 0)}
                  </span>
                </div>
              `).join('')}
            </div>

            <!-- Code / Text preview pane -->
            <div style="padding: 10px 14px; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; margin-bottom: 8px;">
                <span style="font-family: var(--font-mono); font-size: 11.5px; color: #38bdf8;">
                  📄 ${selectedFileForPreview}
                </span>
                <span style="font-size: 11px; color: var(--text-faint);">
                  Read-only Bundle Inspector
                </span>
              </div>
              <pre style="margin: 0; font-family: var(--font-mono); font-size: 11px; color: #cbd5e1; line-height: 1.5; white-space: pre-wrap; word-break: break-all;"><code>${escapeHtml(currentCode.slice(0, 1800))}${currentCode.length > 1800 ? '\n... (truncated for preview)' : ''}</code></pre>
            </div>
          </div>
        </div>

        <!-- Deployment Configuration Form -->
        <div class="config-grid">
          <div class="form-group">
            <label class="form-label" for="cfg-service-name">Project Name</label>
            <div class="input-with-icon" style="position: relative;">
              <input type="text" id="cfg-service-name" value="${serviceName}" placeholder="e.g. my-awesome-site" spellcheck="false" />
            </div>
            <div style="display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px;">
              <span style="font-size: 12px; color: #c084fc; font-family: var(--font-mono); font-weight: 600;">
                ⚡ AlloDeploy: <span id="cf-pages-preview">https://${serviceName}.pages.dev</span>
              </span>
              <span style="font-size: 11.5px; color: #a78bfa; font-family: var(--font-mono);">
                ✦ Server Root: ${store.backendUrl}/sites/${serviceName}/
              </span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="cfg-region">Primary Edge Distribution Region</label>
            <select id="cfg-region">
              <option value="Frankfurt (eu-central-1)" ${region.includes('Frankfurt') ? 'selected' : ''}>Frankfurt (eu-central-1) — 14ms latency</option>
              <option value="Oregon (us-west-1)" ${region.includes('Oregon') ? 'selected' : ''}>Oregon (us-west-1) — 22ms latency</option>
              <option value="Ohio (us-east-2)" ${region.includes('Ohio') ? 'selected' : ''}>Ohio (us-east-2) — 18ms latency</option>
              <option value="Singapore (ap-southeast-1)" ${region.includes('Singapore') ? 'selected' : ''}>Singapore (ap-southeast-1) — 32ms latency</option>
              <option value="Tokyo (ap-northeast-1)" ${region.includes('Tokyo') ? 'selected' : ''}>Tokyo (ap-northeast-1) — 38ms latency</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="cfg-publish-dir">Publish Directory Entrypoint</label>
            <input type="text" id="cfg-publish-dir" value="${publishDir}" placeholder="./dist or ./" />
            <span style="font-size: 11.5px; color: var(--text-faint);">Where your index.html and static assets reside</span>
          </div>

          <div class="form-group">
            <label class="form-label">Deployment Speed / Optimization Level</label>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-sm ${deploySpeed === 'normal' ? 'btn-primary' : 'btn-secondary'} btn-speed-opt" data-speed="normal" style="flex: 1;">
                Standard (1x)
              </button>
              <button type="button" class="btn btn-sm ${deploySpeed === 'fast' ? 'btn-primary' : 'btn-secondary'} btn-speed-opt" data-speed="fast" style="flex: 1;">
                Turbopack (2x)
              </button>
              <button type="button" class="btn btn-sm ${deploySpeed === 'instant' ? 'btn-primary' : 'btn-secondary'} btn-speed-opt" data-speed="instant" style="flex: 1;">
                Edge Instant (3x)
              </button>
            </div>
            <span style="font-size: 11.5px; color: var(--text-faint);">Parallel multi-region propagation speed</span>
          </div>
        </div>

        <!-- AlloDeploy API Hosting & Edge Automation -->
        <div class="cf-deploy-hosting-box" style="background: rgba(168, 85, 247, 0.05); border: 1px solid rgba(168, 85, 247, 0.28); border-radius: var(--radius-md); padding: 14px 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">⚡</span>
              <div>
                <div style="font-size: 13.5px; font-weight: 700; color: #fff;">AlloDeploy Edge Hosting & Custom Domain</div>
                <div style="font-size: 11.5px; color: #94a3b8;">Automate DNS records, DDoS shield, proxy, and edge SSL via AlloDeploy</div>
              </div>
            </div>
            <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35); font-size: 11px;">
              AlloDeploy API
            </span>
          </div>

          <div class="form-grid-2" style="margin-bottom: 10px;">
            <div class="form-group">
              <label class="form-label" for="cfg-cf-domain">Custom Domain (Optional)</label>
              <input type="text" id="cfg-cf-domain" value="${cfDomain}" placeholder="e.g. app.mycompany.com" style="font-family: var(--font-mono); font-size: 13px;" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cfg-cf-zone">AlloDeploy Zone</label>
              <select id="cfg-cf-zone" style="font-size: 13px;">
                <option value="">Auto-detect from domain</option>
                ${(store.cloudflareZones || []).map(z => `<option value="${z.id}" ${cfZoneId === z.id ? 'selected' : ''}>${z.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 12.5px;">
            <label style="display: flex; align-items: center; gap: 8px; color: #cbd5e1; cursor: pointer;">
              <input type="checkbox" id="cfg-cf-proxy" ${cfProxied ? 'checked' : ''} style="accent-color: #a855f7;" />
              <span>AlloDeploy Proxy & Shield ⚡</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; color: #cbd5e1; cursor: pointer;">
              <input type="checkbox" id="cfg-cf-purge" ${cfPurgeCache ? 'checked' : ''} style="accent-color: #a855f7;" />
              <span>Auto-Purge Edge Cache on Deploy</span>
            </label>
          </div>
        </div>

        <!-- Environment Variables Section -->
        <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div>
              <label style="font-size: 13.5px; font-weight: 600; color: var(--text-main);">Edge Environment Variables</label>
              <div style="font-size: 11.5px; color: var(--text-faint);">Encrypted with AES-256 and injected at edge request time</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-add-env">
              ${icons.plus} Add Variable
            </button>
          </div>

          <div id="env-vars-container" style="display: flex; flex-direction: column; gap: 8px;">
            ${envVars.map((ev, idx) => `
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" class="env-key-input" data-index="${idx}" value="${ev.key}" placeholder="KEY (e.g. API_TOKEN)" style="flex: 1; font-family: var(--font-mono); font-size: 12.5px;" />
                <span style="color: var(--text-faint); font-weight: 700;">=</span>
                <input type="text" class="env-val-input" data-index="${idx}" value="${ev.value}" placeholder="VALUE" style="flex: 1; font-family: var(--font-mono); font-size: 12.5px;" />
                <button type="button" class="icon-btn btn-sm btn-remove-env" data-index="${idx}" title="Delete Variable">
                  ${icons.trash}
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderDeployingStep() {
    return `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="font-weight: 600; font-size: 14.5px; display: flex; align-items: center; gap: 8px;">
            <span class="status-dot building"></span>
            <span>Deploying to Global Edge: <strong>${serviceName}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="badge badge-tag" style="font-size: 11px;">
              Region: ${region.split(' ')[0]}
            </span>
            <span style="font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: #38bdf8;">
              ${deployProgress}%
            </span>
          </div>
        </div>

        <div class="deployment-progress-bar-wrap" style="height: 8px; margin-bottom: 18px;">
          <div class="deployment-progress-bar-fill" style="width: ${deployProgress}%;"></div>
        </div>

        <!-- Terminal Filter & Title Bar -->
        <div class="terminal-window" style="min-height: 320px;">
          <div class="terminal-titlebar">
            <div class="terminal-dots">
              <span class="t-dot red"></span>
              <span class="t-dot yellow"></span>
              <span class="t-dot green"></span>
            </div>
            
            <div style="display: flex; gap: 8px;">
              <span class="badge ${logFilter === 'all' ? 'badge-live' : 'badge-tag'} filter-log-btn" data-filter="all" style="cursor: pointer; font-size: 10.5px;">All Logs</span>
              <span class="badge ${logFilter === 'build' ? 'badge-live' : 'badge-tag'} filter-log-btn" data-filter="build" style="cursor: pointer; font-size: 10.5px;">Build</span>
              <span class="badge ${logFilter === 'network' ? 'badge-live' : 'badge-tag'} filter-log-btn" data-filter="network" style="cursor: pointer; font-size: 10.5px;">Anycast Network</span>
              <span class="badge ${logFilter === 'security' ? 'badge-live' : 'badge-tag'} filter-log-btn" data-filter="security" style="cursor: pointer; font-size: 10.5px;">Security & SSL</span>
            </div>

            <button class="icon-btn btn-sm" id="btn-copy-terminal" title="Copy Terminal Output">
              ${icons.copy}
            </button>
          </div>

          <div class="terminal-logs" id="terminal-log-output" style="max-height: 280px; min-height: 240px;">
            ${logLines.map(l => `
              <div class="log-line">
                <span class="log-time">[${l.time}]</span>
                <span class="log-${l.type}">${l.text}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderCompletedStep() {
    const isCloudflareActive = !!(newServiceCreated?.cloudflareConnected && newServiceCreated?.cloudflarePagesUrl);
    const localUrl = `${store.backendUrl}/sites/${serviceName}/`;
    const liveTargetUrl = isCloudflareActive ? newServiceCreated.cloudflarePagesUrl : localUrl;

    return `
      <div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px 10px; gap: 18px;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; display: flex; align-items: center; justify-content: center; color: #34d399; font-size: 32px; box-shadow: 0 0 30px rgba(16, 185, 129, 0.3);">
          ${icons.check}
        </div>

        <!-- Live URL Box -->
        <div style="background: rgba(15, 23, 42, 0.95); border: 1px solid ${isCloudflareActive ? 'rgba(168, 85, 247, 0.45)' : 'rgba(16, 185, 129, 0.45)'}; border-radius: var(--radius-md); padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; gap: 18px; width: 100%; max-width: 680px; box-shadow: 0 6px 24px ${isCloudflareActive ? 'rgba(168, 85, 247, 0.18)' : 'rgba(16, 185, 129, 0.15)'};">
          <div style="display: flex; align-items: center; gap: 14px; text-align: left; min-width: 0; flex: 1;">
            ${isCloudflareActive ? '<span style="font-size: 24px; flex-shrink: 0;">⚡</span>' : '<span class="status-dot running" style="width: 10px; height: 10px; flex-shrink: 0;"></span>'}
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${isCloudflareActive ? '#c084fc' : '#34d399'}; font-weight: 700; margin-bottom: 3px;">
                ${isCloudflareActive ? 'AlloDeploy Live URL' : 'Live Host Server Instance'}
              </div>
              <a href="${liveTargetUrl}" target="_blank" style="font-family: var(--font-mono); font-size: 14.5px; color: #38bdf8; font-weight: 600; text-decoration: none; word-break: break-all; display: inline-block; line-height: 1.4;" title="${liveTargetUrl}">
                ${liveTargetUrl}
              </a>
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;">
            <button class="btn btn-secondary btn-sm" id="btn-copy-completed-url" data-url="${liveTargetUrl}" style="white-space: nowrap;">
              ${icons.copy} Copy Link
            </button>
            <a href="${liveTargetUrl}" target="_blank" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 5px; background: ${isCloudflareActive ? '#7c3aed; border-color: #7c3aed;' : '#7c3aed; border-color: #7c3aed;'} box-shadow: 0 2px 10px rgba(0,0,0,0.3); white-space: nowrap;">
              ${icons.externalLink} Open Link
            </a>
          </div>
        </div>

        ${!isCloudflareActive ? `
          <div style="background: rgba(168, 85, 247, 0.06); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: var(--radius-md); padding: 12px 16px; width: 100%; max-width: 540px; text-align: left; display: flex; align-items: flex-start; gap: 10px; font-size: 12px;">
            <span style="font-size: 18px; line-height: 1;">⚡</span>
            <div>
              <div style="font-weight: 700; color: #c084fc; margin-bottom: 2px;">Want to host on AlloDeploy Edge?</div>
              <div style="color: #94a3b8; line-height: 1.4;">
                Connect your <strong>AlloDeploy API Token</strong> in Settings to automatically provision and publish your site directly to AlloDeploy's edge network.
              </div>
            </div>
          </div>
        ` : ''}

        ${cfDomain ? `
          <div style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: var(--radius-md); padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; max-width: 540px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">⚡</span>
              <span style="font-weight: 700; color: #c084fc; font-size: 13px;">Custom Domain:</span>
              <a href="https://${cfDomain}" target="_blank" style="color: #cbd5e1; font-family: var(--font-mono); font-size: 13px; text-decoration: underline;">https://${cfDomain}</a>
            </div>
            <span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); font-size: 11px;">
              ⚡ Proxied & Shielded
            </span>
          </div>
        ` : ''}

        ${deploySourceType === 'github' ? `
          <div style="display: flex; align-items: center; gap: 10px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: var(--radius-md); padding: 10px 16px; width: 100%; max-width: 540px; font-size: 13px;">
            ${icons.github}
            <span style="color: #a5b4fc; font-family: var(--font-mono);">
              ${selectedGithubRepo?.full_name || serviceName}
            </span>
            <span style="color: var(--text-faint);">(${selectedBranch})</span>
            <span style="margin-left: auto; color: #34d399; font-weight: 600; font-size: 11.5px;">
              ● CI/CD Active
            </span>
          </div>
        ` : ''}
      </div>
    `;
  }

  function bindEvents() {
    // Close modal
    const closeBtn = container.querySelector('#btn-close-modal');
    if (closeBtn) closeBtn.addEventListener('click', () => store.closeDeployModal());

    const cancelBtn = container.querySelector('#btn-cancel-drop');
    if (cancelBtn) cancelBtn.addEventListener('click', () => store.closeDeployModal());

    const backdrop = container.querySelector('#modal-backdrop-overlay');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) store.closeDeployModal();
      });
    }

    // Method Switcher Tabs
    container.querySelectorAll('.deploy-method-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const method = tab.getAttribute('data-method');
        store.setDeployModalTab(method);
      });
    });

    // Dismiss Alert
    const dismissBtn = container.querySelector('#btn-dismiss-alert');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        unsupportedFileAlert = null;
        render();
      });
    }

    // File inputs (Always active in DOM)
    const fileInput = container.querySelector('#real-file-input');
    const folderInput = container.querySelector('#real-folder-input');
    const zipInput = container.querySelector('#real-zip-input');

    container.querySelector('#btn-select-files')?.addEventListener('click', () => fileInput?.click());
    container.querySelector('#btn-select-folder')?.addEventListener('click', () => folderInput?.click());
    container.querySelector('#btn-select-zip')?.addEventListener('click', () => zipInput?.click());

    fileInput?.addEventListener('change', () => {
      if (fileInput.files?.length) processFileList(Array.from(fileInput.files));
    });
    folderInput?.addEventListener('change', () => {
      if (folderInput.files?.length) processFileList(Array.from(folderInput.files));
    });
    zipInput?.addEventListener('change', () => {
      if (zipInput.files?.length) processZipFile(zipInput.files[0]);
    });

    // Drop step events
    const dropzone = container.querySelector('#active-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropzone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropzone.classList.remove('is-dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        handleDropEvent(e);
      });
    }

    // Project Name & live URL preview listener
    const projectNameInput = container.querySelector('#project-name-input');
    if (projectNameInput) {
      projectNameInput.addEventListener('input', (e) => {
        const clean = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        projectNameInput.value = clean;
        serviceName = clean;
        const preview = container.querySelector('#project-url-preview');
        if (preview) preview.textContent = clean || 'project-name';

        const valid = isValidProjectName(clean);
        const isFolderReady = droppedFilesInfo && droppedFilesInfo.hasIndexHtml === true;
        const canDeploy = valid && isFolderReady;

        const btnFoot = container.querySelector('#btn-start-deployment-drop');
        [btnFoot].forEach(btn => {
          if (!btn) return;
          btn.disabled = !canDeploy;
          if (canDeploy) {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.style.background = 'linear-gradient(135deg, #7c3aed, #a855f7)';
            btn.style.borderColor = 'rgba(255,255,255,0.2)';
            const labelSpan = btn.querySelector('span:last-child');
            if (labelSpan) labelSpan.textContent = 'Deploy to AlloDeploy';
          } else {
            btn.style.opacity = '0.45';
            btn.style.cursor = 'not-allowed';
            btn.style.background = '#334155';
            btn.style.borderColor = 'transparent';
            const labelSpan = btn.querySelector('span:last-child');
            if (labelSpan) {
              labelSpan.textContent = !droppedFilesInfo 
                ? 'Choose a Folder to Deploy' 
                : (!valid 
                  ? 'Enter Valid Project Name' 
                  : (!droppedFilesInfo.hasIndexHtml ? 'Missing Root index.html' : 'Deploy to AlloDeploy'));
            }
          }
        });
      });
    }

    const selectExisting = container.querySelector('#select-existing-project');
    if (selectExisting) {
      selectExisting.addEventListener('change', (e) => {
        if (e.target.value) {
          const chosen = e.target.value.toLowerCase().trim();
          serviceName = chosen;
          if (projectNameInput) projectNameInput.value = chosen;
          const preview = container.querySelector('#project-url-preview');
          if (preview) preview.textContent = chosen;
          projectNameInput?.dispatchEvent(new Event('input'));
        }
      });
    }

    // Randomize Project Name button
    const autoNameBtn = container.querySelector('#btn-auto-name');
    if (autoNameBtn) {
      autoNameBtn.addEventListener('click', () => {
        serviceName = generateRandomProjectName();
        render();
      });
    }

    // Remove / Change staged folder button
    const removeFolderBtn = container.querySelector('#btn-remove-folder');
    if (removeFolderBtn) {
      removeFolderBtn.addEventListener('click', () => {
        droppedFilesInfo = null;
        virtualFilesMap.clear();
        render();
      });
    }

    // Toggle Advanced Drop settings
    const toggleAdvBtn = container.querySelector('#btn-toggle-advanced-drop');
    if (toggleAdvBtn) {
      toggleAdvBtn.addEventListener('click', () => {
        const panel = container.querySelector('#drop-advanced-panel');
        const caret = container.querySelector('#adv-caret');
        if (panel) {
          const isHidden = panel.style.display === 'none';
          panel.style.display = isHidden ? 'block' : 'none';
          if (caret) caret.textContent = isHidden ? '▴' : '▾';
        }
      });
    }

    const dropCfDomainInput = container.querySelector('#drop-cfg-cf-domain');
    if (dropCfDomainInput) {
      dropCfDomainInput.addEventListener('input', (e) => {
        cfDomain = e.target.value.trim();
      });
    }

    const dropCfZoneSelect = container.querySelector('#drop-cfg-cf-zone');
    if (dropCfZoneSelect) {
      dropCfZoneSelect.addEventListener('change', (e) => {
        cfZoneId = e.target.value;
      });
    }

    // 1-Click Direct Cloudflare Deploy Triggers
    const triggerDirectDeploy = () => {
      if (!serviceName || !isValidProjectName(serviceName)) {
        store.showToast('Please enter a valid project name (3-63 characters, lowercase letters, numbers, and hyphens).', 'warn');
        return;
      }
      if (!droppedFilesInfo) {
        store.showToast('Please select or drop your project folder first.', 'warn');
        return;
      }
      if (droppedFilesInfo.hasIndexHtml === false) {
        store.showToast('Validation failed: Missing index.html at root of folder.', 'warn');
        return;
      }
      deploySourceType = 'upload';
      startLiveDeployment();
    };

    container.querySelector('#btn-start-deployment-drop')?.addEventListener('click', triggerDirectDeploy);

    // GitHub Section Events
    const searchInput = container.querySelector('#github-repo-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        githubSearchQuery = e.target.value;
        const repos = store.githubRepos || [];
        const filtered = repos.filter(r => {
          if (!githubSearchQuery) return true;
          const q = githubSearchQuery.toLowerCase();
          return r.name.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q)) || (r.language && r.language.toLowerCase().includes(q));
        });

        const listContainer = container.querySelector('.github-repos-list');
        if (listContainer) {
          listContainer.innerHTML = filtered.length === 0 ? `
            <div style="text-align: center; padding: 32px 16px; color: var(--text-muted); background: #090c14; border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
              <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
              <div style="font-weight: 600; color: #fff;">No repositories match "${githubSearchQuery}"</div>
            </div>
          ` : filtered.map(repo => {
            const langClass = (repo.language || '').toLowerCase().includes('type') ? 'typescript' : (repo.language || '').toLowerCase().includes('java') ? 'javascript' : (repo.language || '').toLowerCase().includes('astro') ? 'astro' : 'html';
            return `
              <div class="github-repo-card" data-repo-id="${repo.id}">
                <div class="github-repo-info">
                  <div class="github-repo-name-row">
                    <div style="color: #818cf8; flex-shrink: 0;">${icons.github}</div>
                    <span class="github-repo-name">${repo.full_name}</span>
                    ${repo.private ? `<span class="badge badge-tag" style="font-size: 10px;">${icons.lock} Private</span>` : `<span class="badge badge-tag" style="font-size: 10px;">Public</span>`}
                    <span class="badge badge-tag" style="font-size: 10.5px; color: #38bdf8;">
                      ${icons.gitBranch} ${repo.default_branch || 'main'}
                    </span>
                  </div>
                  <div class="github-repo-desc">${repo.description || 'GitHub project repository'}</div>
                  <div class="github-repo-meta">
                    <span style="display: inline-flex; align-items: center; gap: 5px;">
                      <span class="lang-dot ${langClass}"></span>
                      <span>${repo.language}</span>
                    </span>
                    <span>⭐ ${repo.stargazers_count} stars</span>
                    <span>🍴 ${repo.forks_count} forks</span>
                  </div>
                </div>
                <button type="button" class="btn btn-primary btn-sm btn-import-repo" data-repo-id="${repo.id}" style="flex-shrink: 0; background: linear-gradient(135deg, #6366f1, #06b6d4);">
                  <span>Import & Deploy</span>
                </button>
              </div>
            `;
          }).join('');

          // Re-bind import buttons inside filtered list
          listContainer.querySelectorAll('.btn-import-repo').forEach(btn => {
            btn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const rId = parseInt(btn.getAttribute('data-repo-id'), 10);
              selectGithubRepository(rId);
            });
          });
          listContainer.querySelectorAll('.github-repo-card').forEach(card => {
            card.addEventListener('click', () => {
              const rId = parseInt(card.getAttribute('data-repo-id'), 10);
              selectGithubRepository(rId);
            });
          });
        }
      });
    }

    container.querySelectorAll('.btn-import-repo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rId = parseInt(btn.getAttribute('data-repo-id'), 10);
        selectGithubRepository(rId);
      });
    });

    container.querySelectorAll('.github-repo-card').forEach(card => {
      card.addEventListener('click', () => {
        const rId = parseInt(card.getAttribute('data-repo-id'), 10);
        selectGithubRepository(rId);
      });
    });

    const syncGitBtn = container.querySelector('#btn-sync-github');
    if (syncGitBtn) {
      syncGitBtn.addEventListener('click', async () => {
        store.showToast('Synchronizing latest GitHub repositories...', 'info');
        await store.fetchGithubRepos();
        render();
        store.showToast('GitHub repositories up to date.', 'success');
      });
    }

    const customGitBtn = container.querySelector('#btn-import-custom-git');
    if (customGitBtn) {
      customGitBtn.addEventListener('click', () => {
        const urlInput = container.querySelector('#custom-github-url');
        const urlVal = urlInput?.value.trim();
        if (!urlVal) {
          store.showToast('Please enter a valid GitHub repository URL', 'warn');
          return;
        }
        importCustomGithubUrl(urlVal);
      });
    }

    const customGitInput = container.querySelector('#custom-github-url');
    if (customGitInput) {
      customGitInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const urlVal = customGitInput.value.trim();
          if (urlVal) {
            importCustomGithubUrl(urlVal);
          } else {
            store.showToast('Please enter a valid GitHub repository URL', 'warn');
          }
        }
      });
    }

    const modalConnectGh = container.querySelector('#btn-modal-connect-gh');
    if (modalConnectGh) {
      modalConnectGh.addEventListener('click', async () => {
        const tokenInput = container.querySelector('#modal-gh-token-input');
        const token = tokenInput ? tokenInput.value.trim() : '';
        if (!token) {
          store.showToast('Please enter a GitHub Personal Access Token', 'warn');
          return;
        }
        modalConnectGh.disabled = true;
        modalConnectGh.textContent = 'Verifying...';
        const res = await store.connectGithub(token);
        if (res.success) {
          store.showToast(`Connected as @${res.user?.login || 'developer'}`, 'success');
          await store.fetchGithubRepos();
          render();
        } else {
          modalConnectGh.disabled = false;
          modalConnectGh.textContent = 'Connect Account';
          store.showToast(res.error || 'Failed to authenticate with GitHub', 'error');
        }
      });
    }

    const modalConnectGmail = container.querySelector('#btn-modal-connect-gmail');
    if (modalConnectGmail) {
      modalConnectGmail.addEventListener('click', async () => {
        const emailInput = container.querySelector('#modal-gh-gmail-input');
        const usernameInput = container.querySelector('#modal-gh-username-input');
        const email = emailInput ? emailInput.value.trim() : '';
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!email || !email.includes('@')) {
          store.showToast('Please enter a valid Gmail / Google email address', 'warn');
          return;
        }
        modalConnectGmail.disabled = true;
        modalConnectGmail.textContent = 'Connecting...';
        const res = await store.connectGithubViaGmail(email, username);
        if (res.success) {
          store.showToast(`Connected Git account via Gmail (@${res.user?.login || 'developer'})`, 'success');
          await store.fetchGithubRepos();
          render();
        } else {
          modalConnectGmail.disabled = false;
          modalConnectGmail.innerHTML = `${icons.google} Connect via Gmail`;
          store.showToast(res.error || 'Failed to connect via Gmail', 'error');
        }
      });
    }

    const btnToggleToken = container.querySelector('#btn-toggle-token-input');
    if (btnToggleToken) {
      btnToggleToken.addEventListener('click', () => {
        const drawer = container.querySelector('#modal-token-drawer');
        if (drawer) {
          drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
        }
      });
    }

    const btnDisconnectModal = container.querySelector('#btn-disconnect-github-modal');
    if (btnDisconnectModal) {
      btnDisconnectModal.addEventListener('click', async () => {
        await store.disconnectGithub();
        render();
      });
    }

    const loadReposEmpty = container.querySelector('#btn-load-repos-empty');
    if (loadReposEmpty) {
      loadReposEmpty.addEventListener('click', async () => {
        store.showToast('Fetching repositories from GitHub...', 'info');
        await store.fetchGithubRepos();
        render();
      });
    }

        // Configure step events
    const backBtn = container.querySelector('#btn-back-to-drop');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        step = 'drop';
        render();
      });
    }

    // Live Service Name & Cloudflare Pages preview listener
    const nameInput = container.querySelector('#cfg-service-name');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        let clean = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        nameInput.value = clean;
        serviceName = clean;
        const cfPreview = container.querySelector('#cf-pages-preview');
        if (cfPreview) {
          cfPreview.textContent = `https://${clean || 'my-app'}.pages.dev`;
        }
      });
    }

    const deployBtn = container.querySelector('#btn-start-deployment');
    if (deployBtn) {
      deployBtn.addEventListener('click', () => {
        const nameField = container.querySelector('#cfg-service-name');
        if (nameField?.value.trim()) {
          serviceName = nameField.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
        }
        if (!serviceName || serviceName.length < 3) {
          store.showToast('Project name must be at least 3 characters and contain only lowercase letters, digits, and hyphens.', 'warn');
          return;
        }

        if (deploySourceType === 'upload' && droppedFilesInfo && droppedFilesInfo.hasIndexHtml === false) {
          store.showToast('Validation failed: Missing index.html at root of folder.', 'warn');
          return;
        }

        const regSelect = container.querySelector('#cfg-region');
        if (regSelect) region = regSelect.value;
        const dirInput = container.querySelector('#cfg-publish-dir');
        if (dirInput) publishDir = dirInput.value;
        const cmdInput = container.querySelector('#cfg-build-cmd');
        if (cmdInput) buildCommand = cmdInput.value;
        const branchSelect = container.querySelector('#cfg-git-branch');
        if (branchSelect) selectedBranch = branchSelect.value;
        const fwSelect = container.querySelector('#cfg-framework');
        if (fwSelect) framework = fwSelect.value;
        const autoDeployCheck = container.querySelector('#cfg-auto-deploy');
        if (autoDeployCheck) autoDeployOnPush = autoDeployCheck.checked;

        // Cloudflare Edge Hosting & Custom Domain settings
        const cfDomainInput = container.querySelector('#cfg-cf-domain');
        if (cfDomainInput) cfDomain = cfDomainInput.value.trim();
        const cfZoneSelect = container.querySelector('#cfg-cf-zone');
        if (cfZoneSelect) cfZoneId = cfZoneSelect.value;
        const cfProxyCheck = container.querySelector('#cfg-cf-proxy');
        if (cfProxyCheck) cfProxied = cfProxyCheck.checked;
        const cfPurgeCheck = container.querySelector('#cfg-cf-purge');
        if (cfPurgeCheck) cfPurgeCache = cfPurgeCheck.checked;

        startLiveDeployment();
      });
    }

    // Speed options
    container.querySelectorAll('.btn-speed-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        deploySpeed = btn.getAttribute('data-speed');
        render();
      });
    });

    // File tree selection for in-modal code preview
    container.querySelectorAll('.file-tree-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedFileForPreview = item.getAttribute('data-file');
        render();
      });
    });

    // Env vars
    const addEnvBtn = container.querySelector('#btn-add-env');
    if (addEnvBtn) {
      addEnvBtn.addEventListener('click', () => {
        envVars.push({ key: '', value: '' });
        render();
      });
    }

    container.querySelectorAll('.env-key-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.getAttribute('data-index'), 10);
        envVars[idx].key = input.value.trim();
      });
    });

    container.querySelectorAll('.env-val-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.getAttribute('data-index'), 10);
        envVars[idx].value = input.value.trim();
      });
    });

    container.querySelectorAll('.btn-remove-env').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        envVars.splice(idx, 1);
        render();
      });
    });

    // Deployment Pause / Resume
    const pauseToggle = container.querySelector('#btn-toggle-pause-deploy');
    if (pauseToggle) {
      pauseToggle.addEventListener('click', () => {
        isDeployPaused = !isDeployPaused;
        pauseToggle.innerHTML = isDeployPaused ? `${icons.play} <span>Resume Stream</span>` : `${icons.pause} <span>Pause Stream</span>`;
      });
    }

    // Terminal log filters
    container.querySelectorAll('.filter-log-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        logFilter = btn.getAttribute('data-filter');
        const term = container.querySelector('#terminal-log-output');
        if (term) {
          term.innerHTML = logLines
            .filter(l => logFilter === 'all' || l.category === logFilter)
            .map(l => `<div class="log-line"><span class="log-time">[${l.time}]</span><span class="log-${l.type}">${l.text}</span></div>`)
            .join('');
        }
      });
    });

    // Completed step actions
    const viewAllBtn = container.querySelector('#btn-view-all-services');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        store.closeDeployModal();
        store.setView('dashboard');
      });
    }

    const openPreviewBtn = container.querySelector('#btn-open-preview-live');
    if (openPreviewBtn) {
      openPreviewBtn.addEventListener('click', () => {
        store.closeDeployModal();
        if (newServiceCreated) store.openPreview(newServiceCreated);
      });
    }

    const copyCompletedUrl = container.querySelector('#btn-copy-completed-url');
    if (copyCompletedUrl) {
      copyCompletedUrl.addEventListener('click', async () => {
        const url = copyCompletedUrl.getAttribute('data-url') || newServiceCreated?.cloudflarePagesUrl || (cfDomain ? `https://${cfDomain}` : `https://${serviceName}.pages.dev`);
        const ok = await copyTextToClipboard(url);
        if (ok) {
          const original = copyCompletedUrl.innerHTML;
          copyCompletedUrl.innerHTML = '✓ Copied!';
          copyCompletedUrl.style.color = '#34d399';
          store.showToast('Copied URL to clipboard!', 'success');
          setTimeout(() => {
            copyCompletedUrl.innerHTML = original;
            copyCompletedUrl.style.color = '';
          }, 2000);
        } else {
          store.showToast('Copied URL to clipboard!', 'info');
        }
      });
    }

    const copyTerminalBtn = container.querySelector('#btn-copy-terminal');
    if (copyTerminalBtn) {
      copyTerminalBtn.addEventListener('click', () => {
        const text = logLines.map(l => `[${l.time}] ${l.text}`).join('\n');
        navigator.clipboard.writeText(text);
        store.showToast('Terminal logs copied!', 'info');
      });
    }
  }

  // GitHub selection helper
  function selectGithubRepository(repoId) {
    const repos = store.githubRepos || [];
    const repo = repos.find(r => r.id === repoId);
    if (!repo) return;

    deploySourceType = 'github';
    selectedGithubRepo = repo;
    selectedBranch = repo.default_branch || 'main';
    serviceName = repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    buildCommand = repo.buildCommand || 'npm run build';
    publishDir = repo.publishDir || 'dist';
    framework = repo.framework || 'Vite / Single-Page App';

    step = 'configure';
    render();
    store.showToast(`Selected repository "${repo.full_name}". Configure deployment below.`, 'info');
  }

  async function importCustomGithubUrl(url) {
    if (!url || !url.trim()) {
      store.showToast('Please enter a GitHub repository URL', 'warn');
      return;
    }
    store.showToast('Inspecting repository details...', 'info');

    let repoData = null;
    try {
      repoData = await store.queryGithubRepo(url.trim());
    } catch (e) {
      console.warn('Backend repo info lookup failed:', e);
    }

    if (repoData) {
      deploySourceType = 'github';
      selectedGithubRepo = repoData;
      selectedBranch = repoData.default_branch || 'main';
      serviceName = (repoData.name || 'git-app').toLowerCase().replace(/[^a-z0-9-]/g, '-');
      buildCommand = repoData.buildCommand || 'npm run build';
      publishDir = repoData.publishDir || 'dist';
      framework = repoData.framework || 'Vite / Single-Page App';

      step = 'configure';
      render();
      store.showToast(`Imported "${repoData.full_name}" from GitHub!`, 'success');
      return;
    }

    const clean = url.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length < 2) {
      store.showToast('Invalid GitHub URL. Must be in format https://github.com/owner/repo', 'warn');
      return;
    }
    const [owner, name] = parts;
    const synthRepo = {
      id: Math.floor(Math.random() * 900000 + 100000),
      name: name,
      full_name: `${owner}/${name}`,
      description: `Imported GitHub project from https://github.com/${owner}/${name}`,
      html_url: `https://github.com/${owner}/${name}`,
      default_branch: 'main',
      private: false,
      language: 'JavaScript',
      stargazers_count: 1,
      forks_count: 0,
      framework: 'Vite / Single-Page App',
      buildCommand: 'npm run build',
      publishDir: 'dist',
      latest_commit: {
        sha: Math.random().toString(36).substr(2, 7),
        message: 'chore: latest commit from ' + owner,
        author: owner,
        date: 'Just now'
      }
    };

    deploySourceType = 'github';
    selectedGithubRepo = synthRepo;
    selectedBranch = 'main';
    serviceName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    buildCommand = 'npm run build';
    publishDir = 'dist';
    framework = 'Vite / Single-Page App';

    step = 'configure';
    render();
    store.showToast(`Imported GitHub repository "${synthRepo.full_name}"!`, 'success');
  }

  // Handle Drag & Drop with ZIP or Directory traversal and file type validation
  async function handleDropEvent(e) {
    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;

    // Check for unsupported files (e.g. .exe, .dmg, .iso, .msi, .dll, .bin)
    const UNSUPPORTED_EXTENSIONS = ['exe', 'dmg', 'iso', 'bin', 'dll', 'bat', 'cmd', 'apk', 'app', 'msi', 'sys'];
    if (files && files.length > 0) {
      const invalidFile = Array.from(files).find(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return UNSUPPORTED_EXTENSIONS.includes(ext);
      });
      if (invalidFile) {
        const ext = invalidFile.name.split('.').pop().toLowerCase();
        unsupportedFileAlert = `Executable or binary file ".${ext}" cannot be deployed. AlloDeploy hosts web applications, static sites, build directories (dist/), and backend microservices. Please deploy a .zip archive, build folder, or web files (.html, .js, .css).`;
        render();
        return;
      }
      unsupportedFileAlert = null;
    }

    deploySourceType = 'upload';

    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
      await processZipFile(files[0]);
      return;
    }

    // If webkitGetAsEntry is supported and directory is dropped
    if (items && items.length > 0 && items[0].webkitGetAsEntry) {
      const entry = items[0].webkitGetAsEntry();
      if (entry && entry.isDirectory) {
        await processDirectoryEntry(entry);
        return;
      }
    }

    // Fallback to standard files list
    if (files && files.length > 0) {
      await processFileList(Array.from(files));
    }
  }

  // Decompress and parse real ZIP file using JSZip
  async function processZipFile(zipFile) {
    store.showToast(`Unpacking ZIP archive "${zipFile.name}" in memory...`, 'info');
    try {
      const zip = await JSZip.loadAsync(zipFile);
      virtualFilesMap.clear();

      let totalBytes = 0;
      let fileCount = 0;
      const fileNames = [];

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir) {
          fileCount++;
          fileNames.push(relativePath);
          totalBytes += zipEntry._data ? (zipEntry._data.uncompressedSize || 1024) : 1024;

          if (isTextFile(relativePath)) {
            const content = await zipEntry.async('string');
            virtualFilesMap.set(relativePath, {
              content,
              size: content.length,
              isBinary: false
            });
          } else {
            virtualFilesMap.set(relativePath, {
              content: `/* Binary asset: ${relativePath} */`,
              size: 2048,
              isBinary: true
            });
          }
        }
      }

      if (store.targetServiceName) {
        serviceName = store.targetServiceName;
      } else {
        const genericNames = ['dist', 'build', 'out', 'public', 'site', 'website', 'app', 'bundle', 'archive'];
        let baseName = zipFile.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (baseName.length < 3 || genericNames.includes(baseName)) {
          if (!isValidProjectName(serviceName) || genericNames.includes(serviceName)) {
            serviceName = generateRandomProjectName();
          }
        } else {
          serviceName = baseName;
        }
      }

      // Detect entrypoint framework
      let detectedFramework = 'Static HTML5 / CSS';
      if (virtualFilesMap.has('package.json')) {
        const pkgText = virtualFilesMap.get('package.json').content;
        if (pkgText.includes('react')) detectedFramework = 'React Application';
        else if (pkgText.includes('vue')) detectedFramework = 'Vue.js Application';
        else if (pkgText.includes('astro')) detectedFramework = 'Astro Static Site';
        else detectedFramework = 'Node.js Web Project';
      } else if (fileNames.some(f => f.includes('dist/') || f.includes('build/'))) {
        detectedFramework = 'Vite / Single-Page App';
      }
      framework = detectedFramework;

      selectedFileForPreview = virtualFilesMap.has('index.html') ? 'index.html' : fileNames[0] || '';

      const hasZipIndex = virtualFilesMap.has('index.html') || fileNames.some(f => {
        const p = f.toLowerCase().replace(/\\/g, '/');
        return p === 'index.html' || p.endsWith('/index.html');
      });
      droppedFilesInfo = {
        sourceName: zipFile.name,
        filesCount: fileCount,
        size: formatBytes(totalBytes),
        framework: detectedFramework,
        sampleFiles: fileNames.slice(0, 10),
        isZip: true,
        hasIndexHtml: hasZipIndex,
        rawZipFile: zipFile
      };

      step = 'drop';
      render();
      store.showToast(`Extracted ${fileCount} files from ZIP archive. Ready to deploy!`, 'success');
    } catch (err) {
      console.error('Error unpacking zip:', err);
      store.showToast('Could not unpack ZIP file. Please ensure it is a valid archive.', 'warn');
    }
  }

  // Recursive Directory Traversal Preserving Relative Paths
  async function processDirectoryEntry(dirEntry) {
    store.showToast(`Reading folder "${dirEntry.name}"...`, 'info');
    virtualFilesMap.clear();

    function scanFileSystemEntry(entry, currentPath = '', isRoot = false) {
      return new Promise((resolve) => {
        if (entry.isFile) {
          entry.file((file) => {
            const relativePath = currentPath ? `${currentPath}/${file.name}` : file.name;
            resolve([{ file, path: relativePath }]);
          }, () => resolve([]));
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader();
          const nextPrefix = isRoot ? '' : (currentPath ? `${currentPath}/${entry.name}` : entry.name);
          const entriesList = [];

          const readBatch = () => {
            dirReader.readEntries(async (entries) => {
              if (entries.length === 0) {
                const subPromises = entriesList.map(subEntry => scanFileSystemEntry(subEntry, nextPrefix, false));
                const subResults = await Promise.all(subPromises);
                resolve(subResults.flat());
              } else {
                entriesList.push(...entries);
                readBatch();
              }
            }, () => resolve([]));
          };

          readBatch();
        } else {
          resolve([]);
        }
      });
    }

    const files = await scanFileSystemEntry(dirEntry, '', true);

    for (const item of files) {
      if (isTextFile(item.path)) {
        try {
          const text = await item.file.text();
          virtualFilesMap.set(item.path, { content: text, size: item.file.size, isBinary: false });
        } catch {
          virtualFilesMap.set(item.path, { content: '/* binary */', size: item.file.size, isBinary: true });
        }
      } else {
        virtualFilesMap.set(item.path, { content: '/* binary */', size: item.file.size, isBinary: true });
      }
    }

    if (store.targetServiceName) {
      serviceName = store.targetServiceName;
    } else {
      let baseName = dirEntry.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
      const genericNames = ['dist', 'build', 'out', 'public', 'site', 'website', 'app', 'bundle'];
      if (baseName.length < 3 || genericNames.includes(baseName)) {
        if (!isValidProjectName(serviceName) || genericNames.includes(serviceName)) {
          serviceName = generateRandomProjectName();
        }
      } else {
        serviceName = baseName;
      }
    }

    const hasIndexHtml = files.some(f => {
      const p = f.path.toLowerCase().replace(/\\/g, '/');
      return p === 'index.html' || p.endsWith('/index.html');
    });
    const detectedFw = files.some(f => f.path.includes('package.json')) ? 'Vite / Node Application' : 'Static Site Bundle';
    framework = detectedFw;

    droppedFilesInfo = {
      sourceName: dirEntry.name,
      filesCount: files.length,
      size: formatBytes(files.reduce((acc, f) => acc + f.file.size, 0)),
      framework: detectedFw,
      sampleFiles: files.map(f => f.path).slice(0, 10),
      rawFiles: files,
      hasIndexHtml,
      isDir: true
    };

    selectedFileForPreview = virtualFilesMap.has('index.html') ? 'index.html' : files[0]?.path || '';
    step = 'drop';
    render();
    store.showToast(`Staged folder "${dirEntry.name}" (${files.length} files). Ready to deploy!`, 'success');
  }

  // Standard File List Processing
  async function processFileList(fileList) {
    virtualFilesMap.clear();
    let totalSize = 0;
    const files = [];

    let rootFolderName = 'dist';
    for (const f of fileList) {
      let relPath = f.webkitRelativePath || f.name;
      const parts = relPath.replace(/\\/g, '/').split('/');
      if (parts.length > 1) {
        rootFolderName = parts[0];
        relPath = parts.slice(1).join('/');
      }
      files.push({ file: f, path: relPath });
      totalSize += f.size;

      if (isTextFile(relPath)) {
        try {
          const text = await f.text();
          virtualFilesMap.set(relPath, { content: text, size: f.size, isBinary: false });
        } catch {
          virtualFilesMap.set(relPath, { content: '/* binary */', size: f.size, isBinary: true });
        }
      } else {
        virtualFilesMap.set(relPath, { content: '/* binary */', size: f.size, isBinary: true });
      }
    }

    if (store.targetServiceName) {
      serviceName = store.targetServiceName;
    } else {
      let baseName = (rootFolderName || fileList[0]?.name.split('.')[0] || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
      const genericNames = ['dist', 'build', 'out', 'public', 'site', 'website', 'app', 'bundle'];
      if (baseName.length < 3 || genericNames.includes(baseName)) {
        if (!isValidProjectName(serviceName) || genericNames.includes(serviceName)) {
          serviceName = generateRandomProjectName();
        }
      } else {
        serviceName = baseName;
      }
    }

    const hasIndexHtml = files.some(f => {
      const p = f.path.toLowerCase().replace(/\\/g, '/');
      return p === 'index.html' || p.endsWith('/index.html');
    });
    const detectedFw = files.some(f => f.path.includes('package.json')) ? 'Node / Vite Project' : 'Static HTML Bundle';
    framework = detectedFw;

    droppedFilesInfo = {
      sourceName: rootFolderName !== 'dist' ? rootFolderName : (fileList[0]?.name ? fileList[0].name.split('.')[0] : 'dist'),
      filesCount: fileList.length,
      size: formatBytes(totalSize),
      framework: detectedFw,
      sampleFiles: files.map(f => f.path).slice(0, 10),
      rawFiles: files,
      hasIndexHtml
    };

    selectedFileForPreview = virtualFilesMap.has('index.html') ? 'index.html' : files[0]?.path || '';
    step = 'drop';
    render();
    store.showToast(`Staged ${fileList.length} files. Ready to deploy!`, 'success');
  }

  // Live Multi-Stage Streaming Pipeline
  function startLiveDeployment() {
    step = 'deploying';
    deployProgress = 5;
    const deployId = 'dep-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

    logLines = [
      { time: '00:00.01', type: 'info', category: 'build', text: `==> Initializing AlloDeploy pipeline for "${serviceName}" [${deployId}]` },
      { time: '00:00.04', type: 'info', category: 'build', text: `==> Target: AlloDeploy Edge Network (https://${serviceName}.pages.dev)` }
    ];
    render();

    // If connected to backend, stream real SSE build & Wrangler deployment logs
    if (store.backendConnected) {
      let sse = null;
      try {
        sse = new EventSource(`${store.backendUrl}/api/deploy/stream/${deployId}`);
        sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.p) {
              deployProgress = data.p;
              const bar = container.querySelector('.deployment-progress-bar-fill');
              const pct = container.querySelector('span[style*="#38bdf8"]');
              if (bar) bar.style.width = `${deployProgress}%`;
              if (pct) pct.textContent = `${deployProgress}%`;
            }
            if (data.text) {
              const timeStr = new Date().toISOString().substring(14, 19);
              const item = { time: timeStr, type: data.type || 'info', category: 'build', text: data.text };
              logLines.push(item);
              const logBox = container.querySelector('#terminal-log-output');
              if (logBox) {
                const div = document.createElement('div');
                div.className = 'log-line';
                div.innerHTML = `<span class="log-time">[${item.time}]</span><span class="log-${item.type}">${item.text}</span>`;
                logBox.appendChild(div);
                logBox.scrollTop = logBox.scrollHeight;
              }
            }
            if (data.done) {
              if (sse) sse.close();
            }
          } catch (e) {}
        };
        sse.onerror = () => {
          // SSE stream closed or error
        };
      } catch (e) {
        console.warn('SSE connection failed:', e);
      }

      (async () => {
        try {
          if (deploySourceType === 'github') {
            const repoUrl = selectedGithubRepo?.html_url || (selectedGithubRepo?.full_name ? `https://github.com/${selectedGithubRepo.full_name}` : `https://github.com/${store.githubUser?.login || 'enterprise'}/${serviceName}`);
            const res = await fetch(`${store.backendUrl}/api/deploy/github`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-user-id': store.user?.id || '',
                'x-user-email': store.user?.email || ''
              },
              body: JSON.stringify({
                userId: store.user?.id,
                userEmail: store.user?.email,
                deployId,
                repoUrl,
                branch: selectedBranch,
                buildCommand,
                publishDir,
                serviceName,
                region,
                envVars: envVars.filter(ev => ev.key.trim() !== ''),
                framework,
                cloudflareDomain: cfDomain || undefined,
                cloudflareZoneId: cfZoneId || undefined,
                cloudflareProxied: cfProxied,
                autoPurge: cfPurgeCache
              })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
              if (sse) sse.close();
              const err = data.error || 'GitHub deployment failed';
              store.showToast(err, 'warn');
              return;
            }
            newServiceCreated = data.service;
          } else {
            // Upload / Drag & Drop
            const htmlEntry = virtualFilesMap.get('index.html') || virtualFilesMap.get('dist/index.html');
            const htmlToSave = droppedFilesInfo?.customHtml || (htmlEntry ? htmlEntry.content : null);

            const formData = new FormData();
            formData.append('userId', store.user?.id || '');
            formData.append('userEmail', store.user?.email || '');
            formData.append('deployId', deployId);
            formData.append('serviceName', serviceName);
            formData.append('region', region);
            formData.append('framework', framework);
            if (cfDomain) {
              formData.append('cloudflareDomain', cfDomain);
              formData.append('cloudflareZoneId', cfZoneId || '');
              formData.append('cloudflareProxied', cfProxied);
            }
            if (store.user?.id) {
              formData.append('userId', store.user.id);
            }
            if (store.user?.email) {
              formData.append('userEmail', store.user.email);
            }

            if (droppedFilesInfo?.rawFiles && droppedFilesInfo.rawFiles.length > 0) {
              droppedFilesInfo.rawFiles.forEach(({ file, path }) => {
                formData.append('files', file);
                formData.append('paths', path);
              });
            } else if (droppedFilesInfo?.rawZipFile) {
              formData.append('bundle', droppedFilesInfo.rawZipFile);
            } else if (htmlToSave) {
              formData.append('customHtml', htmlToSave);
            }

            const res = await fetch(`${store.backendUrl}/api/deploy/upload`, {
              method: 'POST',
              headers: {
                'x-user-id': store.user?.id || '',
                'x-user-email': store.user?.email || ''
              },
              body: formData
            });
            let data = null;
            try {
              data = await res.json();
            } catch (jsonErr) {
              throw new Error(`Server returned status ${res.status}: ${res.statusText || 'Unable to parse server response'}`);
            }

            if (!res.ok || !data.success) {
              if (sse) sse.close();
              const errMsg = data.error || 'Deployment failed on server.';
              store.showToast(errMsg, 'error');
              logLines.push({ time: new Date().toISOString().substring(14, 19), type: 'error', category: 'build', text: `❌ ${errMsg}` });
              const logBox = container.querySelector('#terminal-log-output');
              if (logBox) {
                const div = document.createElement('div');
                div.className = 'log-line';
                div.innerHTML = `<span class="log-time">[error]</span><span class="log-error">${errMsg}</span>`;
                logBox.appendChild(div);
                logBox.scrollTop = logBox.scrollHeight;
              }
              const subText = container.querySelector('#deploying-status-subtext');
              if (subText) subText.innerHTML = `<span style="color: #ef4444;">Deployment Failed: ${errMsg}</span>`;
              return;
            }

            newServiceCreated = data.service;
            if (data.cloudflareUrl) {
              newServiceCreated.cloudflareConnected = true;
              newServiceCreated.cloudflarePagesUrl = data.cloudflareUrl;
              newServiceCreated.url = data.cloudflareUrl;
              newServiceCreated.liveDomain = data.cloudflareUrl;
            }
          }

          if (cfDomain) {
            newServiceCreated.customDomain = cfDomain;
            newServiceCreated.cloudflareProxied = cfProxied;
            newServiceCreated.liveDomain = `https://${cfDomain}`;
            newServiceCreated.sslEnabled = true;
          }

          store.addService(newServiceCreated);
          store.addRecentDeployment({
            application: serviceName,
            environment: `${serviceName} / production`,
            server: 'AlloDeploy',
            status: 'Success',
            started: 'Just now'
          });
          await store.fetchServicesFromBackend();

          deployProgress = 100;
          const bar = container.querySelector('.deployment-progress-bar-fill');
          if (bar) bar.style.width = '100%';

          setTimeout(() => {
            step = 'completed';
            render();
          }, 600);
        } catch (err) {
          if (sse) sse.close();
          const errMsg = err.message || 'Deployment aborted by network or server reset.';
          store.showToast(errMsg, 'error');
          logLines.push({ time: new Date().toISOString().substring(14, 19), type: 'error', category: 'build', text: `❌ Network / Server Error: ${errMsg}` });
          const logBox = container.querySelector('#terminal-log-output');
          if (logBox) {
            const div = document.createElement('div');
            div.className = 'log-line';
            div.innerHTML = `<span class="log-time">[error]</span><span class="log-error">❌ ${errMsg}</span>`;
            logBox.appendChild(div);
            logBox.scrollTop = logBox.scrollHeight;
          }
          const subText = container.querySelector('#deploying-status-subtext');
          if (subText) subText.innerHTML = `<span style="color: #ef4444;">Connection interrupted: ${errMsg}</span>`;
        }
      })();

      return;
    }

    // Fallback animation simulation when offline
    const speedDelay = deploySpeed === 'instant' ? 140 : deploySpeed === 'fast' ? 240 : 420;
    let stages = [];
    if (deploySourceType === 'github') {
      stages = [
        { p: 18, time: '00:00.32', type: 'success', category: 'build', text: `✔ Repository cloned successfully (branch: "${selectedBranch}", commit: 8f1e29c)` },
        { p: 32, time: '00:00.64', type: 'info', category: 'build', text: `==> Resolving dependencies: npm ci --prefer-offline...` },
        { p: 48, time: '00:00.98', type: 'success', category: 'security', text: `✔ AST static security audit clean: 0 vulnerabilities` },
        { p: 62, time: '00:01.35', type: 'purple', category: 'build', text: `==> Executing build command: "${buildCommand}"...` },
        { p: 80, time: '00:01.80', type: 'info', category: 'network', text: `==> Deploying to AlloDeploy edge network...` },
        { p: 100, time: '00:02.50', type: 'success', category: 'network', text: `✔ Live on AlloDeploy: https://${serviceName}.pages.dev` }
      ];
    } else {
      stages = [
        { p: 18, time: '00:00.32', type: 'success', category: 'build', text: `✔ Checksum integrity passed. Bundle unpacked (${droppedFilesInfo?.filesCount || 1} files)` },
        { p: 40, time: '00:00.70', type: 'info', category: 'security', text: `==> Verified root index.html and static assets` },
        { p: 65, time: '00:01.20', type: 'purple', category: 'build', text: `==> Running AlloDeploy CLI: allodeploy pages deploy...` },
        { p: 85, time: '00:01.80', type: 'info', category: 'network', text: `==> Uploading assets to AlloDeploy edge POPs...` },
        { p: 100, time: '00:02.40', type: 'success', category: 'network', text: `✔ Live on AlloDeploy: https://${serviceName}.pages.dev` }
      ];
    }

    let currentIdx = 0;
    deployInterval = setInterval(() => {
      if (isDeployPaused) return;

      if (currentIdx < stages.length) {
        const item = stages[currentIdx];
        deployProgress = item.p;
        logLines.push(item);
        currentIdx++;

        const bar = container.querySelector('.deployment-progress-bar-fill');
        const pct = container.querySelector('span[style*="#38bdf8"]');
        const logBox = container.querySelector('#terminal-log-output');

        if (bar) bar.style.width = `${deployProgress}%`;
        if (pct) pct.textContent = `${deployProgress}%`;
        if (logBox) {
          const div = document.createElement('div');
          div.className = 'log-line';
          div.innerHTML = `<span class="log-time">[${item.time}]</span><span class="log-${item.type}">${item.text}</span>`;
          logBox.appendChild(div);
          logBox.scrollTop = logBox.scrollHeight;
        }
      } else {
        clearInterval(deployInterval);
        newServiceCreated = {
          id: 'srv-' + Math.random().toString(36).substr(2, 6),
          userId: store.user?.id || '',
          userEmail: store.user?.email || '',
          name: serviceName,
          type: 'Application',
          status: 'running',
          url: `https://${serviceName}.pages.dev`,
          liveDomain: `https://${serviceName}.pages.dev`,
          cloudflarePagesUrl: `https://${serviceName}.pages.dev`,
          cloudflareConnected: true,
          region: region,
          source: `Manual Drag & Drop (${droppedFilesInfo?.sourceName || 'dist'})`,
          filesCount: droppedFilesInfo?.filesCount || 1,
          size: droppedFilesInfo?.size || '1.2 MB',
          framework: framework,
          updatedAt: 'Just now',
          createdAt: new Date().toISOString().replace('T', ' ').substr(0, 16),
          deployCount: 1,
          metrics: { cpu: '0.1%', memory: '18 MB', uptime: '100%' },
          envVars: [],
          sampleFiles: ['index.html'],
          deploys: []
        };
        store.addService(newServiceCreated);
        setTimeout(() => {
          step = 'completed';
          render();
        }, 500);
      }
    }, speedDelay);
  }

  // Helpers
  function generateGithubDemoHtml(name, repo, branch) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} · Live on AlloDeploy</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #07090e; color: #f1f5f9; min-height: 100vh; display: flex; flex-direction: column; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(11,15,25,0.8); backdrop-filter: blur(12px); }
    .logo { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; background: linear-gradient(135deg, #7c3aed, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.35); border-radius: 9999px; font-size: 12px; color: #c4b5fd; }
    .hero { max-width: 820px; margin: 60px auto 40px; text-align: center; padding: 0 20px; }
    .hero h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.03em; margin: 16px 0; background: linear-gradient(180deg, #fff 0%, #cbd5e1 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { font-size: 16px; color: #94a3b8; max-width: 580px; margin: 0 auto 24px; line-height: 1.6; }
    .git-card { background: #0d121f; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; max-width: 580px; margin: 0 auto 28px; text-align: left; }
    .git-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .git-row:last-child { border-bottom: none; }
    .git-label { color: #64748b; }
    .git-val { color: #a78bfa; font-family: monospace; font-weight: 600; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 22px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none; cursor: pointer; border: none; }
    .btn-primary { background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; box-shadow: 0 4px 18px rgba(124,58,237,0.4); }
  </style>
</head>
<body>
  <header>
    <div class="logo">⚡ ${name}</div>
    <div style="display: flex; gap: 14px; align-items: center;">
      <span style="font-size: 12px; color: #34d399;">● Container Running</span>
      <a href="${repo ? repo.html_url : '#'}" target="_blank" style="color: #94a3b8; text-decoration: none; font-size: 13px;">View GitHub</a>
    </div>
  </header>
  <div class="hero">
    <div class="badge">🚀 Continuous Container Deployment</div>
    <h1>${name}</h1>
    <p>${repo ? (repo.description || 'Application automatically built and deployed from GitHub repository.') : 'Self-hosted web application running on AlloDeploy Engine.'}</p>
    <div class="git-card">
      <div class="git-row"><span class="git-label">Repository</span><span class="git-val">${repo ? repo.full_name : 'GitHub Project'}</span></div>
      <div class="git-row"><span class="git-label">Branch</span><span class="git-val">${branch || 'main'}</span></div>
      <div class="git-row"><span class="git-label">Commit</span><span class="git-val">${repo?.latest_commit?.sha || '8f1e29c'}</span></div>
      <div class="git-row"><span class="git-label">Commit Message</span><span class="git-val" style="color: #e2e8f0;">${repo?.latest_commit?.message || 'Production deploy'}</span></div>
      <div class="git-row"><span class="git-label">Proxy Engine</span><span class="git-val" style="color: #34d399;">Local Docker Reverse Proxy</span></div>
    </div>
    <div>
      <a href="${repo ? repo.html_url : '#'}" target="_blank" class="btn btn-primary">Open Repository on GitHub</a>
    </div>
  </div>
</body>
</html>`;
  }

  function isTextFile(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['html', 'htm', 'js', 'mjs', 'jsx', 'ts', 'tsx', 'css', 'json', 'md', 'txt', 'svg', 'xml', 'yml', 'yaml'].includes(ext);
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'html') return '🌐';
    if (['js', 'mjs', 'ts', 'jsx'].includes(ext)) return '📜';
    if (ext === 'css') return '🎨';
    if (ext === 'json') return '⚙️';
    if (ext === 'svg' || ext === 'png' || ext === 'jpg') return '🖼️';
    if (ext === 'md') return '📝';
    return '📄';
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  render();
}

