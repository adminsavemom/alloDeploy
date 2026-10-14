import express from 'express';
import { certbotService } from '../services/certbotService.js';

export const sslRouter = express.Router();

// GET /api/ssl/certificates - List all active & expiring SSL certificates
sslRouter.get('/certificates', (req, res) => {
  try {
    const certs = certbotService.getCertificates();
    res.json({
      success: true,
      certificates: certs,
      totalCount: certs.length,
      activeCount: certs.filter(c => c.status === 'active').length,
      expiringSoonCount: certs.filter(c => c.status === 'expiring_soon').length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ssl/certificate/:domain - Get certificate for specific domain
sslRouter.get('/certificate/:domain', (req, res) => {
  try {
    const cert = certbotService.getCertificate(req.params.domain);
    if (!cert) {
      return res.status(404).json({ error: `No certificate found for domain: ${req.params.domain}` });
    }
    res.json({ success: true, certificate: cert });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ssl/verify-dns - Pre-flight DNS resolution check
sslRouter.post('/verify-dns', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain name is required' });
    }
    const check = await certbotService.verifyDns(domain);
    res.json({ success: true, check });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ssl/issue - Issue Let's Encrypt / ACME SSL certificate & auto-configure Nginx
sslRouter.post('/issue', async (req, res) => {
  try {
    const { domain, email, serviceId, serviceName, staging } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const certificate = await certbotService.issueCertificate({
      domain,
      email,
      serviceId,
      serviceName,
      staging: !!staging
    });

    res.status(201).json({
      success: true,
      message: `Let's Encrypt SSL certificate issued successfully for ${domain}`,
      certificate
    });
  } catch (error) {
    console.error('SSL issue error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ssl/renew/:domain - Renew an existing certificate
sslRouter.post('/renew/:domain', async (req, res) => {
  try {
    const cert = await certbotService.renewCertificate(req.params.domain);
    res.json({
      success: true,
      message: `SSL Certificate for ${req.params.domain} renewed for 90 days.`,
      certificate: cert
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/ssl/revoke/:domain - Revoke certificate
sslRouter.delete('/revoke/:domain', async (req, res) => {
  try {
    const result = await certbotService.revokeCertificate(req.params.domain);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ssl/auto-renew - Trigger automated scan & renewal for all expiring certs
sslRouter.post('/auto-renew', async (req, res) => {
  try {
    const result = await certbotService.autoRenewAllExpiring();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
