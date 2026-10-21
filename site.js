const btn = document.querySelector('.menu-btn'), links = document.getElementById('navlinks');
  btn.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  links.addEventListener('click', e => { if (e.target.tagName === 'A') { links.classList.remove('open'); btn.setAttribute('aria-expanded', false); } });

  // Quote form: sends to /api/quote (Amazon SES). If the API can't be reached, fall back to the visitor's email app.
  const form = document.getElementById('quote');
  if (form) {
    const loadedAt = Date.now();
    const status = document.getElementById('form-status');
    const submit = form.querySelector('button[type="submit"]');
    const field = name => form.elements[name];
    const flag = (els, msg) => {
      els.forEach(el => el.setAttribute('aria-invalid', 'true'));
      status.textContent = msg;
      els[0].focus();
    };
    const mailtoFallback = d => {
      const body = `Name: ${d.name}
Email: ${d.email}
Phone: ${d.phone}
Tow vehicle: ${d.tow}
Trailer weight: ${d.weight}
Delivery ZIP/postal code: ${d.zip}
Address type: ${d.addr}

${d.message}`;
      location.href = `mailto:trailertoad1@yahoo.com?subject=${encodeURIComponent('Trailer Toad question from ' + d.name)}&body=${encodeURIComponent(body)}`;
      status.textContent = 'We couldn’t send the form, so we opened your email app instead. You can also call or text (319) 404-7001.';
    };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (submit.disabled) return;
      form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
      const d = Object.fromEntries(new FormData(form));
      for (const k in d) d[k] = d[k].trim();

      if (!d.name) return flag([field('name')], 'Please add your name.');
      if (!d.email && !d.phone) return flag([field('email'), field('phone')], 'Please add an email or phone number so we can reach you.');
      if (d.email && !field('email').checkValidity()) return flag([field('email')], 'That email address doesn’t look right.');
      if (!d.message) return flag([field('message')], 'Please add a short note about what you tow.');

      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      status.textContent = 'Sending…';
      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...d, elapsed: Date.now() - loadedAt }),
        });
        const out = await res.json().catch(() => ({}));
        if (res.ok) {
          form.reset();
          status.textContent = d.email
            ? 'Thanks! Your request is on its way. We sent a confirmation to your email.'
            : 'Thanks! Your request is on its way. We’ll call or text you back.';
        } else if (res.status === 400 && out.field && field(out.field)) {
          flag([field(out.field)], out.error);
        } else if (res.status === 429) {
          status.textContent = out.error;
        } else {
          mailtoFallback(d);
        }
      } catch {
        mailtoFallback(d);
      } finally {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
    });
  }

// Photo labels: descriptions show on hover (mouse) or keyboard focus via CSS. Touch screens have
// no hover, so there a tap opens the description and a tap elsewhere or Escape closes it.
const spots = document.querySelectorAll('.hotspot');
const closeSpots = () => spots.forEach(h => h.classList.remove('open'));
if (!matchMedia('(hover: hover)').matches) {
  spots.forEach(h => h.querySelector('button').addEventListener('click', () => {
    const open = !h.classList.contains('open');
    closeSpots();
    if (open) h.classList.add('open');
  }));
  document.addEventListener('click', e => { if (!e.target.closest('.hotspot')) closeSpots(); });
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeSpots();
  if (document.activeElement && document.activeElement.closest('.hotspot')) document.activeElement.blur();
});

// Hero video: loop a 10-second stretch, honour reduced motion, and offer pause/play.
// The <video> has autoplay+muted so the browser starts it on its own; this script only sets the
// loop range, keeps the button in sync and never relies on catching a one-time load event.
const bg = document.querySelector('.bg-video');
if (bg) {
  // the full clip loops data-start..data-end; the trimmed Docker build ships just that stretch, so loop all of it
  let start = +bg.dataset.start, end = +bg.dataset.end;
  const toggle = document.querySelector('.video-toggle');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let userPaused = still;

  const syncButton = () => {
    toggle.setAttribute('aria-pressed', bg.paused);
    toggle.setAttribute('aria-label', bg.paused ? 'Play background video' : 'Pause background video');
  };
  const tryPlay = () => { if (!userPaused) bg.play().catch(() => {}); };
  const init = () => {
    if (bg.duration < end) { start = 0; end = bg.duration - 0.05; }
    if (bg.currentTime < start || bg.currentTime >= end) bg.currentTime = start;
    if (still) bg.pause(); else tryPlay();
    syncButton();
  };

  // run now if the video is already loaded, otherwise as soon as it is
  if (bg.readyState >= 1) init(); else bg.addEventListener('loadedmetadata', init, { once: true });
  bg.addEventListener('canplay', tryPlay);
  bg.addEventListener('play', syncButton);
  bg.addEventListener('pause', syncButton);
  bg.addEventListener('timeupdate', () => {
    if (bg.currentTime >= end || bg.currentTime < start - 1) { bg.currentTime = start; tryPlay(); }
  });
  toggle.addEventListener('click', () => {
    userPaused = !bg.paused;
    if (userPaused) bg.pause(); else bg.play().catch(() => {});
  });
  // a tab opened in the background may hold autoplay; start once it's visible unless paused on purpose
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tryPlay(); });
}
