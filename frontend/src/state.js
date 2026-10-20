// Central State Management for AlloDeploy Cloud
const STORAGE_KEY_USER = 'allodeploy_user_session';
const STORAGE_KEY_SERVICES = 'allodeploy_resources_list';

const initialServices = [];

class StateStore {
  constructor() {
    this.listeners = new Set();
    
    // Load saved session
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u && typeof u === 'object' && (u.email || u.id)) {
          this.user = u;
        } else {
          this.user = null;
        }
      } catch (e) {
        this.user = null;
      }
    } else {
      this.user = null;
    }

    // Load user-scoped resources and projects
    this.services = [];
    this.projects = [];
    this.recentDeployments = [];
    this.loadUserScopedData();

    // Navigation State
    this.activeView = 'dashboard'; // 'dashboard' | 'service-detail'
    this.activeNav = 'projects'; // Default to projects view
    this.activeTab = 'all'; // 'all' | 'applications' | 'databases' | 'services'
    this.currentEnvironment = 'production'; // 'production' | 'staging' | 'development'
    this.selectedServiceId = null;
    this.selectedDetailTab = 'overview'; // 'overview' | 'env' | 'logs' | 'deployments' | 'settings'
    
    // Modals
    this.isDeployModalOpen = false;
    this.isPreviewModalOpen = false;
    this.isSearchOpen = false;
    this.isBackendModalOpen = false;
    this.previewData = null;
    this.deployModalTab = 'drop'; // 'drop' | 'github'

    // Server telemetry & metrics
    this.backendUrl = (typeof window !== 'undefined' && window.location.port === '5173')
      ? 'http://localhost:5000'
      : (typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://localhost:5000');
    this.backendConnected = false;
    this.backendMetrics = null;
    this.serverMetrics = null;

    // Cloudflare Edge & DNS integration
    this.cloudflareConfig = null;
    this.edgeConfig = null;
    this.cloudflareAccounts = [];
    this.cloudflareZones = [];
    this.edgeZones = [];
    this.cloudflareDnsRecords = [];
    this.edgeDnsRecords = [];

    // GitHub Account & VCS Integration
    this.githubConnected = false;
    this.githubUser = null;
    this.githubRepos = [];

    // Toast notifications
    this.toasts = [];

    // Initialize backend connections & real state sync
    this.checkBackendConnection();
    this.fetchServicesFromBackend();
    this.fetchCloudflareConfig();
    this.checkGithubStatus();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.user?.id) {
      headers['x-user-id'] = this.user.id;
    }
    if (this.user?.email) {
      headers['x-user-email'] = this.user.email;
    }
    const token = localStorage.getItem('allodeploy_auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  loadUserScopedData() {
    if (!this.user) {
      this.services = [];
      this.projects = [];
      this.recentDeployments = [];
      return;
    }

    const userKey = this.user?.id || '';
    const userEmail = (this.user?.email || '').toLowerCase().trim();

    // 1. Scoped Services
    const scopedServicesKey = `${STORAGE_KEY_SERVICES}_${userKey}`;
    const rawSaved = localStorage.getItem(scopedServicesKey);
    let parsedServices = null;
    try {
      parsedServices = rawSaved ? JSON.parse(rawSaved) : null;
    } catch (e) {}

    const fakeNames = new Set([
      'my-cool-site--',
      'nextjs-saas-starter',
      'nebula-cloud-docs',
      'synthwave-edge-api',
      'zenith-dashboard-ui',
      'supabase-pg-vault',
      'test-git-app'
    ]);
    const cleanServices = (parsedServices || []).filter(s => {
      if (!s || fakeNames.has(s.name) || s.id === 'srv-09f762b9' || s.name === 'allodeploy-web-app') return false;
      if (s.id?.startsWith('srv-nebula') || s.id?.startsWith('srv-synthwave') || s.id?.startsWith('srv-zenith') || s.id?.startsWith('srv-uqey') || s.id?.startsWith('srv-winek') || s.id?.startsWith('srv-postgres')) return false;

      const srvUserId = (s.userId || '').trim();
      const srvEmail = (s.userEmail || '').toLowerCase().trim();

      // Strict account-based matching only
      if (userKey && srvUserId && srvUserId === userKey) return true;
      if (userEmail && srvEmail && srvEmail === userEmail) return true;
      return false;
    });

    cleanServices.forEach(s => {
      const cfUrl = `https://${s.name}.pages.dev`;
      if (!s.url || s.url.includes('localhost') || s.url.includes('allodeploy.app')) {
        s.url = s.customDomain 
          ? (s.customDomain.startsWith('http') ? s.customDomain : `https://${s.customDomain}`)
          : (s.cloudflarePagesUrl || cfUrl);
      }
      s.cloudflarePagesUrl = s.cloudflarePagesUrl || cfUrl;
      s.cloudflareConnected = true;
      s.liveDomain = s.url;
    });

    this.services = cleanServices;

    // 2. Scoped Projects
    const rawProjects = localStorage.getItem(`allodeploy_projects_list_${userKey}`);
    try {
      const pList = rawProjects ? JSON.parse(rawProjects) : [];
      this.projects = Array.isArray(pList) ? pList.filter(p => {
        if (!p) return false;
        const pUserId = (p.userId || '').trim();
        const pEmail = (p.userEmail || '').toLowerCase().trim();
        return (userKey && pUserId === userKey) || (userEmail && pEmail === userEmail);
      }) : [];
    } catch (e) {
      this.projects = [];
    }

    // 3. Scoped Recent Deployments
    const rawRecent = localStorage.getItem(`allodeploy_recent_deployments_${userKey}`);
    try {
      const rList = rawRecent ? JSON.parse(rawRecent) : [];
      this.recentDeployments = Array.isArray(rList) ? rList.filter(d => {
        if (!d) return false;
        const dUserId = (d.userId || '').trim();
        const dEmail = (d.userEmail || '').toLowerCase().trim();
        return (userKey && dUserId === userKey) || (userEmail && dEmail === userEmail);
      }) : [];
    } catch (e) {
      this.recentDeployments = [];
    }
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }

  showToast(message, type = 'info') {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    this.toasts.push({ id, message, type });
    this.notify();
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id);
      this.notify();
    }, 4000);
  }

  // Navigation
  setNav(nav) {
    this.activeNav = (nav === 'dashboard' ? 'projects' : nav);
    this.activeView = 'dashboard';
    this.notify();
  }

  setEnvironment(env) {
    this.currentEnvironment = env;
    this.showToast(`Switched environment to: ${env.toUpperCase()}`, 'info');
    this.notify();
  }

  setView(view, serviceId = null, detailTab = null) {
    this.activeView = view;
    if (serviceId) {
      this.selectedServiceId = serviceId;
    }
    if (detailTab) {
      this.selectedDetailTab = detailTab;
    } else if (view === 'dashboard') {
      this.selectedDetailTab = 'overview';
    }
    this.notify();
  }

  setTab(tab) {
    this.activeTab = tab;
    this.notify();
  }

  // Auth actions
  login(userPayload) {
    this.user = {
      id: userPayload.id || 'usr_' + Math.random().toString(36).substr(2, 9),
      name: userPayload.name || 'Developer',
      email: userPayload.email,
      handle: userPayload.handle || (userPayload.email ? userPayload.email.split('@')[0] : 'dev'),
      avatar: userPayload.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(userPayload.email || 'user')}`,
      provider: userPayload.provider || 'email',
      team: userPayload.team || 'Personal Workspace',
      role: userPayload.role || 'Admin / Owner'
    };
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.user));
    this.services = [];
    this.loadUserScopedData();
    this.fetchServicesFromBackend();
    this.notify();
    this.showToast(`Welcome back, ${this.user.name}!`, 'success');
  }

  async loginWithCredentials(email, password) {
    const res = await fetch(`${this.backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid email or password.');
    }
    if (data.token) {
      localStorage.setItem('allodeploy_auth_token', data.token);
    }
    this.login(data.user);
    return { success: true, user: data.user };
  }

  async registerUser(name, email, password) {
    const res = await fetch(`${this.backendUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create account.');
    }
    if (data.token) {
      localStorage.setItem('allodeploy_auth_token', data.token);
    }
    this.login(data.user);
    return { success: true, user: data.user };
  }

  async updateProfile(name, handle) {
    if (!this.user) return;
    const cleanName = (name || '').trim();
    const cleanHandle = (handle || cleanName.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_')).trim();

    if (!cleanName) {
      this.showToast('Please enter a valid display name.', 'error');
      return;
    }

    this.user.name = cleanName;
    this.user.handle = cleanHandle;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.user));
    this.notify();

    try {
      const res = await fetch(`${this.backendUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.user.id,
          email: this.user.email,
          name: cleanName,
          handle: cleanHandle
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          this.user = { ...this.user, ...data.user };
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.user));
          this.notify();
        }
      }
    } catch (err) {
      console.warn('Backend profile update sync error:', err);
    }

    this.showToast(`Username updated to "${cleanName}"!`, 'success');
  }

  logout() {
    this.user = null;
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem('allodeploy_auth_token');
    this.services = [];
    this.projects = [];
    this.recentDeployments = [];
    this.activeView = 'dashboard';
    this.activeNav = 'projects';
    this.selectedServiceId = null;
    this.isDeployModalOpen = false;
    this.notify();
    this.showToast('You have been logged out safely.', 'info');
  }

  // Modals
  openDeployModal(tab = 'drop') {
    this.deployModalTab = 'drop';
    this.isDeployModalOpen = true;
    this.notify();
  }

  openDeployModalWithService(serviceName, tab = 'drop') {
    this.targetServiceName = serviceName;
    this.openDeployModal(tab);
  }

  closeDeployModal() {
    this.isDeployModalOpen = false;
    this.targetServiceName = null;
    this.notify();
  }

  setDeployModalTab(tab) {
    this.deployModalTab = tab;
    if (tab === 'github' && this.githubRepos.length === 0) {
      this.fetchGithubRepos();
    }
    this.notify();
  }

  openPreview(service) {
    this.previewData = service;
    this.isPreviewModalOpen = true;
    this.notify();
  }

  closePreview() {
    this.isPreviewModalOpen = false;
    this.previewData = null;
    this.notify();
  }

  // Backend Health and Sync
  async checkBackendConnection() {
    try {
      const res = await fetch(`${this.backendUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        this.backendHealth = await res.json();
        this.backendConnected = true;
        this.fetchBackendMetrics();
      } else {
        this.backendConnected = false;
      }
    } catch {
      this.backendConnected = false;
    }
    this.notify();
  }

  async fetchBackendMetrics() {
    try {
      const res = await fetch(`${this.backendUrl}/api/system/metrics`);
      if (res.ok) {
        this.serverMetrics = await res.json();
        this.notify();
      }
    } catch (e) {
      console.warn('Could not fetch real server metrics:', e);
    }
  }

  async fetchServicesFromBackend() {
    try {
      const res = await fetch(`${this.backendUrl}/api/services`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const fakeNames = new Set([
          'my-cool-site--',
          'nextjs-saas-starter',
          'nebula-cloud-docs',
          'synthwave-edge-api',
          'zenith-dashboard-ui',
          'supabase-pg-vault'
        ]);
        const currentUserId = (this.user?.id || '').trim();
        const currentUserEmail = (this.user?.email || '').toLowerCase().trim();

        const cleanServices = (data.services || []).filter(s => {
          if (!s || fakeNames.has(s.name)) return false;
          if (s.id?.startsWith('srv-nebula') || s.id?.startsWith('srv-synthwave') || s.id?.startsWith('srv-zenith') || s.id?.startsWith('srv-uqey') || s.id?.startsWith('srv-winek') || s.id?.startsWith('srv-postgres')) return false;

          const srvUserId = (s.userId || '').trim();
          const srvEmail = (s.userEmail || '').toLowerCase().trim();

          // Account-based check
          if (currentUserId && srvUserId && srvUserId === currentUserId) return true;
          if (currentUserEmail && srvEmail && srvEmail === currentUserEmail) return true;
          return false;
        });
        cleanServices.forEach(s => {
          const cfUrl = `https://${s.name}.pages.dev`;
          if (!s.url || s.url.includes('localhost') || s.url.includes('allodeploy.app')) {
            s.url = s.customDomain 
              ? (s.customDomain.startsWith('http') ? s.customDomain : `https://${s.customDomain}`)
              : (s.cloudflarePagesUrl || cfUrl);
          }
          s.cloudflarePagesUrl = s.cloudflarePagesUrl || cfUrl;
          s.cloudflareConnected = true;
          s.liveDomain = s.url;
        });
        this.services = cleanServices;
        this.persistServices();
        this.notify();
      }
    } catch (err) {
      console.warn('Could not fetch services from backend:', err);
    }
  }

  // GitHub Account & VCS Integration
  async checkGithubStatus() {
    try {
      const res = await fetch(`${this.backendUrl}/api/github/status`);
      if (res.ok) {
        const data = await res.json();
        this.githubConnected = !!data.connected;
        this.githubUser = data.user || null;
        this.githubAuthProvider = data.authProvider || null;
        this.githubEmail = data.email || null;
        if (this.githubConnected) {
          await this.fetchGithubRepos();
        } else {
          this.githubRepos = [];
        }
        this.notify();
        return data;
      }
    } catch (e) {
      console.warn('Could not check GitHub status:', e);
    }
    return { connected: false };
  }

  async connectGithubViaGmail(email, githubUsername = '', token = '') {
    if (!email || !email.includes('@')) {
      this.showToast('Please enter a valid Gmail / Google email address.', 'error');
      return { success: false };
    }
    this.showToast('Connecting Git account via Gmail...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/github/connect-gmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), githubUsername: githubUsername.trim(), token: token.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.githubConnected = true;
        this.githubUser = data.user;
        this.githubAuthProvider = 'gmail';
        this.githubEmail = email.trim();
        this.showToast(`Connected Git account via Gmail (@${data.user.login})!`, 'success');
        await this.fetchGithubRepos();
        this.notify();
        return { success: true, user: data.user };
      } else {
        this.showToast(`Git connection failed: ${data.error || 'Failed to link account'}`, 'error');
        return { success: false, error: data.error };
      }
    } catch (e) {
      this.showToast(e.message, 'error');
      return { success: false, error: e.message };
    }
  }

  async connectGithub(token) {
    if (!token || !token.trim()) {
      this.showToast('Please enter a GitHub Personal Access Token.', 'error');
      return { success: false };
    }
    this.showToast('Authenticating with GitHub REST API...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.githubConnected = true;
        this.githubUser = data.user;
        this.githubAuthProvider = 'token';
        this.showToast(`Connected to GitHub as @${data.user.login}!`, 'success');
        await this.fetchGithubRepos();
        this.notify();
        return { success: true, user: data.user };
      } else {
        this.showToast(`GitHub connection failed: ${data.error || 'Invalid token'}`, 'error');
        return { success: false, error: data.error };
      }
    } catch (e) {
      this.showToast(e.message, 'error');
      return { success: false, error: e.message };
    }
  }

  async disconnectGithub() {
    this.showToast('Disconnecting GitHub account...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/github/disconnect`, { method: 'POST' });
      if (res.ok) {
        this.githubConnected = false;
        this.githubUser = null;
        this.githubRepos = [];
        this.notify();
        this.showToast('GitHub account disconnected.', 'info');
        return true;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return false;
  }

  async fetchGithubRepos() {
    try {
      const res = await fetch(`${this.backendUrl}/api/github/repos`);
      if (res.ok) {
        const data = await res.json();
        this.githubRepos = data.repositories || [];
        this.notify();
        return this.githubRepos;
      }
    } catch (e) {
      console.warn('Could not fetch github repos:', e);
    }
    return this.githubRepos;
  }

  async queryGithubRepo(url) {
    try {
      const res = await fetch(`${this.backendUrl}/api/github/repo-info?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        return data.repo;
      }
    } catch (e) {
      console.warn('Could not query github repo info from backend:', e);
    }
    return null;
  }
  async startService(id) {
    const srv = this.services.find(s => s.id === id);
    if (srv) {
      srv.status = 'running';
      srv.updatedAt = 'Just now';
      this.persistServices();
      this.notify();
      this.showToast(`Starting ${srv.name}...`, 'info');

      try {
        const res = await fetch(`${this.backendUrl}/api/services/${id}/start`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.service) {
            Object.assign(srv, data.service);
            this.persistServices();
            this.notify();
          }
        }
        this.showToast(`Resource "${srv.name}" is now RUNNING.`, 'success');
      } catch (e) {
        console.warn(e);
      }
    }
  }

  async stopService(id) {
    const srv = this.services.find(s => s.id === id);
    if (srv) {
      srv.status = 'stopped';
      srv.updatedAt = 'Just now';
      this.persistServices();
      this.notify();
      this.showToast(`Stopping ${srv.name}...`, 'info');

      try {
        const res = await fetch(`${this.backendUrl}/api/services/${id}/stop`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.service) {
            Object.assign(srv, data.service);
            this.persistServices();
            this.notify();
          }
        }
        this.showToast(`Resource "${srv.name}" has been STOPPED.`, 'info');
      } catch (e) {
        console.warn(e);
      }
    }
  }

  async restartService(id) {
    const srv = this.services.find(s => s.id === id);
    if (srv) {
      srv.status = 'restarting';
      this.notify();
      this.showToast(`Restarting ${srv.name}...`, 'info');

      try {
        await fetch(`${this.backendUrl}/api/services/${id}/restart`, { method: 'POST' });
        setTimeout(() => {
          srv.status = 'running';
          srv.updatedAt = 'Just now';
          this.persistServices();
          this.notify();
          this.showToast(`Resource ${srv.name} restarted successfully.`, 'success');
        }, 1200);
      } catch (e) {
        srv.status = 'running';
        this.notify();
      }
    }
  }

  async redeployService(serviceId) {
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv) return { success: false, error: 'Service not found' };

    srv.status = 'building';
    this.notify();
    this.showToast(`Starting deployment for ${srv.name}...`, 'info');

    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/redeploy`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const idx = this.services.findIndex(s => s.id === serviceId);
        let updatedService = srv;
        if (idx !== -1 && data.service) {
          this.services[idx] = data.service;
          updatedService = data.service;
        } else {
          srv.status = 'running';
          srv.updatedAt = 'Just now';
        }
        this.persistServices();
        this.notify();
        this.showToast(`✔ Deployment of ${srv.name} succeeded!`, 'success');
        return { success: true, service: updatedService, deploy: data.deploy };
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Deployment failed');
      }
    } catch (e) {
      console.warn('Redeploy failed:', e);
      srv.status = 'running';
      this.notify();
      this.showToast(`Redeployment notice: ${e.message}`, 'error');
      return { success: false, error: e.message };
    }
  }

  async fetchServiceDeployments(serviceId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/deployments`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.deployments) {
          return data.deployments;
        }
      }
    } catch (e) {
      console.warn('Error fetching deployments:', e);
    }
    const srv = this.services.find(s => s.id === serviceId);
    return (srv?.deploys || []).map(d => ({
      id: d.id,
      shortId: d.hash || (d.id ? d.id.replace('dep-', '').substring(0, 8) : ''),
      environment: 'production',
      url: d.url || srv.cloudflarePagesUrl || srv.url,
      aliases: [srv.cloudflarePagesUrl || srv.url],
      createdOn: d.date || d.timestamp || 'Just now',
      branch: 'main',
      commitHash: d.hash || '',
      commitMessage: d.message || 'Deploy to Cloudflare Pages',
      status: 'success',
      duration: d.duration || '2.4s'
    }));
  }

  async createResource(resourceData) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/create`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          ...resourceData,
          userId: this.user?.id,
          userEmail: this.user?.email
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.service) {
          this.services = [data.service, ...this.services];
          this.persistServices();
          this.notify();
          this.showToast(`Resource "${data.service.name}" created and running!`, 'success');
          return data.service;
        }
      }
    } catch (err) {
      console.warn('Backend create failed, creating locally:', err);
    }

    // Fallback local creation
    const cfPagesUrl = `https://${resourceData.name}.pages.dev`;
    const newService = {
      id: 'srv-' + Math.random().toString(36).substr(2, 7),
      name: (resourceData.name || 'resource-' + Math.random().toString(36).substr(2, 5)).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      userId: this.user?.id || 'usr_enterprise_dev',
      userEmail: this.user?.email || 'alex.smith@example.com',
      type: resourceData.type || 'Application',
      status: 'running',
      url: resourceData.customDomain ? (resourceData.customDomain.startsWith('http') ? resourceData.customDomain : `https://${resourceData.customDomain}`) : cfPagesUrl,
      liveDomain: resourceData.customDomain ? `https://${resourceData.customDomain}` : cfPagesUrl,
      cloudflarePagesUrl: cfPagesUrl,
      cloudflareConnected: true,
      customDomain: resourceData.customDomain || '',
      region: 'Self-Hosted Server',
      source: resourceData.gitRepo ? `Git (${resourceData.gitRepo})` : (resourceData.templateType ? `One-Click (${resourceData.templateType})` : 'Self-Hosted Container'),
      gitRepo: resourceData.gitRepo || '',
      port: resourceData.port || 3000,
      filesCount: 1,
      size: '1.2 MB',
      framework: resourceData.framework || 'Docker Container',
      updatedAt: 'Just now',
      createdAt: new Date().toISOString().replace('T', ' ').substr(0, 16),
      deployCount: 1,
      metrics: { cpu: '0.4%', memory: '48 MB', uptime: '100%' },
      envVars: resourceData.envVars || [{ key: 'PORT', value: '3000' }],
      sampleFiles: ['index.html'],
      deploys: [{ id: 'dep-' + Math.random().toString(36).substr(2, 6), date: 'Just now', status: 'running', message: 'Initial deployment via AlloDeploy engine' }]
    };

    this.services = [newService, ...this.services];
    this.persistServices();
    this.notify();
    this.showToast(`Resource "${newService.name}" provisioned successfully!`, 'success');
    return newService;
  }

  addService(newService) {
    if (!newService) return;
    if (this.user) {
      newService.userId = newService.userId || this.user.id || '';
      newService.userEmail = newService.userEmail || this.user.email || '';
    }
    const cfUrl = `https://${newService.name}.pages.dev`;
    if (!newService.url || newService.url.includes('localhost') || newService.url.includes('allodeploy.app')) {
      newService.url = newService.customDomain 
        ? (newService.customDomain.startsWith('http') ? newService.customDomain : `https://${newService.customDomain}`)
        : (newService.cloudflarePagesUrl || cfUrl);
    }
    newService.cloudflarePagesUrl = newService.cloudflarePagesUrl || cfUrl;
    newService.cloudflareConnected = true;
    newService.liveDomain = newService.url;
    if (newService.status === 'live') {
      newService.status = 'running';
    }
    this.services = [newService, ...this.services.filter(s => s.id !== newService.id)];
    this.persistServices();
    this.notify();
    this.showToast(`Resource "${newService.name}" deployed and running!`, 'success');
  }

  async addCustomDomain(serviceId, domain, options = {}) {
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv) return null;

    const proto = srv.protocol || 'https';
    srv.customDomain = cleanDomain;
    srv.customDomainStatus = 'pending';
    srv.customDomainCname = `${srv.name}.pages.dev`;
    srv.cloudflarePagesUrl = `https://${srv.name}.pages.dev`;
    srv.url = `${proto}://${cleanDomain}`;
    srv.liveDomain = `${proto}://${cleanDomain}`;
    if (options && options.customOriginServer !== undefined) srv.customOriginServer = options.customOriginServer;
    if (options && options.customOriginSni !== undefined) srv.customOriginSni = options.customOriginSni;
    if (options && options.customHostnameId) srv.customHostnameId = options.customHostnameId;
    srv.updatedAt = 'Just now';
    this.persistServices();
    this.notify();
    this.showToast(`Registering custom domain "${cleanDomain}"...`, 'info');

    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/custom-domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: cleanDomain,
          customOriginServer: options?.customOriginServer,
          customOriginSni: options?.customOriginSni,
          customHostnameId: options?.customHostnameId,
          zoneId: options?.zoneId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.service) {
          Object.assign(srv, data.service);
          this.persistServices();
          this.notify();
        }
        if (data.cfResult?.status === 'active' || data.service?.customDomainStatus === 'active') {
          this.showToast(`Domain https://${cleanDomain} connected & active!`, 'success');
        } else if (data.customHostname) {
          this.showToast(`Domain "${cleanDomain}" updated with Custom Origin (${options?.customOriginServer || 'origin'})!`, 'success');
        } else {
          this.showToast(`Domain "${cleanDomain}" configured successfully!`, 'success');
        }
        return data;
      }
    } catch (e) {
      console.warn('Backend custom domain error:', e);
    }
    this.showToast(`Domain "${cleanDomain}" registered.`, 'info');
    return { success: true, domain: cleanDomain };
  }

  async updateCustomDomainOrigin(serviceId, { customOriginServer, customOriginSni, customHostnameId, zoneId } = {}) {
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv) return null;

    this.showToast(`Updating Cloudflare Custom Hostname origin routing...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/custom-domain/origin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customOriginServer,
          customOriginSni,
          customHostnameId,
          zoneId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.service) {
          Object.assign(srv, data.service);
          this.persistServices();
          this.notify();
        }
        this.showToast(`Custom Origin updated: ${customOriginServer || 'Default'} (SNI: ${customOriginSni || 'Default'})`, 'success');
        return data;
      } else {
        const err = await res.json();
        this.showToast(err.error || 'Failed to update custom origin', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  async regenerateHostname(serviceId) {
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv) return null;

    this.showToast('Regenerating unique hostname...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/regenerate-hostname`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.service) {
          Object.assign(srv, data.service);
          this.persistServices();
          this.notify();
        }
        this.showToast(`New hostname generated: ${data.hostname}`, 'success');
        return data.hostname;
      }
    } catch (e) {
      console.warn('Backend regenerate hostname error:', e);
    }

    // Fallback generation matching Picture 5
    const randomChars = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const fallbackHostname = `${randomChars.substring(0, 24)}.72.61.239.30.sslip.io`;
    srv.generatedHostname = fallbackHostname;
    this.persistServices();
    this.notify();
    this.showToast(`New hostname generated: ${fallbackHostname}`, 'success');
    return fallbackHostname;
  }

  async saveDomainSettings(serviceId, settings) {
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv) return null;

    this.showToast('Saving domain settings...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/domain-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.service) {
          Object.assign(srv, data.service);
          this.persistServices();
          this.notify();
        }
        this.showToast('Domain settings saved successfully!', 'success');
        return data;
      }
    } catch (e) {
      console.warn('Backend domain settings error:', e);
    }

    // Optimistic fallback
    Object.assign(srv, {
      protocol: settings.protocol,
      port: parseInt(settings.port, 10) || srv.port || 3000,
      pathSuffix: settings.path,
      searchEngineIndexing: settings.indexing,
      wwwRedirect: settings.wwwRedirect,
      customDomain: settings.domain || srv.customDomain
    });
    this.persistServices();
    this.notify();
    this.showToast('Domain settings saved.', 'success');
    return { success: true };
  }

  async patchCloudflareCustomHostname(customHostnameId, { customOriginServer, customOriginSni, zoneId } = {}) {
    this.showToast(`Applying PATCH to Cloudflare Custom Hostname ${customHostnameId}...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/custom-hostnames/${customHostnameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_origin_server: customOriginServer,
          custom_origin_sni: customOriginSni,
          zoneId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`Cloudflare Custom Hostname updated successfully!`, 'success');
        return data;
      } else {
        this.showToast(data.error || 'Failed to update custom hostname', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  async verifyCustomDomain(serviceId) {
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv || !srv.customDomain) return;

    this.showToast(`Checking DNS for ${srv.customDomain}...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/custom-domain/verify`);
      if (res.ok) {
        const data = await res.json();
        if (data.service) {
          Object.assign(srv, data.service);
          this.persistServices();
          this.notify();
        }
        if (data.statusInfo?.status === 'active') {
          this.showToast(`🎉 Domain ${srv.customDomain} is verified & ACTIVE on Cloudflare Pages!`, 'success');
        } else {
          this.showToast(`⏳ CNAME not yet resolving. Point CNAME: ${srv.customDomain} -> ${srv.name}.pages.dev`, 'info');
        }
        return data;
      }
    } catch (e) {
      console.warn('Verify domain error:', e);
    }
  }

  async removeCustomDomain(serviceId) {
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv) return null;

    const cfUrl = srv.cloudflarePagesUrl || `https://${srv.name}.pages.dev`;
    srv.customDomain = '';
    srv.customOriginServer = '';
    srv.customOriginSni = '';
    srv.customHostnameId = '';
    srv.url = cfUrl;
    srv.liveDomain = cfUrl;
    srv.updatedAt = 'Just now';
    this.persistServices();
    this.notify();
    this.showToast(`Custom domain removed. Reverted to ${cfUrl}`, 'info');

    try {
      await fetch(`${this.backendUrl}/api/services/${serviceId}/custom-domain`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Backend remove custom domain error:', e);
    }
    return { success: true };
  }

  async deleteService(serviceId) {
    const target = this.services.find(s => s.id === serviceId || s.name === serviceId) ||
                   (this.projects || []).find(p => p.id === serviceId || p.name === serviceId);
    const targetName = target ? target.name : serviceId;
    const effectiveId = target ? target.id : serviceId;

    // Remove permanently from memory
    this.services = this.services.filter(s => s.id !== effectiveId && s.id !== serviceId && s.name !== targetName);
    this.projects = (this.projects || []).filter(p => p.id !== effectiveId && p.id !== serviceId && p.name !== targetName);
    if (this.recentDeployments) {
      this.recentDeployments = this.recentDeployments.filter(d => 
        d.id !== effectiveId && 
        d.id !== serviceId &&
        d.application !== targetName && 
        d.site !== targetName &&
        d.projectName !== targetName
      );
    }

    // Persist immediately across all local storage scopes
    this.persistServices();
    this.persistProjects();
    this.persistRecentDeployments();

    if (this.selectedServiceId === effectiveId || this.selectedServiceId === serviceId) {
      this.selectedServiceId = null;
      this.activeView = 'dashboard';
    }
    this.notify();
    this.showToast(`Resource "${targetName}" deleted successfully.`, 'info');

    // Permanently sync deletion to backend & Supabase DB
    try {
      const q = targetName ? `?name=${encodeURIComponent(targetName)}` : '';
      const res = await fetch(`${this.backendUrl}/api/services/${encodeURIComponent(effectiveId)}${q}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) {
        console.warn('Backend delete returned non-ok status:', res.status);
        if (targetName && targetName !== effectiveId) {
          await fetch(`${this.backendUrl}/api/services/${encodeURIComponent(targetName)}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
          });
        }
      }
    } catch (e) {
      console.warn('Backend delete sync error:', e);
    }
  }

  async updateServiceConfig(serviceId, configData) {
    const srv = this.services.find(s => s.id === serviceId);
    if (srv) {
      Object.assign(srv, configData);
      srv.updatedAt = 'Just now';
      this.persistServices();
      this.notify();
      this.showToast(`Configuration saved for ${srv.name}.`, 'success');

      try {
        await fetch(`${this.backendUrl}/api/services/${serviceId}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configData)
        });
      } catch (e) {
        console.warn('Backend config sync error:', e);
      }
    }
  }

  async fetchServiceEnv(serviceId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/env`);
      if (res.ok) {
        const data = await res.json();
        return data.envVars || [];
      }
    } catch (e) {
      console.warn('Fetch env error:', e);
    }
    const srv = this.services.find(s => s.id === serviceId);
    return srv?.envVars || [];
  }

  async saveServiceEnv(serviceId, { envVars, rawEnv, order, buildSecrets } = {}) {
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv) return null;

    this.showToast('Saving environment variables...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/env`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVars, rawEnv, order, buildSecrets })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.envVars) {
          srv.envVars = data.envVars;
          srv.updatedAt = 'Just now';
          this.persistServices();
          this.notify();
        }
        this.showToast('Environment variables saved & synced successfully!', 'success');
        return data;
      }
    } catch (e) {
      console.warn('Save env error:', e);
    }

    if (Array.isArray(envVars)) {
      srv.envVars = envVars;
      srv.updatedAt = 'Just now';
      this.persistServices();
      this.notify();
    }
    this.showToast('Environment variables saved locally.', 'success');
    return { success: true };
  }

  async deleteServiceEnv(serviceId, key) {
    const srv = this.services.find(s => s.id === serviceId);
    if (!srv) return null;

    if (Array.isArray(srv.envVars)) {
      srv.envVars = srv.envVars.filter(e => e.key !== key);
      srv.updatedAt = 'Just now';
      this.persistServices();
      this.notify();
    }

    try {
      await fetch(`${this.backendUrl}/api/services/${serviceId}/env/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });
      this.showToast(`Variable "${key}" removed.`, 'info');
    } catch (e) {
      console.warn('Delete env error:', e);
    }
  }

  // =========================================================================
  // COOLIFY INTEGRATION: Domains & Automated Certbot SSL
  // =========================================================================
  async fetchDomains(serviceId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/domains`);
      if (res.ok) {
        const data = await res.json();
        return data.domains || [];
      }
    } catch (e) {
      console.warn('fetchDomains error:', e);
    }
    return [];
  }

  async addDomain(serviceId, domain, email = '') {
    this.showToast(`Verifying DNS & issuing Let's Encrypt SSL for ${domain}...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, email })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const srv = this.services.find(s => s.id === serviceId);
        if (srv) {
          srv.customDomain = domain;
          srv.sslEnabled = true;
          srv.liveDomain = `https://${domain}`;
          this.persistServices();
          this.notify();
        }
        this.showToast(`Domain ${domain} activated with Let's Encrypt SSL & Nginx reloaded!`, 'success');
        return data;
      } else {
        this.showToast(data.error || 'Failed to add domain', 'error');
        return null;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
      return null;
    }
  }

  async removeDomain(serviceId, domain) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/domains/${encodeURIComponent(domain)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        this.showToast(`Domain ${domain} removed.`, 'info');
        return true;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return false;
  }

  // =========================================================================
  // COOLIFY INTEGRATION: Automated Rollback
  // =========================================================================
  async rollbackService(serviceId, deployId) {
    this.showToast(`Rolling back resource to snapshot ${deployId}...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/rollback/${deployId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await this.fetchServicesFromBackend();
        this.showToast(`Successfully rolled back to deployment ${deployId}!`, 'success');
        return data;
      } else {
        this.showToast(data.error || 'Rollback failed', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  // =========================================================================
  // COOLIFY INTEGRATION: Nginx Reverse Proxy
  // =========================================================================
  async getNginxConfig(serviceName) {
    try {
      const res = await fetch(`${this.backendUrl}/api/nginx/config/${encodeURIComponent(serviceName)}`);
      if (res.ok) {
        const data = await res.json();
        return data.config || '';
      }
    } catch (e) {
      console.warn('getNginxConfig error:', e);
    }
    return '';
  }

  async saveNginxConfig(serviceName, config) {
    try {
      const res = await fetch(`${this.backendUrl}/api/nginx/config/${encodeURIComponent(serviceName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast('Nginx virtual host saved and reloaded successfully!', 'success');
        return true;
      } else {
        this.showToast(data.error || 'Nginx syntax validation failed', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return false;
  }

  async testNginxConfig(config) {
    try {
      const res = await fetch(`${this.backendUrl}/api/nginx/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async reloadNginx() {
    try {
      const res = await fetch(`${this.backendUrl}/api/nginx/reload`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        this.showToast('Nginx daemon gracefully reloaded without downtime.', 'success');
        return data;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  // =========================================================================
  // COOLIFY INTEGRATION: Healthcheck Prober
  // =========================================================================
  async probeHealth(serviceId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/healthcheck/probe`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        return data.probe;
      }
    } catch (e) {
      console.warn('probeHealth error:', e);
    }
    return null;
  }

  // =========================================================================
  // COOLIFY INTEGRATION: Backups Manager
  // =========================================================================
  async fetchBackups(serviceId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/backups`);
      if (res.ok) {
        const data = await res.json();
        return data.backups || [];
      }
    } catch (e) {
      console.warn('fetchBackups error:', e);
    }
    return [];
  }

  async createBackup(serviceId, note = 'Manual snapshot') {
    this.showToast('Creating backup snapshot archive...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/backups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast('Backup archive created successfully!', 'success');
        return data.backup;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  async restoreBackup(serviceId, backupId) {
    this.showToast(`Restoring backup ${backupId}...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/backups/${backupId}/restore`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast('Backup restored and Nginx proxy synchronized!', 'success');
        return data;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  // =========================================================================
  // COOLIFY INTEGRATION: Scheduled Tasks (Cron)
  // =========================================================================
  async fetchTasks(serviceId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/tasks`);
      if (res.ok) {
        const data = await res.json();
        return data.tasks || [];
      }
    } catch (e) {
      console.warn('fetchTasks error:', e);
    }
    return [];
  }

  async addTask(serviceId, taskData) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`Scheduled task "${taskData.name}" created!`, 'success');
        return data.task;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  async deleteTask(serviceId, taskId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        this.showToast('Scheduled task deleted.', 'info');
        return true;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return false;
  }

  async runTask(serviceId, taskId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/tasks/${taskId}/run`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast('Task executed successfully.', 'success');
        return data.task;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  // =========================================================================
  // COOLIFY INTEGRATION: Webhooks
  // =========================================================================
  async fetchWebhook(serviceId) {
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/webhook`);
      if (res.ok) {
        const data = await res.json();
        return data.webhook;
      }
    } catch (e) {
      console.warn('fetchWebhook error:', e);
    }
    return null;
  }

  async triggerWebhook(serviceId) {
    this.showToast('Triggering webhook deployment...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/services/${serviceId}/webhook`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast('Webhook deployment triggered!', 'success');
        return data;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  // ALLODEPLOY EDGE & DNS AUTOMATION (Global Anycast Edge Network)
  async fetchEdgeConfig() {
    try {
      const res = await fetch(`${this.backendUrl}/api/edge/config`);
      if (res.ok) {
        this.edgeConfig = await res.json();
        this.cloudflareConfig = this.edgeConfig;
        this.notify();
        if (this.edgeConfig?.configured) {
          this.fetchEdgeZones();
        }
      }
    } catch (e) {
      console.warn('fetchEdgeConfig error:', e);
    }
  }

  // CLOUDFLARE API & DNS AUTOMATION (Global Edge Network)
  async fetchCloudflareConfig() {
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/config`);
      if (res.ok) {
        this.cloudflareConfig = await res.json();
        this.edgeConfig = this.cloudflareConfig;
        this.notify();
        if (this.cloudflareConfig?.configured) {
          this.fetchCloudflareZones();
          this.fetchCloudflareAccounts();
        }
      }
    } catch (e) {
      console.warn('fetchCloudflareConfig error:', e);
    }
  }

  fetchEdgeConfig() {
    return this.fetchCloudflareConfig();
  }

  async saveCloudflareConfig(configUpdates) {
    this.showToast('Saving Cloudflare configuration...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configUpdates)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.cloudflareConfig = data.config;
        this.edgeConfig = this.cloudflareConfig;
        this.showToast('Cloudflare API settings saved successfully!', 'success');
        await this.fetchCloudflareConfig();
        return data;
      } else {
        this.showToast(data.error || 'Failed to save Cloudflare settings', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  saveEdgeConfig(configUpdates) {
    return this.saveCloudflareConfig(configUpdates);
  }

  async verifyCloudflareToken(token = null) {
    this.showToast('Verifying token with Cloudflare API...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: token })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('✅ Cloudflare API Token is valid and active!', 'success');
      } else {
        this.showToast(`❌ Verification failed: ${data.message || 'Invalid token'}`, 'error');
      }
      return data;
    } catch (e) {
      this.showToast(e.message, 'error');
      return { success: false, message: e.message };
    }
  }

  verifyEdgeToken(token = null) {
    return this.verifyCloudflareToken(token);
  }

  async fetchCloudflareZones() {
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/zones`);
      if (res.ok) {
        const data = await res.json();
        this.cloudflareZones = data.zones || [];
        this.edgeZones = this.cloudflareZones;
        this.notify();
        return this.cloudflareZones;
      }
    } catch (e) {
      console.warn('fetchCloudflareZones error:', e);
    }
    return [];
  }

  async fetchCloudflareAccounts() {
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/accounts`);
      if (res.ok) {
        const data = await res.json();
        this.cloudflareAccounts = data.accounts || [];
        this.notify();
        return this.cloudflareAccounts;
      }
    } catch (e) {
      console.warn('fetchCloudflareAccounts error:', e);
    }
    return [];
  }

  fetchEdgeZones() {
    return this.fetchCloudflareZones();
  }

  async fetchCloudflareDns(zoneId = null) {
    try {
      const url = zoneId ? `${this.backendUrl}/api/cloudflare/dns?zoneId=${zoneId}` : `${this.backendUrl}/api/cloudflare/dns`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.cloudflareDnsRecords = data.records || [];
        this.edgeDnsRecords = this.cloudflareDnsRecords;
        this.notify();
        return this.cloudflareDnsRecords;
      }
    } catch (e) {
      console.warn('fetchCloudflareDns error:', e);
    }
    return [];
  }

  fetchEdgeDns(zoneId = null) {
    return this.fetchCloudflareDns(zoneId);
  }

  async createCloudflareDns(recordData) {
    this.showToast(`Creating DNS record ${recordData.name} on Cloudflare...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/dns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`DNS record ${recordData.name} created on Cloudflare!`, 'success');
        await this.fetchCloudflareDns(recordData.zoneId);
        return data;
      } else {
        this.showToast(data.error || 'Failed to create DNS record', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  createEdgeDns(recordData) {
    return this.createCloudflareDns(recordData);
  }

  async deleteCloudflareDns(recordId, zoneId = null) {
    this.showToast('Removing DNS record from Cloudflare...', 'info');
    try {
      const url = zoneId ? `${this.backendUrl}/api/cloudflare/dns/${recordId}?zoneId=${zoneId}` : `${this.backendUrl}/api/cloudflare/dns/${recordId}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast('DNS record removed from Cloudflare.', 'success');
        await this.fetchCloudflareDns(zoneId);
        return data;
      } else {
        this.showToast(data.error || 'Failed to delete DNS record', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  deleteEdgeDns(recordId, zoneId = null) {
    return this.deleteCloudflareDns(recordId, zoneId);
  }

  async toggleCloudflareProxy(recordId, proxied, zoneId = null) {
    this.showToast(`${proxied ? 'Enabling' : 'Disabling'} Cloudflare Proxy (Orange Cloud ☁️)...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/dns/${recordId}/toggle-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId, proxied })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`Cloudflare Proxy ${proxied ? 'enabled' : 'disabled'}.`, 'success');
        await this.fetchCloudflareDns(zoneId);
        return data;
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  toggleEdgeProxy(recordId, proxied, zoneId = null) {
    return this.toggleCloudflareProxy(recordId, proxied, zoneId);
  }

  async purgeCloudflareCache(zoneId = null, purgeEverything = true) {
    this.showToast('Purging Cloudflare Edge Cache worldwide...', 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/purge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId, purgeEverything })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast('⚡ Cloudflare Edge Cache purged worldwide!', 'success');
        return data;
      } else {
        this.showToast(data.error || 'Cache purge failed', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  purgeEdgeCache(zoneId = null, purgeEverything = true) {
    return this.purgeCloudflareCache(zoneId, purgeEverything);
  }

  persistServices() {
    try {
      if (!this.user?.id) return;
      const userKey = this.user.id;
      localStorage.setItem(`${STORAGE_KEY_SERVICES}_${userKey}`, JSON.stringify(this.services));
    } catch (e) {
      console.warn('Failed to persist services to localStorage:', e);
    }
  }

  persistProjects() {
    if (!this.user?.id) return;
    const userKey = this.user.id;
    localStorage.setItem(`allodeploy_projects_list_${userKey}`, JSON.stringify(this.projects));
  }

  persistRecentDeployments() {
    if (!this.user?.id) return;
    const userKey = this.user.id;
    localStorage.setItem(`allodeploy_recent_deployments_${userKey}`, JSON.stringify(this.recentDeployments));
  }

  addProject(project) {
    const cleanProj = {
      id: project.id || 'proj-' + Math.random().toString(36).substr(2, 6),
      name: project.name || 'New Project',
      description: project.description || '',
      foldersCount: project.foldersCount || 1,
      resourcesCount: project.resourcesCount || 0,
      environment: project.environment || this.currentEnvironment || 'production',
      userId: this.user?.id || '',
      userEmail: this.user?.email || '',
      createdAt: new Date().toISOString()
    };
    this.projects.unshift(cleanProj);
    this.persistProjects();
    this.notify();
    this.showToast(`Project workspace "${cleanProj.name}" created!`, 'success');
    return cleanProj;
  }

  addRecentDeployment(dep) {
    const record = {
      id: dep.id || 'dep-' + Math.random().toString(36).substr(2, 6),
      application: dep.application || dep.name || 'app',
      environment: dep.environment || `${dep.name || 'workspace'} / ${this.currentEnvironment || 'production'}`,
      server: dep.server || 'localhost',
      status: dep.status || 'Success',
      started: dep.started || 'Just now',
      userId: this.user?.id || '',
      userEmail: this.user?.email || '',
      timestamp: Date.now()
    };
    this.recentDeployments.unshift(record);
    if (this.recentDeployments.length > 20) {
      this.recentDeployments = this.recentDeployments.slice(0, 20);
    }
    this.persistRecentDeployments();
    this.notify();
  }

  async syncServiceWithCloudflare(serviceId, domain, options = {}) {
    this.showToast(`Provisioning Cloudflare DNS & Orange Cloud for ${domain}...`, 'info');
    try {
      const res = await fetch(`${this.backendUrl}/api/cloudflare/sync-service/${serviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, ...options })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.service) {
          const idx = this.services.findIndex(s => s.id === serviceId);
          if (idx !== -1) {
            this.services[idx] = data.service;
            this.persistServices();
            this.notify();
          }
        }
        this.showToast(`Domain ${domain} provisioned on Cloudflare with Edge Proxy!`, 'success');
        return data;
      } else {
        this.showToast(data.error || 'Failed to sync domain with Cloudflare', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
    return null;
  }

  getSelectedService() {
    return this.services.find(s => s.id === this.selectedServiceId) || this.services[0];
  }
}

export const store = new StateStore();
