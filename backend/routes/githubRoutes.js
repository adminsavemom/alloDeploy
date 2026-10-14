import express from 'express';
import { githubService } from '../services/githubService.js';
import { storageService } from '../services/storageService.js';

export const githubRouter = express.Router();

// GET /api/github/status - Get current GitHub connection status
githubRouter.get('/status', (req, res) => {
  try {
    const config = githubService.getConfig();
    res.json({
      success: true,
      connected: config.connected,
      user: config.user,
      email: config.email,
      authProvider: config.authProvider,
      connectedAt: config.connectedAt,
      hasToken: !!config.token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/github/connect-gmail - Connect Git account through Gmail
githubRouter.post('/connect-gmail', async (req, res) => {
  try {
    const { email, githubUsername, token } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'A Gmail or Google email address is required.' });
    }
    const result = await githubService.connectWithGmail({ email, githubUsername, token });
    res.json({
      success: true,
      message: `Connected Git account via Gmail (${result.email})`,
      user: result.user,
      authProvider: 'gmail'
    });
  } catch (error) {
    console.error('Error connecting Git via Gmail:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/github/connect - Connect GitHub account using Personal Access Token
githubRouter.post('/connect', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'GitHub Personal Access Token is required.' });
    }
    const result = await githubService.verifyAndSaveToken(token);
    res.json({
      success: true,
      message: `Connected successfully to GitHub as @${result.user.login}`,
      user: result.user
    });
  } catch (error) {
    console.error('Error connecting to GitHub:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/github/disconnect - Disconnect GitHub account
githubRouter.post('/disconnect', (req, res) => {
  try {
    const result = githubService.disconnect();
    res.json({
      success: true,
      message: 'GitHub account disconnected.',
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/github/repos - List authenticated user's repositories
githubRouter.get('/repos', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace(/^Bearer /i, '') : null;
    const repos = await githubService.getRepositories(token);
    const config = githubService.getConfig();
    res.json({
      success: true,
      connected: config.connected,
      user: config.user,
      repositories: repos
    });
  } catch (error) {
    console.error('Error in /api/github/repos:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/github/repo-info?url=...
githubRouter.get('/repo-info', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url parameter is required' });

    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace(/^Bearer /i, '') : null;
    const info = await githubService.parseRepoUrl(url, token);
    res.json({ success: true, repo: info });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/github/webhook
githubRouter.post('/webhook', async (req, res) => {
  const event = req.headers['x-github-event'] || 'push';
  const payload = req.body;

  console.log(`[GitHub Webhook] Received ${event} event`);
  if (event === 'push') {
    const repoFullName = payload.repository?.full_name;
    const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : 'main';
    const commitMsg = payload.head_commit?.message || 'Auto-deploy triggered by GitHub push';
    const commitSha = payload.head_commit?.id?.substr(0, 7) || 'auto-' + Math.random().toString(36).substr(2, 5);

    // Find services linked to this repository
    const services = await storageService.getServices();
    const matched = services.filter(s => s.gitRepo && s.gitRepo.toLowerCase() === (repoFullName || '').toLowerCase());

    for (const srv of matched) {
      const newDeploy = {
        id: 'dep-' + Math.random().toString(36).substr(2, 6),
        hash: commitSha,
        message: commitMsg,
        branch,
        date: 'Just now',
        duration: '2.4s',
        status: 'running'
      };
      srv.status = 'running';
      srv.updatedAt = 'Just now';
      srv.deployCount = (srv.deployCount || 1) + 1;
      srv.deploys = [newDeploy, ...(srv.deploys || []).map(d => ({ ...d, status: 'superseded' }))];
      await storageService.addOrUpdateService(srv);
    }

    return res.json({ success: true, autoDeployedCount: matched.length, branch, commit: commitSha });
  }

  res.json({ success: true, message: `Handled ${event}` });
});
