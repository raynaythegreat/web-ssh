document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  const errorMessage = document.getElementById('errorMessage');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const password = passwordInput.value;
    if (!password) return;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Authenticating...';
    errorMessage.style.display = 'none';

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('terminal_token', data.token);
        window.location.href = '/';
      } else {
        errorMessage.textContent = data.error || 'Authentication failed';
        errorMessage.style.display = 'block';
        passwordInput.value = '';
      }
    } catch (error) {
      errorMessage.textContent = 'Connection error. Please try again.';
      errorMessage.style.display = 'block';
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Connect to Terminal';
    }
  });
});