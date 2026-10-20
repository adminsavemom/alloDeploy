import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = path.resolve(__dirname, '..', 'storage');
const SERVICES_FILE = path.join(STORAGE_DIR, 'services.json');
const SITES_DIR = path.join(STORAGE_DIR, 'sites');

const USERS_FILE = path.join(STORAGE_DIR, 'users.json');

// Ensure directories exist
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(SITES_DIR)) fs.mkdirSync(SITES_DIR, { recursive: true });

// In-memory cache synced with DB and local file
let memoryCache = null;

function loadLocalFileServices() {
  try {
    if (fs.existsSync(SERVICES_FILE)) {
      const raw = fs.readFileSync(SERVICES_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading services.json:', err.message);
  }
  return [];
}

function saveLocalFileServices(services) {
  try {
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(services, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving services.json:', err.message);
  }
}

function loadLocalUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading users.json:', err.message);
  }
  return [];
}

function saveLocalUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving users.json:', err.message);
  }
}

export const storageService = {
  // Initialize Database connection and sync local seeds
  async initDb() {
    const local = loadLocalFileServices();
    memoryCache = local;
    const ok = await db.init(local);
    if (ok) {
      const dbServices = await db.getServices();
      if (dbServices && dbServices.length > 0) {
        memoryCache = dbServices;
        saveLocalFileServices(dbServices);
      }
    }
    return ok;
  },

  // Synchronous read (uses latest local file or memory cache)
  getServicesSync() {
    const local = loadLocalFileServices();
    if (local && Array.isArray(local) && local.length > 0) {
      local.forEach(s => {
        const cfPagesUrl = `https://${s.name}.pages.dev`;
        s.cloudflarePagesUrl = s.cloudflarePagesUrl || cfPagesUrl;
        s.cloudflareConnected = true;
        if (s.customDomain) {
          const proto = s.protocol || 'https';
          const cleanDom = s.customDomain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
          const customUrl = s.customDomain.startsWith('http') ? s.customDomain : `${proto}://${cleanDom}${s.pathSuffix || ''}`;
          s.url = customUrl;
          s.liveDomain = customUrl;
        } else if (!s.url || s.url.includes('localhost') || s.url.includes('allodeploy.app')) {
          s.url = cfPagesUrl;
          s.liveDomain = cfPagesUrl;
        }
      });
      memoryCache = local;
      return memoryCache;
    }
    if (memoryCache !== null) return memoryCache;
    return [];
  },

  // Asynchronous read (fetches from Supabase if connected, falls back to local)
  async getServices() {
    let list = [];
    if (db.isDbConnected()) {
      try {
        const fromDb = await db.getServices();
        if (fromDb !== null && fromDb.length > 0) {
          list = fromDb;
        }
      } catch (err) {
        console.warn('⚠️ Supabase read failed, reading from local fallback:', err.message);
      }
    }
    if (!list || list.length === 0) {
      list = this.getServicesSync();
    }

    // Canonical transform: ensure cloudflarePagesUrl exists and preserve customDomain URLs
    let hasUpdates = false;
    list.forEach(s => {
      const cfPagesUrl = `https://${s.name}.pages.dev`;
      if (!s.cloudflarePagesUrl) {
        s.cloudflarePagesUrl = cfPagesUrl;
        s.cloudflareConnected = true;
        hasUpdates = true;
      }
      if (s.customDomain) {
        const proto = s.protocol || 'https';
        const cleanDom = s.customDomain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        const customUrl = s.customDomain.startsWith('http') ? s.customDomain : `${proto}://${cleanDom}${s.pathSuffix || ''}`;
        if (s.url !== customUrl || s.liveDomain !== customUrl) {
          s.url = customUrl;
          s.liveDomain = customUrl;
          hasUpdates = true;
        }
      } else if (!s.url || s.url.includes('localhost') || s.url.includes('allodeploy.app')) {
        s.url = cfPagesUrl;
        s.liveDomain = cfPagesUrl;
        s.cloudflareConnected = true;
        hasUpdates = true;
      }
    });

    if (hasUpdates) {
      this.saveServices(list).catch(() => {});
    }

    memoryCache = list;
    return list;
  },

  // Save full array to both local storage and database
  async saveServices(services) {
    memoryCache = services;
    saveLocalFileServices(services);
    if (db.isDbConnected()) {
      try {
        for (const s of services) {
          await db.upsertService(s);
        }
      } catch (err) {
        console.warn('⚠️ Failed to sync services array to Supabase:', err.message);
      }
    }
  },

  // Add or update a service
  async addOrUpdateService(newService) {
    const current = this.getServicesSync();
    const existingIndex = current.findIndex(s => s.id === newService.id || s.name === newService.name);
    if (existingIndex >= 0) {
      newService.id = current[existingIndex].id;
      current[existingIndex] = { ...current[existingIndex], ...newService };
    } else {
      current.unshift(newService);
    }
    memoryCache = current;
    saveLocalFileServices(current);

    if (db.isDbConnected()) {
      try {
        const saved = await db.upsertService(newService);
        if (saved) return saved;
      } catch (err) {
        console.warn('⚠️ Supabase upsert error, saved locally:', err.message);
      }
    }
    return newService;
  },

  // Delete a service permanently
  async deleteService(serviceId, serviceName = null) {
    const current = this.getServicesSync();
    const target = current.find(s => s.id === serviceId || s.name === serviceId || (serviceName && s.name === serviceName));
    const effectiveName = serviceName || (target && target.name);
    const effectiveId = (target && target.id) || serviceId;

    const updated = current.filter(s => 
      s.id !== effectiveId && 
      s.id !== serviceId && 
      (!effectiveName || s.name !== effectiveName) && 
      (!serviceName || s.name !== serviceName)
    );
    memoryCache = updated;
    saveLocalFileServices(updated);

    if (effectiveName) {
      const sitePath = path.join(SITES_DIR, effectiveName);
      if (fs.existsSync(sitePath)) {
        try {
          fs.rmSync(sitePath, { recursive: true, force: true });
        } catch (e) {
          console.error(`Failed to delete site directory for ${effectiveName}:`, e.message);
        }
      }
    }

    if (db.isDbConnected()) {
      try {
        await db.deleteService(effectiveId, effectiveName);
      } catch (err) {
        console.warn('⚠️ Supabase delete error:', err.message);
      }
    }
    return target;
  },

  async unpackZipToSite(siteName, zipBuffer) {
    const siteDir = path.join(SITES_DIR, siteName);
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
    fs.mkdirSync(siteDir, { recursive: true });

    const zip = await JSZip.loadAsync(zipBuffer);
    const extractedFiles = [];

    for (const [relativePath, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        const destPath = path.join(siteDir, relativePath);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const content = await entry.async('nodebuffer');
        fs.writeFileSync(destPath, content);
        extractedFiles.push({
          path: relativePath,
          size: entry._data ? (entry._data.uncompressedSize || content.length) : content.length
        });
      }
    }

    return { siteDir, files: extractedFiles };
  },

  getSiteDir(siteName) {
    const siteDir = path.join(SITES_DIR, siteName);
    if (!fs.existsSync(siteDir)) fs.mkdirSync(siteDir, { recursive: true });
    return siteDir;
  },

  writeFilesToSite(siteName, files, relativePaths = []) {
    const siteDir = path.join(SITES_DIR, siteName);
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
    fs.mkdirSync(siteDir, { recursive: true });

    const savedFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let rel = (relativePaths[i] || file.originalname || `file_${i}`).replace(/\\/g, '/').replace(/^\/+/, '');
      const normalized = path.posix.normalize(rel);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        continue;
      }
      const destPath = path.join(siteDir, normalized);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destPath, file.buffer);
      savedFiles.push({ path: normalized, size: file.size });
    }
    return { siteDir, files: savedFiles };
  },

  saveCustomHtmlSite(siteName, htmlContent) {
    const siteDir = path.join(SITES_DIR, siteName);
    if (!fs.existsSync(siteDir)) fs.mkdirSync(siteDir, { recursive: true });
    fs.writeFileSync(path.join(siteDir, 'index.html'), htmlContent, 'utf8');
    return siteDir;
  },

  getSiteFilePath(siteName, relativePath = 'index.html') {
    const cleanPath = relativePath.replace(/^(\.\.[\/\\])+/, ''); // avoid traversal
    const candidate = path.join(SITES_DIR, siteName, cleanPath || 'index.html');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    // Only fallback to index.html for extensionless paths or index.html requests (SPA routing)
    // Do NOT fallback for missing images, CSS, JS, fonts, etc.
    const ext = path.extname(cleanPath);
    if (!ext || ext === '.html') {
      const fallback = path.join(SITES_DIR, siteName, 'index.html');
      if (fs.existsSync(fallback)) {
        return fallback;
      }
    }
    return null;
  },

  getLocalUserByEmail(email) {
    if (!email) return null;
    const users = loadLocalUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  createLocalUser(userData) {
    const users = loadLocalUsers();
    const newUser = {
      id: userData.id,
      email: userData.email,
      passwordHash: userData.passwordHash,
      name: userData.name,
      handle: userData.handle,
      role: userData.role || 'Admin / Owner',
      team: userData.team || 'Engineering Team',
      avatar: userData.avatar,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveLocalUsers(users);
    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      handle: newUser.handle,
      role: newUser.role,
      team: newUser.team,
      avatar: newUser.avatar,
      createdAt: newUser.createdAt
    };
  },

  updateLocalUser(id, updates) {
    const users = loadLocalUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    if (updates.name !== undefined) users[idx].name = updates.name.trim();
    if (updates.handle !== undefined) users[idx].handle = updates.handle.trim();
    if (updates.avatar !== undefined) users[idx].avatar = updates.avatar.trim();
    saveLocalUsers(users);
    return users[idx];
  }
};
