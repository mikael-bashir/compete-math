// The Tengoku universe: every theorem is a star, every library a galaxy. Leak's tool calls move through it: the driver is a glowing probe, a
// search dims the field and lights its results in rank order, a verified step leaves a constellation behind.
// Plain WebGL2, no dependencies. It builds its own canvas and HUD inside a container so the same code runs on /leak and in a standalone page.

import type { ReplayRun, UniverseEvent, UniverseLib, UniverseMeta } from './types';
import { NameIndex } from './names';
import { LiveInterpreter, type ProverEventLike, type UniverseSink, type Vec3 } from './events';

export interface UniverseData {
  meta: UniverseMeta;
  pos: Int16Array;
  lib: Uint16Array;
  names: NameIndex | null;
  replays: ReplayRun[];
}

export interface UniverseOptions {
  mode?: 'replay' | 'live';
}

interface Ev extends UniverseEvent {
  ds: number; // display start
  dres?: number; // display resolve time; unset while the call is in flight
  focus?: Vec3 | null;
  chain?: [number, number][];
}

type Rgb = [number, number, number];
const COL: Record<string, Rgb> = {
  loogle: [0.45, 0.85, 1.0],
  moogle: [0.75, 0.55, 1.0],
  pend: [1.0, 0.8, 0.4],
  ok: [0.45, 1.0, 0.65],
  fail: [1.0, 0.35, 0.35],
  gold: [1.0, 0.86, 0.5],
};

const CSS = `
.tku{position:relative;width:100%;height:100%;overflow:hidden;background:#04050a;color:#e8ecf6;font:13px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;
 --dim:#8a93ab;--gold:#ffd98a;--cyan:#7fd8ff;--violet:#c08cff;--green:#74ffa6;--red:#ff6b6b;--panel:rgba(10,12,22,.62);--line:rgba(255,255,255,.10)}
.tku canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.tku canvas.tku-drag{cursor:grabbing}
.tku .tku-labels{pointer-events:none}
.tku .hud{position:absolute;pointer-events:none;z-index:2;text-shadow:0 0 10px #000,0 0 3px #000}
.tku .tku-title{left:16px;top:12px}.tku .tku-title h1{margin:0;font-size:17px;font-weight:600;letter-spacing:.02em}
.tku .tku-title p{margin:3px 0 0;color:var(--dim);font-size:12px}.tku b{color:#e8ecf6;font-weight:600;font-variant-numeric:tabular-nums}
.tku .tku-stats{right:16px;top:12px;text-align:right;font-variant-numeric:tabular-nums}.tku .tku-stats div{margin-bottom:3px;color:var(--dim)}
.tku .tku-legend{left:16px;top:76px;color:var(--dim);font-size:12px}.tku .tku-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:-1px}.tku .tku-legend div{margin:3px 0}
.tku .tku-ticker{left:50%;transform:translateX(-50%);bottom:76px;max-width:min(760px,calc(100% - 32px));width:100%;text-align:center;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim);min-height:18px}
.tku .tku-bar{position:absolute;z-index:3;left:50%;transform:translateX(-50%);bottom:12px;width:min(900px,calc(100% - 24px));display:flex;gap:10px;align-items:center;padding:9px 12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;backdrop-filter:blur(10px)}
.tku .tku-bar button,.tku .tku-bar select{background:rgba(255,255,255,.06);color:#e8ecf6;border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer;min-height:32px}
.tku .tku-bar button:hover,.tku .tku-bar select:hover{background:rgba(255,255,255,.12)}
.tku .tku-bar button.on{background:rgba(255,217,138,.18);border-color:rgba(255,217,138,.5)}
.tku .tku-bar input[type=range]{flex:1;min-width:60px;accent-color:#ffd98a}.tku .tku-bar label{color:var(--dim);display:flex;align-items:center;gap:5px;white-space:nowrap}
.tku .tku-time{color:var(--dim);font-variant-numeric:tabular-nums;min-width:76px;text-align:right}
.tku .tku-tip{position:absolute;z-index:4;pointer-events:none;padding:7px 10px;background:var(--panel);border:1px solid var(--line);border-radius:8px;font-size:12px;backdrop-filter:blur(8px);display:none}.tku .tku-tip span{color:var(--dim)}
.tku .tku-done{left:50%;top:44%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .8s;text-shadow:0 0 24px rgba(116,255,166,.5)}
.tku .tku-done.show{opacity:1}.tku .tku-done h2{margin:0;font-size:26px;font-weight:600;color:var(--green);letter-spacing:.04em}.tku .tku-done p{margin:6px 0 0;color:var(--dim)}
.tku .tku-live{display:none;color:var(--red);font-weight:600;letter-spacing:.06em}
.tku.live .tku-replay-only{display:none}.tku.live .tku-live{display:inline}.tku .tku-live-only{display:none}.tku.live .tku-live-only{display:inline}
@media (max-width:640px){.tku .tku-legend,.tku .tku-stats{display:none}.tku .tku-bar{flex-wrap:wrap;gap:8px}.tku .tku-bar select.tku-run{flex:1 1 120px;min-width:0}
 .tku .tku-bar input.tku-seek{order:9;flex:1 1 100%}.tku .tku-bar .tku-time{order:8;flex:1 1 auto;text-align:left;min-width:0}.tku .tku-opt{display:none}.tku .tku-ticker{bottom:132px;font-size:11px}}
@media (prefers-reduced-motion:reduce){.tku .tku-done{transition:none}}
`;

