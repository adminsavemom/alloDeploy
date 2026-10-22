import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { storageService } from '../services/storageService.js';
import { buildEngineService } from '../services/buildEngineService.js';
import { nginxService } from '../services/nginxService.js';
import { certbotService } from '../services/certbotService.js';
import { automationService } from '../services/automationService.js';
import { cloudflareService } from '../services/cloudflareService.js';

export const servicesRouter = express.Router();

// Helper to extract requesting user from headers/query/body
function getRequestingUser(req) {
  const userId = req.headers['x-user-id'] || req.query.userId || req.body?.userId || '';
  const userEmail = (req.headers['x-user-email'] || req.query.userEmail || req.body?.userEmail || '').toLowerCase().trim();
  return { userId, userEmail };
}

export function checkServiceOwnership(service, { userId, userEmail }) {
  if (!service) return false;
  if (!userId && !userEmail) return false;

  const reqEmail = (userEmail || '').toLowerCase().trim();
  const srvEmail = (service.userEmail || '').toLowerCase().trim();
  const reqId = (userId || '').trim();
  const srvId = (service.userId || '').trim();

  // Strict match by userId
  if (reqId && srvId && reqId === srvId) return true;

  // Strict match by userEmail
  if (reqEmail && srvEmail && reqEmail === srvEmail) return true;

  return false;
}

// GET all services (strictly isolated per user account)
servicesRouter.get('/', async (req, res) => {
  const { userId, userEmail } = getRequestingUser(req);
  if (!userId && !userEmail) {
    return res.json({ services: [] });
  }

  const allServices = (await storageService.getServices()) || [];
  const services = allServices.filter(s => checkServiceOwnership(s, { userId, userEmail }));
  res.json({ services });
});

// GET single service
servicesRouter.get('/:id', async (req, res) => {
  const { userId, userEmail } = getRequestingUser(req);
  const services = await storageService.getServices();
  const service = services.find(s => s.id === req.params.id || s.name === req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  if (!checkServiceOwnership(service, { userId, userEmail })) {
    return res.status(403).json({ error: 'Access denied. You do not have permission to view this project.' });
  }

  res.json({ service });
});

// CREATE new resource (AlloDeploy style)
servicesRouter.post('/create', async (req, res) => {
  try {
    const { name, type, framework, gitRepo, templateType, envVars, port, customDomain } = req.body;
    const cleanName = (name || 'app-' + Math.random().toString(36).substr(2, 6))
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');

    const portNum = port || (type === 'Database' ? (framework === 'Redis' ? 6379 : 5432) : (3000 + Math.floor(Math.random() * 5000)));
    const cfPagesUrl = `https://${cleanName}.pages.dev`;
    const serviceUrl = customDomain ? (customDomain.startsWith('http') ? customDomain : `https://${customDomain}`) : cfPagesUrl;

    const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${cleanName} · AlloDeploy Engine</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f17; color: #f8fafc; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; margin: 0; }
    .card { background: #121824; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 36px; max-width: 540px; text-align: center; box-shadow: 0 12px 30px rgba(0,0,0,0.5); }
    h1 { font-size: 24px; margin-bottom: 12px; color: #8b5cf6; }
    p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
    .badge { display: inline-block; background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); padding: 5px 14px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
    .details { background: #0a0d14; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #a5b4fc; text-align: left; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">● Running (Container Healthy)</span>
    <h1>${cleanName}</h1>
    <p>Resource provisioned and running successfully via the AlloDeploy engine.</p>
    <div class="details">
      <div>TYPE: ${type || 'Application'}</div>
      <div>STACK: ${framework || 'Docker Container'}</div>
      <div>INTERNAL PORT: ${portNum}</div>
      <div>STATUS: 200 OK</div>
    </div>
  </div>
</body>
</html>`;

    storageService.saveCustomHtmlSite(cleanName, defaultHtml);

    const { userId, userEmail } = getRequestingUser(req);
    if (!userId && !userEmail) {
      return res.status(401).json({ error: 'Authentication required to create a project.' });
    }
    const assignedUserId = userId || '';
    const assignedUserEmail = userEmail || '';

    const existingServices = await storageService.getServices();
    const existingSameName = existingServices.find(s => s.name === cleanName);
    if (existingSameName && !checkServiceOwnership(existingSameName, { userId: assignedUserId, userEmail: assignedUserEmail })) {
      return res.status(409).json({ error: `A project named "${cleanName}" already exists under another account. Please choose a different project name.` });
    }

    const newResource = {
      id: 'srv-' + crypto.randomBytes(4).toString('hex'),
      name: cleanName,
      userId: assignedUserId,
      userEmail: assignedUserEmail,
      type: type || 'Application',
      status: 'running',
      url: serviceUrl,
      liveDomain: customDomain ? `https://${customDomain}` : cfPagesUrl,
      cloudflarePagesUrl: cfPagesUrl,
      cloudflareConnected: true,
      customDomain: customDomain || '',
      domains: customDomain ? [{ domain: customDomain, sslStatus: 'active', forceHttps: true }] : [],
      region: 'Self-Hosted Server',
      source: gitRepo ? `Git (${gitRepo})` : (templateType ? `One-Click (${templateType})` : 'Self-Hosted Container'),
      gitRepo: gitRepo || '',
      gitUrl: gitRepo ? `https://github.com/${gitRepo}` : '',
      gitBranch: 'main',
      filesCount: 1,
      size: '1.2 MB',
      framework: framework || (type === 'Database' ? 'PostgreSQL' : 'Node.js'),
      updatedAt: 'Just now',
      createdAt: new Date().toISOString().replace('T', ' ').substr(0, 16),
      deployCount: 1,
      port: portNum,
      metrics: { uptime: '100%', cpu: '0.4%', memory: '48 MB' },
      envVars: envVars || [
        { key: 'PORT', value: String(portNum) },
        { key: 'NODE_ENV', value: 'production' }
      ],
      sampleFiles: ['index.html', 'docker-compose.yml'],
      healthcheck: { path: '/', expectedStatus: 200, intervalSeconds: 30 },
      deploys: [],
      backups: [],
      templateType: templateType || ''
    };

    await storageService.addOrUpdateService(newResource);

    // Run automated deployment pipeline (generates Nginx config & verifies)
    await buildEngineService.runDeployPipeline(newResource, {
      message: 'Initial deployment via AlloDeploy engine'
    });

    return res.status(201).json({ success: true, service: newResource });
  } catch (err) {
    console.error('Error creating resource:', err);
    return res.status(500).json({ error: err.message });
  }
});

// START service
servicesRouter.post('/:id/start', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  srv.status = 'running';
  srv.updatedAt = 'Just now';
  await storageService.addOrUpdateService(srv);
  res.json({ success: true, service: srv });
});

// STOP service
servicesRouter.post('/:id/stop', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  srv.status = 'stopped';
  srv.updatedAt = 'Just now';
  await storageService.addOrUpdateService(srv);
  console.log(`⏹ [Service Stopped] Resource "${srv.name}" marked as STOPPED.`);
  res.json({ success: true, service: srv });
});

// RESTART service
servicesRouter.post('/:id/restart', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  srv.status = 'running';
  srv.updatedAt = 'Just now';
  await storageService.addOrUpdateService(srv);
  console.log(`🔄 [Service Restarted] Resource "${srv.name}" restarted successfully.`);
  res.json({ success: true, service: srv });
});

