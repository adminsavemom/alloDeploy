# AlloDeploy · Complete System Architecture & Technical Documentation

---

## 1. Executive Summary & Project Vision

**AlloDeploy** (Website Hosting Manager) is a modern, self-hosted Platform-as-a-Service (PaaS) and deployment platform. Inspired by systems like **Coolify**, **Vercel**, **Netlify**, and **Heroku**, AlloDeploy gives developers and teams complete control over their hosting infrastructure without relying on costly closed-source vendor platforms.

### Core Capabilities
- **Direct Folder & ZIP Uploads**: Instant drag-and-drop deployment of frontend sites, single-page applications (SPAs), and static assets.
- **Global Network Distribution**: Integrated with **Cloudflare Pages** and routing for instant global CDN caching, automatic SSL/TLS termination, and DDoS protection.
- **Strict Account-Based Isolation**: Multi-tenant architecture where each registered user can only access, deploy, configure, and delete projects that belong directly to their account.
- **Custom Domains & DNS Engine**: 1-click domain binding with automatic CNAME generation (`<project>.pages.dev`), DNS propagation checking, and cache purging.
- **Dual-Layer Persistence**: Enterprise-grade **Supabase PostgreSQL** database storage with an automated zero-downtime local JSON storage fallback.
- **Live Build & Telemetry Streaming**: Real-time log streaming using **Server-Sent Events (SSE)**, simulated container metrics (CPU, RAM, Uptime), and deployment history tracking.
- **Lightweight & High-Performance**: Built with high-efficiency Vanilla JavaScript (ES Modules) and Vanilla CSS on the client side—eliminating bloated framework runtimes while achieving sub-millisecond interaction speeds.

---

## 2. High-Level System Architecture

AlloDeploy is built as a modular client-server system with cloud acceleration:

```mermaid
graph TD
    Client["Client Browser\n(SPA Dashboard / Vanilla JS + Vite)"]
    
    subgraph HostServer ["Host Server (Node.js & Express :5000)"]
        API["Express API Gateway\n(Routes: /api/auth, /api/deploy, /api/services)"]
        SSE["SSE Log Streamer\n(/api/deploy/stream/:id)"]
        VHost["Host-Based Virtual Proxy\n(Serves *.pages.dev & Custom Domains)"]
        BuildEngine["Build & Extraction Engine\n(JSZip / Multer)"]
        LocalSites["Local Site Storage\n(backend/storage/sites/<project>)"]
    end

    subgraph DatabaseLayer ["Persistence Layer"]
        Supabase["Supabase PostgreSQL\n(Tables: services, users)"]
        LocalJSON["Local JSON Cache\n(backend/storage/services.json)"]
    end

    subgraph NetworkLayer ["Global Network"]
        CloudflarePages["Cloudflare Pages API\n(<project>.pages.dev)"]
        CustomDNS["Custom Domain CNAME\n(Proxy / SSL)"]
    end

    Client -->|REST & SSE API| API
    API --> SSE
    API --> BuildEngine
    BuildEngine --> LocalSites
    BuildEngine -.->|Deploy Trigger| CloudflarePages
    API --> Supabase
    Supabase -.->|Fallback Sync| LocalJSON
    Client -->|Public Web Requests| CustomDNS
    CustomDNS --> CloudflarePages
    Client -->|Local VHost Requests| VHost
    VHost --> LocalSites
```

---

## 3. Technology Stack Breakdown

| Layer | Technologies | Responsibilities |
| :--- | :--- | :--- |
| **Frontend Framework** | Vanilla JavaScript (ES Modules), HTML5 | Component lifecycle, reactivity, modal management, DOM rendering without heavy virtual DOM overhead. |
| **Frontend Styling** | Vanilla CSS3 | Custom design system, dark-mode glassmorphism, Aurora glow animations, responsive flex/grid layouts. |
| **Frontend Bundler** | Vite 8.3 | Hot Module Replacement (HMR) for local development; minified rollups for production builds. |
| **Backend Server** | Node.js (v24+), Express 4.x | REST API routing, request validation, authentication, multi-part file streaming, SSE event broadcasting. |
| **File Handling** | Multer, JSZip | Streaming multipart uploads (up to 100MB), zip extraction, directory tree generation. |
| **Primary Database** | Supabase (PostgreSQL 15+) | Relational persistence for projects (`services` table) and accounts (`users` table). |
| **Fallback Storage** | Local JSON (`fs` / `path`) | Standalone file persistence when Supabase credentials or network connection are unavailable. |
| **CDN & DNS** | Cloudflare Pages & DNS API | Hosting, custom hostname SSL certificates, global CDN caching, instant cache purging. |
| **Local Proxy** | Custom Express Middleware | Host-header inspection serving local static bundles directly to visitors. |

