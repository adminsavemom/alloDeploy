import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dns from 'dns';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();
const STORAGE_DIR = path.resolve(__dirname, '..', 'storage');
const CONFIG_FILE = path.join(STORAGE_DIR, 'cloudflare_config.json');

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

function loadStoredConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading cloudflare_config.json:', err.message);
  }
  return {};
}

function persistStoredConfig(data) {
  try {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving cloudflare_config.json:', err.message);
  }
}

export const cloudflareService = {
  getConfig() {
    const stored = loadStoredConfig();
    const token = stored.apiToken || process.env.CLOUDFLARE_API_TOKEN || '';
    const zoneId = stored.zoneId || process.env.CLOUDFLARE_ZONE_ID || '';
    const accountId = stored.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '';
    const serverIp = stored.serverIp || process.env.SERVER_PUBLIC_IP || '127.0.0.1';
    const autoDns = stored.autoDns !== undefined ? stored.autoDns : true;
    const autoPurge = stored.autoPurge !== undefined ? stored.autoPurge : true;
    const defaultProxied = stored.defaultProxied !== undefined ? stored.defaultProxied : true;
    const deployPages = stored.deployPages !== undefined ? stored.deployPages : true;

    return {
      apiToken: token,
      zoneId,
      accountId,
      serverIp,
      autoDns,
      autoPurge,
      defaultProxied,
      deployPages,
      isConfigured: !!(token && (zoneId || accountId || stored.apiToken))
    };
  },

  saveConfig(updates) {
    const current = loadStoredConfig();
    const next = { ...current, ...updates, updatedAt: new Date().toISOString() };
    persistStoredConfig(next);
    return this.getConfig();
  },

  isConfigured() {
    return this.getConfig().isConfigured;
  },

  getHeaders(overrideToken = null) {
    const token = overrideToken || this.getConfig().apiToken;
    if (!token) throw new Error('AlloDeploy Edge API Token is not configured.');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  },

  // Verify API token validity with Cloudflare
  async verifyToken(overrideToken = null) {
    try {
      const headers = this.getHeaders(overrideToken);
      const res = await fetch(`${CF_API_BASE}/user/tokens/verify`, {
        method: 'GET',
        headers
      });
      const data = await res.json();
      return {
        success: data.success,
        status: data.result ? data.result.status : 'invalid',
        message: data.messages?.[0]?.message || (data.success ? 'Token is valid & active' : 'Invalid token'),
        errors: data.errors
      };
    } catch (err) {
      return {
        success: false,
        status: 'error',
        message: err.message
      };
    }
  },

  // List all available Cloudflare DNS zones
  async listZones(overrideToken = null) {
    try {
      const headers = this.getHeaders(overrideToken);
      const res = await fetch(`${CF_API_BASE}/zones?status=active&per_page=50`, {
        method: 'GET',
        headers
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.errors?.[0]?.message || 'Failed to list Cloudflare zones');
      }

      return (data.result || []).map(z => ({
        id: z.id,
        name: z.name,
        status: z.status,
        paused: z.paused,
        nameServers: z.name_servers || [],
        plan: z.plan?.name || 'Free'
      }));
    } catch (err) {
      console.error('Cloudflare listZones error:', err.message);
      throw err;
    }
  },

  // Find apex zone for a custom domain or subdomain (e.g. app.mybrand.com -> mybrand.com)
  async findZoneForDomain(domainName, overrideToken = null) {
    const zones = await this.listZones(overrideToken);
    const clean = domainName.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    
    // Sort zones by length descending to match longest suffix first (e.g. sub.domain.co.uk vs co.uk)
    zones.sort((a, b) => b.name.length - a.name.length);
    
    const matched = zones.find(z => clean === z.name.toLowerCase() || clean.endsWith('.' + z.name.toLowerCase()));
    return matched || zones[0] || null;
  },

  // List DNS records for a zone (with optional name/type filtering)
  async getDnsRecords({ zoneId, name, type } = {}) {
    try {
      const cfg = this.getConfig();
      const targetZone = zoneId || cfg.zoneId;
      if (!targetZone) throw new Error('No Zone ID specified or configured in AlloDeploy.');

      let url = `${CF_API_BASE}/zones/${targetZone}/dns_records?per_page=100`;
      if (name) url += `&name=${encodeURIComponent(name)}`;
      if (type) url += `&type=${encodeURIComponent(type)}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.errors?.[0]?.message || 'Failed to fetch DNS records');
      }

      return (data.result || []).map(r => ({
        id: r.id,
        zoneId: r.zone_id,
        zoneName: r.zone_name,
        name: r.name,
        type: r.type,
        content: r.content,
        proxiable: r.proxiable,
        proxied: r.proxied,
        ttl: r.ttl,
        comment: r.comment || '',
        createdOn: r.created_on,
        modifiedOn: r.modified_on
      }));
    } catch (err) {
      console.error('Cloudflare getDnsRecords error:', err.message);
      throw err;
    }
  },

  // Create or Update a DNS record (Idempotent: updates if name exists, otherwise inserts)
  async createOrUpdateDnsRecord({ zoneId, name, type = 'CNAME', content, proxied = true, ttl = 1, comment = 'Managed by AlloDeploy' }) {
    try {
      const cfg = this.getConfig();
      const targetZone = zoneId || cfg.zoneId;
      if (!targetZone) throw new Error('No Cloudflare Zone ID provided.');

      const cleanName = name.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const existingRecords = await this.getDnsRecords({ zoneId: targetZone, name: cleanName });
      const existing = existingRecords.find(r => r.name.toLowerCase() === cleanName);

      const payload = {
        type,
        name: cleanName,
        content: content || cfg.serverIp,
        ttl: proxied ? 1 : (ttl || 1), // Auto TTL required if proxied
        proxied: !!proxied,
        comment: `${comment} (${new Date().toISOString().substring(0, 10)})`
      };

      let res;
      if (existing) {
        // Update existing record
        res = await fetch(`${CF_API_BASE}/zones/${targetZone}/dns_records/${existing.id}`, {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify(payload)
        });
      } else {
        // Create new record
        res = await fetch(`${CF_API_BASE}/zones/${targetZone}/dns_records`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.errors?.[0]?.message || 'Failed to upsert Cloudflare DNS record');
      }

      return {
        action: existing ? 'updated' : 'created',
        record: data.result
      };
    } catch (err) {
      console.error('Cloudflare createOrUpdateDnsRecord error:', err.message);
      throw err;
    }
  },

  // Delete a DNS record from Cloudflare
  async deleteDnsRecord({ zoneId, recordId }) {
    try {
      const cfg = this.getConfig();
      const targetZone = zoneId || cfg.zoneId;
      if (!targetZone || !recordId) throw new Error('Zone ID and Record ID are required');

      const res = await fetch(`${CF_API_BASE}/zones/${targetZone}/dns_records/${recordId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.errors?.[0]?.message || 'Failed to delete DNS record');
      }
      return { success: true, id: data.result?.id || recordId };
    } catch (err) {
      console.error('Cloudflare deleteDnsRecord error:', err.message);
      throw err;
    }
  },

  // Toggle Cloudflare Proxy (Orange Cloud) on or off
  async toggleProxy({ zoneId, recordId, proxied }) {
    try {
      const cfg = this.getConfig();
      const targetZone = zoneId || cfg.zoneId;
      const res = await fetch(`${CF_API_BASE}/zones/${targetZone}/dns_records/${recordId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ proxied: !!proxied })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.errors?.[0]?.message || 'Failed to toggle Cloudflare proxy');
      }
      return data.result;
    } catch (err) {
      console.error('Cloudflare toggleProxy error:', err.message);
      throw err;
    }
  },

  // Purge Edge Cache for entire zone or specific URLs
  async purgeCache({ zoneId, files = [], purgeEverything = false } = {}) {
    try {
      const cfg = this.getConfig();
      const targetZone = zoneId || cfg.zoneId;
      if (!targetZone) return { skipped: true, reason: 'No Zone ID configured' };

      const body = (files.length > 0 && !purgeEverything)
        ? { files }
        : { purge_everything: true };

      const res = await fetch(`${CF_API_BASE}/zones/${targetZone}/purge_cache`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return {
        success: data.success,
        purged: data.success ? (purgeEverything ? 'all' : files) : null,
        errors: data.errors
      };
    } catch (err) {
      console.error('Cloudflare purgeCache error:', err.message);
      return { success: false, error: err.message };
    }
  },

  // Get zone SSL mode (off, flexible, full, strict)
  async getZoneSslSetting(zoneId = null) {
    try {
      const targetZone = zoneId || this.getConfig().zoneId;
      if (!targetZone) return null;
      const res = await fetch(`${CF_API_BASE}/zones/${targetZone}/settings/ssl`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      const data = await res.json();
      return data.result?.value || 'unknown';
    } catch (err) {
      return 'unknown';
    }
  },

  // Automated Domain Sync for an AlloDeploy Resource
  async autoSyncDomainForResource(resource, domainName, options = {}) {
    const cfg = this.getConfig();
    if (!cfg.apiToken) {
      return { skipped: true, reason: 'AlloDeploy Edge API token not configured' };
    }

    try {
      // Find matching zone
      const matchedZone = await this.findZoneForDomain(domainName);
      if (!matchedZone) {
        return { skipped: true, reason: `No matching AlloDeploy Edge zone found for ${domainName}` };
      }

      // Check if domain is apex or subdomain
      const clean = domainName.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const isApex = clean === matchedZone.name.toLowerCase();
      
      const recordType = isApex ? 'A' : (options.recordType || 'CNAME');
      const recordContent = recordType === 'A' ? (options.serverIp || cfg.serverIp) : (options.cnameTarget || matchedZone.name);

      const result = await this.createOrUpdateDnsRecord({
        zoneId: matchedZone.id,
        name: clean,
        type: recordType,
        content: recordContent,
        proxied: options.proxied !== undefined ? options.proxied : cfg.defaultProxied,
        comment: `AlloDeploy resource: ${resource.name || 'app'}`
      });

      return {
        success: true,
        zone: matchedZone,
        dnsRecord: result.record,
        action: result.action
      };
    } catch (err) {
      console.error(`Auto-sync domain error for ${domainName}:`, err.message);
      return { success: false, error: err.message };
    }
  },

  // List all Cloudflare Accounts accessible by the API Token
  async listAccounts(overrideToken = null) {
    try {
      const headers = this.getHeaders(overrideToken);
      const res = await fetch(`${CF_API_BASE}/accounts?per_page=50`, {
        method: 'GET',
        headers
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.errors?.[0]?.message || 'Failed to list Cloudflare accounts');
      }
      return (data.result || []).map(a => ({
        id: a.id,
        name: a.name,
        type: a.type || 'standard'
      }));
    } catch (err) {
      console.warn('Cloudflare listAccounts notice:', err.message);
      return [];
    }
  },

  // Get or create Cloudflare Pages project
  async getOrCreatePagesProject(projectName, accountId = null) {
    const cfg = this.getConfig();
    let targetAccountId = accountId || cfg.accountId;
    if (!targetAccountId) {
      const accounts = await this.listAccounts();
      if (accounts.length > 0) {
        targetAccountId = accounts[0].id;
        this.saveConfig({ accountId: targetAccountId });
      }
    }
    if (!targetAccountId) throw new Error('Cloudflare Account ID is required for Pages deployments.');

    const cleanName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const headers = this.getHeaders();

    // 1. Check if project already exists
    try {
      const getRes = await fetch(`${CF_API_BASE}/accounts/${targetAccountId}/pages/projects/${encodeURIComponent(cleanName)}`, {
        method: 'GET',
        headers
      });
      const getData = await getRes.json();
      if (getData.success && getData.result) {
        return getData.result;
      }
    } catch (e) {}

    // 2. Create project if not exists
    const createRes = await fetch(`${CF_API_BASE}/accounts/${targetAccountId}/pages/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: cleanName,
        production_branch: 'main'
      })
    });
    const createData = await createRes.json();
    if (!createData.success) {
      if (createData.errors?.[0]?.message?.includes('already exists')) {
        return { name: cleanName, subdomain: `${cleanName}.pages.dev` };
      }
      throw new Error(createData.errors?.[0]?.message || 'Failed to create Cloudflare Pages project');
    }
    return createData.result;
  },

  // Deploy project bundle through Cloudflare Pages API & Edge Network
  async deployPagesProject(projectName, { siteDir = null, branch = 'main', onLog = null } = {}) {
    const cfg = this.getConfig();
    const cleanName = (projectName || 'site').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const defaultPagesUrl = `https://${cleanName}.pages.dev`;

    if (!cfg.apiToken) {
      return {
        success: false,
        configured: false,
        url: defaultPagesUrl,
        projectName: cleanName,
        message: 'Cloudflare API Token is not configured. Configure token in Settings > Cloudflare.'
      };
    }

    let accountId = cfg.accountId;
    if (!accountId) {
      const accounts = await this.listAccounts();
      if (accounts.length > 0) {
        accountId = accounts[0].id;
        this.saveConfig({ accountId });
      }
    }

    const backendDir = path.resolve(__dirname, '..');
    let wranglerEntry = null;
    try {
      const candidate = path.join(backendDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
      if (fs.existsSync(candidate)) {
        wranglerEntry = candidate;
      }
    } catch {}

    const env = {
      ...process.env,
      CI: 'true',
      WRANGLER_SEND_METRICS: 'false',
      CLOUDFLARE_TELEMETRY_DISABLED: '1',
      CLOUDFLARE_API_TOKEN: cfg.apiToken,
      ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {})
    };

    const runWrangler = (args, timeoutMs = 60000) => new Promise((resolve) => {
      let fullOutput = '';
      if (onLog) onLog(`> wrangler ${args.join(' ')}`);

      let timer = null;
      let proc = null;

      try {
        const isWin = process.platform === 'win32';
        const execArgs = wranglerEntry ? [wranglerEntry, ...args] : ['wrangler', ...args];
        const execBin = wranglerEntry ? process.execPath : (isWin ? 'npx.cmd' : 'npx');

        proc = spawn(execBin, execArgs, {
          cwd: backendDir,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: !wranglerEntry && isWin,
          windowsHide: true
        });

        timer = setTimeout(() => {
          if (proc && !proc.killed) {
            try { proc.kill('SIGKILL'); } catch {}
            if (onLog) onLog(`[Wrangler] Timeout after ${timeoutMs / 1000}s, proceeding...`);
            resolve({ code: 1, output: fullOutput + '\nTimeout exceeded.' });
          }
        }, timeoutMs);

        proc.stdout.on('data', (d) => {
          const str = d.toString();
          fullOutput += str;
          if (onLog) {
            str.split(/\r?\n/).filter(l => l.trim()).forEach(l => onLog(l));
          }
        });

        proc.stderr.on('data', (d) => {
          const str = d.toString();
          fullOutput += str;
          if (onLog) {
            str.split(/\r?\n/).filter(l => l.trim()).forEach(l => onLog(`[Wrangler] ${l}`));
          }
        });

        proc.on('close', (code) => {
          if (timer) clearTimeout(timer);
          resolve({ code: code || 0, output: fullOutput });
        });

        proc.on('error', (err) => {
          if (timer) clearTimeout(timer);
          if (onLog) onLog(`[Wrangler Error] ${err.message}`);
          resolve({ code: 1, output: err.message });
        });
      } catch (err) {
        if (timer) clearTimeout(timer);
        resolve({ code: 1, output: err.message });
      }
    });

    try {
      if (onLog) onLog(`Ensuring Cloudflare Pages project "${cleanName}" exists...`);
      // 1. Ensure project exists: wrangler pages project create <name> --production-branch=main
      await runWrangler(['pages', 'project', 'create', cleanName, '--production-branch=main'], 30000);

      // 2. Deploy directory: wrangler pages deploy <siteDir> --project-name=<name> --branch=<branch>
      if (siteDir && fs.existsSync(siteDir)) {
        if (onLog) onLog(`Deploying files to Cloudflare Pages project "${cleanName}"...`);
        const deployRes = await runWrangler([
          'pages',
          'deploy',
          siteDir,
          `--project-name=${cleanName}`,
          `--branch=${branch || 'main'}`,
          '--commit-dirty=true'
        ], 60000);

        const urlMatch = deployRes.output.match(/https:\/\/[a-zA-Z0-9.-]+\.pages\.dev/i);
        const previewUrl = urlMatch ? urlMatch[0] : defaultPagesUrl;
        // Always use defaultPagesUrl (https://<name>.pages.dev) as primary URL because Cloudflare's SSL wildcard
        // certificate (*.pages.dev) covers single subdomain level; nested subdomains like <hash>.<name>.pages.dev
        // cause ERR_SSL_VERSION_OR_CIPHER_MISMATCH in browsers.
        const finalUrl = defaultPagesUrl;

        return {
          success: deployRes.code === 0 || !!urlMatch,
          configured: true,
          method: 'wrangler',
          url: finalUrl,
          previewUrl,
          canonicalUrl: defaultPagesUrl,
          projectName: cleanName,
          message: `Deployed live to Cloudflare Pages edge network at ${finalUrl}`
        };
      }

      return {
        success: true,
        configured: true,
        method: 'api',
        url: defaultPagesUrl,
        canonicalUrl: defaultPagesUrl,
        projectName: cleanName,
        message: `Cloudflare Pages project "${cleanName}" ready at ${defaultPagesUrl}.`
      };
    } catch (err) {
      console.error('[Cloudflare Pages Deploy Error]:', err.message);
      return {
        success: false,
        configured: true,
        url: defaultPagesUrl,
        projectName: cleanName,
        error: err.message
      };
    }
  },

  // Add custom domain to Cloudflare Pages project
  async addPagesProjectDomain(projectName, domainName) {
    const cfg = this.getConfig();
    const cleanProject = (projectName || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const cleanDomain = domainName.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

    let accountId = cfg.accountId;
    if (!accountId) {
      const accounts = await this.listAccounts();
      if (accounts.length > 0) {
        accountId = accounts[0].id;
        this.saveConfig({ accountId });
      }
    }
    if (!accountId) throw new Error('Cloudflare Account ID is required for custom domains.');

    const headers = this.getHeaders();

    // 1. Ensure Pages project exists in Cloudflare
    await this.getOrCreatePagesProject(cleanProject, accountId).catch(() => {});

    // 2. Call Cloudflare Pages custom domain API
    let domainRecord = null;
    try {
      const res = await fetch(`${CF_API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(cleanProject)}/domains`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: cleanDomain })
      });
      const data = await res.json();
      if (data.success && data.result) {
        domainRecord = data.result;
      } else if (data.errors?.[0]?.message?.includes('already exists') || data.errors?.[0]?.code === 8000009) {
        // Fetch existing domain
        const getRes = await fetch(`${CF_API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(cleanProject)}/domains/${encodeURIComponent(cleanDomain)}`, {
          method: 'GET',
          headers
        });
        const getData = await getRes.json();
        if (getData.success && getData.result) {
          domainRecord = getData.result;
        }
      } else {
        throw new Error(data.errors?.[0]?.message || 'Failed to bind custom domain to Cloudflare Pages.');
      }
    } catch (apiErr) {
      console.warn('[Cloudflare Pages Domain API]:', apiErr.message);
      domainRecord = {
        name: cleanDomain,
        status: 'pending',
        verification_data: { status: 'pending', error_message: apiErr.message }
      };
    }

    // 3. Check DNS resolution for domain
    const dnsStatus = await this.checkDomainDns(cleanDomain, `${cleanProject}.pages.dev`);

    return {
      success: true,
      domain: cleanDomain,
      projectName: cleanProject,
      cnameTarget: `${cleanProject}.pages.dev`,
      status: domainRecord?.status || (dnsStatus.isCnameMatched ? 'active' : 'pending'),
      dnsStatus,
      raw: domainRecord
    };
  },

  // Get Cloudflare Pages project domain status
  async getPagesProjectDomainStatus(projectName, domainName) {
    const cfg = this.getConfig();
    const cleanProject = (projectName || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const cleanDomain = domainName.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

    let accountId = cfg.accountId;
    if (!accountId) {
      const accounts = await this.listAccounts();
      if (accounts.length > 0) accountId = accounts[0].id;
    }

    let cfStatus = null;
    if (accountId && cfg.apiToken) {
      try {
        const res = await fetch(`${CF_API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(cleanProject)}/domains/${encodeURIComponent(cleanDomain)}`, {
          method: 'GET',
          headers: this.getHeaders()
        });
        const data = await res.json();
        if (data.success && data.result) {
          cfStatus = data.result;
        }
      } catch (e) {}
    }

    const dnsStatus = await this.checkDomainDns(cleanDomain, `${cleanProject}.pages.dev`);
    const isLive = cfStatus?.status === 'active' || dnsStatus.isCnameMatched;

    return {
      domain: cleanDomain,
      projectName: cleanProject,
      cnameTarget: `${cleanProject}.pages.dev`,
      status: isLive ? 'active' : (cfStatus?.status || 'pending'),
      dnsStatus,
      cfStatus
    };
  },

  // Delete domain from Cloudflare Pages project
  async deletePagesProjectDomain(projectName, domainName) {
    const cfg = this.getConfig();
    const cleanProject = (projectName || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const cleanDomain = domainName.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

    let accountId = cfg.accountId;
    if (!accountId) {
      const accounts = await this.listAccounts();
      if (accounts.length > 0) accountId = accounts[0].id;
    }

    if (accountId && cfg.apiToken) {
      try {
        await fetch(`${CF_API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(cleanProject)}/domains/${encodeURIComponent(cleanDomain)}`, {
          method: 'DELETE',
          headers: this.getHeaders()
        });
      } catch (e) {
        console.warn('Error deleting domain from Cloudflare Pages:', e.message);
      }
    }
    return { success: true };
  },

  // Real DNS resolver check
  async checkDomainDns(domainName, expectedCname) {
    const clean = domainName.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    let cnameRecords = [];
    let aRecords = [];
    let error = null;

    try {
      cnameRecords = await dns.promises.resolveCname(clean);
    } catch (e) {
      // Apex domains often don't have CNAME, or ENODATA
    }

    try {
      const lookup = await dns.promises.lookup(clean);
      if (lookup && lookup.address) {
        aRecords.push(lookup.address);
      }
    } catch (e) {
      error = e.message;
    }

    const isCnameMatched = cnameRecords.some(r => r.toLowerCase().includes(expectedCname.toLowerCase()));
    
    return {
      domain: clean,
      expectedCname,
      cnameRecords,
      aRecords,
      isCnameMatched,
      resolves: aRecords.length > 0,
      error
    };
  }
};