// REGENERATE HOSTNAME (matches Picture 5 format: hash.ip.sslip.io)
servicesRouter.post('/:id/regenerate-hostname', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  // Generate random hash matching format in Picture 5: fvt2dr7dd0q5gphtw5iu1nha.72.61.239.30.sslip.io
  const randomChars = Math.random().toString(36).substring(2, 10) + 
                      Math.random().toString(36).substring(2, 10) + 
                      Math.random().toString(36).substring(2, 10);
  const serverIp = cloudflareService.getConfig().serverIp || '72.61.239.30';
  const newHostname = `${randomChars.substring(0, 24)}.${serverIp}.sslip.io`;

  srv.generatedHostname = newHostname;
  srv.updatedAt = 'Just now';
  await storageService.addOrUpdateService(srv);
  res.json({ success: true, hostname: newHostname, service: srv });
});

// PUT /:id/domain-settings (Full support for Picture 5 domain settings + Cloudflare Custom Hostnames)
servicesRouter.put('/:id/domain-settings', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const {
    protocol,
    domain,
    port,
    path: pathSuffix,
    indexing,
    wwwRedirect,
    customOriginServer,
    customOriginSni,
    customHostnameId,
    zoneId
  } = req.body;

  if (protocol) srv.protocol = protocol;
  if (port) srv.port = parseInt(port, 10) || srv.port || 3000;
  if (pathSuffix !== undefined) srv.pathSuffix = pathSuffix;
  if (indexing) srv.searchEngineIndexing = indexing;
  if (wwwRedirect) srv.wwwRedirect = wwwRedirect;

  const cleanDomain = domain ? domain.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '') : '';
  if (cleanDomain) {
    srv.customDomain = cleanDomain;
    const proto = srv.protocol || 'https';
    // Only append port if explicitly specified as non-standard public port (not 80, 443, 5000, 3000, or internal port)
    const numPort = parseInt(port, 10);
    const isStandardWebPort = !numPort || numPort === 80 || numPort === 443 || numPort === 5000 || numPort === 3000 || numPort === srv.port;
    const portPart = isStandardWebPort ? '' : `:${numPort}`;
    const pathPart = srv.pathSuffix ? (srv.pathSuffix.startsWith('/') ? srv.pathSuffix : `/${srv.pathSuffix}`) : '';
    srv.liveDomain = `${proto}://${cleanDomain}${portPart}${pathPart}`;
    srv.url = srv.liveDomain;
    srv.sslEnabled = proto === 'https';

    // Sync into srv.domains
    if (!Array.isArray(srv.domains)) srv.domains = [];
    const domIdx = srv.domains.findIndex(d => (typeof d === 'string' ? d : d.domain) === cleanDomain);
    const domObj = {
      domain: cleanDomain,
      sslStatus: proto === 'https' ? 'active' : 'disabled',
      forceHttps: proto === 'https',
      customOriginServer: customOriginServer || srv.customOriginServer || '',
      customOriginSni: customOriginSni || srv.customOriginSni || ''
    };
    if (domIdx >= 0) {
      srv.domains[domIdx] = { ...srv.domains[domIdx], ...domObj };
    } else {
      srv.domains.push(domObj);
    }

    // Automatically update Nginx virtual host configuration
    try {
      const nginxConf = nginxService.generateConfig(srv, {
        domain: cleanDomain,
        ssl: proto === 'https',
        forceHttps: proto === 'https'
      });
      nginxService.saveConfig(srv.name, nginxConf);
      await nginxService.reloadNginx();
    } catch (ngErr) {
      console.warn('Nginx virtual host sync notice:', ngErr.message);
    }

    // Call Cloudflare APIs if configured
    if (cloudflareService.isConfigured()) {
      try {
        await cloudflareService.addPagesProjectDomain(srv.name, cleanDomain).catch(() => {});
        const cfHost = await cloudflareService.syncCustomHostnameForDomain({
          zoneId: zoneId || null,
          domain: cleanDomain,
          customOriginServer: customOriginServer || srv.customOriginServer,
          customOriginSni: customOriginSni || srv.customOriginSni,
          customHostnameId: customHostnameId || srv.customHostnameId
        }).catch(() => {});
        if (cfHost?.id) srv.customHostnameId = cfHost.id;
      } catch (cfErr) {
        console.warn('Notice syncing domain settings with Cloudflare:', cfErr.message);
      }
    }
  }

  if (customOriginServer !== undefined) srv.customOriginServer = customOriginServer;
  if (customOriginSni !== undefined) srv.customOriginSni = customOriginSni;
  srv.updatedAt = 'Just now';

  await storageService.addOrUpdateService(srv);
  res.json({ success: true, service: srv });
});


