/* ─────────────────────────────────────────────────────────────
   TIDEWELL — main.js

   APP_STATUS controls all CTAs site-wide.
   Switch from 'beta' → 'live' when the app launches on the
   App Store. One change, entire site updates automatically.
───────────────────────────────────────────────────────────── */

const APP_STATUS = 'beta'; // 'beta' | 'live'

const APP_CONFIG = {
  beta: {
    ios:             'https://testflight.apple.com/join/XXXXXXXX', // ← replace with your TestFlight public link
    ctaLabel:        'App Store',
    ctaBadge:        'iOS beta · TestFlight invite',
    showAndroid:     true,
    androidDisabled: true,
  },
  live: {
    ios:             'https://apps.apple.com/app/tidewell/id000000000', // ← replace with App Store link
    android:         'https://play.google.com/store/apps/details?id=com.blackbeltcodelabs.tidewell',
    ctaLabel:        'App Store',
    ctaBadge:        null,
    showAndroid:     true,
    androidDisabled: false,
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
      const textEl = el.querySelector('[data-cta-badge-text]');
      if (textEl) textEl.textContent = cfg.ctaBadge;
      else el.textContent = cfg.ctaBadge;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });

  document.querySelectorAll('[data-cta="android"]').forEach(el => {
    el.style.display = cfg.showAndroid ? '' : 'none';
    if (cfg.showAndroid) {
      if (!cfg.androidDisabled && cfg.android) {
        el.href = cfg.android;
        el.removeAttribute('aria-disabled');
      } else {
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('href', '#');
      }
    }
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

/* ── Pricing plan toggle ───────────────────────────────────── */

function initPricingToggle() {
  const tabs = document.querySelectorAll('.plan-tab');
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const plan = tab.dataset.plan;

      tabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });

      document.querySelectorAll('.pp-plan').forEach(el => {
        el.classList.toggle('active', el.dataset.planContent === plan);
      });

      document.querySelectorAll('.pp-features').forEach(el => {
        el.classList.toggle('active', el.dataset.planFeatures === plan);
      });
    });
  });
}

/* ── Shot Cycle Wheel ──────────────────────────────────────── */

function initCycleWheel() {
  const nodes = document.querySelectorAll('.cycle-node');
  if (!nodes.length) return;

  const phases = [
    { name: 'Shot Day',     days: 'Day 0',    label: 'You just dosed',       desc: 'Medication begins absorbing. Take it easy — nausea is common early on.' },
    { name: 'Peak Effect',  days: 'Days 1–2', label: 'Strongest window',     desc: 'GLP-1 is at its peak. Appetite feels very quiet — don\'t fight it.' },
    { name: 'Cruise Phase', days: 'Days 3–4', label: 'Finding your rhythm',  desc: 'Steady suppression. Your best window for building gentle habits.' },
    { name: 'Steady State', days: 'Days 4–5', label: 'Calm middle',          desc: 'Energy and mood often stabilise here. The medication is holding.' },
    { name: 'Wind Down',    days: 'Days 5–6', label: 'Tapering off',         desc: 'Medication level declining. Appetite may gradually return — that\'s normal.' },
    { name: 'Next Shot',    days: 'Day 7',    label: 'Time to redose',       desc: 'Log your injection site, confirm your dose schedule, and reset.' },
  ];

  const center    = document.querySelector('.cycle-center');
  const nameEl    = document.querySelector('.cycle-phase-name');
  const daysEl    = document.querySelector('.cycle-phase-days');
  const labelEl   = document.querySelector('.cycle-phase-label');
  const descEl    = document.querySelector('.cycle-phase-desc');

  let current = 0;
  let timer;

  function activatePhase(idx) {
    nodes.forEach((n, i) => n.classList.toggle('active', i === idx));
    const p = phases[idx];

    if (center) center.classList.add('fading');
    setTimeout(() => {
      if (nameEl)  nameEl.textContent  = p.name;
      if (daysEl)  daysEl.textContent  = p.days;
      if (labelEl) labelEl.textContent = p.label;
      if (descEl)  descEl.textContent  = p.desc;
      if (center) center.classList.remove('fading');
    }, 220);
  }

  function tick() {
    current = (current + 1) % phases.length;
    activatePhase(current);
  }

  activatePhase(0);
  timer = setInterval(tick, 2800);

  nodes.forEach((n, i) => {
    n.addEventListener('click', () => {
      clearInterval(timer);
      current = i;
      activatePhase(i);
      timer = setInterval(tick, 2800);
    });
  });
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
  initPricingToggle();
  initCycleWheel();
  initStickyScreenshots();
});
