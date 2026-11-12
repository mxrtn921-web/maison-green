// Maison Green — animations de la boutique « street » : apparition au défilement et images flottantes.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = document.querySelectorAll('.sg-reveal');
  if (reduce || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  items.forEach((el) => io.observe(el));
  // Parallaxe douce des images du haut de page (vitesse 0,05 × défilement).
  const floats = [...document.querySelectorAll('[data-parallax]')];
  if (floats.length) {
    let ticking = false;
    const apply = () => { const y = scrollY; floats.forEach((el, i) => { el.style.transform = `translateY(${-y * 0.05 * (1 + i * 0.6)}px)`; }); ticking = false; };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }, { passive: true });
  }
})();
