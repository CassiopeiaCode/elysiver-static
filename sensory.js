(() => {
  const canvas = document.getElementById('sensory-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const label = document.getElementById('sensory-mode');
  const tip = document.getElementById('sensory-tip');
  const sound = document.getElementById('sensory-sound');
  const dots = [...document.querySelectorAll('.sensory-zone')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['#bc914c', '#b78160', '#aa8a71'];
  const names = ['上层 · 弦线', '中层 · 节律', '下层 · 触感'];
  const hints = ['移动指针，轻拨流线', '移动或轻点，让节律共振', '轻推、按住拖拽，松手感受回弹'];
  const pointer = {x: 0, y: 0, tx: 0, ty: 0, active: false, id: null, type: 'mouse'};
  let width, height, bodies = [], ripples = [], grabbed = null;
  let weights = [1, 0, 0], zone = -1, time = 0, last = 0, beat = 0;
  let audio = null, audible = false, lastTone = 0;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function tone(index, strength = 0.05) {
    if (!audible || !audio || audio.state !== 'running' || time - lastTone < 0.12) return;
    lastTone = time;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = [220, 261.63, 293.66, 329.63, 392, 440][index % 6];
    gain.gain.setValueAtTime(strength, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.55);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(); oscillator.stop(audio.currentTime + 0.6);
  }
  sound.addEventListener('click', async () => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      audio ||= new Audio();
      await audio.resume(); audible = !audible;
      sound.textContent = audible ? '声音 · 开' : '声音 · 关';
      sound.setAttribute('aria-pressed', String(audible));
      if (audible) tone(4);
    } catch { sound.textContent = '声音暂不可用'; }
  });
  function resize() {
    release();
    width = Math.max(1, window.innerWidth); height = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pointer.x = pointer.tx = width / 2; pointer.y = pointer.ty = height * 0.2;
    const count = width < 720 ? 10 : 18;
    const cols = width < 720 ? 4 : 6;
    const rows = Math.ceil(count / cols);
    bodies = Array.from({length: count}, (_, i) => {
      const r = Math.min(32 + (i % 4) * 7, width / 9, height / 9);
      return {x: width * (i % cols + 0.5) / cols, y: height * (0.72 + Math.floor(i / cols) / rows * 0.17),
        vx: 0, vy: 0, r, phase: i * 2.4, deformation: 0, dv: 0, angle: 0, touched: false};
    });
    ripples = [];
  }
  function move(e) {
    if (pointer.id !== null && e.pointerId !== pointer.id) return;
    if (e.isPrimary === false) return;
    pointer.type = e.pointerType || 'mouse';
    pointer.active = true; pointer.tx = clamp(e.clientX, 0, width); pointer.ty = clamp(e.clientY, 0, height);
  }
  function release() {
    if (pointer.id !== null && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    pointer.id = null; grabbed = null;
    if (pointer.type === 'touch') pointer.active = false;
    canvas.classList.remove('is-grabbing');
  }
  window.addEventListener('pointermove', move, {passive: true});
  canvas.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || pointer.id !== null) return;
    move(e); pointer.x = pointer.tx; pointer.y = pointer.ty;
    pointer.id = e.pointerId; canvas.setPointerCapture(e.pointerId);
    if (e.clientY / height >= 2 / 3 || zone === 2) {
      grabbed = bodies.reduce((closest, b) => {
        const distance = Math.hypot(b.x - pointer.x, b.y - pointer.y);
        if (distance >= b.r + (pointer.type === 'touch' ? 28 : 14)) return closest;
        return !closest || distance < Math.hypot(closest.x - pointer.x, closest.y - pointer.y) ? b : closest;
      }, null);
      if (grabbed) { canvas.classList.add('is-grabbing'); tone(bodies.indexOf(grabbed));}
    } else if (e.clientY / height >= 1 / 3) pulse();
  });
  function endPointer(e) { if (e.pointerId === pointer.id) release(); }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', () => {grabbed = null; pointer.id = null; if (pointer.type === 'touch') pointer.active = false; canvas.classList.remove('is-grabbing');});
  window.addEventListener('blur', () => {release(); pointer.active = false;});
  document.addEventListener('pointerleave', () => { if (!grabbed) pointer.active = false; });
  function pulse() {
    ripples.push({x: pointer.x, y: pointer.y, r: 8, life: 1});
    if (ripples.length > 12) ripples.shift();
    tone(Math.floor(time * 2) % 6, 0.035);
  }
  function lines(alpha) {
    ctx.globalAlpha = alpha;
    const count = width < 720 ? 26 : 38;
    for (let i = 0; i < count; i++) {
      const base = height * (i + 0.5) / count;
      ctx.beginPath();
      for (let x = -16; x <= width + 16; x += 16) {
        const d = Math.hypot(x - pointer.x, base - pointer.y);
        const influence = pointer.active ? Math.exp(-d * d / 22000) : 0;
        const y = base + Math.sin(x / width * 5 + time * 0.24 + i * 0.045) * 20
          + Math.cos(x / width * 3 - time * 0.16) * 9 + influence * (pointer.y - base) * 0.2;
        if (x === -16) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 5 ? 'rgba(163,125,71,.22)' : 'rgba(163,125,71,.42)';
      ctx.lineWidth = i % 5 ? 0.65 : 1.1; ctx.stroke();
    }
  }
  function contour(b, radius, organic) {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = i / 64 * Math.PI * 2;
      const r = radius * (1 + organic * Math.sin(a * 3 + b.phase) + organic * 0.5 * Math.cos(a * 2 - b.phase));
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function rhythm(alpha, step) {
    ctx.globalAlpha = alpha;
    const count = width < 720 ? 15 : 28, cols = width < 720 ? 3 : 7;
    const rows = Math.ceil(count / cols);
    const beatPhase = (time % 0.78) / 0.78;
    const energy = Math.exp(-beatPhase * 9);
    if (zone === 1 && time - beat > 0.78 && !reduced) {beat = time; pulse();}
    for (let i = 0; i < count; i++) {
      const x = (i % cols + 0.5) / cols * width;
      const y = (Math.floor(i / cols) + 0.5) / rows * height + Math.sin(time * 1.8 + i) * 7;
      const proximity = pointer.active ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / 150) : 0;
      const r = (13 + i % 3 * 5) * (1 + energy * 0.18 + proximity * 0.35);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * 0.35 + i) * 0.2);
      contour({phase: i}, r, 0.1);
      ctx.fillStyle = i % 2 ? 'rgba(188,145,76,.12)' : 'rgba(183,129,96,.14)'; ctx.fill();
      ctx.strokeStyle = 'rgba(163,115,73,.48)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.53, r * 0.36, time * 0.15, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.r += step * 2.3; r.life -= step * 0.012;
      ctx.globalAlpha = alpha * Math.max(0, r.life) * 0.25;
      ctx.strokeStyle = colors[1]; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      if (r.life <= 0) ripples.splice(i, 1);
    }
  }
  function tactile(alpha, step) {
    const physics = reduced ? 0.35 : 1;
    bodies.forEach((b, i) => {
      if (b === grabbed) {
        b.vx += (pointer.tx - b.x) * 0.07 * step; b.vy += (pointer.ty - b.y) * 0.07 * step;
        b.angle = Math.atan2(b.vy, b.vx); b.dv += (Math.min(0.25, Math.hypot(b.vx, b.vy) * 0.012) - b.deformation) * 0.12 * step;
      } else {
        b.vx += Math.cos(time * 0.6 + b.phase) * 0.018 * physics * step;
        // Gravity exceeds the ambient drift, returning released bodies to reach.
        b.vy += (0.18 + Math.sin(time * 0.8 + b.phase) * 0.015 * physics) * step;
        const dx = b.x - pointer.x, dy = b.y - pointer.y, distance = Math.hypot(dx, dy);
        const touch = pointer.active && zone === 2 && distance < b.r + 24;
        if (touch) {
          const force = (1 - distance / (b.r + 24)) * 0.8 * step;
          const angle = distance > 0.001 ? Math.atan2(dy, dx) : b.phase;
          b.vx += Math.cos(angle) * force; b.vy += Math.sin(angle) * force;
          b.angle = angle; b.dv -= force * 0.035;
          if (!b.touched) tone(i, 0.045);
        }
        b.touched = touch; b.dv -= b.deformation * 0.08 * step;
      }
      b.vx *= Math.pow(b === grabbed ? 0.83 : 0.97, step);
      b.vy *= Math.pow(b === grabbed ? 0.83 : 0.97, step);
      b.x += b.vx * step; b.y += b.vy * step;
      b.dv *= Math.pow(0.82, step); b.deformation = clamp(b.deformation + b.dv * step, -0.28, 0.28);
      const left = b.r, right = Math.max(left, width - b.r), top = b.r + 52, bottom = Math.max(top, height - b.r - 16);
      if (b.x < left || b.x > right) {b.x = clamp(b.x, left, right); b.vx *= -0.6; b.dv -= 0.035;}
      if (b.y < top) {b.y = top; b.vy = Math.abs(b.vy) * 0.4; b.dv -= 0.035;}
      if (b.y > bottom) {
        b.y = bottom; b.vy = b.vy > 0.65 ? -b.vy * 0.38 : 0;
        b.vx *= Math.pow(0.86, step); b.dv -= Math.min(0.035, Math.abs(b.vy) * 0.008);
      }
    });
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j], dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy), overlap = a.r + b.r - distance;
      if (overlap <= 0) continue;
      const nx = distance > 0.001 ? dx / distance : 1, ny = distance > 0.001 ? dy / distance : 0;
      const push = overlap * 0.22;
      if (a !== grabbed) {a.x -= nx * push; a.y -= ny * push; a.vx -= nx * 0.06; a.vy -= ny * 0.06;}
      if (b !== grabbed) {b.x += nx * push; b.y += ny * push; b.vx += nx * 0.06; b.vy += ny * 0.06;}
      a.dv -= Math.min(0.008, overlap * 0.0004); b.dv -= Math.min(0.008, overlap * 0.0004);
    }
    bodies.forEach(b => {
      ctx.globalAlpha = alpha; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.scale(1 + b.deformation, 1 / (1 + b.deformation));
      ctx.shadowColor = 'rgba(94,58,16,.12)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
      const g = ctx.createRadialGradient(-b.r * 0.38, -b.r * 0.4, 0, 0, 0, b.r * 1.15);
      g.addColorStop(0, '#fffdf8'); g.addColorStop(0.35, '#ebdcc3'); g.addColorStop(0.8, '#c5ad8d'); g.addColorStop(1, '#a68c70');
      contour(b, b.r, 0.045); ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = 'rgba(130,103,70,.2)'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.rotate(-b.angle); ctx.beginPath(); ctx.ellipse(-b.r * 0.3, -b.r * 0.38, b.r * 0.28, b.r * 0.13, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill(); ctx.restore();
    });
  }
  function frame(now) {
    const dt = Math.min((now - (last || now)) / 1000, 0.035); last = now;
    if (!document.hidden) {
      time += dt * (reduced ? 0.3 : 1); const step = dt * 60;
      const smoothing = 1 - Math.exp(-dt * 12);
      pointer.x += (pointer.tx - pointer.x) * smoothing; pointer.y += (pointer.ty - pointer.y) * smoothing;
      const next = grabbed ? 2 : Math.min(2, Math.floor(pointer.ty / height * 3));
      if (next !== zone) {
        zone = next; label.textContent = names[zone]; tip.textContent = hints[zone];
        dots.forEach((dot, i) => dot.classList.toggle('is-active', i === zone));
      }
      weights = weights.map((v, i) => v + ((i === zone ? 1 : 0) - v) * (1 - Math.exp(-dt * 5)));
      ctx.clearRect(0, 0, width, height);
      if (weights[0] > 0.005) lines(weights[0]);
      if (weights[1] > 0.005) rhythm(weights[1], step);
      if (weights[2] > 0.005) tactile(weights[2], step);
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {last = 0; if (document.hidden) {release(); audio?.suspend();} else if (audible) audio?.resume().catch(() => {});});
  resize(); requestAnimationFrame(frame);
})();
