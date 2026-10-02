// Site-wide behaviour. Bundled by Astro into one cached module instead of being
// inlined into every page.

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ── Theme toggle ──
{
  const toggle = document.getElementById('theme-toggle');
  const label = () =>
    toggle?.setAttribute(
      'aria-label',
      root.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    );
  label();
  toggle?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#15140F' : '#F7F6F1');
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Storage blocked (private mode etc.) — the toggle still works for this page.
    }
    label();
  });
}

// ── Scroll reveal ──
// Classes are only added here, so without JS (or when printing) content is
// simply visible. Long-form prose is deliberately not animated.
if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          observer.unobserve(e.target);
        }
      }
    },
    { threshold: 0.06, rootMargin: '0px 0px -24px 0px' },
  );
  const reveal = (el: HTMLElement, delay = 0) => {
    el.classList.add('reveal');
    if (delay) el.style.transitionDelay = `${delay}ms`;
    observer.observe(el);
  };

  document.querySelectorAll('.post-list, .want-list').forEach((list) => {
    list.querySelectorAll<HTMLElement>(':scope > li').forEach((li, i) => reveal(li, Math.min(i * 45, 180)));
  });
  document.querySelectorAll('.book-grid').forEach((grid) => {
    grid.querySelectorAll<HTMLElement>('.book-card').forEach((card, i) => reveal(card, Math.min(i * 55, 330)));
  });
  document
    .querySelectorAll<HTMLElement>('[data-reveal]:not(.reveal), .section-label, .page-heading')
    .forEach((el) => reveal(el));
}

// ── Mobile nav ──
{
  const btn = document.getElementById('hamburger');
  const nav = document.getElementById('primary-nav');
  const inner = nav?.querySelector<HTMLElement>('.nav-inner');
  const mobile = window.matchMedia('(max-width: 600px)');

  if (btn && nav && inner) {
    const setOpen = (open: boolean) => {
      nav.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      // The collapsed menu is only visually hidden; take its links out of the
      // tab order and accessibility tree too.
      inner.inert = mobile.matches && !open;
    };
    setOpen(false);

    btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    mobile.addEventListener('change', () => setOpen(false));
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target as Node) && !btn.contains(e.target as Node)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        setOpen(false);
        btn.focus();
      }
    });
  }
}

// ── Back to top + reading progress (one rAF-throttled scroll handler) ──
{
  const backBtn = document.getElementById('back-to-top');
  const bar = document.getElementById('read-progress');
  const hasArticle = !!document.getElementById('post-body');
  let queued = false;

  const update = () => {
    queued = false;
    const y = window.scrollY;
    backBtn?.classList.toggle('visible', y > 400);
    if (bar && hasArticle) {
      const max = root.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, y / max) : 1;
      bar.style.transform = `scaleX(${progress})`;
    }
  };
  const schedule = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule);
  update();

  backBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  });
}

// ── Book cover fallback ──
// Swap a cover that fails to load (no OpenLibrary cover, expired URL) for the
// title placeholder rendered next to it.
{
  const showPlaceholder = (img: HTMLImageElement) => {
    img.hidden = true;
    const placeholder = img.nextElementSibling as HTMLElement | null;
    if (placeholder) placeholder.hidden = false;
  };
  document.addEventListener(
    'error',
    (e) => {
      if (e.target instanceof HTMLImageElement && e.target.hasAttribute('data-cover')) {
        showPlaceholder(e.target);
      }
    },
    true,
  );
  // Catch failures that happened before this module ran.
  document.querySelectorAll<HTMLImageElement>('img[data-cover]').forEach((img) => {
    if (img.complete && img.currentSrc && img.naturalWidth === 0) showPlaceholder(img);
  });
}