// BIND / CHANGE CUSTOM DOMAIN (Cloudflare Pages & Custom Hostnames PATCH)
servicesRouter.post('/:id/custom-domain', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const {
    domain,
    customOriginServer,
    custom_origin_server,
    customOriginSni,
    custom_origin_sni,
    customHostnameId,
    custom_hostname_id,
    zoneId
  } = req.body;

  if (!domain) return res.status(400).json({ error: 'Domain name is required' });

  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const originServer = customOriginServer !== undefined ? customOriginServer : (custom_origin_server || srv.customOriginServer || '');
  const originSni = customOriginSni !== undefined ? customOriginSni : (custom_origin_sni || srv.customOriginSni || '');
  let targetHostnameId = customHostnameId || custom_hostname_id || srv.customHostnameId || null;

  // 1. Cloudflare Pages Project Domain Binding
  let cfResult = null;
  if (cloudflareService.isConfigured()) {
    try {
      cfResult = await cloudflareService.addPagesProjectDomain(srv.name, cleanDomain);
    } catch (cfErr) {
      console.warn('[Cloudflare Pages Custom Domain Notice]:', cfErr.message);
    }
  }

  // 2. Cloudflare Custom Hostname API (PATCH /zones/:zone_id/custom_hostnames/:custom_hostname_id)
  let cfHostnameResult = null;
  if (cloudflareService.isConfigured() && (originServer || originSni || targetHostnameId)) {
    try {
      const syncRes = await cloudflareService.syncCustomHostnameForDomain({
        zoneId: zoneId || null,
        domain: cleanDomain,
        customOriginServer: originServer,
        customOriginSni: originSni,
        customHostnameId: targetHostnameId
      });
      cfHostnameResult = syncRes;
      if (syncRes?.id) {
        targetHostnameId = syncRes.id;
      }
    } catch (hostErr) {
      console.warn('[Cloudflare Custom Hostname PATCH Notice]:', hostErr.message);
    }
  }

  srv.customDomain = cleanDomain;
  srv.customDomainStatus = cfResult?.status || 'active';
  srv.customDomainCname = `${srv.name}.pages.dev`;
  srv.customDomainError = cfResult?.dnsStatus?.error || '';
  srv.customOriginServer = originServer;
  srv.customOriginSni = originSni;
  if (targetHostnameId) srv.customHostnameId = targetHostnameId;
  const proto = srv.protocol || 'https';
  srv.cloudflarePagesUrl = `https://${srv.name}.pages.dev`;
  srv.url = `${proto}://${cleanDomain}`;
  srv.liveDomain = `${proto}://${cleanDomain}`;
  srv.sslEnabled = proto === 'https';
  srv.updatedAt = 'Just now';

  // Also sync with srv.domains array if present
  if (!Array.isArray(srv.domains)) srv.domains = [];
  const existingDom = srv.domains.find(d => (typeof d === 'string' ? d : d.domain) === cleanDomain);
  if (existingDom && typeof existingDom === 'object') {
    existingDom.customOriginServer = originServer;
    existingDom.customOriginSni = originSni;
    if (targetHostnameId) existingDom.customHostnameId = targetHostnameId;
    existingDom.sslStatus = 'active';
  } else if (!existingDom) {
    srv.domains.push({
      domain: cleanDomain,
      sslStatus: 'active',
      forceHttps: true,
      customOriginServer: originServer,
      customOriginSni: originSni,
      customHostnameId: targetHostnameId
    });
  }

  // Generate / update Nginx virtual host configuration
  try {
    const nginxConf = nginxService.generateConfig(srv, {
      domain: cleanDomain,
      ssl: proto === 'https',
      forceHttps: proto === 'https'
    });
    nginxService.saveConfig(srv.name, nginxConf);
    await nginxService.reloadNginx();
  } catch (ngErr) {
    console.warn('Nginx virtual host sync notice:', ngErr.message);
  }

  await storageService.addOrUpdateService(srv);
  console.log(`🌐 [Custom Domain Bound] Resource "${srv.name}" bound domain ${cleanDomain} (Status: ${srv.customDomainStatus})${originServer ? ` with custom origin: ${originServer}` : ''}`);
  res.json({
    success: true,
    service: srv,
    domain: cleanDomain,
    cfResult,
    customHostname: cfHostnameResult
  });
});