const HASH_GLSL = `float hash(uint x){ x ^= x>>16; x *= 0x7feb352du; x ^= x>>15; x *= 0x846ca68bu; x ^= x>>16; return float(x)/4294967295.0; }`;
const FLOW_GLSL = `vec3 flow(vec3 p, float h, float h2, float t){ return 0.0042*vec3(sin(p.y*9.0+t*0.23+h*6.283), sin(p.z*9.0+t*0.19+h2*6.283), sin(p.x*9.0+t*0.21+(h+h2)*3.1))*(0.5+h2); }`;

const STAR_VS = `#version 300 es
precision highp float; precision highp int;
in vec3 a_pos; in uint a_lib;
uniform mat4 u_vp; uniform float u_scale, u_time, u_psize, u_dim; uniform sampler2D u_pal;
out vec4 v_col;
${HASH_GLSL}
${FLOW_GLSL}
void main(){
  uint id = uint(gl_VertexID); float h = hash(id), h2 = hash(id*747796405u+2891336453u);
  vec3 p = a_pos*u_scale; p += flow(p,h,h2,u_time);
  gl_Position = u_vp*vec4(p,1.0);
  uint lib = a_lib & 0x7FFFu; bool trusted = (a_lib & 0x8000u) != 0u;
  vec3 hue = texelFetch(u_pal, ivec2(int(lib)&255, int(lib)>>8), 0).rgb;
  float tw = 0.72 + 0.28*sin(u_time*(0.6+h*1.4)+h2*40.0);
  vec3 col = trusted ? mix(vec3(1.0,0.93,0.80), hue, 0.50) : hue*0.70;
  v_col = vec4(col*tw, (trusted ? 0.46 : 0.17)*u_dim);
  float d = max(gl_Position.w, 0.05);
  gl_PointSize = clamp(u_psize*(trusted?1.25:0.95)*(0.6+h*0.8)/d, 1.0, 3.6);
}`;
const STAR_FS = `#version 300 es
precision mediump float; in vec4 v_col; out vec4 o;
void main(){ vec2 d = gl_PointCoord-0.5; float a = exp(-dot(d,d)*12.0); o = vec4(v_col.rgb*v_col.a*a, 1.0); }`;
const GLOW_VS = `#version 300 es
precision highp float; in vec3 a_pos; in vec4 a_col; in float a_size; uniform mat4 u_vp; uniform float u_psize; out vec4 v_col;
void main(){ gl_Position = u_vp*vec4(a_pos,1.0); v_col = a_col; gl_PointSize = clamp(u_psize*a_size/max(gl_Position.w,0.05), 2.0, 96.0); }`;
const GLOW_FS = `#version 300 es
precision mediump float; in vec4 v_col; out vec4 o;
void main(){ vec2 d = gl_PointCoord-0.5; float r = length(d)*2.0; float core = exp(-r*r*18.0)*0.5; float halo = exp(-r*r*2.6)*0.55; float cross = (exp(-abs(d.x)*60.0)+exp(-abs(d.y)*60.0))*0.22*(1.0-r); vec3 c = v_col.rgb*(halo+cross) + mix(v_col.rgb, vec3(1.0), 0.35)*core; o = vec4(c*v_col.a, 1.0); }`;
const LINE_VS = `#version 300 es
precision highp float; in vec3 a_pos; in vec4 a_col; uniform mat4 u_vp; out vec4 v_col;
void main(){ gl_Position = u_vp*vec4(a_pos,1.0); v_col = a_col; }`;
const LINE_FS = `#version 300 es
precision mediump float; in vec4 v_col; out vec4 o; void main(){ o = vec4(v_col.rgb*v_col.a, 1.0); }`;

const MAXG = 12000;
const MAXL = 200000;

