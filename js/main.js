/* ─────────────────────────────────────────────────────────────
   TIDEWELL — main.js

   APP_STATUS controls all CTAs site-wide.
   Switch from 'beta' → 'live' when the app launches on the
   App Store. One change, entire site updates automatically.
───────────────────────────────────────────────────────────── */

const APP_STATUS = 'beta'; // 'beta' | 'live'

const APP_CONFIG = {
  beta: {
    ios:         'https://testflight.apple.com/join/XXXXXXXX', // ← replace with your TestFlight public link
    ctaLabel:    'Join via TestFlight',
    ctaBadge:    'Currently in beta — join via TestFlight',
    showAndroid: false,
  },
  live: {
    ios:         'https://apps.apple.com/app/tidewell/id000000000', // ← replace with App Store link
    android:     'https://play.google.com/store/apps/details?id=com.blackbeltcodelabs.tidewell',
    ctaLabel:    'Download on the App Store',
    ctaBadge:    null,
    showAndroid: true,
  },
};

const cfg = APP_CONFIG[APP_STATUS];

/* ── CTA injection ─────────────────────────────────────────── */

function renderCTAs() {
  document.querySelectorAll('[data-cta="ios"]').forEach(el => {
    el.href = cfg.ios;
    const label = el.querySelector('[data-cta-label]');
    if (label) label.textContent = cfg.ctaLabel;
  });

  document.querySelectorAll('[data-cta-badge]').forEach(el => {
    if (cfg.ctaBadge) {
      el.textContent = cfg.ctaBadge;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });

  document.querySelectorAll('[data-cta="android"]').forEach(el => {
    el.style.display = cfg.showAndroid ? '' : 'none';
    if (cfg.showAndroid && cfg.android) el.href = cfg.android;
  });
}

/* ── Navigation ────────────────────────────────────────────── */

function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 20);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  const hamburger = document.querySelector('.nav-hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });

  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ── FAQ accordion ─────────────────────────────────────────── */

function initFAQ() {
  const items = document.querySelectorAll('.faq-item');

  items.forEach(item => {
    const btn = item.querySelector('.faq-q');
    const body = item.querySelector('.faq-a');
    if (!btn || !body) return;

    btn.setAttribute('aria-expanded', 'false');

    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all
      items.forEach(other => {
        other.classList.remove('open');
        const a = other.querySelector('.faq-a');
        if (a) a.style.maxHeight = '0';
        const q = other.querySelector('.faq-q');
        if (q) q.setAttribute('aria-expanded', 'false');
      });

      // Open if it was closed
      if (!isOpen) {
        item.classList.add('open');
        body.style.maxHeight = body.scrollHeight + 'px';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ── Scroll animations ─────────────────────────────────────── */

function initScrollAnimations() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const els = document.querySelectorAll('.fade-in');
  if (!els.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

  els.forEach(el => observer.observe(el));
}

/* ── Sticky screenshot scroll ──────────────────────────────── */

function initStickyScreenshots() {
  const steps   = document.querySelectorAll('.screenshots-step');
  const screens = document.querySelectorAll('.spscreen');
  if (!steps.length || !screens.length) return;

  const activate = (idx) => {
    steps.forEach((s, i)   => s.classList.toggle('active', i === idx));
    screens.forEach((s, i) => s.classList.toggle('active', i === idx));
  };

  activate(0);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    steps.forEach(s => { s.style.opacity = '1'; s.style.transform = 'none'; });
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) activate(Number(e.target.dataset.idx));
    });
  }, { threshold: 0.5 });

  steps.forEach(step => observer.observe(step));
}

/* ── Boot ──────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  renderCTAs();
  initNav();
  initFAQ();
  initScrollAnimations();
  initStickyScreenshots();
});