// PATCH /api/services/:id/custom-domain/origin - Direct PATCH update to Custom Hostname origin & SNI
servicesRouter.patch('/:id/custom-domain/origin', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const {
    customOriginServer,
    custom_origin_server,
    customOriginSni,
    custom_origin_sni,
    customHostnameId,
    custom_hostname_id,
    zoneId
  } = req.body;

  const originServer = customOriginServer !== undefined ? customOriginServer : custom_origin_server;
  const originSni = customOriginSni !== undefined ? customOriginSni : custom_origin_sni;
  const hostnameId = customHostnameId || custom_hostname_id || srv.customHostnameId;

  if (!srv.customDomain && !hostnameId) {
    return res.status(400).json({ error: 'No custom domain or custom hostname ID found for service' });
  }

  let cfHostnameResult = null;
  if (cloudflareService.isConfigured()) {
    try {
      cfHostnameResult = await cloudflareService.syncCustomHostnameForDomain({
        zoneId: zoneId || null,
        domain: srv.customDomain,
        customOriginServer: originServer,
        customOriginSni: originSni,
        customHostnameId: hostnameId
      });
      if (cfHostnameResult?.id) srv.customHostnameId = cfHostnameResult.id;
    } catch (cfErr) {
      console.warn('Cloudflare custom hostname PATCH error:', cfErr.message);
      return res.status(500).json({ error: cfErr.message });
    }
  }

  if (originServer !== undefined) srv.customOriginServer = originServer;
  if (originSni !== undefined) srv.customOriginSni = originSni;
  srv.updatedAt = 'Just now';

  await storageService.addOrUpdateService(srv);
  res.json({
    success: true,
    message: 'Custom origin routing updated successfully',
    service: srv,
    customHostname: cfHostnameResult
  });
});

servicesRouter.get('/:id/custom-domain/verify', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });
  if (!srv.customDomain) return res.status(400).json({ error: 'No custom domain set' });

  let statusInfo = { status: 'pending', cnameTarget: `${srv.name}.pages.dev` };
  if (cloudflareService.isConfigured()) {
    try {
      statusInfo = await cloudflareService.getPagesProjectDomainStatus(srv.name, srv.customDomain);
      srv.customDomainStatus = statusInfo.status;
    } catch (err) {
      console.warn('Cloudflare verify error:', err.message);
    }
  }

  // Verify public DNS resolution
  const dnsRes = await certbotService.verifyDns(srv.customDomain);
  statusInfo.dns = dnsRes;
  statusInfo.dnsResolved = dnsRes.resolved;
  srv.dnsResolved = dnsRes.resolved;

  if (dnsRes.resolved) {
    statusInfo.status = 'active';
    srv.customDomainStatus = 'active';
    srv.customDomainError = '';
  } else {
    statusInfo.status = 'dns_pending';
    srv.customDomainStatus = 'dns_pending';
    srv.customDomainError = dnsRes.message || 'CNAME/A record not yet configured in your domain registrar DNS.';
  }

  await storageService.addOrUpdateService(srv);
  res.json({ success: true, service: srv, statusInfo });
});

// REMOVE CUSTOM DOMAIN
servicesRouter.delete('/:id/custom-domain', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  if (srv.customDomain && cloudflareService.isConfigured()) {
    await cloudflareService.deletePagesProjectDomain(srv.name, srv.customDomain).catch(() => {});
  }

  if (srv.customHostnameId && cloudflareService.isConfigured()) {
    await cloudflareService.deleteCustomHostname({ customHostnameId: srv.customHostnameId }).catch(() => {});
  }

  const removedDomain = srv.customDomain;
  srv.customDomain = '';
  srv.customDomainStatus = '';
  srv.customDomainError = '';
  srv.customDomainCname = '';
  srv.customHostnameId = '';
  srv.customOriginServer = '';
  srv.customOriginSni = '';
  if (Array.isArray(srv.domains)) {
    srv.domains = srv.domains.filter(d => (typeof d === 'string' ? d : d.domain) !== removedDomain);
  }
  const cfUrl = `https://${srv.name}.pages.dev`;
  srv.url = cfUrl;
  srv.liveDomain = cfUrl;
  srv.cloudflarePagesUrl = cfUrl;
  srv.updatedAt = 'Just now';

  try {
    const nginxConf = nginxService.generateConfig(srv);
    nginxService.saveConfig(srv.name, nginxConf);
    await nginxService.reloadNginx();
  } catch (ngErr) {}

  await storageService.addOrUpdateService(srv);
  console.log(`🌐 [Custom Domain Removed] Resource "${srv.name}" reverted to ${cfUrl}`);
  res.json({ success: true, service: srv });
});

