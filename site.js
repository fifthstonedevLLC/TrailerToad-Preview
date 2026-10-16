const btn = document.querySelector('.menu-btn'), links = document.getElementById('navlinks');
  btn.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  links.addEventListener('click', e => { if (e.target.tagName === 'A') { links.classList.remove('open'); btn.setAttribute('aria-expanded', false); } });

  // No backend yet: compose an email to Jok from the form.
  document.getElementById('quote')?.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, status = document.getElementById('form-status');
    const missing = [...f.querySelectorAll('[required]')].filter(el => !el.value.trim());
    f.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    if (missing.length) {
      missing.forEach(el => el.setAttribute('aria-invalid', 'true'));
      status.textContent = 'Please add your name and a short note about what you tow.';
      missing[0].focus();
      return;
    }
    const d = new FormData(f);
    const body = `Name: ${d.get('name')}\nPhone: ${d.get('phone')}\nTow vehicle: ${d.get('tow')}\nTrailer weight: ${d.get('weight')}\nDelivery ZIP/postal code: ${d.get('zip')}\nAddress type: ${d.get('addr')}\n\n${d.get('message')}`;
    location.href = `mailto:trailertoad1@yahoo.com?subject=${encodeURIComponent('Trailer Toad question from ' + d.get('name'))}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Opening your email app. If nothing happens, call or text (319) 404-7001.';
  });

// Photo labels: click to show the description, click elsewhere or press Escape to close.
const spots = document.querySelectorAll('.hotspot');
const closeSpots = () => spots.forEach(h => { h.classList.remove('open'); h.querySelector('button').setAttribute('aria-expanded', 'false'); });
spots.forEach(h => {
  const b = h.querySelector('button');
  b.addEventListener('click', () => {
    const open = !h.classList.contains('open');
    closeSpots();
    if (open) { h.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
  });
});
document.addEventListener('click', e => { if (!e.target.closest('.hotspot')) closeSpots(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.hotspot.open button');
  closeSpots();
  open?.focus();
});

// Hero video: loop a 10-second stretch, honour reduced motion, and offer pause/play.
const bg = document.querySelector('.bg-video');
if (bg) {
  const start = +bg.dataset.start, end = +bg.dataset.end;
  const toggle = document.querySelector('.video-toggle');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setPaused = paused => {
    toggle.setAttribute('aria-pressed', paused);
    toggle.setAttribute('aria-label', paused ? 'Play background video' : 'Pause background video');
  };
  bg.addEventListener('loadedmetadata', () => {
    bg.currentTime = start;
    if (still) setPaused(true); else bg.play().catch(() => setPaused(true));
  });
  let userPaused = still;
  bg.addEventListener('timeupdate', () => {
    if (bg.currentTime >= end || bg.currentTime < start - 1) {
      bg.currentTime = start;
      if (!userPaused) bg.play().catch(() => {});
    }
  });
  toggle.addEventListener('click', () => {
    userPaused = !bg.paused;
    if (bg.paused) { bg.play(); setPaused(false); } else { bg.pause(); setPaused(true); }
  });
  // a tab opened in the background may block autoplay; start once it's visible unless paused on purpose
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && bg.paused && !userPaused) bg.play().then(() => setPaused(false)).catch(() => {});
  });
}
