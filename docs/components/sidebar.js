// FlakeMonster Docs — Sidebar Component

const NAV_SECTIONS = [
  {
    title: 'Getting Started',
    items: [
      { label: 'Quick Start', href: 'index.html' },
    ],
  },
  {
    title: 'Usage',
    items: [
      { label: 'CLI Reference', href: 'cli-reference.html' },
      { label: 'Configuration', href: 'configuration.html' },
      { label: 'Injection Modes', href: 'injection-modes.html' },
      { label: 'Seed System', href: 'seed-system.html' },
      { label: 'Test Runners', href: 'test-runners.html' },
    ],
  },
  {
    title: 'Integrations',
    items: [
      { label: 'GitHub Action', href: 'github-action.html' },
      { label: 'Agent Skill', href: 'agent-skill.html' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { label: 'How It Works', href: 'how-it-works.html' },
      { label: 'Troubleshooting', href: 'troubleshooting.html' },
    ],
  },
];

function getCurrentPage() {
  var path = location.pathname;
  var filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
  return filename;
}

export function createSidebar() {
  var currentPage = getCurrentPage();
  var aside = document.createElement('aside');
  aside.className = 'docs-sidebar';

  var html = '';
  NAV_SECTIONS.forEach(function (section) {
    html += '<h4>' + section.title + '</h4><ul>';
    section.items.forEach(function (item) {
      var active = item.href === currentPage ? ' class="active"' : '';
      html += '<li><a href="' + item.href + '"' + active + '>' + item.label + '</a>';
      // Placeholder for sub-nav (scroll spy fills this)
      if (item.href === currentPage) {
        html += '<ul class="sub-nav" id="docs-sub-nav"></ul>';
      }
      html += '</li>';
    });
    html += '</ul>';
  });

  aside.innerHTML = html;
  return aside;
}

export function addScrollSpy(sidebar, content) {
  var headings = content.querySelectorAll('h2[id]');
  if (headings.length < 2) return;

  var subNav = sidebar.querySelector('#docs-sub-nav');
  if (!subNav) return;

  // Build sub-nav links
  var html = '';
  headings.forEach(function (h) {
    html += '<li><a href="#' + h.id + '">' + h.textContent + '</a></li>';
  });
  subNav.innerHTML = html;

  var links = subNav.querySelectorAll('a');

  // Click handler — scroll with correct offset and mark active
  subNav.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('href').slice(1);
    var target = document.getElementById(id);
    if (target) {
      var top = target.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: top, behavior: 'smooth' });
      history.replaceState(null, '', '#' + id);
    }
    links.forEach(function (l) { l.classList.remove('active'); });
    a.classList.add('active');
  });

  // Intersection observer for passive scroll tracking
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        links.forEach(function (l) { l.classList.remove('active'); });
        var match = subNav.querySelector('a[href="#' + entry.target.id + '"]');
        if (match) match.classList.add('active');
      }
    });
  }, {
    rootMargin: '-80px 0px -65% 0px',
    threshold: 0,
  });

  headings.forEach(function (h) { observer.observe(h); });
}
