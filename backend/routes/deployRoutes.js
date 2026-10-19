import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { storageService } from '../services/storageService.js';
import { githubService } from '../services/githubService.js';
import { buildEngineService, deployEvents } from '../services/buildEngineService.js';
import { cloudflareService } from '../services/cloudflareService.js';

export const deployRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Deploy via manual file, folder drag-and-drop, or ZIP upload (Automated AlloDeploy Pipeline)
deployRouter.post('/upload', upload.any(), async (req, res) => {
  try {
    const rawServiceName = (req.body.serviceName || req.body.projectName || 'site-' + Math.random().toString(36).substr(2, 6)).toLowerCase().trim();
    // Validate project name: lowercase letters, numbers, hyphens only
    const serviceName = rawServiceName.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    if (!serviceName || serviceName.length < 3) {
      return res.status(400).json({ error: 'Project name must be at least 3 characters and contain only lowercase letters, numbers, and hyphens.' });
    }

    const region = req.body.region || 'Frankfurt (eu-central-1)';
    const framework = req.body.framework || 'Static Site';
    const deployId = req.body.deployId || ('dep-' + crypto.randomBytes(4).toString('hex'));

    let filesCount = 1;
    let sizeStr = '12 KB';
    let sampleFiles = ['index.html'];

    if (req.files && req.files.length > 0) {
      // Check if it's a single ZIP file upload
      if (req.files.length === 1 && req.files[0].originalname.toLowerCase().endsWith('.zip')) {
        const result = await storageService.unpackZipToSite(serviceName, req.files[0].buffer);
        filesCount = result.files.length;
        sampleFiles = result.files.map(f => f.path).slice(0, 10);
        sizeStr = `${(req.files[0].size / 1024).toFixed(1)} KB`;
      } else {
        // Multi-file or folder drag & drop upload
        let rawPaths = [];
        if (Array.isArray(req.body.paths)) {
          rawPaths = req.body.paths;
        } else if (typeof req.body.paths === 'string') {
          rawPaths = [req.body.paths];
        } else {
          rawPaths = req.files.map(f => f.originalname);
        }

        // Normalize paths: strip leading slash and normalize slashes
        const normalizedPaths = rawPaths.map((p, idx) => {
          const raw = (p || req.files[idx]?.originalname || `file_${idx}`).replace(/\\/g, '/').replace(/^\/+/, '');
          return path.posix.normalize(raw);
        });

        // If all files share a common root folder (e.g., "dist/" or "build/"), strip it so index.html sits at root
        const parts = normalizedPaths.map(p => p.split('/'));
        const firstDir = parts.length > 0 && parts[0].length > 1 ? parts[0][0] : null;
        const allShareFirstDir = firstDir && parts.every(p => p.length > 1 && p[0] === firstDir);

        const finalPaths = allShareFirstDir
          ? normalizedPaths.map(p => p.split('/').slice(1).join('/'))
          : normalizedPaths;

        const writeRes = storageService.writeFilesToSite(serviceName, req.files, finalPaths);
        filesCount = writeRes.files.length;
        sampleFiles = writeRes.files.map(f => f.path).slice(0, 10);

        const totalBytes = req.files.reduce((acc, f) => acc + (f.size || 0), 0);
        sizeStr = totalBytes > 1024 * 1024 ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB` : `${(totalBytes / 1024).toFixed(1)} KB`;
      }
    } else if (req.body.customHtml) {
      storageService.saveCustomHtmlSite(serviceName, req.body.customHtml);
    } else {
      // Default placeholder if empty
      storageService.saveCustomHtmlSite(serviceName, `<!DOCTYPE html><html><head><title>${serviceName}</title></head><body><h1>${serviceName}</h1><p>Deployed via AlloDeploy Engine</p></body></html>`);
    }

    // MANDATORY VALIDATION: Check for root index.html
    const siteDir = storageService.getSiteDir(serviceName);
    const rootIndexPath = path.join(siteDir, 'index.html');
    if (!fs.existsSync(rootIndexPath)) {
      try {
        fs.rmSync(siteDir, { recursive: true, force: true });
      } catch (rmErr) {
        console.warn('Failed to clean up invalid site directory:', rmErr.message);
      }
      return res.status(400).json({
        error: 'Validation failed: Missing "index.html" at the root of the uploaded folder. Cloudflare Pages requires an index.html at root to serve your site.'
      });
    }

    const assignedPort = parseInt(req.body.port, 10) || (3000 + Math.floor(Math.random() * 5000));

    const existingServices = await storageService.getServices();
    const existing = existingServices.find(s => s.name === serviceName || (req.body.serviceId && s.id === req.body.serviceId));

    const targetDomainInit = req.body.cloudflareDomain || req.body.customDomain || (existing?.customDomain || '');
    const cfPagesUrl = `https://${serviceName}.pages.dev`;
    const initialUrl = targetDomainInit 
      ? (targetDomainInit.startsWith('http') ? targetDomainInit : `https://${targetDomainInit}`) 
      : (existing?.url || cfPagesUrl);

    const requestingUserId = req.headers['x-user-id'] || req.body.userId || (existing?.userId || 'usr_enterprise_dev');
    const requestingUserEmail = req.headers['x-user-email'] || req.body.userEmail || (existing?.userEmail || 'alex.smith@example.com');

    const newService = {
      ...(existing || {}),
      id: existing ? existing.id : ('srv-' + crypto.randomBytes(4).toString('hex')),
      userId: requestingUserId,
      userEmail: requestingUserEmail,
      name: serviceName,
      type: framework.includes('API') || framework.includes('Node') ? 'Web Service' : (existing?.type || 'Application'),
      status: 'running',
      url: initialUrl,
      liveDomain: initialUrl,
      cloudflarePagesUrl: cfPagesUrl,
      cloudflareConnected: true,
      customDomain: targetDomainInit,
      domains: existing?.domains?.length ? existing.domains : (targetDomainInit ? [{ domain: targetDomainInit, sslStatus: 'active', forceHttps: true }] : []),
      region: region || existing?.region || 'Frankfurt (eu-central-1)',
      source: `Manual Upload (${req.files && req.files.length > 1 ? `${filesCount} folder files` : (req.files && req.files[0] ? req.files[0].originalname : 'Direct Drop')})`,
      filesCount,
      size: sizeStr,
      framework: framework || existing?.framework || 'Static Site',
      port: assignedPort,
      updatedAt: 'Just now',
      createdAt: existing?.createdAt || new Date().toISOString().replace('T', ' ').substr(0, 16),
      deployCount: (existing?.deployCount || 0) + 1,
      metrics: { cpu: '0.2%', memory: sizeStr, uptime: '100%' },
      envVars: existing?.envVars || [],
      sampleFiles,
      deploys: existing?.deploys || []
    };

    // Auto-sync Cloudflare DNS & Edge Hosting if domain specified
    const targetDomain = req.body.cloudflareDomain || req.body.customDomain;
    if (targetDomain && cloudflareService.isConfigured()) {
      try {
        const cfSync = await cloudflareService.autoSyncDomainForResource(newService, targetDomain, {
          proxied: req.body.cloudflareProxied !== 'false' && req.body.cloudflareProxied !== false,
          zoneId: req.body.cloudflareZoneId
        });
        if (cfSync && cfSync.success) {
          newService.customDomain = targetDomain;
          newService.cloudflareProxied = cfSync.dnsRecord ? cfSync.dnsRecord.proxied : true;
          newService.liveDomain = `https://${targetDomain}`;
          newService.sslEnabled = true;
          await cloudflareService.purgeCache();
        }
      } catch (cfErr) {
        console.warn('[Cloudflare Auto-DNS] Upload deploy error:', cfErr.message);
      }
    }

    await storageService.addOrUpdateService(newService);

    // Launch automated AlloDeploy deployment pipeline
    const pipelinePromise = buildEngineService.runDeployPipeline(newService, {
      deployId,
      message: `Deploy from bundle (${filesCount} files, ${sizeStr})`
    });

    const deployRecord = await pipelinePromise;

    return res.status(201).json({
      success: true,
      service: newService,
      deployId,
      deploy: deployRecord,
      cloudflareUrl: newService.cloudflarePagesUrl
    });
  } catch (error) {
    console.error('Upload deploy error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Deploy via GitHub Project Integration (Automated AlloDeploy Pipeline)
deployRouter.post('/github', async (req, res) => {
  try {
    const { repoUrl, branch, buildCommand, publishDir, serviceName: requestedName, region, envVars, port } = req.body;
    if (!repoUrl) {
      return res.status(400).json({ error: 'GitHub repository URL is required.' });
    }

    const repoInfo = await githubService.parseRepoUrl(repoUrl);
    const chosenBranch = branch || repoInfo.default_branch || 'main';
    const cleanServiceName = (requestedName || repoInfo.name).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const chosenRegion = region || 'Oregon (us-west-1)';
    const deployId = 'dep-' + crypto.randomBytes(4).toString('hex');
    const assignedPort = parseInt(port, 10) || (3000 + Math.floor(Math.random() * 5000));

    const parts = (repoInfo.full_name || '').split('/');
    const owner = parts[0] || 'developer';
    const repo = parts[1] || repoInfo.name;

    // Download actual repository source tree from GitHub into server storage
    let extractedSource = null;
    try {
      extractedSource = await githubService.downloadAndExtractRepo(owner, repo, chosenBranch, cleanServiceName);
    } catch (dlErr) {
      console.warn(`[GitHub Deploy] Zipball download notice (${dlErr.message}), proceeding with runtime bundle creation.`);
    }

    // Check if an index.html was extracted
    const hasLiveIndex = storageService.getSiteFilePath(cleanServiceName, 'index.html');
    let generatedHtml = null;

    if (!hasLiveIndex) {
      generatedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${repoInfo.name} · Production Server Instance</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #080a12; color: #f8fafc; padding: 48px 24px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .card { background: #0e1320; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 40px; max-width: 680px; width: 100%; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; padding: 4px 14px; background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.35); border-radius: 9999px; font-size: 12px; color: #4ade80; font-weight: 600; margin-bottom: 20px; }
    .status-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e; }
    h1 { font-size: 26px; font-weight: 800; margin-bottom: 8px; color: #fff; letter-spacing: -0.02em; }
    p { color: #94a3b8; font-size: 14.5px; line-height: 1.6; margin-bottom: 24px; }
    .meta-grid { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; font-family: monospace; font-size: 13px; color: #cbd5e1; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
    .meta-item { display: flex; flex-direction: column; gap: 4px; }
    .meta-label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 600; }
    .meta-val { color: #38bdf8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .actions { display: flex; gap: 12px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #6366f1; color: white; border-radius: 8px; text-decoration: none; font-size: 13.5px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status-badge"><span class="status-dot"></span> Server Process Live</div>
    <h1>${repoInfo.name}</h1>
    <p>${repoInfo.description || 'Enterprise application deployed from GitHub repository directly to host server runtime.'}</p>
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">Repository</span><span class="meta-val">${repoInfo.full_name}</span></div>
      <div class="meta-item"><span class="meta-label">Branch</span><span class="meta-val">${chosenBranch}</span></div>
      <div class="meta-item"><span class="meta-label">Internal Port</span><span class="meta-val">:${assignedPort}</span></div>
      <div class="meta-item"><span class="meta-label">Commit SHA</span><span class="meta-val">${repoInfo.latest_commit?.sha || 'HEAD'}</span></div>
      <div class="meta-item"><span class="meta-label">Author</span><span class="meta-val">${repoInfo.latest_commit?.author || owner}</span></div>
      <div class="meta-item"><span class="meta-label">Region</span><span class="meta-val">${chosenRegion}</span></div>
    </div>
    <div class="actions">
      <a href="${repoInfo.html_url}" target="_blank" class="btn">View Source Repository</a>
    </div>
  </div>
</body>
</html>`;
      storageService.saveCustomHtmlSite(cleanServiceName, generatedHtml);
    }

    const filesCount = extractedSource?.filesCount || 1;
    const sampleFiles = extractedSource?.sampleFiles || ['index.html'];

    const existingServices = await storageService.getServices();
    const existing = existingServices.find(s => s.name === cleanServiceName);

    const cfPagesUrl = `https://${cleanServiceName}.pages.dev`;
    const targetDomainInit = req.body.cloudflareDomain || req.body.customDomain || (existing?.customDomain || '');
    const initialUrl = targetDomainInit 
      ? (targetDomainInit.startsWith('http') ? targetDomainInit : `https://${targetDomainInit}`) 
      : (existing?.url || cfPagesUrl);

    const requestingUserId = req.headers['x-user-id'] || req.body.userId || (existing?.userId || 'usr_enterprise_dev');
    const requestingUserEmail = req.headers['x-user-email'] || req.body.userEmail || (existing?.userEmail || 'alex.smith@example.com');

    const newService = {
      ...(existing || {}),
      id: existing ? existing.id : ('srv-' + crypto.randomBytes(4).toString('hex')),
      userId: requestingUserId,
      userEmail: requestingUserEmail,
      name: cleanServiceName,
      type: repoInfo.language === 'JavaScript' || repoInfo.language === 'TypeScript' ? 'Application' : 'Web Service',
      status: 'building',
      url: initialUrl,
      liveDomain: initialUrl,
      cloudflarePagesUrl: cfPagesUrl,
      cloudflareConnected: true,
      customDomain: targetDomainInit,
      domains: existing?.domains?.length ? existing.domains : (targetDomainInit ? [{ domain: targetDomainInit, sslStatus: 'active', forceHttps: true }] : []),
      region: chosenRegion,
      source: `GitHub (${repoInfo.full_name}:${chosenBranch})`,
      gitRepo: repoInfo.full_name,
      gitUrl: repoInfo.html_url,
      gitBranch: chosenBranch,
      gitCommit: repoInfo.latest_commit?.sha || 'HEAD',
      gitCommitMsg: repoInfo.latest_commit?.message || 'Deploy update',
      gitAuthor: repoInfo.latest_commit?.author || owner,
      buildCommand: buildCommand || repoInfo.buildCommand || 'npm run build',
      publishDir: publishDir || repoInfo.publishDir || 'dist',
      autoDeploy: true,
      port: assignedPort,
      filesCount,
      size: `${Math.max(1, (filesCount * 45 / 1024)).toFixed(1)} MB`,
      framework: repoInfo.framework || (repoInfo.language === 'TypeScript' ? 'TypeScript App' : 'Node.js / Static'),
      updatedAt: 'Just now',
      createdAt: new Date().toISOString().replace('T', ' ').substr(0, 16),
      deployCount: 1,
      metrics: { cpu: '0.2%', memory: '42 MB', uptime: '100%' },
      envVars: Array.isArray(envVars) ? envVars : [],
      sampleFiles,
      htmlContent: generatedHtml,
      deploys: []
    };

    // Auto-sync Cloudflare DNS & Edge Hosting if domain specified
    const targetDomain = req.body.cloudflareDomain || req.body.customDomain;
    if (targetDomain && cloudflareService.isConfigured()) {
      try {
        const cfSync = await cloudflareService.autoSyncDomainForResource(newService, targetDomain, {
          proxied: req.body.cloudflareProxied !== 'false' && req.body.cloudflareProxied !== false,
          zoneId: req.body.cloudflareZoneId
        });
        if (cfSync && cfSync.success) {
          newService.customDomain = targetDomain;
          newService.cloudflareProxied = cfSync.dnsRecord ? cfSync.dnsRecord.proxied : true;
          newService.liveDomain = `https://${targetDomain}`;
          newService.sslEnabled = true;
          await cloudflareService.purgeCache();
        }
      } catch (cfErr) {
        console.warn('[Cloudflare Auto-DNS] GitHub deploy error:', cfErr.message);
      }
    }

    await storageService.addOrUpdateService(newService);

    // Run automated deployment pipeline
    const deployRecord = await buildEngineService.runDeployPipeline(newService, {
      deployId,
      hash: repoInfo.latest_commit?.sha || 'main',
      message: repoInfo.latest_commit?.message || 'Initial GitHub deployment'
    });

    return res.status(201).json({
      success: true,
      service: newService,
      deployId,
      deploy: deployRecord
    });
  } catch (error) {
    console.error('GitHub deploy error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Real-Time SSE Live Build Log Streaming: /api/deploy/stream/:id
deployRouter.get('/stream/:id', (req, res) => {
  const deployId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering for instant SSE

  // If already finished in storage, send past logs
  const existing = buildEngineService.getDeployLogs(deployId);
  if (existing && existing.logs) {
    for (const log of existing.logs) {
      res.write(`data: ${JSON.stringify({ p: 100, text: `[${log.level}] ${log.text}`, type: log.level === 'SUCCESS' ? 'success' : 'info' })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    return res.end();
  }

  // Otherwise, listen for live events
  const onDeployEvent = (event) => {
    if (event.type === 'log') {
      res.write(`data: ${JSON.stringify({
        p: event.progress || 50,
        text: `[${event.entry.level}] ${event.entry.text}`,
        type: event.entry.level === 'SUCCESS' ? 'success' : (event.entry.level === 'WARN' ? 'warning' : 'info')
      })}\n\n`);
    } else if (event.type === 'done') {
      res.write(`data: ${JSON.stringify({ done: true, deploy: event.deployRecord })}\n\n`);
      deployEvents.off(`deploy:${deployId}`, onDeployEvent);
      res.end();
    }
  };

  deployEvents.on(`deploy:${deployId}`, onDeployEvent);

  req.on('close', () => {
    deployEvents.off(`deploy:${deployId}`, onDeployEvent);
  });
});

// GET /api/deploy/logs/:id - Fetch full log file for deployment
deployRouter.get('/logs/:id', (req, res) => {
  const logs = buildEngineService.getDeployLogs(req.params.id);
  if (!logs) {
    return res.status(404).json({ error: 'Deploy record not found' });
  }
  res.json({ success: true, ...logs });
});
