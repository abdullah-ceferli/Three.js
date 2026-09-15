export class AuthUI {
  constructor(onAuthenticated) {
    this.onAuthenticated = onAuthenticated;
    this.panel = document.querySelector('#auth');
    this.form = document.querySelector('#auth-form');
    this.title = document.querySelector('#auth-title');
    this.submit = document.querySelector('#auth-submit');
    this.switchButton = document.querySelector('#auth-switch');
    this.confirmRow = document.querySelector('#confirm-row');
    this.error = document.querySelector('#auth-error');
    this.mode = 'login';
    this.form.addEventListener('submit', event => { event.preventDefault(); void this.authenticate(); });
    this.switchButton.addEventListener('click', () => this.setMode(this.mode === 'login' ? 'register' : 'login'));
    document.querySelector('#logout-account')?.addEventListener('click', () => this.logout());
    void this.restore();
  }

  setMode(mode) {
    this.mode = mode;
    const registering = mode === 'register';
    this.title.textContent = registering ? 'Create account' : 'Welcome back';
    this.submit.textContent = registering ? 'Register & play' : 'Login & play';
    this.switchButton.textContent = registering ? 'Already registered? Login' : 'New explorer? Register';
    this.confirmRow.classList.toggle('hidden', !registering);
    document.querySelector('#confirm-password').required = registering;
    this.error.textContent = '';
  }

  async request(path, options = {}) {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Authentication failed.');
    return payload;
  }

  async restore() {
    try {
      const result = await this.request('/api/auth/session');
      this.complete(result.nickname);
    } catch {}
  }

  async authenticate() {
    const username = document.querySelector('#auth-username').value.trim();
    const password = document.querySelector('#auth-password').value;
    const confirmPassword = document.querySelector('#confirm-password').value;
    this.submit.disabled = true; this.error.textContent = '';
    try {
      const result = await this.request(`/api/auth/${this.mode}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, confirmPassword })
      });
      this.form.reset(); this.complete(result.nickname);
    } catch (error) { this.error.textContent = error.message; }
    finally { this.submit.disabled = false; }
  }

  complete(nickname) {
    this.panel.classList.add('hidden');
    document.querySelector('#lobby').classList.remove('hidden');
    document.querySelector('#local-nickname').textContent = nickname;
    this.onAuthenticated({ nickname });
  }

  logout() {
    void fetch('/api/auth/logout', { method: 'POST' }).finally(() => location.reload());
  }
}
