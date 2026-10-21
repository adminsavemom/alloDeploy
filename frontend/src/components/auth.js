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

  function render() {
    const isSignUp = activeTab === 'signup';

    container.innerHTML = `
      <div class="coolify-auth-container">
        <div class="coolify-auth-card">
          <!-- Brand Logo & Header -->
          <div class="coolify-auth-brand">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="#7c3aed" />
              <path d="M7 8h10M7 12h10M7 16h6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
            </svg>
            <span class="coolify-auth-title">alloDeploy</span>
          </div>

          <div class="coolify-auth-header">
            <h2>${isSignUp ? 'Create an account' : 'Login'}</h2>
            <p>${isSignUp ? 'Enter your details to create your admin account.' : 'Enter your email and password to access your dashboard.'}</p>
          </div>

          <!-- Error Alert Banner -->
          ${errorMessage ? `
            <div class="coolify-auth-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>${errorMessage}</span>
            </div>
          ` : ''}

          <!-- Form -->
          <form id="auth-main-form" autocomplete="on">
            ${isSignUp ? `
              <div class="coolify-form-group">
                <label class="coolify-form-label" for="auth-name">Name</label>
                <input 
                  type="text" 
                  id="auth-name" 
                  class="coolify-form-input" 
                  placeholder="Your Name" 
                  value="${nameVal}" 
                  required 
                  autocomplete="name"
                  ${isLoading ? 'disabled' : ''}
                />
              </div>
            ` : ''}

            <div class="coolify-form-group">
              <label class="coolify-form-label" for="auth-email">Email</label>
              <input 
                type="email" 
                id="auth-email" 
                class="coolify-form-input" 
                placeholder="name@company.com" 
                value="${emailVal}" 
                required 
                autocomplete="email" 
                ${isLoading ? 'disabled' : ''}
              />
            </div>

            <div class="coolify-form-group">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <label class="coolify-form-label" for="auth-password" style="margin-bottom: 0;">Password</label>
                ${!isSignUp ? `
                  <a href="#" id="link-forgot-pw" class="coolify-forgot-link">Forgot password?</a>
                ` : ''}
              </div>
              <div class="coolify-password-wrap">
                <input 
                  type="${showPassword ? 'text' : 'password'}" 
                  id="auth-password" 
                  class="coolify-form-input" 
                  placeholder="••••••••" 
                  value="${passwordVal}" 
                  required 
                  autocomplete="${isSignUp ? 'new-password' : 'current-password'}" 
                  ${isLoading ? 'disabled' : ''}
                />
                <button type="button" class="coolify-pw-toggle" id="toggle-pw-visibility" title="Toggle password visibility">
                  ${showPassword ? icons.eyeOff : icons.eye}
                </button>
              </div>
            </div>

            ${!isSignUp ? `
              <div class="coolify-remember-row">
                <label class="coolify-remember-label">
                  <input type="checkbox" id="auth-remember" checked />
                  <span>Remember me</span>
                </label>
              </div>
            ` : ''}

            <button type="submit" class="coolify-btn-submit" id="btn-submit-main" ${isLoading ? 'disabled' : ''}>
              ${isLoading ? (isSignUp ? 'Creating account...' : 'Logging in...') : (isSignUp ? 'Register' : 'Login')}
            </button>
          </form>

          <!-- Toggle between Login and Register -->
          <div class="coolify-auth-footer">
            ${isSignUp ? `
              <span>Already have an account?</span>
              <a href="#" id="btn-toggle-auth-tab" data-target="signin">Login</a>
            ` : `
              <span>Don't have an account?</span>
              <a href="#" id="btn-toggle-auth-tab" data-target="signup">Register</a>
            `}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const toggleBtn = container.querySelector('#btn-toggle-auth-tab');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = toggleBtn.getAttribute('data-target');
        if (target && target !== activeTab) {
          activeTab = target;
          errorMessage = '';
          render();
        }
      });
    }

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

    const emailInput = container.querySelector('#auth-email');
    if (emailInput) {
      emailInput.addEventListener('input', (e) => { emailVal = e.target.value; });
    }
    const nameInput = container.querySelector('#auth-name');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => { nameVal = e.target.value; });
    }
    const pwInput = container.querySelector('#auth-password');
    if (pwInput) {
      pwInput.addEventListener('input', (e) => { passwordVal = e.target.value; });
    }

    const mainForm = container.querySelector('#auth-main-form');
    if (mainForm) {
      mainForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailVal.trim();
        const password = passwordVal;
        const name = nameVal.trim();

        if (!email || !password) {
          errorMessage = 'Please enter both email and password.';
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
          store.showToast(`Password reset link sent to ${mail}.`, 'info');
        } else {
          store.showToast('Please enter your email address first.', 'warning');
          const input = container.querySelector('#auth-email');
          if (input) input.focus();
        }
      });
    }
  }

  render();
}
