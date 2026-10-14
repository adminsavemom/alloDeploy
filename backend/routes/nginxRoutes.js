import express from 'express';
import { nginxService } from '../services/nginxService.js';
import { storageService } from '../services/storageService.js';

export const nginxRouter = express.Router();

// GET /api/nginx/status - Status, active vhosts, version & telemetry
nginxRouter.get('/status', (req, res) => {
  try {
    const status = nginxService.getStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/nginx/vhosts - List all active virtual host configurations
nginxRouter.get('/vhosts', (req, res) => {
  try {
    const vhosts = nginxService.listVhosts();
    res.json({ success: true, vhosts, count: vhosts.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/nginx/config/:serviceName - Get raw Nginx configuration
nginxRouter.get('/config/:serviceName', (req, res) => {
  try {
    const config = nginxService.getConfig(req.params.serviceName);
    if (!config) {
      return res.status(404).json({ error: `Nginx configuration for "${req.params.serviceName}" not found.` });
    }
    res.json({ success: true, serviceName: req.params.serviceName, config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/nginx/config/:serviceName - Update, test, and save Nginx configuration
nginxRouter.put('/config/:serviceName', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Configuration content is required.' });
    }

    // Syntax validation
    const test = await nginxService.testConfig(config);
    if (!test.success) {
      return res.status(422).json({
        error: 'Nginx syntax validation failed',
        details: test.errors || [test.output]
      });
    }

    const saved = nginxService.saveConfig(req.params.serviceName, config);
    const reload = await nginxService.reloadNginx();

    res.json({
      success: true,
      message: `Nginx configuration for ${req.params.serviceName} saved and reloaded.`,
      saved,
      reload
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nginx/test - Validate arbitrary Nginx configuration syntax
nginxRouter.post('/test', async (req, res) => {
  try {
    const { config } = req.body;
    const result = await nginxService.testConfig(config || '');
    res.json({ success: result.success, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nginx/reload - Gracefully reload Nginx daemon
nginxRouter.post('/reload', async (req, res) => {
  try {
    const result = await nginxService.reloadNginx();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nginx/generate/:serviceId - Automatically regenerate Nginx virtual host for service
nginxRouter.post('/generate/:serviceId', async (req, res) => {
  try {
    const services = await storageService.getServices();
    const service = services.find(s => s.id === req.params.serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const domain = req.body.domain || service.customDomain || `${service.name}.local`;
    const ssl = req.body.ssl !== undefined ? req.body.ssl : !!service.sslEnabled;
    const forceHttps = req.body.forceHttps !== undefined ? req.body.forceHttps : (service.forceHttps ?? true);

    const config = nginxService.generateConfig(service, { domain, ssl, forceHttps });
    nginxService.saveConfig(service.name, config);
    const reload = await nginxService.reloadNginx();

    res.json({
      success: true,
      message: `Nginx configuration regenerated and applied for ${service.name}`,
      config,
      reload
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
