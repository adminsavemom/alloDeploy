# AlloDeploy — Self-Hosted Web & Edge Deployment Manager

AlloDeploy is a modern self-hosted application and website deployment manager with built-in Cloudflare Pages & Anycast Edge integration, drag-and-drop instant bundle deployments, and custom domain management with automated SSL.

---

## ✨ Features

- **🚀 Cloudflare Pages & Edge Integration**: Automated Anycast Edge deployment, instant global caching, and SSL certificate provisioning.
- **🌐 Custom Domain Management**: Full CNAME verification, live DNS status checks, and automated edge binding.
- **📦 Instant Drag & Drop Deployment**: Drop project bundles (`.zip` or folders) directly onto the window for zero-config deployments.
- **⚡ Interactive Workspace**: Manage containers, static sites, databases, environment variables, and live terminal logs.
- **🔒 Secure Architecture**: Zero-exposure secret management and token-scoped Cloudflare API integration.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla JS (ES Modules), Vite, CSS Design System
- **Backend**: Node.js, Express, Cloudflare REST APIs, Wrangler & Edge bindings
- **Storage**: JSON / PostgreSQL (Supabase ready) persistence with telemetry tracking

---

## 🏁 Getting Started

### Prerequisites

- Node.js (v18.0.0 or higher)
- npm or yarn

### 1. Clone the repository

```bash
git clone https://github.com/kathirkamadurai29/alloDeploy.git
cd alloDeploy
```

### 2. Install dependencies

```bash
# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
cd ..
```

### 3. Environment Configuration

Copy the example environment file:
```bash
cp backend/.env.example backend/.env
```

Configure your environment variables:
```env
PORT=5000
NODE_ENV=development
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
```

### 4. Run Development Servers

From the root directory:
```bash
npm run dev
```

- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`

---

## 📄 License

MIT License. Built with ❤️ for modern self-hosted web infrastructure.
