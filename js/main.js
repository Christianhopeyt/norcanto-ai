/* Norcanto AI — Main JavaScript */
'use strict';

// ── Navigation ───────────────────────────────────────────────────────────────
const initNav = () => {
  const nav    = document.getElementById('main-nav');
  const toggle = document.getElementById('mobile-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  const menuIcon  = document.getElementById('menu-icon');

  if (!nav) return;

  // Scroll effect
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile toggle
  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      const open = mobileNav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
      if (menuIcon) {
        menuIcon.innerHTML = open
          ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
          : '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>';
      }
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (mobileNav.classList.contains('open') && !nav.contains(e.target) && !mobileNav.contains(e.target)) {
        mobileNav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Active link highlighting
  document.querySelectorAll('.nav-link, .nav-mobile-link').forEach(link => {
    if (link.href && link.href === window.location.href) link.classList.add('active');
  });
};

// ── FAQ Accordion ────────────────────────────────────────────────────────────
const initFAQ = () => {
  document.querySelectorAll('.faq-item').forEach(item => {
    const btn = item.querySelector('.faq-q');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
};

// ── Use-case tabs ────────────────────────────────────────────────────────────
const initUsecaseTabs = () => {
  const tabs = document.querySelectorAll('.usecase-tab');
  if (!tabs.length) return;
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.usecase-panel').forEach(panel => {
        panel.style.display = panel.dataset.panel === target ? 'block' : 'none';
      });
    });
  });
};

// ── Scroll-triggered animations ──────────────────────────────────────────────
const initScrollAnimations = () => {
  if (!window.IntersectionObserver) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('animate-fade-up');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('[data-animate]').forEach(el => obs.observe(el));
};

// ── Smooth scroll for anchor links ───────────────────────────────────────────
const initSmoothScroll = () => {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
};

// ── Upload modal (landing page) ──────────────────────────────────────────────
const initUploadModal = () => {
  const overlay  = document.getElementById('upload-modal');
  if (!overlay) return;
  const closeBtn = overlay.querySelector('.modal-close');
  const dropzone = overlay.querySelector('.dropzone');
  const fileInput = document.getElementById('file-input');

  // Open triggers
  document.querySelectorAll('[data-open-upload]').forEach(btn => {
    btn.addEventListener('click', () => overlay.classList.add('open'));
  });

  const close = () => overlay.classList.remove('open');
  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault(); dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleLandingUpload(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleLandingUpload(fileInput.files[0]);
      fileInput.value = '';
    });
  }
};

const handleLandingUpload = (file) => {
  // File objects cannot be carried safely across a page navigation. Open the
  // dashboard upload workflow immediately so the user can select it there.
  window.location.href = '/pages/app.html?upload=1';
};

// ── Toast ────────────────────────────────────────────────────────────────────
const showToast = (message, type = 'info') => {
  const existing = document.querySelector('.qd-toast');
  if (existing) existing.remove();
  const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--text-muted)' };
  const el = document.createElement('div');
  el.className = 'qd-toast';
  el.style.cssText = [
    'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
    'z-index:9999','background:var(--brand-charcoal)','border:1px solid var(--brand-border)',
    `border-left:3px solid ${colors[type] || colors.info}`,
    'border-radius:10px','padding:12px 18px','font-size:13px','color:var(--text-primary)',
    'max-width:360px','width:calc(100% - 48px)','box-shadow:var(--shadow-lg)',
    'text-align:center','animation:fadeUp 0.3s ease'
  ].join(';');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
};

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFAQ();
  initUsecaseTabs();
  initScrollAnimations();
  initSmoothScroll();
  initUploadModal();
});
