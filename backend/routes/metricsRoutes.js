import express from 'express';
import os from 'os';
import { storageService } from '../services/storageService.js';

export const metricsRouter = express.Router();

metricsRouter.get('/', async (req, res) => {
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const usedMem = totalMem - freeMem;
  const services = (await storageService.getServices()) || [];

  res.json({
    timestamp: new Date().toISOString(),
    status: 'healthy',
    server: {
      hostname: os.hostname(),
      platform: `${os.platform()} (${os.arch()})`,
      release: os.release(),
      uptimeSeconds: Math.floor(os.uptime()),
      processUptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      cpuModel: os.cpus()[0]?.model || 'Host CPU',
      cpuCores: os.cpus().length,
      memoryTotalMB: Math.round(totalMem / 1024 / 1024),
      memoryUsedMB: Math.round(usedMem / 1024 / 1024),
      memoryFreeMB: Math.round(freeMem / 1024 / 1024),
      memoryUsagePercent: Math.round((usedMem / totalMem) * 100),
      processMemoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    resources: {
      total: services.length,
      running: services.filter(s => s.status === 'live' || s.status === 'running').length,
      stopped: services.filter(s => s.status === 'stopped').length,
      databases: services.filter(s => s.type.toLowerCase().includes('database') || s.type.toLowerCase().includes('postgres') || s.type.toLowerCase().includes('redis')).length,
      applications: services.filter(s => s.type.toLowerCase().includes('site') || s.type.toLowerCase().includes('web') || s.type.toLowerCase().includes('app')).length
    }
  });
});