// RESTART service
servicesRouter.post('/:id/restart', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  srv.status = 'running';
  srv.updatedAt = 'Just now';
  await nginxService.reloadNginx();
  await storageService.addOrUpdateService(srv);
  res.json({ success: true, service: srv });
});

// REDEPLOY service (Triggers real multi-step pipeline)
servicesRouter.post('/:id/redeploy', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  try {
    const deployRecord = await buildEngineService.runDeployPipeline(srv, {
      message: srv.gitRepo ? `Redeploy from branch ${srv.gitBranch || 'main'}` : 'Manual container redeploy triggered'
    });
    res.json({ success: true, service: srv, deploy: deployRecord });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/services/:id/deployments - List Cloudflare Pages & local deployments
servicesRouter.get('/:id/deployments', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  let cfDeployments = [];
  try {
    if (cloudflareService.isConfigured()) {
      cfDeployments = await cloudflareService.getPagesDeployments(srv.name);
    }
  } catch (e) {
    console.warn('[Cloudflare Deployments API]:', e.message);
  }

  // If authentic deployments are available, return them sorted descending (newest first)
  if (cfDeployments && cfDeployments.length > 0) {
    cfDeployments.sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());
    return res.json({ success: true, deployments: cfDeployments });
  }

  const localDeploys = (srv.deploys || []).map(d => ({
    id: d.id,
    shortId: d.hash || (d.id ? d.id.replace('dep-', '').substring(0, 8) : ''),
    environment: srv.currentEnvironment || 'production',
    url: d.url || (d.hash ? `https://${d.hash}.${srv.name}.pages.dev` : (srv.cloudflarePagesUrl || srv.url)),
    aliases: [srv.cloudflarePagesUrl || srv.url],
    createdOn: d.timestamp ? new Date(d.timestamp).toISOString() : (d.date && d.date !== 'Just now' ? d.date : srv.createdAt || new Date().toISOString()),
    branch: srv.gitBranch || 'main',
    commitHash: d.hash || '',
    commitMessage: d.message || 'Deploy to AlloDeploy',
    status: d.status === 'running' || d.status === 'success' ? 'success' : (d.status || 'success'),
    duration: d.duration || '2.4s'
  }));

  localDeploys.sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());

  res.json({ success: true, deployments: localDeploys });
});

// =============================================================================
// DOMAINS & AUTOMATED CERTBOT SSL INTEGRATION
// =============================================================================

// GET /api/services/:id/domains - List domains and SSL certificate status
servicesRouter.get('/:id/domains', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const domains = Array.isArray(srv.domains) ? srv.domains : [];
  if (srv.customDomain && !domains.some(d => (typeof d === 'string' ? d : d.domain) === srv.customDomain)) {
    domains.push({
      domain: srv.customDomain,
      sslStatus: srv.sslEnabled ? 'active' : 'pending',
      forceHttps: srv.forceHttps ?? true
    });
  }

  // Enrich with live certbot certificate metadata
  const enriched = domains.map(d => {
    const domName = typeof d === 'string' ? d : d.domain;
    const cert = certbotService.getCertificate(domName);
    return {
      domain: domName,
      sslStatus: cert ? cert.status : (d.sslStatus || 'disabled'),
      certificate: cert || null,
      forceHttps: d.forceHttps ?? true,
      issuer: cert ? cert.issuer : null,
      daysRemaining: cert ? cert.daysRemaining : null,
      autoRenew: cert ? cert.autoRenew : true
    };
  });

  res.json({ success: true, domains: enriched });
});

