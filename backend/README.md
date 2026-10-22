# ⚡ AlloDeploy Backend Server

Standalone Deployment, GitHub CI/CD, and Hosting Backend Engine for **AlloDeploy**.

This backend is located in its own completely separate directory (`../backend`), distinct from the frontend application (`../day 3`).

---

## 🌟 Key Features

1. **📦 File & ZIP Drag & Drop Deployment Pipeline**
   - Ingests `.zip`, `.tar.gz`, project folders, and static bundles via `POST /api/deploy/upload`.
   - Automatically unzips archives in-memory using `jszip`.
   - Validates entrypoints (`index.html`, `package.json`, framework manifests).
   - Serves deployed sites directly from `storage/sites/<subdomain>/`.

2. **🐙 Full GitHub Project Integration**
   - Fetch repositories from GitHub REST API (`GET /api/github/repos`).
   - Query repository information, branches, and latest commits (`GET /api/github/repo-info`).
   - Continuous Deployment Webhook support (`POST /api/github/webhook`) to auto-deploy on `git push`.
   - Deploy directly from any public or private GitHub repository URL (`POST /api/deploy/github`).

3. **📡 Real-Time SSE Build & Distribution Logs**
   - Server-Sent Events endpoint (`GET /api/deploy/stream/:id`) for live terminal output during builds.

4. **🌐 Built-in Static Hosting**
   - Deployed sites are immediately browsable at `http://localhost:5000/sites/:subdomain/`.

5. **📊 Real-time Health & Telemetry**
   - `GET /api/health`: Platform status and uptime.
   - `GET /api/system/metrics`: Memory usage, active nodes, and simulated 24h request traffic.

---

## 🚀 Quickstart Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env`:
```bash
PORT=5000
GITHUB_TOKEN=your_github_personal_access_token_optional
```

### 3. Start the Server
```bash
# Production mode
npm start

# Or Development mode (with live watch reload)
npm run dev
```

The server will launch at: **`http://localhost:5000`**

---

## 📚 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server health & uptime check |
| `GET` | `/api/system/metrics` | Real-time RAM, CPU, latency, & network POPs |
| `GET` | `/api/services` | List all deployed services |
| `GET` | `/api/services/:id` | Get individual service metadata & deploys |
| `POST` | `/api/services/:id/redeploy` | Trigger immediate redeployment |
| `DELETE` | `/api/services/:id` | Delete service and clean site storage |
| `POST` | `/api/deploy/upload` | Upload `.zip` or files for instant deployment |
| `POST` | `/api/deploy/github` | Deploy project from GitHub repository URL |
| `GET` | `/api/deploy/stream/:id` | SSE stream for live build & deployment logs |
| `GET` | `/api/github/repos` | List developer GitHub repositories |
| `GET` | `/api/github/repo-info?url=...` | Parse and inspect any GitHub repository |
| `POST` | `/api/github/webhook` | Webhook listener for automatic git push deploys |
| `GET` | `/sites/:subdomain/*` | Direct live static site preview & routing |

---

## 🧪 Testing with cURL

```bash
# 1. Check server health
curl http://localhost:5000/api/health

# 2. List services
curl http://localhost:5000/api/services

# 3. Deploy from GitHub
curl -X POST http://localhost:5000/api/deploy/github \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/alexchen/nextjs-saas-starter", "branch": "main", "serviceName": "my-saas-app"}'

# 4. View deployed site
curl http://localhost:5000/sites/my-saas-app/
```