const hash32 = (x: number): number => {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const persp = (fovy: number, asp: number, n: number, f: number): number[] => {
  const t = 1 / Math.tan(fovy / 2);
  return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0];
};
const lookAt = (e: Vec3, c: Vec3, u: Vec3): number[] => {
  const z = norm(sub(e, c));
  const x = norm(cross(u, z));
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
};
const mul = (a: number[], b: number[]): number[] => {
  const o = new Array<number>(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  return o;
};
const hsv = (h: number, s: number, v: number): Rgb => {
  const f = (n: number): number => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  };
  return [f(5), f(3), f(1)];
};
const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const nice = (n: string): string => n.replace(/^mathlib-/, 'Mathlib · ').replace(/-/g, ' ');
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class Universe implements UniverseSink {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly labels: HTMLCanvasElement;
  private readonly lctx: CanvasRenderingContext2D;
  private readonly gl: WebGL2RenderingContext;
  private readonly N: number;
  private readonly SC: number;
  private readonly progStar: WebGLProgram;
  private readonly progGlow: WebGLProgram;
  private readonly progLine: WebGLProgram;
  private readonly vaoStars: WebGLVertexArrayObject;
  private readonly vaoGlow: WebGLVertexArrayObject;
  private readonly vaoLine: WebGLVertexArrayObject;
  private readonly bufGlow: WebGLBuffer;
  private readonly bufLine: WebGLBuffer;
  private readonly palTex: WebGLTexture;
  private readonly glowData = new Float32Array(MAXG * 8);
  private readonly lineData = new Float32Array(MAXL * 7);
  private readonly uni = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private readonly libsBySize: UniverseLib[];
  private ng = 0;
  private nl = 0;
  private maxR = 0;
  private W = 1;
  private H = 1;
  private DPR = 1;
  private VP: number[] = [];
  private raf = 0;
  private destroyed = false;

  // camera
  private yaw = 0.6;
  private pitch = 0.5;
  private dist = 2.3;
  private target: Vec3 = [0, 0, 0];
  private tgoal: Vec3 = [0, 0, 0];
  private dgoal = 2.3;
  private freeUntil = 0;
  private dragging: { x: number; y: number } | null = null;
  private readonly pointers = new Map<number, [number, number]>();
  private mouse = { x: -1, y: -1 };

  // playback
  private mode: 'replay' | 'live';
  private T = 0;
  private clock = 0;
  private playing = true;
  private speed = 2;
  private run: ReplayRun | null = null;
  private evs: Ev[] = [];
  private dur = 1;
  private probe: Vec3 = [0, 0, 0];
  private liveFinal: boolean | null = null;
  private interp: LiveInterpreter | null = null;
  private dimNow = 0.8;
  private dimTarget = 0.8;
  private drawFrac = 1;
  private userQuality = false;
  private frames = 0;
  private fpsT = 0;
  private slow = 0;
  private last = 0;
  private simT = 0;
  private libLabelAlpha = new Map<string, number>();

  // hud
  private readonly el: Record<string, HTMLElement> = {};
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly data: UniverseData,
    opts: UniverseOptions = {},
  ) {
    this.N = data.meta.n;
    this.SC = 1 / data.meta.scale;
    this.mode = opts.mode ?? 'replay';
    this.libsBySize = [...data.meta.libs].sort((a, b) => b.t + b.u - (a.t + a.u));

    if (!document.getElementById('tku-css')) {
      const st = document.createElement('style');
      st.id = 'tku-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.className = 'tku' + (this.mode === 'live' ? ' live' : '');
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', "Interactive map of Tengoku's theorems as a universe of stars");
    this.labels = document.createElement('canvas');
    this.labels.className = 'tku-labels';
    this.root.append(this.canvas, this.labels);
    this.buildHud();
    container.appendChild(this.root);

    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL 2 is not available');
    this.gl = gl;
    const l2 = this.labels.getContext('2d');
    if (!l2) throw new Error('2D canvas is not available');
    this.lctx = l2;

    this.progStar = this.program(STAR_VS, STAR_FS);
    this.progGlow = this.program(GLOW_VS, GLOW_FS);
    this.progLine = this.program(LINE_VS, LINE_FS);

    this.vaoStars = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoStars);
    const bp = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bp);
    gl.bufferData(gl.ARRAY_BUFFER, data.pos, gl.STATIC_DRAW);
    let loc = gl.getAttribLocation(this.progStar, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.SHORT, false, 6, 0);
    const bl = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bl);
    gl.bufferData(gl.ARRAY_BUFFER, data.lib, gl.STATIC_DRAW);
    loc = gl.getAttribLocation(this.progStar, 'a_lib');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribIPointer(loc, 1, gl.UNSIGNED_SHORT, 2, 0);

    const pal = new Uint8Array(512 * 3);
    data.meta.libs.forEach((l, i) => {
      const c = hsv(l.h, 0.78, 1);
      pal[i * 3] = c[0] * 255;
      pal[i * 3 + 1] = c[1] * 255;
      pal[i * 3 + 2] = c[2] * 255;
    });
    this.palTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 256, 2, 0, gl.RGB, gl.UNSIGNED_BYTE, pal);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.vaoGlow = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoGlow);
    this.bufGlow = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGlow);
    gl.bufferData(gl.ARRAY_BUFFER, this.glowData.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, size, off] of [['a_pos', 3, 0], ['a_col', 4, 12], ['a_size', 1, 28]] as const) {
      const l = gl.getAttribLocation(this.progGlow, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, 32, off);
    }
    this.vaoLine = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoLine);
    this.bufLine = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufLine);
    gl.bufferData(gl.ARRAY_BUFFER, this.lineData.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, size, off] of [['a_pos', 3, 0], ['a_col', 4, 12]] as const) {
      const l = gl.getAttribLocation(this.progLine, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, 28, off);
    }
    gl.bindVertexArray(null);

    if (data.names) this.interp = new LiveInterpreter(data.names, this);
    this.bindInput();
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.root);
    this.cleanups.push(() => ro.disconnect());
    if (data.replays.length) this.loadRun(0);
    this.syncMode();

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.last = performance.now();
    this.fpsT = this.last;
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- public ----------
  /** Feed one event of a live prover run. */
  pushProverEvent(e: ProverEventLike): void {
    this.interp?.handle(e);
  }

  /** Jump a replay to a fraction (0..1) of its length. */
  seekFraction(f: number): void {
    if (this.mode === 'replay') this.T = Math.max(0, Math.min(1, f)) * this.dur;
  }

  /** Forget the previous live run (call when a new one starts). */
  resetLive(): void {
    this.evs = [];
    this.liveFinal = null;
    this.probe = [0, 0, 0];
    this.T = 0;
    this.clock = 0;
    this.interp = this.data.names ? new LiveInterpreter(this.data.names, this) : null;
  }

  setMode(mode: 'replay' | 'live'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'live') this.resetLive();
    else if (this.data.replays.length) this.loadRun(+(this.el.run as HTMLSelectElement).value || 0);
    this.syncMode();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.cleanups.forEach((f) => f());
    this.root.remove();
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }

  // ---------- UniverseSink (live events) ----------
  start(ev: UniverseEvent): UniverseEvent {
    const e: Ev = { ...ev, t: this.T, ds: this.T };
    if (e.used) e.chain = this.chainOf(e.used.slice(0, 18));
    this.evs.push(e);
    if (this.evs.length > 400) this.evs.splice(0, this.evs.length - 400);
    return e;
  }
  finish(ev: UniverseEvent, patch: Partial<UniverseEvent>): void {
    const e = ev as Ev;
    Object.assign(e, patch);
    e.dres = this.T;
    e.te = this.T;
    e.focus = this.centroid(e.hits ?? e.used ?? []);
  }
  starAt(i: number): Vec3 {
    return this.basePos(i);
  }
  attention(): Vec3 {
    return this.probe;
  }
  verified(ok: boolean): void {
    this.liveFinal = ok;
  }

  // ---------- helpers ----------
  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const mk = (t: number, s: string): WebGLShader => {
      const o = gl.createShader(t)!;
      gl.shaderSource(o, s);
      gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) ?? 'shader error');
      return o;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
    return p;
  }
  private u(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    let m = this.uni.get(p);
    if (!m) this.uni.set(p, (m = new Map()));
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(p, name));
    return m.get(name) ?? null;
  }
  private basePos(i: number, out: Vec3 = [0, 0, 0]): Vec3 {
    out[0] = this.data.pos[i * 3] * this.SC;
    out[1] = this.data.pos[i * 3 + 1] * this.SC;
    out[2] = this.data.pos[i * 3 + 2] * this.SC;
    return out;
  }
  // identical to the vertex shader's flow, so a highlight sits exactly on its star
  private starPos(i: number, t: number, out: Vec3): Vec3 {
    const x = this.data.pos[i * 3] * this.SC;
    const y = this.data.pos[i * 3 + 1] * this.SC;
    const z = this.data.pos[i * 3 + 2] * this.SC;
    const h = hash32(i);
    const h2 = hash32((Math.imul(i, 747796405) + 2891336453) | 0);
    const k = 0.0042 * (0.5 + h2);
    out[0] = x + k * Math.sin(y * 9 + t * 0.23 + h * 6.283);
    out[1] = y + k * Math.sin(z * 9 + t * 0.19 + h2 * 6.283);
    out[2] = z + k * Math.sin(x * 9 + t * 0.21 + (h + h2) * 3.1);
    return out;
  }
  private centroid(ids: number[]): Vec3 | null {
    if (!ids.length) return null;
    const c: Vec3 = [0, 0, 0];
    const p: Vec3 = [0, 0, 0];
    for (const i of ids) {
      this.basePos(i, p);
      c[0] += p[0];
      c[1] += p[1];
      c[2] += p[2];
    }
    return [c[0] / ids.length, c[1] / ids.length, c[2] / ids.length];
  }
  // a greedy nearest-neighbour path through the lemmas a script used
  private chainOf(ids: number[]): [number, number][] {
    if (ids.length < 2) return [];
    const P = ids.map((i) => this.basePos(i));
    const left = ids.map((_, k) => k);
    const out: number[] = [];
    let cur = left.shift()!;
    out.push(cur);
    while (left.length) {
      let b = 0;
      let bd = Infinity;
      for (let k = 0; k < left.length; k++) {
        const d = Math.hypot(P[left[k]][0] - P[cur][0], P[left[k]][1] - P[cur][1], P[left[k]][2] - P[cur][2]);
        if (d < bd) {
          bd = d;
          b = k;
        }
      }
      cur = left.splice(b, 1)[0];
      out.push(cur);
    }
    const e: [number, number][] = [];
    for (let k = 1; k < out.length; k++) e.push([ids[out[k - 1]], ids[out[k]]]);
    return e;
  }

  private loadRun(i: number): void {
    const run = this.data.replays[i];
    if (!run) return;
    this.run = run;
    let t = 1;
    this.evs = run.events.map((raw, k) => {
      if (k) t += Math.min(3.5, Math.max(0.5, raw.t - run.events[k - 1].t));
      const span = Math.min(3, Math.max(0.8, (raw.te ?? raw.t) - raw.t));
      const e: Ev = { ...raw, ds: t, dres: t + span };
      e.focus = this.centroid(e.hits ?? e.used ?? []);
      e.chain = e.used && e.used.length > 1 ? this.chainOf(e.used.slice(0, 18)) : [];
      return e;
    });
    this.dur = (this.evs.length ? this.evs[this.evs.length - 1].ds : 0) + 6;
    this.T = 0;
    this.probe = [0, 0, 0];
    (this.el.seek as HTMLInputElement).value = '0';
    this.el.done.classList.remove('show');
  }

  // ---------- HUD ----------
  private buildHud(): void {
    const m = this.data.meta;
    const html = `
      <div class="hud tku-title"><h1>Tengoku universe</h1><p><b>${m.n.toLocaleString()}</b> theorems · <b>${m.n_trusted.toLocaleString()}</b> verified by Leak · every star is a theorem, every cluster a library</p></div>
      <div class="hud tku-legend">
        <div><i style="background:#ffe9c4"></i>trusted (Leak-verified)</div>
        <div><i style="background:#4f6fb8"></i>tentative (source proof, not yet re-verified)</div>
        <div><i style="background:var(--cyan)"></i>type-pattern search (Leak I loogle)</div>
        <div><i style="background:var(--violet)"></i>concept search (Leak I moogle)</div>
        <div><i style="background:var(--gold)"></i>compile (Leak IV) &nbsp;<i style="background:var(--green)"></i>✅ &nbsp;<i style="background:var(--red)"></i>❌</div>
      </div>
      <div class="hud tku-stats"><div class="tku-live-only"><span class="tku-live">● LIVE</span></div><div>searches <b data-k="search">0</b></div><div>compiles <b data-k="ok">0</b> ✅ · <b data-k="fail">0</b> ❌</div><div>lemmas touched <b data-k="lem">0</b></div><div data-k="fps" style="opacity:.6"></div></div>
      <div class="hud tku-ticker" data-k="ticker"></div>
      <div class="hud tku-done" data-k="done"><h2>VERIFIED</h2><p data-k="doneSub"></p></div>
      <div class="tku-tip" data-k="tip"></div>
      <div class="tku-bar" role="group" aria-label="Universe controls">
        <button data-k="live" class="tku-opt-mode">Live</button><button data-k="replay" class="tku-opt-mode">Replay</button>
        <button data-k="play" class="tku-replay-only" aria-label="Play or pause">⏸</button>
        <select data-k="run" class="tku-run tku-replay-only" aria-label="Replay run"></select>
        <input data-k="seek" class="tku-seek tku-replay-only" type="range" min="0" max="1000" value="0" aria-label="Timeline">
        <span class="tku-time tku-replay-only" data-k="time">0:00</span>
        <select data-k="speed" class="tku-replay-only" aria-label="Speed"><option value="1">1×</option><option value="2" selected>2×</option><option value="5">5×</option><option value="12">12×</option></select>
        <label class="tku-opt"><input data-k="follow" type="checkbox" checked> follow</label>
        <select data-k="quality" class="tku-opt" aria-label="Star density"><option value="1">all stars</option><option value="0.5">½ stars</option><option value="0.25">¼ stars</option></select>
      </div>`;
    const holder = document.createElement('div');
    holder.innerHTML = html;
    while (holder.firstChild) this.root.appendChild(holder.firstChild);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => {
      this.el[n.dataset.k!] = n;
    });
    const run = this.el.run as HTMLSelectElement;
    this.data.replays.forEach((r, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = r.label;
      run.appendChild(o);
    });
    const on = <K extends keyof HTMLElementEventMap>(n: HTMLElement, ev: K, f: (e: HTMLElementEventMap[K]) => void): void => {
      n.addEventListener(ev, f);
    };
    on(run, 'change', () => this.loadRun(+run.value));
    on(this.el.play, 'click', () => {
      this.playing = !this.playing;
      this.el.play.textContent = this.playing ? '⏸' : '▶';
    });
    on(this.el.speed, 'change', () => (this.speed = +(this.el.speed as HTMLSelectElement).value));
    on(this.el.seek, 'input', () => (this.T = (+(this.el.seek as HTMLInputElement).value / 1000) * this.dur));
    on(this.el.quality, 'change', () => {
      this.drawFrac = +(this.el.quality as HTMLSelectElement).value;
      this.userQuality = true;
    });
    on(this.el.live, 'click', () => this.setMode('live'));
    on(this.el.replay, 'click', () => this.setMode('replay'));
    if (!this.data.names) (this.el.live as HTMLElement).style.display = 'none';
    if (!this.data.replays.length) (this.el.replay as HTMLElement).style.display = 'none';
    const key = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && this.mode === 'replay' && this.root.contains(document.activeElement)) {
        e.preventDefault();
        (this.el.play as HTMLButtonElement).click();
      }
    };
    window.addEventListener('keydown', key);
    this.cleanups.push(() => window.removeEventListener('keydown', key));
  }
  private syncMode(): void {
    this.root.classList.toggle('live', this.mode === 'live');
    this.el.live.classList.toggle('on', this.mode === 'live');
    this.el.replay.classList.toggle('on', this.mode === 'replay');
  }

  // ---------- input ----------
  private bindInput(): void {
    const c = this.canvas;
    const rect = (): DOMRect => c.getBoundingClientRect();
    const free = (): void => {
      this.freeUntil = performance.now() + 9000;
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.dragging = { x: e.clientX, y: e.clientY };
      c.classList.add('tku-drag');
      free();
    });
    const up = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      this.dragging = null;
      c.classList.remove('tku-drag');
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      this.mouse.x = -1;
    });
    c.addEventListener('pointermove', (e) => {
      const r = rect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      const mine = this.pointers.get(e.pointerId);
      if (this.pointers.size === 2 && mine) {
        const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const d0 = Math.hypot(mine[0] - other[0], mine[1] - other[1]);
        const d1 = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
        this.dist = Math.min(8, Math.max(0.05, (this.dist * d0) / Math.max(d1, 1)));
        this.dgoal = this.dist;
      } else if (this.dragging && mine) {
        this.yaw -= (e.clientX - this.dragging.x) * 0.006;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (e.clientY - this.dragging.y) * 0.006));
        this.dragging = { x: e.clientX, y: e.clientY };
        free();
      }
      if (mine) this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.dist = Math.min(8, Math.max(0.05, this.dist * Math.exp(e.deltaY * 0.0012)));
        this.dgoal = this.dist;
        free();
      },
      { passive: false },
    );
    c.addEventListener('dblclick', () => {
      this.freeUntil = 0;
      (this.el.follow as HTMLInputElement).checked = true;
    });
  }
  private resize(): void {
    const r = this.root.getBoundingClientRect();
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, Math.floor(r.width * this.DPR));
    this.H = Math.max(1, Math.floor(r.height * this.DPR));
    for (const cv of [this.canvas, this.labels]) {
      cv.width = this.W;
      cv.height = this.H;
    }
    this.gl.viewport(0, 0, this.W, this.H);
  }

  // ---------- drawing primitives ----------
  private G(p: Vec3, c: Rgb, a: number, s: number): void {
    if (this.ng >= MAXG) return;
    const o = this.ng++ * 8;
    const d = this.glowData;
    d[o] = p[0];
    d[o + 1] = p[1];
    d[o + 2] = p[2];
    d[o + 3] = c[0];
    d[o + 4] = c[1];
    d[o + 5] = c[2];
    d[o + 6] = a;
    d[o + 7] = s;
  }
  private Lv(p: Vec3, c: Rgb, a: number): void {
    const o = this.nl++ * 7;
    const d = this.lineData;
    d[o] = p[0];
    d[o + 1] = p[1];
    d[o + 2] = p[2];
    d[o + 3] = c[0];
    d[o + 4] = c[1];
    d[o + 5] = c[2];
    d[o + 6] = a;
  }
  // a hairline that sways like weed in a current, drawn three times for a soft glow, with a pulse of light travelling along it
  private curve(A: Vec3, B: Vec3, seed: number, t: number, c: Rgb, a: number, pulse: number, segs = 14, sway = 0.16): void {
    if (this.nl + segs * 6 + 6 >= MAXL) return;
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const dz = B[2] - A[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    const px = -dy / len;
    const py = dx / len;
    const amp = len * sway * Math.sin(t * 0.55 + seed * 6.28);
    for (const [side, fade] of [[0, 1], [0.0011, 0.38], [-0.0011, 0.38]] as const) {
      let prev: Vec3 | null = null;
      let pa = 0;
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        const env = Math.sin(u * Math.PI);
        const bend = env * amp;
        const w = Math.sin(u * 9 + t * 1.3 + seed * 20) * len * 0.012 * env;
        const p: Vec3 = [
          A[0] + dx * u + px * (bend + w + side),
          A[1] + dy * u + py * (bend + w + side) + Math.cos(u * 7 + t + seed * 9) * len * 0.01 * env,
          A[2] + dz * u,
        ];
        const al = fade * a * (0.35 + 0.65 * Math.max(0, Math.sin(u * 14 - t * pulse + seed * 30) * 0.5 + 0.5)) * Math.min(1, env * 3 + 0.25);
        if (prev) {
          this.Lv(prev, c, pa);
          this.Lv(p, c, al);
        }
        prev = p;
        pa = al;
      }
    }
  }

  // ---------- the simulation: a pure function of the time T, so scrubbing just works ----------
  private simulate(): boolean {
    this.ng = 0;
    this.nl = 0;
    this.maxR = 0;
    const T = this.T;
    const simT = this.simT;
    const tmp: Vec3 = [0, 0, 0];
    const tmp2: Vec3 = [0, 0, 0];
    let pr: Vec3 = [0, 0, 0];
    let lastT = 0;
    let search = 0;
    let ok = 0;
    let fail = 0;
    let ticker = '';
    let tickAge = 1e9;
    let dimTarget = 0.8;
    const touched = new Set<number>();

    for (let i = 0; i < this.evs.length; i++) {
      const e = this.evs[i];
      if (e.ds > T) break;
      const res = e.dres ?? Infinity;
      const resolved = T >= res;
      const flight = T - e.ds;
      const age = resolved ? T - res : 0;
      if (e.focus && resolved) {
        const k = Math.min(1, 1 - Math.exp(-(Math.min(T, res + 3) - Math.max(lastT, res)) * 1.1) + 0.12);
        if (k > 0) pr = [pr[0] + (e.focus[0] - pr[0]) * k, pr[1] + (e.focus[1] - pr[1]) * k, pr[2] + (e.focus[2] - pr[2]) * k];
        lastT = res;
      }
      if (resolved) {
        if (e.k !== 'compile') search++;
        else if (e.ok) ok++;
        else fail++;
      }
      const base = e.k === 'compile' ? COL.pend : COL[e.k];
      const label =
        e.k === 'compile'
          ? !resolved
            ? 'compiling…'
            : e.ok
              ? '✅ verified a step'
              : '❌ rejected' + (e.unk?.length ? ' · unknown: ' + e.unk[0] : '')
          : e.blocked
            ? 'search allowance at 0 — go and prove'
            : e.hits
              ? e.hits.length + ' stars'
              : 'searching…';
      if (flight < tickAge) {
        tickAge = flight;
        const rgb = base.map((v) => (v * 255) | 0).join(',');
        ticker = `<b style="color:rgb(${rgb})">${e.k}</b>${e.q ? ' ▸ “' + esc(e.q) + '”' : ''} → ${esc(label)}`;
      }

      const ids = e.hits ?? e.used ?? [];
      const n = Math.max(1, ids.length);
      const active = !resolved || age < 4.5;
      if (active) {
        // a search dims the field so that what it returns can be read against the dark
        dimTarget = Math.min(dimTarget, e.k === 'compile' ? 0.34 : 0.16);
        const fade = resolved ? Math.max(0, 1 - age / 4.5) : 1;
        const ph = resolved ? 1 : Math.min(1, flight / 1.1);
        const resColor: Rgb = e.k === 'compile' ? (resolved ? (e.ok ? COL.ok : COL.fail) : COL.pend) : COL[e.k];
        const origin: Vec3 = [pr[0], pr[1], pr[2]];
        const isSearch = e.k !== 'compile';
        const shown = Math.min(ids.length, 40);
        for (let k = 0; k < shown; k++) {
          this.starPos(ids[k], simT, tmp);
          this.maxR = Math.max(this.maxR, Math.hypot(tmp[0] - pr[0], tmp[1] - pr[1], tmp[2] - pr[2]));
          const rank = k / n; // 0 = best result
          if (isSearch) {
            // read-out: results light up in rank order; the best are brightest and pulse fastest, the wave of light carries the ranking
            const reveal = resolved ? Math.min(1, Math.max(0, (age - k * 0.05) / 0.25)) : 0;
            const pulse = 0.62 + 0.38 * Math.sin(simT * (3.4 - 2.0 * rank) - k * 0.55);
            const bright = 0.3 + 0.7 * (1 - rank);
            if (reveal > 0) this.G(tmp, resColor, reveal * fade * bright * pulse * 0.9, 7 + 10 * (1 - rank));
            // an arm reaches out to each result; the best results have the strongest arms
            if (k < 28) {
              const ext = resolved ? 1 : ph;
              const tip: Vec3 = [origin[0] + (tmp[0] - origin[0]) * ext, origin[1] + (tmp[1] - origin[1]) * ext, origin[2] + (tmp[2] - origin[2]) * ext];
              this.curve(origin, tip, hash32(i * 131 + k), simT, resColor, (0.55 + 0.45 * (1 - rank)) * fade, 3.2 - 1.6 * rank, 20, 0.22);
            }
          } else if (resolved || k / shown < ph) {
            this.G(tmp, resColor, 0.9 * fade, 11);
          }
        }
        if (isSearch) {
          // feelers: arms that wander out of the glow while a search is under way, and keep reaching for a moment after
          const feel = !resolved ? 1 : fade;
          for (let q = 0; q < 6; q++) {
            const th = hash32(i * 17 + q) * 6.283 + simT * (0.4 + q * 0.07);
            const ph2 = hash32(i * 29 + q) * 6.283;
            const reach = 0.07 + 0.09 * (0.5 + 0.5 * Math.sin(simT * 1.7 + ph2));
            const tip: Vec3 = [origin[0] + Math.cos(th) * reach, origin[1] + Math.sin(th * 1.3) * reach * 0.8, origin[2] + Math.sin(th) * reach];
            this.curve(origin, tip, hash32(i * 53 + q), simT, resColor, 0.65 * feel, 3.6, 14, 0.4);
          }
        } else if (e.chain?.length) {
          for (const [a1, b1] of e.chain) {
            this.starPos(a1, simT, tmp);
            this.starPos(b1, simT, tmp2);
            this.curve(tmp, tmp2, hash32(a1 ^ b1), simT, resColor, resolved ? 0.95 * fade : 0.5, 4.0);
          }
        }
        if (!resolved && !ids.length) this.G(origin, resColor, 0.5 + 0.5 * Math.sin(flight * 9), 14);
        if (resolved && e.k === 'compile' && !e.ok) this.G(origin, COL.fail, fade * 0.9, 20 + 18 * (1 - fade));
        if (e.unk && resolved && age < 2) {
          for (let q = 0; q < e.unk.length; q++) {
            const th = hash32(i * 17 + q) * 6.28;
            this.G([origin[0] + Math.cos(th) * 0.03 * (1 + age), origin[1] + Math.sin(th) * 0.03 * (1 + age), origin[2]], COL.fail, Math.max(0, 1 - age / 2) * 0.8, 9);
          }
        }
      }
      if (e.k === 'compile' && e.ok && resolved) {
        // a verified step stays: the constellation Leak actually used
        const settle = Math.min(1, age / 1.5);
        for (const [a1, b1] of e.chain ?? []) {
          this.starPos(a1, simT, tmp);
          this.starPos(b1, simT, tmp2);
          this.curve(tmp, tmp2, hash32(a1 ^ b1), simT, COL.gold, 0.34 * settle, 1.4, 10);
        }
        for (const id of (e.used ?? []).slice(0, 18)) {
          this.starPos(id, simT, tmp);
          this.G(tmp, COL.gold, 0.55 * settle, 5);
        }
      }
      if (e.hits && resolved) for (const id of e.hits) touched.add(id);
      if (e.used && e.ok && resolved) for (const id of e.used) touched.add(id);
    }

    this.probe = pr;
    const anyActive = dimTarget < 0.8;
    this.G(pr, COL.gold, 0.95, 16 + 3 * Math.sin(T * 5));
    this.G(pr, [1, 1, 1], 0.75, 7);
    this.tgoal = [pr[0] * 0.9, pr[1] * 0.9, pr[2] * 0.9];
    this.dgoal = Math.min(2.2, Math.max(0.38, 0.3 + 1.7 * (anyActive ? this.maxR : 0.5)));
    this.dimTarget = dimTarget;

    const set = (k: string, v: string): void => {
      if (this.el[k].textContent !== v) this.el[k].textContent = v;
    };
    this.el.ticker.innerHTML = ticker;
    set('search', String(search));
    set('ok', String(ok));
    set('fail', String(fail));
    set('lem', touched.size.toLocaleString());
    let fin = false;
    if (this.mode === 'live') fin = this.liveFinal === true;
    else if (this.evs.length && this.run) fin = T > this.evs[this.evs.length - 1].ds + 2.5 && this.run.ok;
    this.el.done.classList.toggle('show', fin);
    if (fin) {
      this.el.doneSub.textContent =
        this.mode === 'live' ? `${ok} verified steps` : `${this.run!.theorem.replace(/_/g, '_​')} · closed in ${fmt(this.run!.seconds)} · ${ok} verified steps`;
    }
    return anyActive;
  }

  // ---------- labels: every galaxy gets one, shown when you are close enough to read it ----------
  private drawLabels(): void {
    const ctx = this.lctx;
    ctx.clearRect(0, 0, this.W, this.H);
    const D = this.DPR;
    const f = this.H / (2 * Math.tan(0.45));
    const placed: [number, number, number, number][] = [];
    let best: UniverseLib | null = null;
    let bd = 1e9;
    ctx.font = `${11 * D}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    this.libsBySize.forEach((l, rank) => {
      const w = this.VP[3] * l.c[0] + this.VP[7] * l.c[1] + this.VP[11] * l.c[2] + this.VP[15];
      if (w <= 0.05) return;
      const x = ((this.VP[0] * l.c[0] + this.VP[4] * l.c[1] + this.VP[8] * l.c[2] + this.VP[12]) / w * 0.5 + 0.5) * this.W;
      const y = (1 - ((this.VP[1] * l.c[0] + this.VP[5] * l.c[1] + this.VP[9] * l.c[2] + this.VP[13]) / w * 0.5 + 0.5)) * this.H;
      const pxR = (l.r * f) / w;
      if (x < -50 || y < -20 || x > this.W + 50 || y > this.H + 20) return;
      const d = Math.hypot(x / D - this.mouse.x, y / D - this.mouse.y);
      if (this.mouse.x >= 0 && d < bd && d < Math.max(36, pxR / D)) {
        bd = d;
        best = l;
      }
      // the biggest are always named; the rest appear as the camera comes close enough that the galaxy is a readable size
      const want = rank < 8 ? 1 : Math.max(0, Math.min(1, (pxR / D - 7) / 10));
      const prev = this.libLabelAlpha.get(l.name) ?? 0;
      const a = prev + (want - prev) * 0.15;
      this.libLabelAlpha.set(l.name, a);
      if (a < 0.04) return;
      const text = nice(l.name);
      const tw = ctx.measureText(text).width;
      const lx = x + 6 * D;
      const ly = y + 6 * D;
      if (placed.some((r) => lx < r[0] + r[2] && lx + tw > r[0] && ly < r[1] + r[3] && ly + 13 * D > r[1])) return;
      placed.push([lx, ly, tw, 13 * D]);
      ctx.globalAlpha = a * 0.92;
      ctx.lineWidth = 3 * D;
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(text, lx, ly);
      ctx.fillStyle = '#d7deef';
      ctx.fillText(text, lx, ly);
    });
    ctx.globalAlpha = 1;
    const tip = this.el.tip as HTMLElement;
    const b = best as UniverseLib | null;
    if (b) {
      tip.style.display = 'block';
      tip.style.left = `${this.mouse.x + 14}px`;
      tip.style.top = `${this.mouse.y + 14}px`;
      tip.innerHTML = `<b>${esc(nice(b.name))} galaxy</b><br><span>${(b.t + b.u).toLocaleString()} theorems · ${b.t.toLocaleString()} trusted</span>`;
    } else tip.style.display = 'none';
  }

  // ---------- frame ----------
  private updateCam(dt: number): void {
    const follow = (this.el.follow as HTMLInputElement).checked && performance.now() > this.freeUntil;
    const k = 1 - Math.exp(-dt * 1.6);
    if (follow) {
      for (let i = 0; i < 3; i++) this.target[i] += (this.tgoal[i] - this.target[i]) * k;
      this.dist += (this.dgoal - this.dist) * k;
    } else if (!this.dragging) this.yaw += dt * 0.012;
    const cp = Math.cos(this.pitch);
    const eye: Vec3 = [
      this.target[0] + this.dist * cp * Math.sin(this.yaw),
      this.target[1] + this.dist * Math.sin(this.pitch),
      this.target[2] + this.dist * cp * Math.cos(this.yaw),
    ];
    this.VP = mul(persp(0.9, this.W / this.H, 0.02, 20), lookAt(eye, this.target, [0, 1, 0]));
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.simT += dt;
    this.clock += dt;
    if (this.mode === 'live') this.T = this.clock;
    else if (this.playing) {
      this.T += dt * this.speed;
      if (this.T > this.dur) this.T = 0;
      (this.el.seek as HTMLInputElement).value = String((this.T / this.dur) * 1000);
    }
    if (this.mode === 'replay' && this.run) this.el.time.textContent = `${fmt((this.T / this.dur) * this.run.seconds)} / ${fmt(this.run.seconds)}`;
    this.simulate();
    this.dimNow += (this.dimTarget - this.dimNow) * (1 - Math.exp(-dt * 3));
    this.updateCam(dt);

    const gl = this.gl;
    gl.clearColor(0.016, 0.02, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const ps = this.DPR * (this.H / 900) * 2.1;
    gl.useProgram(this.progStar);
    gl.bindVertexArray(this.vaoStars);
    gl.uniformMatrix4fv(this.u(this.progStar, 'u_vp'), false, this.VP);
    gl.uniform1f(this.u(this.progStar, 'u_scale'), this.SC);
    gl.uniform1f(this.u(this.progStar, 'u_time'), this.simT);
    gl.uniform1f(this.u(this.progStar, 'u_psize'), ps);
    gl.uniform1f(this.u(this.progStar, 'u_dim'), this.dimNow);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.uniform1i(this.u(this.progStar, 'u_pal'), 0);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); // screen blending keeps dense cores from burning out
    gl.drawArrays(gl.POINTS, 0, Math.floor(this.N * this.drawFrac));
    gl.blendFunc(gl.ONE, gl.ONE);
    if (this.nl) {
      gl.useProgram(this.progLine);
      gl.bindVertexArray(this.vaoLine);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufLine);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineData, 0, this.nl * 7);
      gl.uniformMatrix4fv(this.u(this.progLine, 'u_vp'), false, this.VP);
      gl.drawArrays(gl.LINES, 0, this.nl);
    }
    if (this.ng) {
      gl.useProgram(this.progGlow);
      gl.bindVertexArray(this.vaoGlow);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGlow);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.glowData, 0, this.ng * 8);
      gl.uniformMatrix4fv(this.u(this.progGlow, 'u_vp'), false, this.VP);
      gl.uniform1f(this.u(this.progGlow, 'u_psize'), ps * 7);
      gl.drawArrays(gl.POINTS, 0, this.ng);
    }
    this.drawLabels();

    this.frames++;
    if (now - this.fpsT > 1000) {
      const fps = (this.frames * 1000) / (now - this.fpsT);
      this.el.fps.textContent = `${fps.toFixed(0)} fps · ${Math.floor((this.N * this.drawFrac) / 1000).toLocaleString()}k stars`;
      this.frames = 0;
      this.fpsT = now;
      if (!this.userQuality && fps < 24 && this.drawFrac > 0.25 && ++this.slow >= 2) {
        this.drawFrac = this.drawFrac > 0.5 ? 0.5 : 0.25;
        this.slow = 0;
        (this.el.quality as HTMLSelectElement).value = String(this.drawFrac);
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
