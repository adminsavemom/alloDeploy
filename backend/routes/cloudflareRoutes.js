import express from 'express';
import { cloudflareService } from '../services/cloudflareService.js';
import { storageService } from '../services/storageService.js';

export const cloudflareRouter = express.Router();

// GET /api/cloudflare/config - Get current Cloudflare configuration & status
cloudflareRouter.get('/config', async (req, res) => {
  try {
    const cfg = cloudflareService.getConfig();
    const token = cfg.apiToken || '';
    const masked = token.length > 8 ? `${token.substring(0, 4)}••••••••${token.substring(token.length - 4)}` : (token ? '••••••••' : '');

    let verifyStatus = null;
    if (cfg.apiToken) {
      verifyStatus = await cloudflareService.verifyToken();
    }

    res.json({
      success: true,
      configured: cfg.isConfigured,
      apiTokenMasked: masked,
      hasToken: !!cfg.apiToken,
      zoneId: cfg.zoneId,
      accountId: cfg.accountId,
      serverIp: cfg.serverIp,
      autoDns: cfg.autoDns,
      autoPurge: cfg.autoPurge,
      defaultProxied: cfg.defaultProxied,
      verification: verifyStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cloudflare/config - Save Cloudflare credentials and settings
cloudflareRouter.post('/config', async (req, res) => {
  try {
    const { apiToken, zoneId, accountId, serverIp, autoDns, autoPurge, defaultProxied } = req.body;
    const updates = {};
    if (apiToken !== undefined && apiToken !== '') updates.apiToken = apiToken.trim();
    if (zoneId !== undefined) updates.zoneId = zoneId.trim();
    if (accountId !== undefined) updates.accountId = accountId.trim();
    if (serverIp !== undefined) updates.serverIp = serverIp.trim();
    if (autoDns !== undefined) updates.autoDns = !!autoDns;
    if (autoPurge !== undefined) updates.autoPurge = !!autoPurge;
    if (defaultProxied !== undefined) updates.defaultProxied = !!defaultProxied;

    const saved = cloudflareService.saveConfig(updates);
    
    // Test verification with new settings
    let verify = null;
    if (saved.apiToken) {
      verify = await cloudflareService.verifyToken();
    }

    res.json({
      success: true,
      message: 'AlloDeploy Edge configuration saved successfully.',
      config: saved,
      verification: verify
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cloudflare/verify - Verify token explicitly
cloudflareRouter.post('/verify', async (req, res) => {
  try {
    const token = req.body.apiToken || null;
    const result = await cloudflareService.verifyToken(token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cloudflare/accounts - List available Cloudflare accounts for user
cloudflareRouter.get('/accounts', async (req, res) => {
  try {
    const accounts = await cloudflareService.listAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cloudflare/zones - List available Cloudflare zones for user
cloudflareRouter.get('/zones', async (req, res) => {
  try {
    const zones = await cloudflareService.listZones();
    res.json({ success: true, zones });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cloudflare/pages/deploy - Deploy a service to Cloudflare Pages
cloudflareRouter.post('/pages/deploy', async (req, res) => {
  try {
    const { serviceName, serviceId } = req.body;
    let targetName = serviceName;
    let siteDir = null;

    if (serviceId) {
      const services = (await storageService.getServices()) || [];
      const srv = services.find(s => s.id === serviceId);
      if (srv) {
        targetName = srv.name;
        siteDir = storageService.getSiteDir(srv.name);
      }
    } else if (targetName) {
      siteDir = storageService.getSiteDir(targetName);
    }

    const result = await cloudflareService.deployPagesProject(targetName, { siteDir });
    res.json({ success: result.success, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cloudflare/dns - List DNS records for active or requested zone
cloudflareRouter.get('/dns', async (req, res) => {
  try {
    const zoneId = req.query.zoneId;
    const name = req.query.name;
    const type = req.query.type;
    const records = await cloudflareService.getDnsRecords({ zoneId, name, type });
    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cloudflare/dns - Create or update a DNS record
cloudflareRouter.post('/dns', async (req, res) => {
  try {
    const { zoneId, name, type, content, proxied, ttl, comment } = req.body;
    if (!name) return res.status(400).json({ error: 'Record name is required' });

    const result = await cloudflareService.createOrUpdateDnsRecord({
      zoneId,
      name,
      type: type || 'CNAME',
      content,
      proxied: proxied !== undefined ? proxied : true,
      ttl: ttl || 1,
      comment
    });

    res.json({
      success: true,
      message: `DNS record ${name} ${result.action} on AlloDeploy Edge.`,
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cloudflare/dns/:recordId - Delete a DNS record
cloudflareRouter.delete('/dns/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const zoneId = req.query.zoneId;
    const result = await cloudflareService.deleteDnsRecord({ zoneId, recordId });
    res.json({ success: true, message: 'DNS record removed from AlloDeploy Edge.', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cloudflare/dns/:recordId/toggle-proxy - Toggle Orange Cloud Proxy
cloudflareRouter.post('/dns/:recordId/toggle-proxy', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { zoneId, proxied } = req.body;
    const result = await cloudflareService.toggleProxy({ zoneId, recordId, proxied });
    res.json({ success: true, message: `AlloDeploy Edge Proxy ${proxied ? 'enabled' : 'disabled'}`, record: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cloudflare/purge - Purge Edge Cache
cloudflareRouter.post('/purge', async (req, res) => {
  try {
    const { zoneId, files, purgeEverything } = req.body;
    const result = await cloudflareService.purgeCache({
      zoneId,
      files: files || [],
      purgeEverything: !!purgeEverything
    });
    res.json({ success: true, message: 'AlloDeploy Edge CDN cache purged successfully', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cloudflare/sync-service/:id - Auto sync domain for a specific service
cloudflareRouter.post('/sync-service/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const services = (await storageService.getServices()) || [];
    const srv = services.find(s => s.id === id);
    if (!srv) return res.status(404).json({ error: 'Service not found' });

    const targetDomain = req.body.domain || srv.customDomain;
    if (!targetDomain) return res.status(400).json({ error: 'No domain specified for service' });

    const result = await cloudflareService.autoSyncDomainForResource(srv, targetDomain, req.body);
    if (result.success) {
      srv.customDomain = targetDomain;
      srv.cloudflareProxied = result.dnsRecord ? result.dnsRecord.proxied : true;
      srv.liveDomain = `https://${targetDomain}`;
      srv.sslEnabled = true;
      srv.updatedAt = 'Just now';
      await storageService.addOrUpdateService(srv);
      
      // Auto purge cache for domain
      await cloudflareService.purgeCache();
    }
    res.json({ success: true, result, service: srv });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
