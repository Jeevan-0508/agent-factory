const ASSET_BASE = new URL('./assets/', import.meta.url);
const ENTITY_ARCHETYPES = [
  ['Architect', 'intelligence'], ['Sage', 'knowledge'], ['Warrior', 'protection'], ['Nature', 'balance'], ['Creator', 'creativity'],
  ['Oracle', 'foresight'], ['Innovator', 'invention'], ['Guardian', 'care'], ['Harmonizer', 'coherence'], ['Explorer', 'discovery']
];
const FOCAL_ENTITIES = [
  { id: 'architect', name: 'Architect', domain: 'intelligence', color: '#f5c66a' },
  { id: 'sage', name: 'Sage', domain: 'knowledge', color: '#8bdfff' },
  { id: 'creator', name: 'Creator', domain: 'creativity', color: '#b78cff' },
  { id: 'guardian', name: 'Guardian', domain: 'protection', color: '#79e4c5' },
  { id: 'explorer', name: 'Explorer', domain: 'exploration', color: '#8da8ff' },
  { id: 'innovator', name: 'Innovator', domain: 'innovation', color: '#ff9a6a' }
];

function asset(file) { return new URL(file, ASSET_BASE).href; }

function createStage(root, catalog) {
  root.innerHTML = `
    <div class="divine-council-backdrop" aria-hidden="true"></div>
    <canvas class="divine-council-canvas" aria-hidden="true"></canvas>
    <div class="divine-council-vignette" aria-hidden="true"></div>
    <div class="divine-council-stage" aria-hidden="true">
      <div class="divine-council-orbit orbit-a"></div>
      <div class="divine-council-platform"></div>
      <div class="divine-entity-constellation">
        ${FOCAL_ENTITIES.map((entity, index) => `<div class="divine-entity-beacon entity-${index + 1}" data-entity="${entity.id}" style="--entity-color:${entity.color}">
          <span class="divine-entity-aura"></span><strong>${entity.name}</strong><small>${entity.domain}</small>
        </div>`).join('')}
      </div>
      <div class="divine-council-insignia" aria-hidden="true"><span>AF</span></div>
    </div>
    <div class="divine-council-copy">
      <p class="divine-council-kicker" data-copy="kicker">AGENT//FACTORY</p>
      <h1 data-copy="title">THE COUNCIL OF ENTITIES</h1>
      <p class="divine-council-subtitle" data-copy="subtitle">100 identities. One collective intelligence.</p>
      <p class="divine-council-reading-rule">Fictional archetypes are creative labels, not catalog roles, capability claims, or representations of living traditions.</p>
      <p class="divine-council-status" data-copy="status" aria-live="polite">Awakening the entity constellation…</p>
    </div>
    <div class="divine-council-fallback" hidden>
      <img src="${asset('council-clean.webp')}" alt="Fictional Council of Entities celestial chamber">
      <div><strong>WebGL unavailable.</strong><span>The Council of Entities remains available as an accessible visual chamber.</span></div>
    </div>
  `;
}

