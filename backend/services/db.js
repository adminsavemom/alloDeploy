import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

const { Pool } = pg;

// Helper to format/fix postgres connection string
function getConnectionString() {
  let conn = process.env.DATABASE_URL || '';
  if (!conn && process.env.SUPABASE_URL && process.env.SUPABASE_URL.startsWith('postgres')) {
    conn = process.env.SUPABASE_URL;
  }
  return conn.trim();
}

let pool = null;
let isConnected = false;

export function getPool() {
  if (pool) return pool;

  const connectionString = getConnectionString();
  if (!connectionString) {
    console.log('ℹ️  No DATABASE_URL found. Running with local JSON storage.');
    return null;
  }

  try {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      keepAlive: true
    });

    pool.on('error', (err) => {
      console.error('⚠️ Unexpected error on idle Supabase client:', err.message);
    });

    return pool;
  } catch (err) {
    console.error('⚠️ Failed to initialize Supabase PostgreSQL pool:', err.message);
    return null;
  }
}

// Convert DB snake_case row to JS camelCase object
export function rowToService(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'Static Site',
    status: row.status || 'live',
    url: row.url || '',
    liveDomain: row.live_domain || '',
    customDomain: row.custom_domain || '',
    domains: Array.isArray(row.domains) ? row.domains : [],
    sslEnabled: !!row.ssl_enabled,
    forceHttps: row.force_https !== undefined ? !!row.force_https : true,
    port: row.port || 3000,
    region: row.region || '',
    source: row.source || '',
    gitRepo: row.git_repo || '',
    gitUrl: row.git_url || '',
    gitBranch: row.git_branch || 'main',
    gitCommit: row.git_commit || '',
    gitCommitMsg: row.git_commit_msg || '',
    gitAuthor: row.git_author || '',
    buildCommand: row.build_command || '',
    publishDir: row.publish_dir || '',
    autoDeploy: !!row.auto_deploy,
    filesCount: row.files_count || 1,
    size: row.size || '',
    framework: row.framework || '',
    updatedAt: row.updated_at || '',
    createdAt: row.created_at || '',
    deployCount: row.deploy_count || 1,
    metrics: typeof row.metrics === 'object' && row.metrics !== null ? row.metrics : {},
    envVars: Array.isArray(row.env_vars) ? row.env_vars : [],
    sampleFiles: Array.isArray(row.sample_files) ? row.sample_files : [],
    deploys: Array.isArray(row.deploys) ? row.deploys : [],
    healthcheck: row.healthcheck || { path: '/', expectedStatus: 200, intervalSeconds: 30 },
    backups: Array.isArray(row.backups) ? row.backups : [],
    templateType: row.template_type || '',
    userId: row.user_id || '',
    userEmail: row.user_email || ''
  };
}

// Convert JS camelCase object to query parameters
export function serviceToRowParams(s) {
  return [
    s.id,
    s.name,
    s.type || 'Static Site',
    s.status || 'live',
    s.url || '',
    s.liveDomain || '',
    s.customDomain || '',
    JSON.stringify(s.domains || []),
    !!s.sslEnabled,
    s.forceHttps !== undefined ? !!s.forceHttps : true,
    s.port || 3000,
    s.region || '',
    s.source || '',
    s.gitRepo || '',
    s.gitUrl || '',
    s.gitBranch || 'main',
    s.gitCommit || '',
    s.gitCommitMsg || '',
    s.gitAuthor || '',
    s.buildCommand || '',
    s.publishDir || '',
    !!s.autoDeploy,
    s.filesCount || 1,
    s.size || '',
    s.framework || '',
    s.updatedAt || '',
    s.createdAt || '',
    s.deployCount || 1,
    JSON.stringify(s.metrics || {}),
    JSON.stringify(s.envVars || []),
    JSON.stringify(s.sampleFiles || []),
    JSON.stringify(s.deploys || []),
    JSON.stringify(s.healthcheck || { path: '/', expectedStatus: 200, intervalSeconds: 30 }),
    JSON.stringify(s.backups || []),
    s.templateType || '',
    s.userId || '',
    s.userEmail || ''
  ];
}

