import { icons } from '../icons.js';
import { store } from '../state.js';

export function renderAuth(container) {
  let activeTab = 'signin'; // 'signin' | 'signup'
  let showPassword = false;
  let emailVal = '';
  let passwordVal = '';
  let nameVal = '';
  let errorMessage = '';
  let isLoading = false;

  function calculateStrength(pw) {
    if (!pw) return { score: 0, label: 'Enter password', cls: '' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    switch (score) {
      case 1: return { score: 1, label: 'Weak (needs numbers & symbols)', cls: 'weak' };
      case 2: return { score: 2, label: 'Fair (add uppercase & length)', cls: 'fair' };
      case 3: return { score: 3, label: 'Good (strong protection)', cls: 'good' };
      case 4: return { score: 4, label: 'Excellent (high entropy)', cls: 'strong' };
      default: return { score: 1, label: 'Too short (min 8 chars)', cls: 'weak' };
    }
  }

  function render() {
    const isSignUp = activeTab === 'signup';

    container.innerHTML = `
      <div class="auth-page-container">
        <div class="auth-grid-overlay"></div>

        <div class="auth-layout">
          <div class="auth-hero-showcase">
            <div class="auth-hero-brand">
              <div class="brand-logo-wrap">
                ${icons.logo}
              </div>
              <div>
                <h2>AlloDeploy</h2>
                <div style="font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); letter-spacing: 0.04em;">
                  DEPLOYMENT & HOSTING MANAGER
                </div>
              </div>
            </div>

            <div class="auth-hero-center">
              <h1 class="auth-hero-headline">
                Deploy and manage applications on your infrastructure.
              </h1>

              <p class="auth-hero-sub">
                Run static sites, containers, and services with automatic SSL, virtual host routing, and deployment logs.
              </p>

              <div class="auth-terminal">
                <div class="auth-terminal-header">
                  <div class="terminal-dots">
                    <span class="terminal-dot red"></span>
                    <span class="terminal-dot yellow"></span>
                    <span class="terminal-dot green"></span>
                  </div>
                  <span style="font-size: 11px; color: var(--text-faint);">allodeploy-cli / engine</span>
                  <span style="font-size: 11px; color: #34d399;" class="pulse-status">● Engine Online</span>
                </div>
                <div class="auth-terminal-body">
                  <div class="terminal-line">
                    <span class="terminal-prompt">$</span>
                    <span class="terminal-cmd typing-anim">allodeploy deploy --project=production --app=web</span>
                  </div>
                  <div class="terminal-output">==> Pulling source code & building container image...</div>
                  <div class="terminal-output">==> Configuring reverse proxy & SSL certificates...</div>
                  <div class="terminal-output">==> Attaching PostgreSQL & Redis network bridge...</div>
                  <div class="terminal-success">[ok] Container is running & healthy on port 3000!</div>
                  <div class="terminal-line">
                    <span class="terminal-prompt">></span>
                    <span style="color: #a78bfa;">https://app.allodeploy.local [ACTIVE]</span>
                    <span class="terminal-cursor"></span>
                  </div>
                </div>
              </div>

              <div class="auth-features-row">
                <div class="auth-feature-pill">
                  ${icons.server}
                  <span>Docker & Traefik Native</span>
                </div>
                <div class="auth-feature-pill">
                  ${icons.terminal}
                  <span>Real-Time Logs</span>
                </div>
                <div class="auth-feature-pill">
                  ${icons.lock}
                  <span>Automatic SSL</span>
                </div>
              </div>
            </div>
          </div>

          <div class="auth-form-side">
            <div class="auth-card-clean">
              
              <div class="auth-card-header">
                <h1>${isSignUp ? 'Create an account' : 'Sign in to AlloDeploy'}</h1>
                <p>${isSignUp ? 'Set up your admin workspace to manage services' : 'Enter your credentials to access your dashboard'}</p>
              </div>

              <div class="auth-nav-tabs">
                <button class="auth-nav-tab ${!isSignUp ? 'active' : ''}" data-tab="signin">
                  ${icons.lock} Sign In
                </button>
                <button class="auth-nav-tab ${isSignUp ? 'active' : ''}" data-tab="signup">
                  ${icons.activity} Create Account
                </button>
              </div>

              <!-- Error Alert Banner -->
              ${errorMessage ? `
                <div class="auth-error-banner" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>${errorMessage}</span>
                </div>
              ` : ''}

              <!-- Main Auth Form -->
              <form id="auth-main-form" autocomplete="on">
                ${isSignUp ? `
                  <div class="auth-form-group">
                    <label class="auth-form-label" for="auth-name">Developer Name</label>
                    <div class="auth-input-wrapper">
                      <span class="auth-input-icon">${icons.activity}</span>
                      <input 
                        type="text" 
                        id="auth-name" 
                        class="auth-input animated-input" 
                        placeholder="e.g. Enterprise Admin" 
                        value="${nameVal}" 
                        required 
                        autocomplete="name"
                        ${isLoading ? 'disabled' : ''}
                      />
                    </div>
                  </div>
                ` : ''}

                <div class="auth-form-group">
                  <label class="auth-form-label" for="auth-email">Email Address</label>
                  <div class="auth-input-wrapper">
                    <span class="auth-input-icon">${icons.mail}</span>
                    <input 
                      type="email" 
                      id="auth-email" 
                      class="auth-input animated-input" 
                      placeholder="alex.smith@example.com" 
                      value="${emailVal}" 
                      required 
                      autocomplete="email" 
                      ${isLoading ? 'disabled' : ''}
                    />
                  </div>
                </div>

                <div class="auth-form-group">
                  <div class="auth-form-label">
                    <label for="auth-password">Password</label>
                    ${!isSignUp ? `<a href="#" id="link-forgot-pw" style="color: #a78bfa; text-decoration: none; font-size: 11.5px;">Forgot Password?</a>` : ''}
                  </div>
                  <div class="auth-input-wrapper">
                    <span class="auth-input-icon">${icons.lock}</span>
                    <input 
                      type="${showPassword ? 'text' : 'password'}" 
                      id="auth-password" 
                      class="auth-input animated-input" 
                      placeholder="••••••••••••" 
                      value="${passwordVal}" 
                      required 
                      autocomplete="${isSignUp ? 'new-password' : 'current-password'}" 
                      ${isLoading ? 'disabled' : ''}
                    />
                    <button type="button" class="auth-pw-toggle" id="toggle-pw-visibility" title="Toggle password visibility">
                      ${showPassword ? icons.eyeOff : icons.eye}
                    </button>
                  </div>

                  ${isSignUp ? `
                    <div class="pw-strength-container" id="pw-strength-widget">
                      <div class="pw-strength-bars">
                        <div class="pw-strength-bar" id="str-bar-1"></div>
                        <div class="pw-strength-bar" id="str-bar-2"></div>
                        <div class="pw-strength-bar" id="str-bar-3"></div>
                        <div class="pw-strength-bar" id="str-bar-4"></div>
                      </div>
                      <div class="pw-strength-text">
                        <span id="pw-strength-label">Enter password</span>
                        <span>8+ chars · uppercase · numbers</span>
                      </div>
                    </div>
                  ` : ''}
                </div>

                ${!isSignUp ? `
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; font-size: 12px; color: var(--text-muted);">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                      <input type="checkbox" id="auth-remember" checked style="accent-color: #8b5cf6; width: 14px; height: 14px;" />
                      <span>Remember session</span>
                    </label>
                    <span style="color: #34d399; font-size: 11.5px; display: flex; align-items: center; gap: 4px;">
                      ${icons.check} Local Host Secure
                    </span>
                  </div>
                ` : `
                  <div style="margin-bottom: 14px; font-size: 11.5px; color: var(--text-faint); line-height: 1.5;">
                    <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
                      <input type="checkbox" id="auth-agree-terms" checked required style="accent-color: #8b5cf6; width: 14px; height: 14px; margin-top: 2px;" />
                      <span>I agree to self-hosted terms & local data policies.</span>
                    </label>
                  </div>
                `}

                <button type="submit" class="btn-auth-submit" id="btn-submit-main" ${isLoading ? 'disabled' : ''}>
                  ${isLoading ? `
                    <span class="spin-icon">${icons.refresh}</span>
                    <span>${isSignUp ? 'Creating account...' : 'Signing in...'}</span>
                  ` : `
                    <span>${isSignUp ? 'Create account' : 'Sign in'}</span>
                  `}
                </button>
              </form>

            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    container.querySelectorAll('.auth-nav-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab && tab !== activeTab) {
          activeTab = tab;
          errorMessage = '';
          render();
        }
      });
    });

    const pwToggle = container.querySelector('#toggle-pw-visibility');
    if (pwToggle) {
      pwToggle.addEventListener('click', () => {
        showPassword = !showPassword;
        const pwInput = container.querySelector('#auth-password');
        if (pwInput) {
          pwInput.type = showPassword ? 'text' : 'password';
        }
        pwToggle.innerHTML = showPassword ? icons.eyeOff : icons.eye;
      });
    }

    const pwInput = container.querySelector('#auth-password');
    if (pwInput) {
      pwInput.addEventListener('input', (e) => {
        passwordVal = e.target.value;
        if (activeTab === 'signup') {
          const result = calculateStrength(passwordVal);
          const label = container.querySelector('#pw-strength-label');
          if (label) label.textContent = result.label;

          for (let i = 1; i <= 4; i++) {
            const bar = container.querySelector(`#str-bar-${i}`);
            if (bar) {
              bar.className = 'pw-strength-bar';
              if (i <= result.score) {
                bar.classList.add(result.cls);
              }
            }
          }
        }
      });
    }

    const emailInput = container.querySelector('#auth-email');
    if (emailInput) {
      emailInput.addEventListener('input', (e) => { emailVal = e.target.value; });
    }
    const nameInput = container.querySelector('#auth-name');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => { nameVal = e.target.value; });
    }

    const mainForm = container.querySelector('#auth-main-form');
    if (mainForm) {
      mainForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailVal.trim();
        const password = passwordVal;
        const name = nameVal.trim();

        if (!email || !password) {
          errorMessage = 'Please provide both email and password.';
          render();
          return;
        }

        if (activeTab === 'signup' && password.length < 8) {
          errorMessage = 'Password must be at least 8 characters long.';
          render();
          return;
        }

        isLoading = true;
        errorMessage = '';
        render();

        try {
          if (activeTab === 'signup') {
            await store.registerUser(name || email.split('@')[0], email, password);
          } else {
            await store.loginWithCredentials(email, password);
          }
        } catch (err) {
          isLoading = false;
          errorMessage = err.message || 'Authentication failed. Please verify your credentials.';
          render();
        }
      });
    }

    const forgotLink = container.querySelector('#link-forgot-pw');
    if (forgotLink) {
      forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        const mail = emailVal.trim();
        if (mail) {
          store.showToast(`Password recovery link transmitted to ${mail}. Check your inbox.`, 'info');
        } else {
          store.showToast('Please enter your email in the field first.', 'warning');
          const input = container.querySelector('#auth-email');
          if (input) input.focus();
        }
      });
    }
  }

  render();
}
