// FlakeMonster Docs — Header Component

export function createHeader() {
  const nav = document.createElement('nav');
  nav.className = 'docs-nav';
  nav.innerHTML = `
    <div class="docs-nav-inner">
      <a href="../index.html" class="nav-brand">
        <img src="../website/logo.svg" alt="" class="nav-logo">
        FlakeMonster
      </a>
      <div class="nav-right">
        <button class="theme-toggle" data-theme-toggle aria-label="Toggle dark mode"></button>
      </div>
      <button class="docs-hamburger" aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  `;

  // Theme toggle
  nav.querySelector('[data-theme-toggle]').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  return nav;
}
