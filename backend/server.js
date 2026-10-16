import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { deployRouter } from './routes/deployRoutes.js';
import { servicesRouter } from './routes/servicesRoutes.js';
import { githubRouter } from './routes/githubRoutes.js';
import { metricsRouter } from './routes/metricsRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { nginxRouter } from './routes/nginxRoutes.js';
import { sslRouter } from './routes/sslRoutes.js';
import { cloudflareRouter } from './routes/cloudflareRoutes.js';

import { storageService } from './services/storageService.js';
import { db } from './services/db.js';
import { certbotService } from './services/certbotService.js';
import { nginxService } from './services/nginxService.js';
import { automationService } from './services/automationService.js';
import { cloudflareService } from './services/cloudflareService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend Vite dev server & local clients
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    version: '4.0.0',
    platform: 'AlloDeploy Edge Engine',
    database: db.isDbConnected() ? 'Supabase PostgreSQL (Connected)' : 'Local JSON Storage Fallback',
    nginxGateway: nginxService.getStatus().status,
    activeVhosts: nginxService.getStatus().activeVhosts,
    certificatesCount: certbotService.getCertificates().length,
    edgeNetwork: cloudflareService.isConfigured() ? 'active' : 'unconfigured',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Mount modular API routers
app.use('/api/auth', authRouter);
app.use('/api/deploy', deployRouter);
app.use('/api/services', servicesRouter);
app.use('/api/github', githubRouter);
app.use('/api/system/metrics', metricsRouter);
app.use('/api/nginx', nginxRouter);
app.use('/api/ssl', sslRouter);
app.use('/api/edge', cloudflareRouter);
app.use('/api/cloudflare', cloudflareRouter);

// Edge Static Hosting Endpoint: /sites/:subdomain/*
app.use('/sites/:subdomain', async (req, res) => {
  const subdomain = req.params.subdomain;
  const services = (await storageService.getServices()) || [];
  const srv = services.find(s => s.name === subdomain);

  if (srv && srv.status === 'stopped') {
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Service Stopped · AlloDeploy</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #090d16; color: #f8fafc; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; margin: 0;">
        <div style="background: #111726; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 36px; text-align: center; max-width: 480px; box-shadow: 0 16px 40px rgba(0,0,0,0.6);">
          <div style="width: 44px; height: 44px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #f87171; font-size: 20px;">⏹</div>
          <h2 style="margin: 0 0 10px; color: #fff; font-size: 20px;">Resource Stopped</h2>
          <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5;">The service <strong>${subdomain}</strong> is currently paused in the AlloDeploy engine.</p>
          <a href="http://localhost:5173" style="display: inline-block; background: #7c3aed; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;">Go to AlloDeploy Dashboard</a>
        </div>
      </body>
      </html>
    `);
  }

  const reqUrl = req.url.split('?')[0];
  const relativeFile = (reqUrl === '/' || !reqUrl) ? 'index.html' : reqUrl.replace(/^\//, '');

  const filePath = storageService.getSiteFilePath(subdomain, relativeFile);
  if (filePath) {
    return res.sendFile(filePath);
  }
  return res.status(404).send(`
    <html>
      <body style="font-family: sans-serif; background: #080a11; color: #f8fafc; padding: 40px; text-align: center;">
        <h2>404 - Not Found</h2>
        <p style="color: #94a3b8;">The requested asset for <code>${subdomain}</code> does not exist on this server.</p>
      </body>
    </html>
  `);
});

// 404 Handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Serve static frontend assets when built (Docker / production)
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/sites')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Background Automation Scheduler (Certbot Auto-Renewal & Healthcheck Prober)
function startAutomationBackgroundTasks() {
  console.log('⏰ Starting background automation jobs...');

  // 1. Periodic Certbot Auto-Renewal Check (Every 12 hours)
  setInterval(async () => {
    try {
      const res = await certbotService.autoRenewAllExpiring();
      if (res.renewedCount > 0) {
        console.log(`🔐 [Certbot Auto-Renew] Renewed ${res.renewedCount} certificate(s).`);
      }
    } catch (e) {
      console.warn('⚠️ [Certbot Auto-Renew Error]:', e.message);
    }
  }, 12 * 60 * 60 * 1000);

  // 2. Periodic Service Health Check Probes (Every 60 seconds)
  setInterval(async () => {
    try {
      const services = await storageService.getServices();
      for (const srv of services) {
        if (srv.status === 'running') {
          automationService.probeService(srv).catch(() => {});
        }
      }
    } catch (e) {
      // Quiet background probe
    }
  }, 60 * 1000);
}

// Boot server
async function boot() {
  // Initialize Database connection (Supabase PostgreSQL with fallback)
  await storageService.initDb();

  // Start background schedulers
  startAutomationBackgroundTasks();

  // Boot server
  app.listen(PORT, () => {
    console.log('======================================================');
    console.log(`⚡ AlloDeploy Engine Live on http://localhost:${PORT}`);
    console.log(`🗄️ Database:     ${db.isDbConnected() ? 'Supabase PostgreSQL (Connected)' : 'Local Storage Fallback'}`);
    console.log(`🚀 Deployment:   POST /api/deploy/upload & /api/deploy/github`);
    console.log(`🌐 Edge API:     GET/POST /api/edge/config & /api/edge/dns`);
    console.log(`🛡️ Nginx Proxy:  GET/PUT /api/nginx/status & /api/nginx/vhosts`);
    console.log(`🔒 Certbot SSL:  POST /api/ssl/issue & /api/ssl/renew/:domain`);
    console.log(`📦 Services API: http://localhost:${PORT}/api/services`);
    console.log(`🌐 Web Proxy:    http://localhost:${PORT}/sites/:subdomain/`);
    console.log('======================================================');
  });
}

boot();