---

## 4. Detailed Feature & Workflow Deep Dive

### 4.1 Authentication & User Management
- **Registration**: Passwords are encrypted using **Node.js Scrypt** with a cryptographically secure 16-byte random salt (`salt:hash`).
- **Sessions**: Returns an authentication token (`allo_<hex32>`) and user payload (`id`, `name`, `email`, `role`, `avatar`).
- **Profile Customization**: Users can update their display name and handle from the top navigation dropdown.
- **Account State Isolation**: When a user logs in, the client clears any previous session data and loads only the projects and deployments tagged with that user's unique ID.

### 4.2 Strict Account-Based Project Isolation
Every resource in AlloDeploy belongs strictly to the user account that created it:
1. **Database Stamping**: Every row in the `services` table has `user_id` and `user_email`.
2. **Backend Guard (`checkServiceOwnership`)**:
   - `GET /api/services` extracts `x-user-id` and `x-user-email` from headers.
   - Any query or modification (`GET /:id`, `POST /:id/redeploy`, `PUT /:id/domain-settings`, `DELETE /:id`) enforces ownership. If another user attempts access, the API responds with `403 Access Denied`.
3. **Collision Protection**: If User A has already claimed the project name `portfolio`, User B cannot overwrite it. The system rejects the request with `409 Conflict`.
4. **Client-Side Scoping**: `localStorage` uses isolated keys (`allodeploy_resources_list_${userId}`). Switching accounts never exposes one user's projects to another user.

### 4.3 Deployment Engine Workflow
```mermaid
sequenceDiagram
    autonumber
    actor User as Developer
    participant UI as Deploy Modal (Client)
    participant API as /api/deploy/upload (Express)
    participant Disk as Local Storage (backend/storage)
    participant SSE as SSE Streamer
    participant CF as Cloudflare Pages API

    User->>UI: Drags & drops project folder or .zip
    UI->>UI: Validates root index.html & project name
    UI->>API: POST /api/deploy/upload (FormData + x-user-id)
    API->>SSE: Open /api/deploy/stream/:id
    UI->>SSE: Connect EventSource to receive live build logs
    API->>Disk: Extract files to backend/storage/sites/<project>/
    API->>Disk: Verify index.html exists at root
    API->>CF: (Optional) Register Cloudflare Pages deployment
    API->>API: Upsert project into Supabase PostgreSQL
    API-->>UI: 201 Created (service record + cloudflareUrl)
    SSE-->>UI: Live log stream finishes (Status: 100% Live)
    UI->>User: Displays success screen with live URLs
```

### 4.4 Custom Domain & DNS Management
- **CNAME Mapping**: Each deployed project is assigned a canonical target: `<project-name>.pages.dev`.
- **Domain Binding**: In the **Domain Settings** modal or Project Details, developers specify custom branded domains (e.g. `testuyir.allokonnect.com`).
- **1-Click Copy**: The CNAME target includes a cross-environment copy button with automatic fallback (`navigator.clipboard` -> temporary textarea -> prompt) and visual feedback (`✓ Copied!`).
- **Real-Time DNS Verification**: Clicking **Check DNS** queries live DNS over HTTPS (DoH) to check whether the domain resolves to the target.
- **Cache Invalidation**: Single-click **Purge Cache** transmits a purge command to Cloudflare to clear stale assets globally.

### 4.5 Environment Variables & Secret Vault
- **Build vs. Runtime Secrets**: Variables can be flagged as `isSecret` (hidden from normal view with toggleable reveal eye) or `isBuildSecret`.
- **Search & Filter**: Real-time search filters keys and values instantly.
- **Sorting**: Toggle between creation order, alphabetical (`A-Z`), and reverse alphabetical (`Z-A`).
- **Bulk Updates**: Variables can be edited, appended, or deleted individually or in batches.

