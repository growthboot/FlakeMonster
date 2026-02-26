// FlakeMonster Docs — Footer Component

export function createFooter() {
  var footer = document.createElement('footer');
  footer.className = 'docs-footer';
  footer.innerHTML = `
    <div class="docs-footer-wave">
      <svg class="docs-wave-layer docs-wave-1" viewBox="0 14 2880 74" preserveAspectRatio="none">
        <path d="M0,40 C240,62 480,18 720,40 C960,62 1200,18 1440,40 C1680,62 1920,18 2160,40 C2400,62 2640,18 2880,40 L2880,62 C2640,40 2400,84 2160,62 C1920,40 1680,84 1440,62 C1200,40 960,84 720,62 C480,40 240,84 0,62 Z" fill="var(--accent)" opacity="0.10"/>
      </svg>
      <svg class="docs-wave-layer docs-wave-2" viewBox="0 14 2880 74" preserveAspectRatio="none">
        <path d="M0,46 C160,66 320,26 480,46 C640,66 800,26 960,46 C1120,66 1280,26 1440,46 C1600,66 1760,26 1920,46 C2080,66 2240,26 2400,46 C2560,66 2720,26 2880,46 L2880,64 C2720,44 2560,84 2400,64 C2240,44 2080,84 1920,64 C1760,44 1600,84 1440,64 C1280,44 1120,84 960,64 C800,44 640,84 480,64 C320,44 160,84 0,64 Z" fill="var(--accent)" opacity="0.06"/>
      </svg>
      <svg class="docs-wave-layer docs-wave-3" viewBox="0 14 2880 74" preserveAspectRatio="none">
        <path d="M0,44 C120,60 240,28 360,44 C480,60 600,28 720,44 C840,60 960,28 1080,44 C1200,60 1320,28 1440,44 C1560,60 1680,28 1800,44 C1920,60 2040,28 2160,44 C2280,60 2400,28 2520,44 C2640,60 2760,28 2880,44 L2880,60 C2760,44 2640,76 2520,60 C2400,44 2280,76 2160,60 C2040,44 1920,76 1800,60 C1680,44 1560,76 1440,60 C1320,44 1200,76 1080,60 C960,44 840,76 720,60 C600,44 480,76 360,60 C240,44 120,76 0,60 Z" fill="var(--accent)" opacity="0.04"/>
      </svg>
    </div>

    <div class="docs-footer-inner">
      <div class="docs-footer-brand">
        <img src="../website/logo.svg" alt="FlakeMonster" class="docs-footer-logo">
        <span class="docs-footer-name">FlakeMonster</span>
        <p class="docs-footer-tagline">Surface flaky tests with<br>deterministic async delays</p>
      </div>

      <div class="docs-footer-links">
        <div class="docs-footer-col">
          <h4>Product</h4>
          <ul>
            <li><a href="../index.html">Home</a></li>
            <li><a href="../pricing.html">Pricing</a></li>
            <li><a href="index.html">Documentation</a></li>
          </ul>
        </div>
        <div class="docs-footer-col">
          <h4>Docs</h4>
          <ul>
            <li><a href="getting-started.html">Getting Started</a></li>
            <li><a href="how-it-works.html">How It Works</a></li>
            <li><a href="cli-reference.html">CLI Reference</a></li>
            <li><a href="troubleshooting.html">Troubleshooting</a></li>
          </ul>
        </div>
        <div class="docs-footer-col">
          <h4>Resources</h4>
          <ul>
            <li><a href="github-action.html">GitHub Action</a></li>
            <li><a href="agent-skill.html">Agent Skill</a></li>
            <li><a href="configuration.html">Configuration</a></li>
          </ul>
        </div>
        <div class="docs-footer-col">
          <h4>Community</h4>
          <ul>
            <li><a href="https://github.com/growthboot/FlakeMonster" target="_blank" rel="nofollow noopener">GitHub</a></li>
            <li><a href="https://github.com/growthboot/FlakeMonster/issues" target="_blank" rel="nofollow noopener">Issues</a></li>
            <li><a href="https://www.npmjs.com/package/flake-monster" target="_blank" rel="nofollow noopener">npm</a></li>
          </ul>
        </div>
      </div>
    </div>

    <div class="docs-footer-art">
      <span class="docs-footer-dot" style="--x:12%;--d:3s"></span>
      <span class="docs-footer-dot" style="--x:28%;--d:4.5s"></span>
      <span class="docs-footer-dot" style="--x:45%;--d:2.5s"></span>
      <span class="docs-footer-dot" style="--x:62%;--d:3.8s"></span>
      <span class="docs-footer-dot" style="--x:78%;--d:2.8s"></span>
      <span class="docs-footer-dot" style="--x:90%;--d:4s"></span>
    </div>

    <div class="docs-footer-bottom">
      <span>CLI licensed under MIT</span>
      <span class="docs-footer-sep">&middot;</span>
      <span>Made to catch the bugs that hide</span>
      <span class="docs-footer-sep">&middot;</span>
      <span class="docs-footer-lightning">&zwnj;&#9889;</span>
    </div>
  `;
  return footer;
}
