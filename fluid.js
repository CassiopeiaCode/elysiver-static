// Fluid background adapted from https://www.drleaves.icu/fluid.js
// 墨水流体:WebGL2 稳定流体(stable fluids)+ 光影(fx 0 方向光 / 1 体积光 / 2 光追式软阴影+AO)+ 辉光
// 用法:const f = Fluid(canvas); f.setPalette({bg, inks, light}); f.splat(x, y, dx, dy, rgb); f.burst(x, y)
window.Fluid = function (canvas) {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;

  const CFG = { sim: 128, dye: innerWidth < 720 ? 512 : 1024, densityDiss: 0.9, velocityDiss: 0.25, pressure: 0.8, iters: 20, curl: 28, radius: 0.22, force: 6000 };

  // ---------- shaders ----------
  const VS = `#version 300 es
  in vec2 aPos; uniform vec2 texel; out vec2 vUv, vL, vR, vT, vB;
  void main(){ vUv=aPos*.5+.5; vL=vUv-vec2(texel.x,0.); vR=vUv+vec2(texel.x,0.); vT=vUv+vec2(0.,texel.y); vB=vUv-vec2(0.,texel.y); gl_Position=vec4(aPos,0.,1.); }`;
  const HEAD = `#version 300 es
  precision highp float; precision highp sampler2D; in vec2 vUv, vL, vR, vT, vB; out vec4 o;\n`;
  const FS = {
    splat: `uniform sampler2D uTarget; uniform float aspect, radius; uniform vec3 color; uniform vec2 point;
      void main(){ vec2 p=vUv-point; p.x*=aspect; vec3 s=exp(-dot(p,p)/radius)*color; o=vec4(texture(uTarget,vUv).xyz+s,1.); }`,
    advect: `uniform sampler2D uVelocity, uSource; uniform vec2 simTexel; uniform float dt, diss;
      void main(){ vec2 c=vUv-dt*texture(uVelocity,vUv).xy*simTexel; o=texture(uSource,c)/(1.+diss*dt); }`,
    divergence: `uniform sampler2D uVelocity;
      void main(){ float L=texture(uVelocity,vL).x, R=texture(uVelocity,vR).x, T=texture(uVelocity,vT).y, B=texture(uVelocity,vB).y;
        vec2 C=texture(uVelocity,vUv).xy; if(vL.x<0.)L=-C.x; if(vR.x>1.)R=-C.x; if(vT.y>1.)T=-C.y; if(vB.y<0.)B=-C.y;
        o=vec4(.5*(R-L+T-B),0.,0.,1.); }`,
    curl: `uniform sampler2D uVelocity;
      void main(){ float L=texture(uVelocity,vL).y, R=texture(uVelocity,vR).y, T=texture(uVelocity,vT).x, B=texture(uVelocity,vB).x;
        o=vec4(.5*(R-L-T+B),0.,0.,1.); }`,
    vorticity: `uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
      void main(){ float L=texture(uCurl,vL).x, R=texture(uCurl,vR).x, T=texture(uCurl,vT).x, B=texture(uCurl,vB).x, C=texture(uCurl,vUv).x;
        vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L)); f/=length(f)+1e-4; f*=curl*C; f.y*=-1.;
        o=vec4(clamp(texture(uVelocity,vUv).xy+f*dt,-1000.,1000.),0.,1.); }`,
    pressure: `uniform sampler2D uPressure, uDivergence;
      void main(){ float L=texture(uPressure,vL).x, R=texture(uPressure,vR).x, T=texture(uPressure,vT).x, B=texture(uPressure,vB).x;
        o=vec4((L+R+B+T-texture(uDivergence,vUv).x)*.25,0.,0.,1.); }`,
    gradient: `uniform sampler2D uPressure, uVelocity;
      void main(){ float L=texture(uPressure,vL).x, R=texture(uPressure,vR).x, T=texture(uPressure,vT).x, B=texture(uPressure,vB).x;
        o=vec4(texture(uVelocity,vUv).xy-vec2(R-L,T-B),0.,1.); }`,
    scale: `uniform sampler2D uTexture; uniform float value; void main(){ o=value*texture(uTexture,vUv); }`,
    prefilter: `uniform sampler2D uTexture; uniform vec3 curve; uniform float threshold;
      void main(){ vec3 c=texture(uTexture,vUv).rgb; float br=max(c.r,max(c.g,c.b));
        float rq=clamp(br-curve.x,0.,curve.y); rq=curve.z*rq*rq; o=vec4(c*max(rq,br-threshold)/max(br,1e-4),1.); }`,
    blur: `uniform sampler2D uTexture; uniform vec2 dir;
      void main(){ vec3 s=texture(uTexture,vUv).rgb*.227;
        s+=(texture(uTexture,vUv+dir*1.385)+texture(uTexture,vUv-dir*1.385)).rgb*.316;
        s+=(texture(uTexture,vUv+dir*3.231)+texture(uTexture,vUv-dir*3.231)).rgb*.070; o=vec4(s,1.); }`,
    // 体积光:从像素朝光源步进,累积“光盘被墨水遮挡后”的散射 + 墨水自发光的拖尾(GPU Gems 3 crepuscular rays 的变体)
    rays: `uniform sampler2D uTexture; uniform vec3 L, lcol; uniform float aspect;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      float H(vec2 uv){ return 1.-exp(-2.2*length(texture(uTexture,uv).rgb)); }
      void main(){
        const int N=48; vec2 st=(L.xy-vUv)/float(N); vec2 uv=vUv+st*hash(gl_FragCoord.xy);
        vec3 acc=vec3(0.); float w=1.;
        for(int i=0;i<N;i++){
          uv+=st; vec2 q=uv-L.xy; q.x*=aspect;
          float h=H(uv), disk=exp(-dot(q,q)*70.);
          acc+=(lcol*disk*exp(-h*5.)+texture(uTexture,uv).rgb*h*.10)*w; w*=.97;
        }
        o=vec4(acc*L.z/float(N)*3.2,1.); }`,
    display: `uniform sampler2D uTexture, uBloom, uRays; uniform vec2 texel; uniform vec3 bg, L, lcol; uniform float light, bloomI, aspect; uniform int fx, steps;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      float H(vec2 uv){ return 1.-exp(-2.2*length(texture(uTexture,uv).rgb)); }
      void main(){
        vec3 c=texture(uTexture,vUv).rgb;
        vec3 b=texture(uBloom,vUv).rgb*bloomI;
        float vig=mix(.7,1.,smoothstep(1.15,.25,length(vUv-.5)));
        vec3 dark, lite;
        if(fx==0){
          float dx=length(texture(uTexture,vR).rgb)-length(texture(uTexture,vL).rgb);
          float dy=length(texture(uTexture,vT).rgb)-length(texture(uTexture,vB).rgb);
          vec3 n=normalize(vec3(dx,dy,length(texel)));
          c*=clamp(dot(n,normalize(vec3(-.45,.55,1.)))+.45,.55,1.3);
          dark=(bg+c+b)*vig; lite=bg-c-b*.35;
        } else {
          // 墨水浓度当高度场,点光源悬在光标上方
          float h=H(vUv);
          vec3 n=normalize(vec3(H(vL)-H(vR),H(vB)-H(vT),.035));
          vec2 dp=L.xy-vUv; dp.x*=aspect;
          vec3 ld=normalize(vec3(dp,.3));
          float att=L.z/(1.+dot(dp,dp)*12.);
          float dif=max(dot(n,ld),0.);
          float spe=pow(max(dot(n,normalize(ld+vec3(0.,0.,1.))),0.),56.)*smoothstep(.05,.35,h);
          vec3 rays=texture(uRays,vUv).rgb;
          float sh=1., ao=1.;
          if(fx==2){
            // 软阴影:沿表面点→光源在高度场里步进,被更高的墨挡住就衰减
            float j=hash(gl_FragCoord.xy);
            for(int i=1;i<=steps;i++){
              float t=(float(i)-j)/float(steps);
              float rh=mix(h+.015,.6,t), hq=H(vUv+(L.xy-vUv)*t);
              sh*=1.-clamp((hq-rh)*7.,0.,1.)*.55;
            }
            // AO:周围比自己高的墨压暗缝隙
            float r=14.*length(texel);
            for(int i=0;i<8;i++){ float a=float(i)*.785+j; vec2 o2=vec2(cos(a),sin(a))*r*(1.+float(i&1)); o2.x/=aspect; ao-=max(H(vUv+o2)-h,0.)*.32; }
            ao=clamp(ao,.35,1.);
            vec3 lit=c*(.32+1.25*dif*att*sh)*ao + lcol*spe*att*sh*1.6 + lcol*pow(1.-n.z,2.)*h*att*sh*.8;
            vec3 floorL=bg + lcol*att*.13*sh*(1.-h);
            dark=floorL*vig + lit + b*.8 + rays;
            lite=(bg-c*(.75+.35*ao)-b*.3)*(.8+.2*sh) + vec3(1.)*spe*att*sh*.35;
          } else {
            vec3 lit=c*(.55+.7*dif*att) + lcol*spe*att*1.2;
            dark=(bg+lit+b)*vig + rays;
            lite=bg-c-b*.35 + vec3(1.)*spe*att*.25 - rays*.1;
          }
        }
        // Compress subtractive ink on white: overlapping splashes stay lavender.
        lite=bg-(vec3(1.)-exp(-max(bg-lite,vec3(0.))))*.60;
        vec3 col=mix(dark,lite,light);
        col+=(hash(gl_FragCoord.xy)-.5)/255.;
        o=vec4(col,1.); }`,
  };

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VS);
  const P = {};
  for (const k in FS) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + FS[k]));
    gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name);
    }
    P[k] = { p, u };
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);

  // ---------- 帧缓冲 ----------
  function fbo(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, texel: [1 / w, 1 / h], bind(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); return unit; } };
  }
  const dbl = (w, h) => { const d = { read: fbo(w, h), write: fbo(w, h), swap() { [d.read, d.write] = [d.write, d.read]; } }; return d; };
  function res(r) {
    const a = gl.drawingBufferWidth / gl.drawingBufferHeight, big = Math.round(r * (a < 1 ? 1 / a : a));
    return a >= 1 ? [big, r] : [r, big];
  }

  let dye, vel, div, curl, pres, bloomA, bloomB, raysT;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width === w && canvas.height === h && dye) return;
    canvas.width = w; canvas.height = h;
    const [sw, sh] = res(CFG.sim), [dw, dh] = res(CFG.dye), [bw, bh] = res(256);
    // Release old GPU resources before rebuilding after a viewport change.
    for (const target of [dye, vel, div, curl, pres, bloomA, bloomB, raysT]) {
      if (!target) continue;
      for (const buffer of target.read ? [target.read, target.write] : [target]) {
        gl.deleteTexture(buffer.tex); gl.deleteFramebuffer(buffer.fb);
      }
    }
    dye = dbl(dw, dh); vel = dbl(sw, sh); div = fbo(sw, sh); curl = fbo(sw, sh); pres = dbl(sw, sh);
    bloomA = fbo(bw, bh); bloomB = fbo(bw, bh);
    const [rw, rh] = res(360); raysT = fbo(rw, rh);
  }

  function use(name, target, texel) {
    const pr = P[name]; gl.useProgram(pr.p);
    const t = texel || (target ? target.texel : [1 / canvas.width, 1 / canvas.height]);
    if (pr.u.texel) gl.uniform2f(pr.u.texel, t[0], t[1]);
    return pr.u;
  }
  function blit(target) {
    if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------- 调色板 ----------
  let pal = { bg: [0.04, 0.035, 0.03], inks: [[1, 0.55, 0.2]], light: 0 };
  let bloomBoost = 0;
  // 点光源:跟随光标缓动,点击时闪亮后回落
  const lt = { x: 0.72, y: 0.66, tx: 0.72, ty: 0.66, i: 0.6, base: 0.6 };
  let fx = 2;
  const steps = innerWidth < 720 ? 10 : 22;
  const lightCol = () => (pal.light ? [1, 1, 1] : pal.inks[0].map((v) => v * 0.55 + 0.45));

  function inkColor(rgb, k) {
    // 浅色模式下墨水是“减去”的:传 bg - 目标色
    const c = pal.light ? rgb.map((v, i) => Math.max(pal.bg[i] - v, 0)) : rgb;
    return c.map((v) => v * k);
  }

  function splatRaw(x, y, dx, dy, color, rmul = 1) {
    const aspect = canvas.width / canvas.height;
    let r = (CFG.radius / 100) * rmul; if (aspect > 1) r *= aspect;
    let u = use("splat", vel.write);
    gl.uniform1i(u.uTarget, vel.read.bind(0)); gl.uniform1f(u.aspect, aspect); gl.uniform1f(u.radius, r);
    gl.uniform2f(u.point, x, y); gl.uniform3f(u.color, dx, dy, 0); blit(vel.write); vel.swap();
    u = use("splat", dye.write);
    gl.uniform1i(u.uTarget, dye.read.bind(0)); gl.uniform1f(u.aspect, aspect); gl.uniform1f(u.radius, r);
    gl.uniform2f(u.point, x, y); gl.uniform3f(u.color, ...color); blit(dye.write); dye.swap();
  }

  // ---------- 一帧 ----------
  function step(dt) {
    gl.disable(gl.BLEND);
    let u = use("curl", curl); gl.uniform1i(u.uVelocity, vel.read.bind(0)); blit(curl);
    u = use("vorticity", vel.write); gl.uniform1i(u.uVelocity, vel.read.bind(0)); gl.uniform1i(u.uCurl, curl.bind(1));
    gl.uniform1f(u.curl, CFG.curl); gl.uniform1f(u.dt, dt); blit(vel.write); vel.swap();
    u = use("divergence", div); gl.uniform1i(u.uVelocity, vel.read.bind(0)); blit(div);
    u = use("scale", pres.write); gl.uniform1i(u.uTexture, pres.read.bind(0)); gl.uniform1f(u.value, CFG.pressure); blit(pres.write); pres.swap();
    u = use("pressure", pres.write); gl.uniform1i(u.uDivergence, div.bind(0));
    for (let i = 0; i < CFG.iters; i++) { gl.uniform1i(u.uPressure, pres.read.bind(1)); blit(pres.write); pres.swap(); }
    u = use("gradient", vel.write); gl.uniform1i(u.uPressure, pres.read.bind(0)); gl.uniform1i(u.uVelocity, vel.read.bind(1)); blit(vel.write); vel.swap();
    u = use("advect", vel.write); gl.uniform2f(u.simTexel, ...vel.read.texel); gl.uniform1i(u.uVelocity, vel.read.bind(0)); gl.uniform1i(u.uSource, vel.read.bind(0));
    gl.uniform1f(u.dt, dt); gl.uniform1f(u.diss, CFG.velocityDiss); blit(vel.write); vel.swap();
    u = use("advect", dye.write); gl.uniform2f(u.simTexel, ...vel.read.texel); gl.uniform1i(u.uVelocity, vel.read.bind(0)); gl.uniform1i(u.uSource, dye.read.bind(1));
    gl.uniform1f(u.dt, dt); gl.uniform1f(u.diss, CFG.densityDiss); blit(dye.write); dye.swap();
  }
  function bloom() {
    const th = 0.55, knee = th * 0.7 + 1e-4;
    let u = use("prefilter", bloomA); gl.uniform1i(u.uTexture, dye.read.bind(0));
    gl.uniform3f(u.curve, th - knee, knee * 2, 0.25 / knee); gl.uniform1f(u.threshold, th); blit(bloomA);
    u = use("blur", bloomB);
    for (let i = 0; i < 4; i++) {
      const s = i + 1;
      gl.uniform2f(u.dir, bloomA.texel[0] * s, 0); gl.uniform1i(u.uTexture, bloomA.bind(0)); blit(bloomB);
      gl.uniform2f(u.dir, 0, bloomA.texel[1] * s); gl.uniform1i(u.uTexture, bloomB.bind(0)); blit(bloomA);
    }
  }
  function render() {
    bloom();
    const aspect = canvas.width / canvas.height, lc = lightCol();
    if (fx) {
      const r = use("rays", raysT); gl.uniform1i(r.uTexture, dye.read.bind(0));
      gl.uniform3f(r.L, lt.x, lt.y, pal.light ? 0 : lt.i); gl.uniform3f(r.lcol, ...lc); gl.uniform1f(r.aspect, aspect); blit(raysT);
    }
    const u = use("display", null, dye.read.texel);
    gl.uniform1i(u.uTexture, dye.read.bind(0)); gl.uniform1i(u.uBloom, bloomA.bind(1)); gl.uniform1i(u.uRays, raysT.bind(2));
    gl.uniform3f(u.L, lt.x, lt.y, lt.i); gl.uniform3f(u.lcol, ...lc); gl.uniform1f(u.aspect, aspect);
    gl.uniform1i(u.fx, fx); gl.uniform1i(u.steps, steps);
    gl.uniform3f(u.bg, ...pal.bg); gl.uniform1f(u.light, pal.light);
    gl.uniform1f(u.bloomI, (pal.light ? 0.4 : 0.9) + bloomBoost);
    blit(null);
  }

  let last = performance.now(), running = true;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 60); last = now;
    resize();
    if (running) { step(dt); render(); }
    bloomBoost *= 0.94;
    lt.x += (lt.tx - lt.x) * 0.1; lt.y += (lt.ty - lt.y) * 0.1; lt.i += (lt.base - lt.i) * 0.035;
    if (running) requestAnimationFrame(loop);
  }
  canvas.addEventListener("webglcontextlost", () => { running = false; });
  resize();
  requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", () => { const resume = !running && !document.hidden; running = !document.hidden; last = performance.now(); if (resume) requestAnimationFrame(loop); });

  return {
    // 换调色板时清掉旧墨(深浅模式的墨水含义相反)
    setPalette(p) {
      pal = p;
      const u = use("scale", dye.write); gl.uniform1i(u.uTexture, dye.read.bind(0)); gl.uniform1f(u.value, 0); blit(dye.write); dye.swap();
    },
    // 归一化坐标 (0..1, y 向上);dx/dy 为归一化位移
    setFx(n) { fx = n; },
    move(x, y, dx, dy, rgb) {
      lt.tx = x; lt.ty = y;
      const a = canvas.width / canvas.height;
      if (a < 1) dx *= a; if (a > 1) dy /= a;
      splatRaw(x, y, dx * CFG.force, dy * CFG.force, inkColor(rgb, pal.light ? 0.4 : 0.16));
    },
    drop(x, y, rgb, k = 0.5, rmul = 1.4) {
      const ang = Math.random() * Math.PI * 2, f = 220 + Math.random() * 380;
      splatRaw(x, y, Math.cos(ang) * f, Math.sin(ang) * f, inkColor(rgb, pal.light ? k * 1.8 : k), rmul);
    },
    // 点击:中心高亮 + 一圈向外喷射
    burst(x, y, rgbs) {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, f = 900 + Math.random() * 500;
        splatRaw(x, y, Math.cos(a) * f, Math.sin(a) * f, inkColor(rgbs[i % rgbs.length], pal.light ? 1.1 : 1.6), 0.7);
      }
      splatRaw(x, y, 0, 0, inkColor(rgbs[0], pal.light ? 1.4 : 3.2), 1.2);
      bloomBoost = pal.light ? 0.3 : 1.1;
      lt.x = lt.tx = x; lt.y = lt.ty = y; lt.i = 2.4;
    },
  };
};