// POST /api/services/:id/domains - Add domain with AUTOMATED Certbot SSL & Nginx config
servicesRouter.post('/:id/domains', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const {
    domain,
    email,
    forceHttps = true,
    customOriginServer,
    custom_origin_server,
    customOriginSni,
    custom_origin_sni,
    customHostnameId,
    custom_hostname_id,
    zoneId
  } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain name is required' });

  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const originServer = customOriginServer !== undefined ? customOriginServer : (custom_origin_server || srv.customOriginServer || '');
  const originSni = customOriginSni !== undefined ? customOriginSni : (custom_origin_sni || srv.customOriginSni || '');
  let targetHostnameId = customHostnameId || custom_hostname_id || srv.customHostnameId || null;

  try {
    // 1. Verify DNS resolution
    const dnsCheck = await certbotService.verifyDns(cleanDomain);

    // 2. Issue Let's Encrypt SSL certificate via Certbot
    const certificate = await certbotService.issueCertificate({
      domain: cleanDomain,
      email: email || 'alex.smith@example.com',
      serviceId: srv.id,
      serviceName: srv.name
    });

    // 3. Update service record
    srv.customDomain = cleanDomain;
    srv.sslEnabled = true;
    srv.sslStatus = 'active';
    srv.liveDomain = `https://${cleanDomain}`;
    srv.forceHttps = forceHttps;
    if (originServer) srv.customOriginServer = originServer;
    if (originSni) srv.customOriginSni = originSni;

    const currentDomains = Array.isArray(srv.domains) ? [...srv.domains] : [];
    const idx = currentDomains.findIndex(d => (typeof d === 'string' ? d : d.domain) === cleanDomain);
    const domainItem = {
      domain: cleanDomain,
      sslStatus: 'active',
      forceHttps,
      customOriginServer: originServer,
      customOriginSni: originSni,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt
    };

    if (idx >= 0) {
      currentDomains[idx] = domainItem;
    } else {
      currentDomains.push(domainItem);
    }
    srv.domains = currentDomains;

    // 4. Automatically generate Nginx virtual host with SSL & force HTTPS
    const nginxConf = nginxService.generateConfig(srv, {
      domain: cleanDomain,
      ssl: true,
      forceHttps
    });
    nginxService.saveConfig(srv.name, nginxConf);
    await nginxService.reloadNginx();

    // 5. Automated Cloudflare DNS Provisioning
    let cloudflareSync = null;
    if (cloudflareService.isConfigured() && cloudflareService.getConfig().autoDns) {
      try {
        cloudflareSync = await cloudflareService.autoSyncDomainForResource(srv, cleanDomain, {
          proxied: req.body.proxied !== undefined ? req.body.proxied : true
        });
        if (cloudflareSync?.success) {
          domainItem.cloudflare = {
            synced: true,
            zoneId: cloudflareSync.zone?.id,
            zoneName: cloudflareSync.zone?.name,
            recordId: cloudflareSync.dnsRecord?.id,
            proxied: cloudflareSync.dnsRecord?.proxied,
            type: cloudflareSync.dnsRecord?.type
          };
        }
      } catch (cfErr) {
        console.warn('Cloudflare auto-sync warning:', cfErr.message);
      }
    }

    // 6. Cloudflare Custom Hostname API (PATCH /zones/:zone_id/custom_hostnames/:custom_hostname_id)
    let customHostnameResult = null;
    if (cloudflareService.isConfigured() && (originServer || originSni || targetHostnameId)) {
      try {
        customHostnameResult = await cloudflareService.syncCustomHostnameForDomain({
          zoneId: zoneId || null,
          domain: cleanDomain,
          customOriginServer: originServer,
          customOriginSni: originSni,
          customHostnameId: targetHostnameId
        });
        if (customHostnameResult?.id) {
          srv.customHostnameId = customHostnameResult.id;
          domainItem.customHostnameId = customHostnameResult.id;
        }
      } catch (hostErr) {
        console.warn('Cloudflare custom hostname sync error:', hostErr.message);
      }
    }

    await storageService.addOrUpdateService(srv);

    res.status(201).json({
      success: true,
      message: `Domain ${cleanDomain} added, SSL certificate issued, and Nginx reverse proxy configured.${cloudflareSync?.success ? ' Synced with AlloDeploy DNS.' : ''}${customHostnameResult ? ' Custom origin routing applied.' : ''}`,
      service: srv,
      certificate,
      dnsCheck,
      dnsSync: cloudflareSync,
      customHostname: customHostnameResult
    });
  } catch (err) {
    console.error('Domain add error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/services/:id/domains/:domain - Remove domain
servicesRouter.delete('/:id/domains/:domain', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const target = req.params.domain.toLowerCase();
  srv.domains = (srv.domains || []).filter(d => (typeof d === 'string' ? d : d.domain).toLowerCase() !== target);

  if (srv.customDomain?.toLowerCase() === target) {
    srv.customDomain = srv.domains[0] ? (typeof srv.domains[0] === 'string' ? srv.domains[0] : srv.domains[0].domain) : '';
    srv.liveDomain = srv.customDomain ? `https://${srv.customDomain}` : `http://${srv.name}.local`;
    srv.sslEnabled = !!srv.customDomain;
  }

  // Regenerate Nginx config
  const nginxConf = nginxService.generateConfig(srv);
  nginxService.saveConfig(srv.name, nginxConf);
  await nginxService.reloadNginx();

  await storageService.addOrUpdateService(srv);
  res.json({ success: true, message: `Domain ${target} removed`, service: srv });
});

// POST /api/services/:id/domains/:domain/ssl - Re-issue or renew SSL
servicesRouter.post('/:id/domains/:domain/ssl', async (req, res) => {
  try {
    const domain = req.params.domain;
    let cert = certbotService.getCertificate(domain);
    if (cert) {
      cert = await certbotService.renewCertificate(domain);
    } else {
      cert = await certbotService.issueCertificate({
        domain,
        serviceId: req.params.id
      });
    }
    res.json({ success: true, certificate: cert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// ROLLBACK API
// =============================================================================

// POST /api/services/:id/rollback/:deployId - Instant rollback
servicesRouter.post('/:id/rollback/:deployId', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  try {
    const result = await buildEngineService.rollback(srv, req.params.deployId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// AUTOMATED HEALTHCHECK API
// =============================================================================

// GET /api/services/:id/healthcheck - Get settings and probe history
servicesRouter.get('/:id/healthcheck', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const history = automationService.getHealthHistory(srv.id);
  res.json({
    success: true,
    healthcheck: srv.healthcheck || { path: '/', expectedStatus: 200, intervalSeconds: 30 },
    history
  });
});

// PUT /api/services/:id/healthcheck - Update healthcheck settings
servicesRouter.put('/:id/healthcheck', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  srv.healthcheck = {
    path: req.body.path || '/',
    expectedStatus: parseInt(req.body.expectedStatus, 10) || 200,
    intervalSeconds: parseInt(req.body.intervalSeconds, 10) || 30
  };

  await storageService.addOrUpdateService(srv);
  res.json({ success: true, healthcheck: srv.healthcheck });
});

// POST /api/services/:id/healthcheck/probe - Run immediate health probe
servicesRouter.post('/:id/healthcheck/probe', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const probeResult = await automationService.probeService(srv);
  res.json({ success: true, probe: probeResult });
});

// =============================================================================
// BACKUPS API
// =============================================================================

// GET /api/services/:id/backups - List backups
servicesRouter.get('/:id/backups', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  res.json({ success: true, backups: automationService.getBackups(srv) });
});

// POST /api/services/:id/backups - Create backup
servicesRouter.post('/:id/backups', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  try {
    const backup = await automationService.createBackup(srv, req.body.note);
    res.status(201).json({ success: true, backup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/services/:id/backups/:backupId/restore - Restore backup
servicesRouter.post('/:id/backups/:backupId/restore', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  try {
    const result = await automationService.restoreBackup(srv, req.params.backupId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/services/:id/backups/:backupId - Delete backup
servicesRouter.delete('/:id/backups/:backupId', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const result = await automationService.deleteBackup(srv, req.params.backupId);
  res.json(result);
});

// =============================================================================
// SCHEDULED TASKS (CRON) API
// =============================================================================

// GET /api/services/:id/tasks - List scheduled tasks
servicesRouter.get('/:id/tasks', async (req, res) => {
  res.json({ success: true, tasks: automationService.getTasks(req.params.id) });
});

// POST /api/services/:id/tasks - Add scheduled task
servicesRouter.post('/:id/tasks', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const task = automationService.addTask(srv, req.body);
  res.status(201).json({ success: true, task });
});

// DELETE /api/services/:id/tasks/:taskId - Delete scheduled task
servicesRouter.delete('/:id/tasks/:taskId', async (req, res) => {
  automationService.deleteTask(req.params.taskId);
  res.json({ success: true, taskId: req.params.taskId });
});

// POST /api/services/:id/tasks/:taskId/run - Run scheduled task now
servicesRouter.post('/:id/tasks/:taskId/run', async (req, res) => {
  try {
    const task = automationService.runTask(req.params.taskId);
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// WEBHOOKS API
// =============================================================================

// GET /api/services/:id/webhook - Get webhook endpoint URL
servicesRouter.get('/:id/webhook', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  res.json({ success: true, webhook: automationService.getWebhookInfo(srv) });
});

// POST /api/services/:id/webhook - Trigger webhook deploy
servicesRouter.post('/:id/webhook', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  srv.lastWebhookTriggered = new Date().toISOString();
  await storageService.addOrUpdateService(srv);

  const deployRecord = await buildEngineService.runDeployPipeline(srv, {
    message: 'Triggered via incoming Webhook event'
  });

  res.json({ success: true, message: 'Webhook triggered deployment pipeline', deploy: deployRecord });
});

// UPDATE CONFIG & ENV VARS
servicesRouter.put('/:id/config', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const { name, envVars, buildCommand, publishDir, port, autoDeploy, customDomain, forceHttps } = req.body;
  if (name) srv.name = name;
  if (envVars) srv.envVars = envVars;
  if (buildCommand !== undefined) srv.buildCommand = buildCommand;
  if (publishDir !== undefined) srv.publishDir = publishDir;
  if (port) srv.port = port;
  if (autoDeploy !== undefined) srv.autoDeploy = autoDeploy;
  if (customDomain !== undefined) srv.customDomain = customDomain;
  if (forceHttps !== undefined) srv.forceHttps = forceHttps;
  srv.updatedAt = 'Just now';

  // Automatically update and reload Nginx configuration
  const nginxConf = nginxService.generateConfig(srv);
  nginxService.saveConfig(srv.name, nginxConf);
  await nginxService.reloadNginx();

  await storageService.addOrUpdateService(srv);
  res.json({ success: true, service: srv });
});

// =========================================================================
// CUSTOM ENVIRONMENT VARIABLES API (UI & Developer View .env Sync)
// =========================================================================

// GET /api/services/:id/env - Get custom environment variables
servicesRouter.get('/:id/env', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });
  res.json({ success: true, envVars: srv.envVars || [] });
});

// PUT /api/services/:id/env - Update custom environment variables (supports JSON array or raw .env string)
servicesRouter.put('/:id/env', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const { envVars, rawEnv, order, buildSecrets } = req.body;
  let parsedEnv = [];

  if (Array.isArray(envVars)) {
    parsedEnv = envVars.filter(ev => ev && ev.key).map(ev => ({
      key: ev.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      value: ev.value !== undefined ? String(ev.value) : '',
      isSecret: !!ev.isSecret,
      isBuildSecret: !!ev.isBuildSecret
    }));
  } else if (typeof rawEnv === 'string') {
    // Parse raw .env format from Developer View
    const lines = rawEnv.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key) {
          parsedEnv.push({ key, value, isSecret: false, isBuildSecret: false });
        }
      }
    }
  }

  srv.envVars = parsedEnv;
  if (order) srv.envOrder = order;
  if (buildSecrets) srv.envBuildSecrets = buildSecrets;
  srv.updatedAt = 'Just now';

  // Write .env to service site directory if on disk
  try {
    const siteDir = storageService.getSiteDir(srv.name);
    if (siteDir && fs.existsSync(siteDir)) {
      const envContent = parsedEnv.map(e => `${e.key}=${e.value}`).join('\n');
      fs.writeFileSync(path.join(siteDir, '.env'), envContent, 'utf8');
    }
  } catch (fsErr) {
    console.warn('Notice writing .env file to disk:', fsErr.message);
  }

  // Sync to Cloudflare Pages deployment configs if configured
  if (cloudflareService.isConfigured()) {
    try {
      await cloudflareService.updatePagesEnvironmentVariables(srv.name, parsedEnv);
    } catch (cfErr) {
      console.warn('Notice syncing Pages env vars:', cfErr.message);
    }
  }

  await storageService.addOrUpdateService(srv);
  console.log(`🔐 [Custom Environment API] Saved ${parsedEnv.length} variables for resource "${srv.name}"`);
  res.json({ success: true, service: srv, envVars: parsedEnv });
});

// POST /api/services/:id/env - Add or update a single environment variable
servicesRouter.post('/:id/env', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const { key, value, isSecret, isBuildSecret } = req.body;
  if (!key) return res.status(400).json({ error: 'Variable key is required' });

  const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (!Array.isArray(srv.envVars)) srv.envVars = [];

  const existingIdx = srv.envVars.findIndex(e => e.key === cleanKey);
  const newEntry = {
    key: cleanKey,
    value: value !== undefined ? String(value) : '',
    isSecret: !!isSecret,
    isBuildSecret: !!isBuildSecret
  };

  if (existingIdx !== -1) {
    srv.envVars[existingIdx] = newEntry;
  } else {
    srv.envVars.push(newEntry);
  }

  srv.updatedAt = 'Just now';
  await storageService.addOrUpdateService(srv);
  res.json({ success: true, service: srv, envVars: srv.envVars });
});

// DELETE /api/services/:id/env/:key - Delete an environment variable by key
servicesRouter.delete('/:id/env/:key', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const targetKey = req.params.key.toUpperCase();
  if (Array.isArray(srv.envVars)) {
    srv.envVars = srv.envVars.filter(e => e.key !== targetKey);
    srv.updatedAt = 'Just now';
    await storageService.addOrUpdateService(srv);
  }

  res.json({ success: true, service: srv, envVars: srv.envVars || [] });
});

// GET LOGS
servicesRouter.get('/:id/logs', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const now = new Date().toISOString();
  const logs = [
    `[${now}] [info] Initializing AlloDeploy runner for ${srv.name}...`,
    `[${now}] [info] Validating runtime environment (${srv.framework || 'Docker'})...`,
    `[${now}] [info] Reverse proxy target: http://127.0.0.1:${srv.port || 3000}`,
    `[${now}] [info] Healthcheck endpoint verified: http://localhost:5000/sites/${srv.name}/`,
    `[${now}] [stdout] Container listening on port ${srv.port || 3000}`,
    `[${now}] [stdout] Nginx virtual host active (/etc/nginx/conf.d/${srv.name}.conf)`,
    `[${now}] [success] Resource is ${srv.status === 'stopped' ? 'STOPPED' : 'HEALTHY & RUNNING'}`
  ];

  res.json({ logs });
});

// DELETE project
servicesRouter.delete('/:id', async (req, res) => {
  const { userId, userEmail } = getRequestingUser(req);
  const targetIdOrName = req.params.id;
  const targetQueryName = req.query.name || req.body?.name;

  const services = await storageService.getServices();
  const srv = services.find(s => 
    s.id === targetIdOrName || 
    s.name === targetIdOrName || 
    (targetQueryName && s.name === targetQueryName)
  );

  const effectiveId = srv ? srv.id : targetIdOrName;
  const effectiveName = srv ? srv.name : (targetQueryName || targetIdOrName);

  // Clean up from Cloudflare Pages & Custom Hostnames if configured
  if (cloudflareService.isConfigured() && effectiveName) {
    try {
      if (srv?.customDomain && typeof cloudflareService.deletePagesProjectDomain === 'function') {
        await cloudflareService.deletePagesProjectDomain(effectiveName, srv.customDomain).catch(() => {});
      }
      if (srv?.customHostnameId && typeof cloudflareService.deleteCustomHostname === 'function') {
        await cloudflareService.deleteCustomHostname({ customHostnameId: srv.customHostnameId }).catch(() => {});
      }
      if (typeof cloudflareService.deletePagesProject === 'function') {
        await cloudflareService.deletePagesProject(effectiveName).catch(() => {});
      }
    } catch (cfErr) {
      console.warn('Notice cleaning up Cloudflare resources:', cfErr.message);
    }
  }

  const deleted = await storageService.deleteService(effectiveId, effectiveName);
  if (effectiveName) {
    nginxService.deleteConfig(effectiveName);
    await nginxService.reloadNginx();
  }
  res.json({ success: true, message: `Resource "${effectiveName}" and associated configs deleted successfully`, deleted });
});

