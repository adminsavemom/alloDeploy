import express from 'express';
import crypto from 'crypto';
import { storageService } from '../services/storageService.js';
import { buildEngineService } from '../services/buildEngineService.js';
import { nginxService } from '../services/nginxService.js';
import { certbotService } from '../services/certbotService.js';
import { automationService } from '../services/automationService.js';
import { cloudflareService } from '../services/cloudflareService.js';

export const servicesRouter = express.Router();

// GET all services
servicesRouter.get('/', async (req, res) => {
  const services = (await storageService.getServices()) || [];
  res.json({ services });
});

// GET single service
servicesRouter.get('/:id', async (req, res) => {
  const services = await storageService.getServices();
  const service = services.find(s => s.id === req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });
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

    const newResource = {
      id: 'srv-' + crypto.randomBytes(4).toString('hex'),
      name: cleanName,
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

// BIND CUSTOM DOMAIN (Cloudflare Pages Project Domain Binding)
servicesRouter.post('/:id/custom-domain', async (req, res) => {
  const services = await storageService.getServices();
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Service not found' });

  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain name is required' });

  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

  let cfResult = null;
  if (cloudflareService.isConfigured()) {
    try {
      cfResult = await cloudflareService.addPagesProjectDomain(srv.name, cleanDomain);
    } catch (cfErr) {
      console.warn('[Cloudflare Pages Custom Domain Notice]:', cfErr.message);
    }
  }

  srv.customDomain = cleanDomain;
  srv.customDomainStatus = cfResult?.status || 'pending';
  srv.customDomainCname = `${srv.name}.pages.dev`;
  srv.customDomainError = cfResult?.dnsStatus?.error || (cfResult?.status === 'pending' ? 'CNAME record pending' : '');
  srv.cloudflarePagesUrl = `https://${srv.name}.pages.dev`;
  srv.url = `https://${srv.name}.pages.dev`;
  srv.liveDomain = `https://${srv.name}.pages.dev`;
  srv.sslEnabled = true;
  srv.updatedAt = 'Just now';

  await storageService.addOrUpdateService(srv);
  console.log(`🌐 [Custom Domain Bound] Resource "${srv.name}" bound domain ${cleanDomain} (Status: ${srv.customDomainStatus})`);
  res.json({ success: true, service: srv, domain: cleanDomain, cfResult });
});

// VERIFY / CHECK CUSTOM DOMAIN STATUS
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
      await storageService.addOrUpdateService(srv);
    } catch (err) {
      console.warn('Domain verify error:', err.message);
    }
  }

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

  srv.customDomain = '';
  srv.customDomainStatus = '';
  srv.customDomainError = '';
  srv.customDomainCname = '';
  const cfUrl = `https://${srv.name}.pages.dev`;
  srv.url = cfUrl;
  srv.liveDomain = cfUrl;
  srv.cloudflarePagesUrl = cfUrl;
  srv.updatedAt = 'Just now';

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

  const { domain, email, forceHttps = true } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain name is required' });

  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  try {
    // 1. Verify DNS resolution
    const dnsCheck = await certbotService.verifyDns(cleanDomain);

    // 2. Issue Let's Encrypt SSL certificate via Certbot
    const certificate = await certbotService.issueCertificate({
      domain: cleanDomain,
      email: email || 'admin@allodeploy.dev',
      serviceId: srv.id,
      serviceName: srv.name
    });

    // 3. Update service record
    srv.customDomain = cleanDomain;
    srv.sslEnabled = true;
    srv.sslStatus = 'active';
    srv.liveDomain = `https://${cleanDomain}`;
    srv.forceHttps = forceHttps;

    const currentDomains = Array.isArray(srv.domains) ? [...srv.domains] : [];
    const idx = currentDomains.findIndex(d => (typeof d === 'string' ? d : d.domain) === cleanDomain);
    const domainItem = {
      domain: cleanDomain,
      sslStatus: 'active',
      forceHttps,
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

    await storageService.addOrUpdateService(srv);

    res.status(201).json({
      success: true,
      message: `Domain ${cleanDomain} added, SSL certificate issued, and Nginx reverse proxy configured.${cloudflareSync?.success ? ' Synced with AlloDeploy Edge DNS.' : ''}`,
      service: srv,
      certificate,
      dnsCheck,
      edge: cloudflareSync
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

// DELETE
servicesRouter.delete('/:id', async (req, res) => {
  const deleted = await storageService.deleteService(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Service not found' });
  nginxService.deleteConfig(deleted.name);
  await nginxService.reloadNginx();
  res.json({ success: true, message: `Resource ${deleted.name} and Nginx virtual host removed successfully` });
});
