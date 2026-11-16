(() => {
  const canvas = document.getElementById('sensory-canvas');
  const tip = document.getElementById('sensory-tip');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
  const inks = ['#932bff', '#26dfff', '#365bff', '#ffbf32'].map(hex);
  let fluid;
  const fallback = () => {
    document.documentElement.classList.add('no-fluid');
    canvas.style.display = 'none';
    tip.textContent = '白紫流墨';
  };
  if (reduced.matches) { fallback(); return; }
  try { fluid = window.Fluid(canvas); } catch (error) { console.warn('Fluid background unavailable', error); }
  if (!fluid) { fallback(); return; }
  fluid.setPalette({bg: hex('#fcfaff'), inks, light: 1});
  // Match the reference: advance the palette on meaningful pointer movement.
  let hue = 0;
  const pick = () => inks[(hue = (hue + 1) % (inks.length * 40)) / 40 | 0];
  let previous = null;
  let pending = null;
  let frame = null;
  const interactive = target => target.closest?.('a, button, input, textarea, select, [data-egg], #elys-brand, #mc-player-panel');
  window.addEventListener('pointermove', event => {
    if (event.isPrimary === false || interactive(event.target)) { previous = null; return; }
    const point = {x: event.clientX / innerWidth, y: 1 - event.clientY / innerHeight};
    if (previous) {
      const dx = point.x - previous.x, dy = point.y - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.0005) {
        pending = { ...point, dx: dx + (pending?.dx || 0), dy: dy + (pending?.dy || 0), color: pick() };
        if (frame === null) frame = requestAnimationFrame(() => {
          frame = null;
          const move = pending; pending = null;
          if (move) fluid.move(move.x, move.y, move.dx, move.dy, move.color);
        });
      }
    }
    previous = point;
  }, {passive: true});
  window.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || event.button !== 0 || interactive(event.target)) return;
    fluid.burst(event.clientX / innerWidth, 1 - event.clientY / innerHeight, [...inks].sort(() => Math.random() - 0.5));
  }, {passive: true});
  const reset = () => {
    previous = pending = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  document.addEventListener('pointerleave', reset);
  window.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') reset(); });
  window.addEventListener('pointercancel', reset);
  window.addEventListener('blur', reset);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(); });
  reduced.addEventListener('change', () => location.reload());
})();