### 4.6 Permanent Deletion Lifecycle
When a user deletes a project from their dashboard:
1. **Database Purge**: `DELETE FROM services WHERE id = $1 AND (user_id = $2 OR user_email = $3)`.
2. **File System Cleanup**: Removes directory `backend/storage/sites/<project>/` completely.
3. **Cloudflare Deletion**: Calls Cloudflare Pages API to detach custom hostnames and delete the Pages project.
4. **State Sync**: Removes the service from `store.services` and clears the user's `localStorage` scoped cache.

---

## 5. Repository Directory Structure

```
Website hosting manager/
├── package.json                    # Workspace scripts (dev, build, docker)
├── start-dev.js                    # Concurrent dev launcher for frontend + backend
├── Dockerfile                      # Production container image
├── docker-compose.yml              # Multi-container orchestration
│
├── backend/                        # Node.js & Express Backend Service
│   ├── package.json                # Backend dependencies (express, pg, multer, jszip, cors)
│   ├── server.js                   # Application entrypoint, CORS, vhost gateway & proxy
│   ├── .env                        # Environment configuration (Port, Supabase credentials)
│   │
│   ├── routes/                     # REST API Route Handlers
│   │   ├── authRoutes.js           # /api/auth (register, login, profile)
│   │   ├── deployRoutes.js         # /api/deploy (upload, github, stream/:id)
│   │   ├── servicesRoutes.js       # /api/services (CRUD, redeploy, domains, env vars)
│   │   ├── cloudflareRoutes.js     # /api/cloudflare & /api/edge (DNS, zones, cache)
│   │   ├── githubRoutes.js         # /api/github (repo connection, webhooks)
│   │   ├── metricsRoutes.js        # /api/system/metrics (CPU, RAM, system health)
│   │   ├── nginxRoutes.js          # /api/nginx (virtual host configs)
│   │   └── sslRoutes.js            # /api/ssl (Certbot SSL automation)
│   │
│   ├── services/                   # Business Logic & Infrastructure Connectors
│   │   ├── db.js                   # Supabase PostgreSQL client & query executor
│   │   ├── storageService.js       # Local disk cache & site directory manager
│   │   ├── buildEngineService.js   # Pipeline orchestrator & SSE event bus
│   │   ├── cloudflareService.js    # Cloudflare REST API v4 integration
│   │   ├── githubService.js        # GitHub API & repo zipball downloader
│   │   ├── nginxService.js         # Nginx configuration generator & reloader
│   │   ├── certbotService.js       # Let's Encrypt automated certificate management
│   │   └── automationService.js    # Periodic health checks & database backups
│   │
│   └── storage/                    # Persistent Disk Storage
│       ├── services.json           # Local JSON fallback copy of projects
│       └── sites/                  # Unpacked deployed web projects
│           └── <project-name>/     # Extracted files (index.html, assets, etc.)
│
└── frontend/                       # Vite + Vanilla JS Client Application
    ├── index.html                  # HTML5 application shell & font imports
    ├── package.json                # Frontend dependencies & Vite scripts
    ├── vite.config.js              # Vite bundler configuration (with polling for Windows)
    │
    └── src/                        # Source Code
        ├── main.js                 # App bootstrap, auth routing, layout composition
        ├── state.js                # Central StateStore (Observer pattern, user scoping)
        ├── style.css               # Complete design system & custom animations
        ├── icons.js                # Scalable inline SVG icon library
        │
        └── components/             # Modular UI Components
            ├── auth.js             # Sign in, Sign up, password meter, CLI animation
            ├── navbar.js           # Top navigation, environment switcher, user menu
            ├── dashboard.js        # Project cards, metrics bar, custom domain modal
            ├── serviceDetail.js    # Project view: Deployments, Domain, Env, Redeploy
            ├── deployModal.js      # Drag-and-drop deployment dialog
            ├── previewModal.js     # Responsive live preview dialog
            ├── backendModal.js     # Server telemetry & health status inspector
            └── toast.js            # Animated notification banners
```

---

## 6. Complete API Route Reference

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Headers / Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new account (hashes password with scrypt) | Body: `{ name, email, password }` |
| `POST` | `/api/auth/login` | Verify credentials & issue session token | Body: `{ email, password }` |
| `PUT` | `/api/auth/profile` | Update user display name and handle | Body: `{ id, email, name, handle }` |

