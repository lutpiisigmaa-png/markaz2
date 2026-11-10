/*
 * Markaz At-Ta'allum — Premium Motion Layer
 * Progressive enhancement only: this module decorates rendered UI and never
 * reads or writes LMS records, authentication state, or learning progress.
 */
const REVEAL_SELECTOR = [
  '.dash-top', '.stat-card', '.panel', '.video-card', '.program-card',
  '.package-card', '.schedule-card', '.kta-panel', '.streak-card',
  '.notice-banner', '.subscription-card', '.evaluation-card',
  '.announcement-row', '.feature-card', '.announcement-card',
  '.testi-card', '.roadmap-card', '.learning-card', '.cta-strip',
  '.auth-box', '.auth-side', '.chart-bars', '.leaderboard'
].join(',');

let initialized = false;
let revealObserver = null;
let mutationObserver = null;
let reducedMotion = false;

function isElement(node) {
  return node && node.nodeType === 1 && typeof node.matches === 'function';
}

function animateCounter(element) {
  if (element.dataset.motionCounted) return;
  const raw = element.textContent.trim();
  if (!/^\d[\d,.]*$/.test(raw)) return;
  const target = Number(raw.replace(/[,.]/g, ''));
  if (!Number.isFinite(target) || target <= 0 || target > 1000000) return;

  element.dataset.motionCounted = 'true';
  element.dataset.motionFinal = raw;
  const duration = 720;
  const start = performance.now();
  const format = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  element.textContent = '0';

  const frame = now => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = format.format(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(frame);
    else element.textContent = format.format(target);
  };
  requestAnimationFrame(frame);
}

function animateProgress(element) {
  if (element.dataset.motionProgress) return;
  element.dataset.motionProgress = 'true';
  const target = Number(element.value);
  if (!Number.isFinite(target) || target <= 0) return;
  const max = Number(element.max) || 100;
  const duration = 850;
  const start = performance.now();
  element.value = 0;
  const frame = now => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.value = Math.min(max, target * eased);
    if (progress < 1) requestAnimationFrame(frame);
    else element.value = target;
  };
  requestAnimationFrame(frame);
}

function animateWidth(element) {
  if (element.dataset.motionWidth) return;
  const finalWidth = element.style.width;
  if (!finalWidth || !/%$/.test(finalWidth)) return;
  element.dataset.motionWidth = 'true';
  element.style.width = '0%';
  requestAnimationFrame(() => { element.style.width = finalWidth; });
}

function activate(element) {
  if (!isElement(element)) return;
  element.classList.add('is-visible');
  if (element.matches('.stat-card strong, .streak-count')) animateCounter(element);
  element.querySelectorAll?.('.stat-card strong, .streak-count').forEach(animateCounter);
  element.querySelectorAll?.('progress').forEach(animateProgress);
  element.querySelectorAll?.('.progress span, .chart-fill').forEach(animateWidth);
}

function decorate(container) {
  if (!isElement(container)) return;
  const candidates = [];
  if (container.matches(REVEAL_SELECTOR)) candidates.push(container);
  candidates.push(...container.querySelectorAll(REVEAL_SELECTOR));

  candidates.forEach((element, index) => {
    if (element.dataset.motionReady) return;
    element.dataset.motionReady = 'true';
    element.classList.add('motion-reveal');
    element.style.setProperty('--motion-delay', `${Math.min(index % 5, 4) * 55}ms`);
    if (revealObserver) revealObserver.observe(element);
    else activate(element);
  });
}

export function initMotionEnhancements(root = document.body) {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;
  reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  if (reducedMotion) return;

  document.documentElement.classList.add('motion-ready');
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        activate(entry.target);
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  }

  decorate(root);
  if (root !== document.body) decorate(document.body);

  if ('MutationObserver' in window) {
    mutationObserver = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (isElement(node)) decorate(node);
      }));
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }
}