function createWebGL(canvas, lowPower = false, reducedMotion = false) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: lowPower ? 'low-power' : 'high-performance' });
  if (!gl) return null;
  const vertex = `
    attribute vec3 a_position;
    attribute vec3 a_color;
    attribute float a_size;
    uniform float u_time;
    uniform float u_zoom;
    uniform float u_rotation;
    uniform vec2 u_resolution;
    varying vec3 v_color;
    varying float v_alpha;
    void main() {
      float c = cos(u_rotation + u_time * 0.025);
      float s = sin(u_rotation + u_time * 0.025);
      vec3 p = vec3(c * a_position.x - s * a_position.z, a_position.y, s * a_position.x + c * a_position.z);
      float depth = max(1.0, 7.2 - p.z);
      float perspective = u_zoom / depth;
      gl_Position = vec4(p.x * perspective, p.y * perspective, p.z / 12.0, 1.0);
      gl_PointSize = a_size * (u_resolution.y / 900.0) * perspective;
      v_color = a_color;
      v_alpha = clamp(1.2 - (depth / 8.2), .14, 1.0);
    }
  `;
  const fragment = `
    precision mediump float;
    varying vec3 v_color;
    varying float v_alpha;
    void main() {
      vec2 point = gl_PointCoord - vec2(.5);
      float glow = smoothstep(.5, .02, length(point));
      gl_FragColor = vec4(v_color, glow * v_alpha);
    }
  `;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const program = gl.createProgram();
  const vertexShader = compile(gl.VERTEX_SHADER, vertex);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vertexShader || !fragmentShader) return null;
  gl.attachShader(program, vertexShader); gl.attachShader(program, fragmentShader); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const particles = [];
  const count = lowPower ? 360 : 880;
  for (let i = 0; i < count; i += 1) {
    const radius = 3.2 + Math.random() * 7.2;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - .5) * 5.8;
    const hue = i % 5 === 0 ? [1, .72, .28] : i % 3 === 0 ? [.42, .55, 1] : [.68, .45, 1];
    particles.push(radius * Math.cos(angle), height, radius * Math.sin(angle), ...hue, .8 + Math.random() * 2.4);
  }
  const rings = [];
  for (const [radius, y, color] of [[2.7, -.84, [1, .65, .2]]]) {
    for (let i = 0; i <= 128; i += 1) {
      const angle = (i / 128) * Math.PI * 2;
      rings.push(radius * Math.cos(angle), y, radius * Math.sin(angle), ...color, .04);
    }
  }
  const buffer = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); return b; };
  const particleBuffer = buffer(particles); const ringBuffer = buffer(rings);
  const position = gl.getAttribLocation(program, 'a_position'); const color = gl.getAttribLocation(program, 'a_color'); const size = gl.getAttribLocation(program, 'a_size');
  const time = gl.getUniformLocation(program, 'u_time'); const zoom = gl.getUniformLocation(program, 'u_zoom'); const rotation = gl.getUniformLocation(program, 'u_rotation'); const resolution = gl.getUniformLocation(program, 'u_resolution');
  let frame = 0; let rotationValue = 0; let zoomValue = 1.35; let running = !reducedMotion;
  const draw = (now = 0) => {
    const width = Math.max(1, Math.floor(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
    const height = Math.max(1, Math.floor(canvas.clientHeight * Math.min(window.devicePixelRatio || 1, 2)));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.uniform1f(time, now / 1000); gl.uniform1f(zoom, zoomValue); gl.uniform1f(rotation, rotationValue); gl.uniform2f(resolution, width, height);
    const renderBuffer = (source, mode, countValue, offset = 0) => { gl.bindBuffer(gl.ARRAY_BUFFER, source); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 28, 12); gl.enableVertexAttribArray(color); gl.vertexAttribPointer(size, 1, gl.FLOAT, false, 28, 24); gl.enableVertexAttribArray(size); gl.drawArrays(mode, offset, countValue); };
    renderBuffer(particleBuffer, gl.POINTS, count); renderBuffer(ringBuffer, gl.LINE_STRIP, 129, 0);
    if (running) frame = requestAnimationFrame(draw);
  };
  draw(0);
  return { draw, stop: () => { running = false; cancelAnimationFrame(frame); }, setRotation: (value) => { rotationValue = Number(value) || 0; if (!running) draw(performance.now()); }, setZoom: (value) => { zoomValue = Number(value) || 1.35; if (!running) draw(performance.now()); } };
}