### Deployments (`/api/deploy`)
| Method | Endpoint | Description | Headers / Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/deploy/upload` | Multipart file/folder/zip upload pipeline | `x-user-id`, `x-user-email`, FormData |
| `POST` | `/api/deploy/github` | Build & deploy directly from GitHub repo | `x-user-id`, `x-user-email`, JSON |
| `GET` | `/api/deploy/stream/:id` | Real-time SSE stream of deployment logs | EventSource streaming |

### Projects & Services (`/api/services`)
| Method | Endpoint | Description | Headers / Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/services` | Retrieve all projects owned by requesting user | `x-user-id`, `x-user-email` |
| `GET` | `/api/services/:id` | Get details for a single project (owned by user) | `x-user-id`, `x-user-email` |
| `POST` | `/api/services/create` | Create a new container/application resource | `x-user-id`, `x-user-email`, JSON |
| `POST` | `/api/services/:id/redeploy` | Trigger immediate rebuild and redeployment | `x-user-id`, `x-user-email` |
| `POST` | `/api/services/:id/restart` | Restart project and cycle container instance | `x-user-id`, `x-user-email` |
| `PUT` | `/api/services/:id/domain-settings` | Update domain, protocol, origin, and port | `x-user-id`, `x-user-email`, JSON |
| `PUT` | `/api/services/:id/env` | Bulk update environment variables | `x-user-id`, `x-user-email`, JSON |
| `DELETE` | `/api/services/:id/env/:key`| Delete a specific environment variable | `x-user-id`, `x-user-email` |
| `DELETE` | `/api/services/:id` | Permanently delete project, folder & records | `x-user-id`, `x-user-email` |

---

## 7. Data Models & Database Schema

AlloDeploy stores all relational records inside **Supabase PostgreSQL**:

### `users` Table
```sql
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
```

### `services` Table
```sql
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  user_id TEXT DEFAULT '',
  user_email TEXT DEFAULT '',
  type TEXT DEFAULT 'Application',
  status TEXT DEFAULT 'running',
  url TEXT DEFAULT '',
  live_domain TEXT DEFAULT '',
  custom_domain TEXT DEFAULT '',
  domains JSONB DEFAULT '[]'::jsonb,
  ssl_enabled BOOLEAN DEFAULT false,
  force_https BOOLEAN DEFAULT true,
  port INT DEFAULT 3000,
  region TEXT DEFAULT 'Global',
  source TEXT DEFAULT 'Manual Upload',
  git_repo TEXT DEFAULT '',
  git_branch TEXT DEFAULT 'main',
  git_commit TEXT DEFAULT '',
  build_command TEXT DEFAULT '',
  publish_dir TEXT DEFAULT '',
  auto_deploy BOOLEAN DEFAULT false,
  files_count INT DEFAULT 1,
  size TEXT DEFAULT '',
  framework TEXT DEFAULT 'Static Site',
  updated_at TEXT,
  created_at TEXT,
  deploy_count INT DEFAULT 1,
  metrics JSONB DEFAULT '{}'::jsonb,
  env_vars JSONB DEFAULT '[]'::jsonb,
  sample_files JSONB DEFAULT '[]'::jsonb,
  deploys JSONB DEFAULT '[]'::jsonb,
  healthcheck JSONB DEFAULT '{"path": "/", "expectedStatus": 200, "intervalSeconds": 30}'::jsonb,
  backups JSONB DEFAULT '[]'::jsonb,
  template_type TEXT DEFAULT ''
);
```

---

## 8. How to Run, Build & Operate Locally

### Prerequisites
- **Node.js**: v18.0.0 or later (v24 recommended)
- **npm**: v9.0.0 or later

### Step 1: Install Dependencies
```bash
# Root
npm install

# Backend
npm --prefix backend install

# Frontend
npm --prefix frontend install
```

### Step 2: Environment Configuration
Check `backend/.env` for your database connection and Cloudflare credentials:
```env
PORT=5000
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_DB_URL=postgresql://postgres:password@db.supabase.co:5432/postgres
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
```

### Step 3: Running Development Servers
You can launch both frontend and backend concurrently using the root runner:
```bash
npm run dev
```
Or start them independently in separate terminals:
```bash
# Terminal 1: Backend Server (Port 5000)
node backend/server.js

# Terminal 2: Frontend Vite Server (Port 5173)
npm --prefix frontend run dev
```

### Step 4: Building for Production
```bash
npm run build
```
This executes Vite's build pipeline, creating an optimized, minified bundle inside `frontend/dist/`.
