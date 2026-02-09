async function fetchData(url) {
  // Simulated async operation
  return new Promise((resolve) => {
    setTimeout(() => resolve({ url, data: 'ok' }), 1);
  });
}

async function loadDashboard() {
  const user = await fetchData('/user');
  const posts = await fetchData('/posts');
  return { user, posts };
}

export { fetchData, loadDashboard };
