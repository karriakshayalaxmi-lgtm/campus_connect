(() => {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  window.CAMPUS_API_BASE_URL = isLocal
    ? 'http://127.0.0.1:5000'
    : localStorage.getItem('quadpulse-api-url') || '';
})();