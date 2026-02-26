// FlakeMonster Docs — Layout Orchestrator

import { createHeader } from './header.js';
import { createSidebar, addScrollSpy } from './sidebar.js';
import { createFooter } from './footer.js';

document.addEventListener('DOMContentLoaded', function () {
  var content = document.getElementById('doc-content');
  if (!content) return;

  // Create header and prepend to body
  var header = createHeader();
  document.body.prepend(header);

  // Create layout wrapper
  var layout = document.createElement('div');
  layout.className = 'docs-layout';

  // Create sidebar
  var sidebar = createSidebar();

  // Create backdrop for mobile
  var backdrop = document.createElement('div');
  backdrop.className = 'docs-backdrop';
  document.body.appendChild(backdrop);

  // Restructure DOM
  content.parentNode.insertBefore(layout, content);
  layout.appendChild(sidebar);
  layout.appendChild(content);

  // Wrap existing content in a flex-grow container so footer sticks to bottom
  var contentBody = document.createElement('div');
  contentBody.className = 'docs-content-body';
  while (content.firstChild) {
    contentBody.appendChild(content.firstChild);
  }
  content.appendChild(contentBody);

  // Add footer after content body (pushed to bottom by flexbox)
  var footer = createFooter();
  content.appendChild(footer);

  // Scroll spy
  addScrollSpy(sidebar, content);

  // Mobile hamburger
  var hamburger = header.querySelector('.docs-hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', function () {
      var isOpen = sidebar.classList.toggle('sidebar-open');
      hamburger.classList.toggle('open', isOpen);
      backdrop.classList.toggle('visible', isOpen);
    });

    backdrop.addEventListener('click', function () {
      sidebar.classList.remove('sidebar-open');
      hamburger.classList.remove('open');
      backdrop.classList.remove('visible');
    });

    // Close sidebar when a link is clicked (mobile)
    sidebar.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        sidebar.classList.remove('sidebar-open');
        hamburger.classList.remove('open');
        backdrop.classList.remove('visible');
      }
    });
  }
});