export function mountDivineCouncil({ onEnterFactory, catalog } = {}) {
  const existing = document.querySelector('#divine-council-overlay');
  if (existing?.__divineCouncil) { existing.__divineCouncil.open(); return existing.__divineCouncil; }
  const root = document.createElement('section');
  root.id = 'divine-council-overlay'; root.className = 'divine-council-overlay'; root.dataset.council = 'entities'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Agent Factory Council of Entities opening');
  createStage(root, catalog);
  const entityRibbon = document.createElement('div'); entityRibbon.className = 'divine-entity-ribbon'; entityRibbon.setAttribute('aria-label', 'Fictional entity archetypes');
  ENTITY_ARCHETYPES.forEach(([name, domain]) => { const chip = document.createElement('span'); chip.textContent = `${name} · ${domain}`; entityRibbon.append(chip); });
  root.append(entityRibbon);
  document.body.append(root);
  const canvas = root.querySelector('.divine-council-canvas'); const status = root.querySelector('[data-copy="status"]'); const title = root.querySelector('[data-copy="title"]'); const subtitle = root.querySelector('[data-copy="subtitle"]');
  const skip = document.createElement('button'); skip.className = 'divine-council-skip'; skip.type = 'button'; skip.textContent = 'Skip intro'; root.append(skip);
  const toolbar = document.createElement('div'); toolbar.className = 'divine-council-toolbar'; toolbar.innerHTML = '<button type="button" data-control="sound">Sound: muted</button><button type="button" data-control="replay" hidden>Replay opening</button><label>Orbit <input data-control="rotation" type="range" min="-1" max="1" step=".01" value="0" aria-label="Rotate council chamber"></label><label>Zoom <input data-control="zoom" type="range" min=".9" max="1.9" step=".01" value="1.35" aria-label="Zoom council chamber"></label>'; root.append(toolbar);
  const enter = document.createElement('button'); enter.className = 'divine-council-enter'; enter.type = 'button'; enter.textContent = 'ENTER THE FACTORY'; root.append(enter);
  const close = () => { localStorage.setItem('agent-factory-divine-council-seen', 'true'); api.destroy(); onEnterFactory?.(); };
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const configuredTimeline = Number(window.__DIVINE_COUNCIL_TIMELINE_MS__);
  const timelineMs = configuredTimeline > 0 ? configuredTimeline : 23000;
  const lowPower = Boolean(navigator.connection?.saveData || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
  const webgl = createWebGL(canvas, lowPower, reducedMotion);
  if (!webgl) { root.classList.add('is-fallback'); root.querySelector('.divine-council-fallback').hidden = false; }
  const api = {
    open() { root.hidden = false; document.body.classList.add('divine-council-open'); start(); },
    destroy() { webgl?.stop(); audio?.stop(); root.remove(); document.body.classList.remove('divine-council-open'); },
    replay() { start(true); }
  };
  root.__divineCouncil = api;
  let timer = 0; let started = 0; let audio = null; let chamber = false;
  const setScene = (scene) => { root.dataset.scene = scene; };
  const sceneCopy = (scene) => {
    const copy = {
      awakening: { kicker: 'AGENT//FACTORY', title: 'THE VOID OPENS', subtitle: '', status: 'Drawing a path through the nebula…' },
      approach: { kicker: 'AGENT//FACTORY', title: 'THE OBSERVATORY', subtitle: '', status: 'Approaching the entity chamber…' },
      closeups: { kicker: '', title: '', subtitle: '', status: 'The entity signals emerge…' },
      assembly: { kicker: 'THE COUNCIL OF ENTITIES', title: '', subtitle: '', status: 'The ensemble converges around governed human work.' },
      convergence: { kicker: 'CONVERGENCE', title: '', subtitle: '', status: 'Signals converge on a common insignia…' },
      title: { kicker: 'THE COUNCIL OF ENTITIES', title: 'AGENT//FACTORY', subtitle: 'THE COUNCIL OF ENTITIES · 100 identities. One collective intelligence.', status: 'The chamber is ready.' },
      chamber: { kicker: 'THE COUNCIL OF ENTITIES', title: 'AGENT//FACTORY', subtitle: 'Fictional ensemble — inspect the catalog for actual role contracts.', status: 'Interactive chamber · ready to enter' }
    }[scene];
    root.querySelector('[data-copy="kicker"]').textContent = copy.kicker; title.textContent = copy.title; subtitle.textContent = copy.subtitle; status.textContent = copy.status;
  };
  const showChamber = () => { chamber = true; window.clearTimeout(timer); localStorage.setItem('agent-factory-divine-council-seen', 'true'); setScene('chamber'); sceneCopy('chamber'); root.querySelector('[data-control="replay"]').hidden = false; skip.textContent = 'Close chamber'; skip.onclick = close; enter.hidden = false; };
  const tick = (now) => {
    if (chamber) return;
    const elapsed = reducedMotion ? timelineMs : now - started;
    const progress = Math.min(1, elapsed / timelineMs); root.style.setProperty('--scene-progress', String(progress));
    if (progress >= 1) {
      if (reducedMotion) { showChamber(); return; }
      if (root.dataset.scene !== 'title') {
        setScene('title'); sceneCopy('title');
        timer = window.setTimeout(showChamber, reducedMotion ? 0 : 1300);
      }
      return;
    }
    const scene = progress < 4 / 23 ? 'awakening' : progress < 8 / 23 ? 'approach' : progress < 14 / 23 ? 'closeups' : progress < 19 / 23 ? 'assembly' : 'convergence';
    if (root.dataset.scene !== scene) { setScene(scene); sceneCopy(scene); }
    timer = window.setTimeout(() => tick(performance.now()), reducedMotion ? 0 : 100);
  };
  const start = (isReplay = false) => { chamber = false; root.querySelector('[data-control="replay"]').hidden = true; skip.textContent = 'Skip intro'; skip.onclick = showChamber; enter.hidden = true; started = performance.now(); setScene('awakening'); sceneCopy('awakening'); tick(started); };
  skip.onclick = showChamber; enter.onclick = close;
  root.querySelector('[data-control="replay"]').onclick = () => start(true);
  root.querySelector('[data-control="rotation"]').oninput = (event) => { root.style.setProperty('--orbit-x', `${event.target.value}turn`); webgl?.setRotation(Number(event.target.value) * Math.PI); };
  root.querySelector('[data-control="zoom"]').oninput = (event) => { root.style.setProperty('--orbit-scale', event.target.value); webgl?.setZoom(Number(event.target.value)); };
  root.querySelector('[data-control="sound"]').onclick = (event) => {
    if (audio) { audio.stop(); audio = null; event.currentTarget.textContent = 'Sound: muted'; return; }
    try { const context = new AudioContext(); const gain = context.createGain(); gain.gain.value = .018; gain.connect(context.destination); const a = context.createOscillator(); const b = context.createOscillator(); a.type = 'sine'; b.type = 'triangle'; a.frequency.value = 110; b.frequency.value = 164.81; a.connect(gain); b.connect(gain); a.start(); b.start(); audio = { stop: () => { a.stop(); b.stop(); context.close(); } }; event.currentTarget.textContent = 'Sound: on'; } catch { event.currentTarget.textContent = 'Sound: unavailable'; }
  };
  api.open();
  return api;
}