export const db = {
  isDbConnected() {
    return isConnected;
  },

  async init(localFallbackServices = []) {
    const p = getPool();
    if (!p) return false;

    try {
      const client = await p.connect();
      try {
        const testRes = await client.query('SELECT NOW()');
        isConnected = true;
        console.log('✅ Supabase PostgreSQL connected successfully at:', testRes.rows[0].now);

        // Ensure table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS services (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            type TEXT DEFAULT 'Static Site',
            status TEXT DEFAULT 'live',
            url TEXT,
            live_domain TEXT,
            custom_domain TEXT DEFAULT '',
            domains JSONB DEFAULT '[]'::jsonb,
            ssl_enabled BOOLEAN DEFAULT false,
            force_https BOOLEAN DEFAULT true,
            port INT DEFAULT 3000,
            region TEXT,
            source TEXT,
            git_repo TEXT,
            git_url TEXT,
            git_branch TEXT,
            git_commit TEXT,
            git_commit_msg TEXT,
            git_author TEXT,
            build_command TEXT,
            publish_dir TEXT,
            auto_deploy BOOLEAN DEFAULT false,
            files_count INT DEFAULT 1,
            size TEXT,
            framework TEXT,
            updated_at TEXT,
            created_at TEXT,
            deploy_count INT DEFAULT 1,
            metrics JSONB DEFAULT '{}'::jsonb,
            env_vars JSONB DEFAULT '[]'::jsonb,
            sample_files JSONB DEFAULT '[]'::jsonb,
            deploys JSONB DEFAULT '[]'::jsonb,
            healthcheck JSONB DEFAULT '{"path": "/", "expectedStatus": 200, "intervalSeconds": 30}'::jsonb,
            backups JSONB DEFAULT '[]'::jsonb,
            template_type TEXT
          );

          ALTER TABLE services ADD COLUMN IF NOT EXISTS custom_domain TEXT DEFAULT '';
          ALTER TABLE services ADD COLUMN IF NOT EXISTS domains JSONB DEFAULT '[]'::jsonb;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS ssl_enabled BOOLEAN DEFAULT false;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS force_https BOOLEAN DEFAULT true;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS port INT DEFAULT 3000;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS healthcheck JSONB DEFAULT '{"path": "/", "expectedStatus": 200, "intervalSeconds": 30}'::jsonb;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS backups JSONB DEFAULT '[]'::jsonb;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT '';
          ALTER TABLE services ADD COLUMN IF NOT EXISTS user_email TEXT DEFAULT '';

          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            handle TEXT,
            role TEXT DEFAULT 'Admin / Owner',
            team TEXT DEFAULT 'Engineering Team',
            avatar TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);

        return true;
      } finally {
        client.release();
      }
    } catch (err) {
      isConnected = false;
      console.warn('⚠️ Supabase connection failed, falling back to local JSON storage:', err.message);
      return false;
    }
  },

  async getServices() {
    const p = getPool();
    if (!p || !isConnected) return null;

    try {
      const res = await p.query('SELECT * FROM services ORDER BY created_at DESC');
      return res.rows.map(rowToService);
    } catch (err) {
      console.error('Error fetching services from Supabase:', err.message);
      return null;
    }
  },

  async getServiceById(id) {
    const p = getPool();
    if (!p || !isConnected) return null;

    try {
      const res = await p.query('SELECT * FROM services WHERE id = $1 LIMIT 1', [id]);
      if (res.rows.length === 0) return null;
      return rowToService(res.rows[0]);
    } catch (err) {
      console.error('Error fetching service by id from Supabase:', err.message);
      return null;
    }
  },

  async upsertService(s) {
    const p = getPool();
    if (!p || !isConnected) return null;

    const query = `
      INSERT INTO services (
        id, name, type, status, url, live_domain, custom_domain, domains,
        ssl_enabled, force_https, port, region, source,
        git_repo, git_url, git_branch, git_commit, git_commit_msg, git_author,
        build_command, publish_dir, auto_deploy, files_count, size, framework,
        updated_at, created_at, deploy_count, metrics, env_vars, sample_files,
        deploys, healthcheck, backups, template_type, user_id, user_email
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)
      ON CONFLICT (name) DO UPDATE SET
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        url = EXCLUDED.url,
        live_domain = EXCLUDED.live_domain,
        custom_domain = EXCLUDED.custom_domain,
        domains = EXCLUDED.domains,
        ssl_enabled = EXCLUDED.ssl_enabled,
        force_https = EXCLUDED.force_https,
        port = EXCLUDED.port,
        region = EXCLUDED.region,
        source = EXCLUDED.source,
        git_repo = EXCLUDED.git_repo,
        git_url = EXCLUDED.git_url,
        git_branch = EXCLUDED.git_branch,
        git_commit = EXCLUDED.git_commit,
        git_commit_msg = EXCLUDED.git_commit_msg,
        git_author = EXCLUDED.git_author,
        build_command = EXCLUDED.build_command,
        publish_dir = EXCLUDED.publish_dir,
        auto_deploy = EXCLUDED.auto_deploy,
        files_count = EXCLUDED.files_count,
        size = EXCLUDED.size,
        framework = EXCLUDED.framework,
        updated_at = EXCLUDED.updated_at,
        created_at = EXCLUDED.created_at,
        deploy_count = EXCLUDED.deploy_count,
        metrics = EXCLUDED.metrics,
        env_vars = EXCLUDED.env_vars,
        sample_files = EXCLUDED.sample_files,
        deploys = EXCLUDED.deploys,
        healthcheck = EXCLUDED.healthcheck,
        backups = EXCLUDED.backups,
        template_type = EXCLUDED.template_type,
        user_id = COALESCE(NULLIF(EXCLUDED.user_id, ''), services.user_id),
        user_email = COALESCE(NULLIF(EXCLUDED.user_email, ''), services.user_email)
      RETURNING *;
    `;

    try {
      const res = await p.query(query, serviceToRowParams(s));
      return rowToService(res.rows[0]);
    } catch (err) {
      console.error('Error upserting service in Supabase:', err.message);
      return null;
    }
  },

  async deleteService(id, name = null) {
    const p = getPool();
    if (!p || !isConnected) return null;

    try {
      const res = await p.query(
        'DELETE FROM services WHERE id = $1 OR name = $1 OR (name = $2 AND $2 IS NOT NULL AND $2 != \'\') RETURNING *',
        [id, name || null]
      );
      if (res.rows.length === 0) return null;
      return rowToService(res.rows[0]);
    } catch (err) {
      console.error('Error deleting service from Supabase:', err.message);
      return null;
    }
  },

  async getUserByEmail(email) {
    const p = getPool();
    if (!p || !isConnected || !email) return null;

    try {
      const res = await p.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        email: r.email,
        passwordHash: r.password_hash,
        name: r.name,
        handle: r.handle,
        role: r.role,
        team: r.team,
        avatar: r.avatar,
        createdAt: r.created_at
      };
    } catch (err) {
      console.error('Error fetching user from Supabase:', err.message);
      return null;
    }
  },

  async createUser(userData) {
    const p = getPool();
    if (!p || !isConnected) return null;

    try {
      const res = await p.query(
        `INSERT INTO users (id, email, password_hash, name, handle, role, team, avatar)
         VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          userData.id,
          userData.email.trim(),
          userData.passwordHash,
          userData.name,
          userData.handle,
          userData.role || 'Admin / Owner',
          userData.team || 'Engineering Team',
          userData.avatar
        ]
      );
      const r = res.rows[0];
      return {
        id: r.id,
        email: r.email,
        name: r.name,
        handle: r.handle,
        role: r.role,
        team: r.team,
        avatar: r.avatar,
        createdAt: r.created_at
      };
    } catch (err) {
      console.error('Error creating user in Supabase:', err.message);
      throw err;
    }
  },

  async updateUser(id, updates) {
    const p = getPool();
    if (!p || !isConnected || !id) return null;

    try {
      const fields = [];
      const values = [];
      let idx = 1;

      if (updates.name !== undefined) {
        fields.push(`name = $${idx++}`);
        values.push(updates.name.trim());
      }
      if (updates.handle !== undefined) {
        fields.push(`handle = $${idx++}`);
        values.push(updates.handle.trim());
      }
      if (updates.avatar !== undefined) {
        fields.push(`avatar = $${idx++}`);
        values.push(updates.avatar.trim());
      }

      if (fields.length === 0) return null;

      values.push(id);
      const res = await p.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        email: r.email,
        name: r.name,
        handle: r.handle,
        role: r.role,
        team: r.team,
        avatar: r.avatar,
        createdAt: r.created_at
      };
    } catch (err) {
      console.error('Error updating user in Supabase:', err.message);
      return null;
    }
  }
};
