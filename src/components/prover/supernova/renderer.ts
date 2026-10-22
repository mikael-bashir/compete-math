import { BLUR_FRAG, BRIGHT_FRAG, FINAL_FRAG, SCENE_FRAG, VERT } from './shader';
import { flashEnvelope, DETONATION_S, overlayAlpha } from './timeline';

// The WebGL2 side of the proof supernova: one HDR scene pass, a bright-pass, a small and a wide blur (the bloom that makes the core spill
// light over everything), and a composite that tone-maps. Float render targets when the browser has them; otherwise 8-bit with the HDR range
// divided down (HDR_SCALE_8BIT), which bands a little in the dark but keeps the look.

export interface NovaRenderer {
  /** Draw the frame at `timeS` seconds since the overlay opened. */
  render(timeS: number): void;
  /** Resize the drawing buffer: CSS size, device pixel ratio, and a quality scale (0.35 to 1). */
  resize(cssW: number, cssH: number, dpr: number, scale: number): void;
  setQuality(q: number): void;
  setFigure(on: boolean): void;
  setSeed(seed: number): void;
  readonly floatTargets: boolean;
  dispose(): void;
}

const HDR_SCALE_8BIT = 8;

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

export function createNovaRenderer(canvas: HTMLCanvasElement, seed = 1): NovaRenderer | null {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return null;

  const floatTargets = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  gl.getExtension('OES_texture_float_linear');
  const hdrScale = floatTargets ? 1 : HDR_SCALE_8BIT;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[supernova] shader compile failed:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const program = (frag: string) => {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[supernova] link failed:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  };

  const scene = program(SCENE_FRAG);
  const bright = program(BRIGHT_FRAG);
  const blur = program(BLUR_FRAG);
  const final = program(FINAL_FRAG);
  if (!scene || !bright || !blur || !final) return null;

  const loc = (p: WebGLProgram, names: string[]) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) as Record<string, WebGLUniformLocation | null>;
  const uScene = loc(scene, ['uRes', 'uT', 'uQ', 'uSeed', 'uFigure', 'uScale']);
  const uBright = loc(bright, ['uSrc', 'uRes', 'uThreshold', 'uScale']);
  const uBlur = loc(blur, ['uSrc', 'uRes', 'uDir']);
  const uFinal = loc(final, ['uScene', 'uBloomA', 'uBloomB', 'uRes', 'uT', 'uAlpha', 'uScale', 'uFlash']);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const makeTarget = (w: number, h: number): Target => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (floatTargets) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  };
  const freeTarget = (t: Target | null) => {
    if (!t) return;
    gl.deleteFramebuffer(t.fbo);
    gl.deleteTexture(t.tex);
  };

  // scene (full), bloom at 1/4 (a, b ping-pong), wide bloom at 1/16 (c, d ping-pong)
  let S: Target | null = null, A: Target | null = null, B: Target | null = null, C: Target | null = null, D: Target | null = null;
  let quality = 1;
  let figure = 1;
  let seedV = seed;
  let w = 2, h = 2;

  const pass = (target: Target | null, p: WebGLProgram, setup: () => void) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : w, target ? target.h : h);
    gl.useProgram(p);
    setup();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const bind = (unit: number, t: Target | null, u: WebGLUniformLocation | null) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t ? t.tex : null);
    gl.uniform1i(u, unit);
  };

  const api: NovaRenderer = {
    floatTargets,
    resize(cssW, cssH, dpr, scale) {
      const nw = Math.max(2, Math.round(cssW * dpr * scale));
      const nh = Math.max(2, Math.round(cssH * dpr * scale));
      if (nw === w && nh === h && S) return;
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
      [S, A, B, C, D].forEach(freeTarget);
      S = makeTarget(w, h);
      const q = (k: number) => [Math.max(2, Math.round(w / k)), Math.max(2, Math.round(h / k))] as const;
      A = makeTarget(...q(4));
      B = makeTarget(...q(4));
      C = makeTarget(...q(16));
      D = makeTarget(...q(16));
    },
    setQuality(q) {
      quality = Math.min(1, Math.max(0, q));
    },
    setFigure(on) {
      figure = on ? 1 : 0;
    },
    setSeed(s) {
      seedV = s;
    },
    render(timeS) {
      if (!S || !A || !B || !C || !D) return;
      gl.disable(gl.BLEND);
      pass(S, scene, () => {
        gl.uniform2f(uScene.uRes, w, h);
        gl.uniform1f(uScene.uT, timeS);
        gl.uniform1f(uScene.uQ, quality);
        gl.uniform1f(uScene.uSeed, seedV);
        gl.uniform1f(uScene.uFigure, figure);
        gl.uniform1f(uScene.uScale, hdrScale);
      });
      // bright-pass into A, then a small blur (A <-> B), then a wide one from A down into C <-> D
      pass(A, bright, () => {
        bind(0, S, uBright.uSrc);
        gl.uniform2f(uBright.uRes, A!.w, A!.h);
        gl.uniform1f(uBright.uThreshold, 1.25);
        gl.uniform1f(uBright.uScale, hdrScale);
      });
      const blurPass = (from: Target, to: Target, dx: number, dy: number) =>
        pass(to, blur, () => {
          bind(0, from, uBlur.uSrc);
          gl.uniform2f(uBlur.uRes, to.w, to.h);
          gl.uniform2f(uBlur.uDir, dx, dy);
        });
      blurPass(A, B, 1.6, 0);
      blurPass(B, A, 0, 1.6);
      blurPass(A, C, 1, 0);
      blurPass(C, D, 2.2, 0);
      blurPass(D, C, 0, 2.2);
      blurPass(C, D, 3.4, 0);
      blurPass(D, C, 0, 3.4);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      pass(null, final, () => {
        bind(0, S, uFinal.uScene);
        bind(1, A, uFinal.uBloomA);
        bind(2, C, uFinal.uBloomB);
        gl.uniform2f(uFinal.uRes, w, h);
        gl.uniform1f(uFinal.uT, timeS);
        gl.uniform1f(uFinal.uAlpha, overlayAlpha(timeS));
        gl.uniform1f(uFinal.uScale, hdrScale);
        gl.uniform1f(uFinal.uFlash, flashEnvelope(timeS - DETONATION_S));
      });
    },
    dispose() {
      [S, A, B, C, D].forEach(freeTarget);
      [scene, bright, blur, final].forEach((p) => p && gl.deleteProgram(p));
      gl.deleteVertexArray(vao);
      // not loseContext(): React (StrictMode) mounts an effect twice on the same canvas, and a lost context cannot be taken again
    },
  };
  return api;
}

// Compile the shaders before they are needed. The first draw of this scene makes the driver compile and link four programs, which can block
// the page for a second or more; doing it once on an idle tick, on a canvas nobody sees, means the real play starts from a cache. Safe to call
// any number of times; it only ever does the work once.
let warmed = false;
export function prewarmSupernova() {
  if (warmed || typeof document === 'undefined') return;
  warmed = true;
  try {
    const t0 = performance.now();
    const c = document.createElement('canvas');
    const r = createNovaRenderer(c, 1);
    if (r) {
      r.resize(16, 16, 1, 1);
      r.render(0);
      r.dispose();
      if (process.env.NODE_ENV !== 'production') console.debug(`[supernova] shaders warmed in ${Math.round(performance.now() - t0)} ms`);
    }
  } catch {
    /* a warm-up is only ever an optimisation */
  }
}

// A starting resolution that a laptop can hold: about 2.6 million pixels at most, scaled down from the device's own. The play then adapts.
export function startingScale(cssW: number, cssH: number, dpr: number) {
  const px = cssW * cssH * dpr * dpr;
  return Math.min(1, Math.sqrt(2.6e6 / Math.max(1, px)));
}
