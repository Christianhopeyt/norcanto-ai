/* Norcanto AI - Main JavaScript */
'use strict';

// =====================
// Navigation
// =====================
const initNav = () => {
  const nav = document.getElementById('main-nav');
  const toggle = document.getElementById('mobile-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  const menuIcon = document.getElementById('menu-icon');

  if (!nav) return;

  // Scroll behavior
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const current = window.scrollY;
    nav.classList.toggle('scrolled', current > 20);
    lastScroll = current;
  }, { passive: true });

  // Mobile toggle
  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen);
      menuIcon.innerHTML = isOpen
        ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
        : '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>';
    });
  }

  // Close mobile nav on outside click
  document.addEventListener('click', (e) => {
    if (mobileNav && mobileNav.classList.contains('open') && !nav.contains(e.target) && !mobileNav.contains(e.target)) {
      mobileNav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Active link
  const links = document.querySelectorAll('.nav-link, .nav-mobile-link');
  links.forEach(link => {
    if (link.href && link.href === window.location.href) link.classList.add('active');
  });
};

// =====================
// FAQ Accordion
// =====================
const initFAQ = () => {
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
};

// =====================
// Use Case Tabs
// =====================
const initUsecaseTabs = () => {
  const tabs = document.querySelectorAll('.usecase-tab');
  const contents = document.querySelectorAll('.usecase-panel');
  if (!tabs.length) return;
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      contents.forEach(c => {
        c.style.display = c.dataset.panel === target ? 'block' : 'none';
      });
    });
  });
};

// =====================
// Scroll Animations
// =====================
const initScrollAnimations = () => {
  if (!window.IntersectionObserver) return;
  const els = document.querySelectorAll('[data-animate]');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('animate-fade-up');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
  els.forEach(el => obs.observe(el));
};

// =====================
// Smooth scroll for anchors
// =====================
const initSmoothScroll = () => {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
};

// =====================
// Upload Modal
// =====================
const initUploadModal = () => {
  const overlay = document.getElementById('upload-modal');
  if (!overlay) return;
  const modal = overlay.querySelector('.modal');
  const closeBtn = overlay.querySelector('.modal-close');
  const dropzone = overlay.querySelector('.dropzone');
  const fileInput = document.getElementById('file-input');

  // Open triggers
  document.querySelectorAll('[data-open-upload]').forEach(btn => {
    btn.addEventListener('click', () => overlay.classList.add('open'));
  });

  // Close
  const close = () => overlay.classList.remove('open');
  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Drag & drop
  if (dropzone) {
    dropzone.addEventListener('click', () => fileInput?.click());
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault(); dropzone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length) handleFileUpload(files[0]);
    });
  }

  fileInput?.addEventListener('change', () => {
    if (fileInput.files.length) handleFileUpload(fileInput.files[0]);
  });
};

// =====================
// File Upload Handler
// =====================
const handleFileUpload = (file) => {
  const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
  const maxSize = 20 * 1024 * 1024; // 20MB

  if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|docx|txt)$/i)) {
    showToast('Unsupported file type. Please upload PDF, DOCX, or TXT files.', 'error');
    return;
  }
  if (file.size > maxSize) {
    showToast('File too large. Maximum size is 20MB.', 'error');
    return;
  }

  // Show progress
  const overlay = document.getElementById('upload-modal');
  const dropzone = overlay?.querySelector('.dropzone');
  if (dropzone) {
    dropzone.innerHTML = `
      <div class="upload-progress">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div class="dropzone-icon" style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div>
            <div style="font-size:14px;font-weight:500;color:var(--text-primary)">${file.name}</div>
            <div style="font-size:12px;color:var(--text-muted)">${formatFileSize(file.size)}</div>
          </div>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar" id="upload-progress-bar" style="width:0%"></div></div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:8px" id="upload-status">Uploading...</div>
      </div>
    `;
  }

  // Simulate upload then redirect to analysis
  let progress = 0;
  const bar = document.getElementById('upload-progress-bar');
  const status = document.getElementById('upload-status');
  const interval = setInterval(() => {
    progress += Math.random() * 15 + 5;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      if (bar) bar.style.width = '100%';
      if (status) status.textContent = 'Analyzing document with AI...';
      setTimeout(() => {
        overlay?.classList.remove('open');
        window.location.href = '/pages/analysis.html?doc=' + encodeURIComponent(file.name);
      }, 1200);
    }
    if (bar) bar.style.width = progress + '%';
  }, 120);
};

// =====================
// Toast notifications
// =====================
const showToast = (message, type = 'info') => {
  const existing = document.querySelector('.toast-container');
  if (existing) existing.remove();
  const container = document.createElement('div');
  container.className = 'toast-container';
  container.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;`;
  const icons = {
    success: '<path d="M20 6L9 17l-5-5"/>',
    error: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5"/>'
  };
  const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--info)' };
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;background:var(--brand-charcoal);border:1px solid var(--brand-border);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--text-primary);max-width:320px;box-shadow:var(--shadow-lg);animation:fadeUp 0.3s ease both;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">${icons[type]||icons.info}</svg>
      <span>${message}</span>
    </div>
  `;
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 4000);
};

// =====================
// Utils
// =====================
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// =====================
// Cookie Banner
// =====================
const initCookieBanner = () => {
  if (localStorage.getItem('qd_cookies_accepted')) return;
  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:3000;background:var(--brand-charcoal);border:1px solid var(--brand-border);border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:16px;font-size:13px;color:var(--text-secondary);max-width:600px;width:calc(100% - 32px);box-shadow:var(--shadow-lg);animation:fadeUp 0.4s ease;`;
  banner.innerHTML = `
    <span>We use cookies to improve your experience. <a href="/pages/cookie-policy.html" style="color:var(--text-primary);text-decoration:underline;text-underline-offset:3px;">Learn more</a></span>
    <div style="display:flex;gap:8px;flex-shrink:0;">
      <button onclick="document.getElementById('cookie-banner').remove()" style="padding:6px 14px;border-radius:6px;border:1px solid var(--brand-border);background:transparent;color:var(--text-secondary);font-size:12px;cursor:pointer;">Decline</button>
      <button onclick="localStorage.setItem('qd_cookies_accepted','1');document.getElementById('cookie-banner').remove()" style="padding:6px 14px;border-radius:6px;border:none;background:var(--accent);color:var(--text-inverse);font-size:12px;cursor:pointer;font-weight:500;">Accept</button>
    </div>
  `;
  document.body.appendChild(banner);
};

// =====================
// Init All
// =====================
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFAQ();
  initUsecaseTabs();
  initScrollAnimations();
  initSmoothScroll();
  initUploadModal();
  initCookieBanner();
});
