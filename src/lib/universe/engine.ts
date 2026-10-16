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
  loogle: [1.0, 0.95, 0.8], // cream: the landing page's hottest tint
  moogle: [1.0, 0.62, 0.3], // orange
  pend: [1.0, 0.8, 0.55], // amber
  ok: [0.62, 1.0, 0.55],
  fail: [0.95, 0.3, 0.22], // ember red
  gold: [1.0, 0.86, 0.5],
};

const CSS = `
.tku{position:relative;width:100%;height:100%;overflow:hidden;background:#07080a;color:#f1ecdc;font:13px/1.35 ui-monospace,SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace;-webkit-font-smoothing:antialiased;
 --dim:#a39c86;--gold:#ffd98a;--cyan:#fff2cc;--violet:#ff9e4d;--green:#9dff8c;--red:#f2503a;--panel:rgba(14,16,10,.66);--line:rgba(255,217,138,.18)}
.tku canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.tku canvas.tku-drag{cursor:grabbing}
.tku .tku-labels{pointer-events:none}
.tku .hud{position:absolute;pointer-events:none;z-index:2;text-shadow:0 0 10px #000,0 0 3px #000}
.tku .tku-title{left:16px;top:12px}.tku .tku-title h1{margin:0;font-size:17px;font-weight:700;letter-spacing:.01em;color:#ffe9a8;text-shadow:0 0 14px rgba(255,200,80,.45),0 0 3px #000}
.tku .tku-title p{margin:3px 0 0;color:var(--dim);font-size:12px}.tku b{color:#fff4dc;font-weight:600;font-variant-numeric:tabular-nums}
.tku .tku-stats{right:16px;top:12px;text-align:right;font-variant-numeric:tabular-nums}.tku .tku-stats div{margin-bottom:3px;color:var(--dim)}
.tku .tku-perf{right:12px;top:112px;padding:6px 8px;background:rgba(10,11,7,.55);border:1px solid var(--line);border-radius:8px;text-align:right;text-shadow:none;font-variant-numeric:tabular-nums;font-size:11px;color:var(--dim);line-height:1.4}
.tku .tku-perf canvas{position:static;display:block;margin:0 0 3px auto;width:120px;height:30px;cursor:default;opacity:.92}
.tku .tku-perf .tku-fps{font-size:15px;color:#ffe9a8;font-weight:700}.tku .tku-perf .tku-fps small{font-size:11px;font-weight:400;color:var(--dim)}
.tku .tku-legend{left:16px;top:76px;color:var(--dim);font-size:12px}.tku .tku-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:-1px}.tku .tku-legend div{margin:3px 0}
.tku .tku-ticker{left:50%;transform:translateX(-50%);bottom:76px;max-width:min(760px,calc(100% - 32px));width:100%;text-align:center;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim);min-height:18px}
.tku .tku-bar{position:absolute;z-index:3;left:50%;transform:translateX(-50%);bottom:12px;width:min(900px,calc(100% - 24px));display:flex;gap:10px;align-items:center;padding:9px 12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;backdrop-filter:blur(10px)}
.tku .tku-bar button,.tku .tku-bar select{background:rgba(255,217,138,.05);color:#ffe9b8;border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer;min-height:32px}
.tku .tku-bar button:hover,.tku .tku-bar select:hover{background:rgba(255,217,138,.14)}
.tku .tku-bar button.on{background:rgba(255,217,138,.18);border-color:rgba(255,217,138,.5)}
.tku .tku-bar input[type=range]{flex:1;min-width:60px;accent-color:#ffd98a}.tku .tku-bar label{color:var(--dim);display:flex;align-items:center;gap:5px;white-space:nowrap}
.tku .tku-time{color:var(--dim);font-variant-numeric:tabular-nums;min-width:76px;text-align:right}
.tku .tku-tip{position:absolute;z-index:4;pointer-events:none;padding:7px 10px;background:var(--panel);border:1px solid var(--line);border-radius:8px;font-size:12px;backdrop-filter:blur(8px);display:none}.tku .tku-tip span{color:var(--dim)}
.tku .tku-live{display:none;color:var(--red);font-weight:600;letter-spacing:.06em}
.tku.live .tku-replay-only{display:none}.tku.live .tku-live{display:inline}.tku .tku-live-only{display:none}.tku.live .tku-live-only{display:inline}
@media (max-width:640px){.tku .tku-legend,.tku .tku-stats{display:none}.tku .tku-perf{top:8px;right:8px}.tku .tku-perf-more{display:none}.tku .tku-title{max-width:calc(100% - 150px)}.tku .tku-title p{display:none}.tku .tku-bar{flex-wrap:wrap;gap:8px}.tku .tku-bar select.tku-run{flex:1 1 120px;min-width:0}
 .tku .tku-bar input.tku-seek{order:9;flex:1 1 100%}.tku .tku-bar .tku-time{order:8;flex:1 1 auto;text-align:left;min-width:0}.tku .tku-opt{display:none}.tku .tku-ticker{bottom:132px;font-size:11px}}
`;

const HASH_GLSL = `float hash(uint x){ x ^= x>>16; x *= 0x7feb352du; x ^= x>>15; x *= 0x846ca68bu; x ^= x>>16; return float(x)/4294967295.0; }`;
const FLOW_GLSL = `vec3 flow(vec3 p, float h, float h2, float t){ return 0.0042*vec3(sin(p.y*9.0+t*0.23+h*6.283), sin(p.z*9.0+t*0.19+h2*6.283), sin(p.x*9.0+t*0.21+(h+h2)*3.1))*(0.5+h2); }`;

const STAR_VS = `#version 300 es
precision highp float; precision highp int;
in vec3 a_pos; in uint a_lib;
uniform mat4 u_vp; uniform float u_scale, u_time, u_psize, u_dim, u_gain; uniform sampler2D u_pal;
out vec4 v_col; out float v_big;
${HASH_GLSL}
${FLOW_GLSL}
void main(){
  uint id = uint(gl_VertexID); float h = hash(id), h2 = hash(id*747796405u+2891336453u), h3 = hash(id*2246822519u+3266489917u);
  vec3 p = a_pos*u_scale; p += flow(p,h,h2,u_time);
  gl_Position = u_vp*vec4(p,1.0);
  uint lib = a_lib & 0x7FFFu;
  vec3 hue = texelFetch(u_pal, ivec2(int(lib)&255, int(lib)>>8), 0).rgb;
  float tw = 0.72 + 0.28*sin(u_time*(0.6+h*1.4)+h2*40.0);
  // the landing page's warm spectrum - cream, amber, orange, ember - hashed per star, then tinted by its galaxy
  vec3 warm = mix(mix(vec3(1.0,0.95,0.80), vec3(1.0,0.80,0.55), smoothstep(0.25,0.55,h3)), mix(vec3(1.0,0.62,0.30), vec3(0.95,0.42,0.22), smoothstep(0.9,1.0,h3)), smoothstep(0.62,0.9,h3));
  vec3 col = mix(warm, hue, 0.45);
  // one star in sixty-odd is a bright one: a hot cream core, a halo and a diffraction cross
  float big = step(0.985, h);
  v_big = big;
  v_col = vec4(col*tw, u_gain*(0.55+h2*0.9)*u_dim*(1.0+big*1.5));
  float d = max(gl_Position.w, 0.05);
  gl_PointSize = big > 0.5 ? clamp(u_psize*(2.4+h2*1.8)/d, 4.0, 11.0) : clamp(u_psize*(0.7+h*0.9)/d, 1.0, 3.4);
}`;
const STAR_FS = `#version 300 es
precision mediump float; in vec4 v_col; in float v_big; out vec4 o;
void main(){
  vec2 d = gl_PointCoord-0.5; float r2 = dot(d,d);
  if (v_big < 0.5) { float a = exp(-r2*14.0)*(1.0-smoothstep(0.16,0.25,r2)); o = vec4(v_col.rgb*v_col.a*a, 1.0); return; }
  float w = 1.0-smoothstep(0.26,0.5,sqrt(r2));
  float core = exp(-r2*150.0), halo = exp(-r2*16.0);
  float cross = (exp(-abs(d.x)*90.0)+exp(-abs(d.y)*90.0))*(1.0-2.0*sqrt(r2));
  vec3 c = v_col.rgb*(halo*0.55+cross*0.5) + mix(v_col.rgb, vec3(1.0,0.96,0.86), 0.7)*core*1.4;
  o = vec4(c*v_col.a*w, 1.0);
}`;
// a negative size draws a precision flare (a hairline cross with a pinpoint core) that anchors a result; a size of 1000 plus a radius draws a small
// ring that pings once as the result arrives; anything else is a blaze: a cream-white core, a halo cooling through the colour toward ember, and
// diffraction spikes (the landing page's "hot knots" in the nebula)
const GLOW_VS = `#version 300 es
precision highp float; in vec3 a_pos; in vec4 a_col; in float a_size; uniform mat4 u_vp; uniform float u_psize; out vec4 v_col; out float v_kind;
void main(){ gl_Position = u_vp*vec4(a_pos,1.0); v_col = a_col; float a = abs(a_size); v_kind = a >= 1000.0 ? 2.0 : (a_size < 0.0 ? 1.0 : 0.0); float sz = a >= 1000.0 ? a - 1000.0 : a; gl_PointSize = clamp(u_psize*sz/max(gl_Position.w,0.05), 3.0, 84.0); }`;
const GLOW_FS = `#version 300 es
precision mediump float; in vec4 v_col; in float v_kind; out vec4 o;
void main(){
  vec2 d = gl_PointCoord-0.5; float r = length(d)*2.0; float edge = 1.0-smoothstep(0.72,1.0,r);
  vec2 e = vec2(d.x+d.y, d.x-d.y)*0.7071;
  if (v_kind > 1.5) { float ring = smoothstep(0.82,0.9,r)*(1.0-smoothstep(0.9,0.97,r)); o = vec4(v_col.rgb*v_col.a*ring, 1.0); return; }
  vec3 cream = vec3(1.0,0.95,0.82);
  if (v_kind > 0.5) {
    float fall = pow(max(0.0,1.0-r),1.5); float arms = (exp(-abs(d.y)*48.0)+exp(-abs(d.x)*48.0))*0.5*fall; float diag = (exp(-abs(e.y)*70.0)+exp(-abs(e.x)*70.0))*0.14*fall*fall; float core = exp(-r*r*140.0);
    o = vec4(mix(v_col.rgb, cream, 0.55)*v_col.a*(arms*0.9+diag+core*1.1), 1.0); return; }
  float core = exp(-r*r*70.0), body = exp(-r*r*16.0), halo = exp(-r*r*3.2);
  float cross = (exp(-abs(d.x)*44.0)+exp(-abs(d.y)*44.0))*0.5*(1.0-r)*(1.0-r);
  float diag = (exp(-abs(e.x)*70.0)+exp(-abs(e.y)*70.0))*0.14*(1.0-r)*(1.0-r);
  vec3 ember = v_col.rgb*vec3(1.0,0.62,0.42);
  vec3 c = mix(ember, v_col.rgb, body)*(halo*0.15+body*0.32+cross+diag) + mix(v_col.rgb, cream, 0.85)*core*1.2;
  o = vec4(c*v_col.a*edge, 1.0); }`;
const TONE_VS = `#version 300 es
out vec2 v_uv; void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); v_uv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
// Stars are summed in linear light, then compressed: a crowd of stars is a bright patch of the galaxy's own colour, not a white block.
// Under them sits a faint ember/tan haze that drifts as the camera turns - the landing page's nebula floor on an olive-black sky.
const TONE_FS = `#version 300 es
precision highp float; uniform sampler2D u_tex; uniform float u_exposure, u_aspect; uniform vec2 u_cam; in vec2 v_uv; out vec4 o;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x), mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x), f.y); }
void main(){
  vec3 c = texture(u_tex, v_uv).rgb; float L = dot(c, vec3(0.2126,0.7152,0.0722)) + 1e-5; float k = L*u_exposure; float m = 1.0 - exp(-k);
  vec3 col = c*(m/L); col = mix(col, vec3(m), smoothstep(1.5,6.0,k)*0.35);
  vec2 q = v_uv-0.5; float vig = 1.0 - dot(q,q)*0.55;
  vec2 p = q*vec2(u_aspect,1.0)*1.7 + u_cam*0.75;
  float n = vn(p*1.3)*0.6 + vn(p*2.9+17.0)*0.4;
  float gate = smoothstep(0.42,0.78, vn(p*0.45+3.0));
  vec3 haze = mix(vec3(0.30,0.09,0.045), vec3(0.85,0.55,0.28), n)*gate*(0.012+0.05*n*n);
  o = vec4(pow(col, vec3(0.92)) + (vec3(0.022,0.024,0.014)+haze)*vig, 1.0); }`;
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
  private readonly progTone: WebGLProgram;
  private readonly vaoTone: WebGLVertexArrayObject;
  private hdr: { fbo: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private canHdr = false;
  private hudRects: [number, number, number, number][] = [];
  private marks: { star: number; rank: number; name: string; color: Rgb; alpha: number }[] = [];
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
  private liveFinAt = 0;
  private interp: LiveInterpreter | null = null;
  private dimNow = 0.8;
  private dimTarget = 0.8;
  private drawFrac = 1;
  private userQuality = false;
  private frames = 0;
  private fpsT = 0;
  private slow = 0;
  private last = 0;
  // performance: real frame intervals, JS time per frame, and GPU time where the browser exposes a timer query
  private readonly dts = new Float32Array(240);
  private readonly cpus = new Float32Array(240);
  private nPerf = 0;
  private perfAt = 0;
  private gpuMs: number | null = null;
  private timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private readonly gpuPending: WebGLQuery[] = [];
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
    this.progTone = this.program(TONE_VS, TONE_FS);
    this.vaoTone = gl.createVertexArray()!;
    this.canHdr = !!(gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float'));
    this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

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
    this.liveFinAt = this.T;
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
  }

  // ---------- HUD ----------
  private buildHud(): void {
    const m = this.data.meta;
    const html = `
      <div class="hud tku-title" data-k="title"><h1>Tengoku universe</h1><p><b>${m.n.toLocaleString()}</b> trusted theorems · every star is one Leak can use while proving, every cluster a library</p></div>
      <div class="hud tku-legend" data-k="legend">
        <div><i style="background:#ffe9c4"></i>a trusted theorem (verified by Leak)</div>
        <div><i style="background:var(--cyan)"></i>type-pattern search (Leak I loogle)</div>
        <div><i style="background:var(--violet)"></i>concept search (Leak I moogle)</div>
        <div><i style="background:var(--gold)"></i>compile (Leak IV) &nbsp;<i style="background:var(--green)"></i>✅ &nbsp;<i style="background:var(--red)"></i>❌</div>
      </div>
      <div class="hud tku-stats" data-k="stats"><div class="tku-live-only"><span class="tku-live">● LIVE</span></div><div>searches <b data-k="search">0</b></div><div>compiles <b data-k="ok">0</b> ✅ · <b data-k="fail">0</b> ❌</div><div>lemmas touched <b data-k="lem">0</b></div></div>
      <div class="hud tku-perf" data-k="perf" aria-label="Performance"><canvas data-k="perfGraph" width="120" height="30"></canvas><div class="tku-fps"><span data-k="fps">–</span> <small>fps</small></div><div data-k="perfA"></div><div data-k="perfB"></div><div class="tku-perf-more" data-k="perfC"></div></div>
      <div class="hud tku-ticker" data-k="ticker"></div>
      <div class="tku-tip" data-k="tip"></div>
      <div class="tku-bar" data-k="bar" role="group" aria-label="Universe controls">
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
    if (this.canHdr) this.allocHdr();
    this.refreshHud();
  }

  private allocHdr(): void {
    const gl = this.gl;
    if (!this.hdr) {
      const tex = gl.createTexture()!;
      const fbo = gl.createFramebuffer()!;
      this.hdr = { fbo, tex };
    }
    gl.bindTexture(gl.TEXTURE_2D, this.hdr.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.W, this.H, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdr.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.hdr.tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      this.canHdr = false;
      this.hdr = null;
    }
  }

  /** the HUD's own boxes (CSS px, relative to the universe), so galaxy labels stay out from under it */
  private refreshHud(): void {
    const r0 = this.root.getBoundingClientRect();
    this.hudRects = ['title', 'legend', 'stats', 'perf', 'ticker', 'bar'].map((k) => {
      const e = this.el[k];
      if (!e) return [0, 0, 0, 0] as [number, number, number, number];
      const b = e.getBoundingClientRect();
      return [b.left - r0.left - 6, b.top - r0.top - 6, b.width + 12, b.height + 12] as [number, number, number, number];
    });
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
    const marks: typeof this.marks = [];
    let dimTarget = 0.8;
    const touched = new Set<number>();
    // the end of a proof is shown, not announced: the constellation Leak used ignites outward from where the proof closed, the sky lights up and the
    // view draws back to take in the whole of it. fa is seconds since the proof closed (negative while it is still open).
    let fa = -1;
    if (this.mode === 'live') {
      if (this.liveFinal === true) fa = T - this.liveFinAt;
    } else if (this.evs.length && this.run?.ok) fa = T - (this.evs[this.evs.length - 1].ds + 2.5);
    const fin = fa >= 0;
    const finGlow = fin ? Math.min(1, fa / 1.5) : 0;
    const okIds = new Set<number>();

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
      const hold = e.k === 'compile' ? 4.5 : 7;
      const active = !resolved || age < hold;
      if (active) {
        // a search dims the field so that what it returns can be read against the dark
        dimTarget = Math.min(dimTarget, e.k === 'compile' ? 0.34 : 0.16);
        const fade = resolved ? Math.max(0, 1 - age / hold) : 1;
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
            if (reveal > 0) {
              this.G(tmp, resColor, reveal * fade * bright * pulse * 0.9, 7 + 10 * (1 - rank));
              if (k < 8) {
                // the anchor: a precision flare on each of the best results (the best largest), and one small ping as it arrives
                this.G(tmp, resColor, reveal * fade * (0.95 - 0.55 * rank), -(k === 0 ? 34 : 24 - k * 1.5));
                const pt = age - k * 0.05;
                if (pt > 0 && pt < 0.7) this.G(tmp, resColor, (1 - pt / 0.7) * 0.75 * fade, 1000 + 8 + 20 * (pt / 0.7));
              }
              if (k < 6 && e.hn?.[k]) marks.push({ star: ids[k], rank: k, name: e.hn[k], color: resColor, alpha: reveal * Math.min(1, fade * 1.6) });
            }
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
          this.curve(tmp, tmp2, hash32(a1 ^ b1), simT, COL.gold, 0.34 * settle * (1 + 1.6 * finGlow), 1.4 + 2 * finGlow, 10);
        }
        for (const id of (e.used ?? []).slice(0, 18)) {
          this.starPos(id, simT, tmp);
          this.G(tmp, COL.gold, 0.36 * settle, 3.4);
          okIds.add(id);
        }
      }
      if (e.hits && resolved) for (const id of e.hits) touched.add(id);
      if (e.used && e.ok && resolved) for (const id of e.used) touched.add(id);
    }

    let finR = 0;
    if (fin) {
      const wave = fa * 0.55; // the front of light, in universe units per second
      let n = 0;
      for (const id of okIds) {
        if (n++ >= 400) break;
        this.starPos(id, simT, tmp);
        const dist = Math.hypot(tmp[0] - pr[0], tmp[1] - pr[1], tmp[2] - pr[2]);
        finR = Math.max(finR, dist);
        const behind = Math.min(1, Math.max(0, (wave - dist) / 0.08 + 0.5)); // 1 once the front has passed
        const flash = Math.exp(-(((dist - wave) / 0.07) ** 2));
        const breathe = 0.8 + 0.2 * Math.sin(simT * 2.2 + dist * 14);
        this.G(tmp, COL.gold, behind * 0.55 * breathe + flash * 0.9, 7 + 12 * flash + 3 * behind);
      }
      // a sunrise at the closing step: one big soft bloom that opens and fades, and a steady white-gold heart
      this.G(pr, COL.gold, 0.85 * Math.exp(-fa * 0.7) * Math.min(1, fa * 3), 40 + 30 * Math.min(1, fa / 2));
      this.G(pr, [1, 0.97, 0.85], 0.7 * finGlow, 14 + 2 * Math.sin(simT * 2));
    }
    this.marks = marks;
    this.probe = pr;
    if (fin) dimTarget = 1; // the whole universe comes up to full light
    const anyActive = dimTarget < 0.8;
    this.G(pr, COL.gold, 0.95, 16 + 3 * Math.sin(T * 5));
    this.G(pr, [1, 1, 1], 0.75, 7);
    this.tgoal = [pr[0] * 0.9, pr[1] * 0.9, pr[2] * 0.9];
    this.dgoal = Math.min(2.2, Math.max(0.38, 0.3 + 1.7 * (fin ? Math.max(finR, 0.25) : anyActive ? this.maxR : 0.5)));
    this.dimTarget = dimTarget;

    const set = (k: string, v: string): void => {
      if (this.el[k].textContent !== v) this.el[k].textContent = v;
    };
    if (!this.evs.length && this.mode === 'live') ticker = 'Live: waiting for a prover run. Send a statement above and every Leak I search and Leak IV compile appears here.';
    this.el.ticker.innerHTML = ticker;
    set('search', String(search));
    set('ok', String(ok));
    set('fail', String(fail));
    set('lem', touched.size.toLocaleString());
    return anyActive;
  }

  // ---------- labels: every galaxy gets one, shown when you are close enough to read it; the best results of a search are named and ranked ----------
  private project(p: Vec3, out: [number, number, number]): boolean {
    const w = this.VP[3] * p[0] + this.VP[7] * p[1] + this.VP[11] * p[2] + this.VP[15];
    if (w <= 0.05) return false;
    out[0] = (((this.VP[0] * p[0] + this.VP[4] * p[1] + this.VP[8] * p[2] + this.VP[12]) / w) * 0.5 + 0.5) * this.W;
    out[1] = (1 - (((this.VP[1] * p[0] + this.VP[5] * p[1] + this.VP[9] * p[2] + this.VP[13]) / w) * 0.5 + 0.5)) * this.H;
    out[2] = w;
    return true;
  }

  private drawLabels(): void {
    const ctx = this.lctx;
    ctx.clearRect(0, 0, this.W, this.H);
    const D = this.DPR;
    const f = this.H / (2 * Math.tan(0.45));
    const placed: [number, number, number, number][] = this.hudRects.map(([x, y, w, h]) => [x * D, y * D, w * D, h * D]);
    const hits = (lx: number, ly: number, tw: number, th: number): boolean =>
      placed.some((r) => lx < r[0] + r[2] && lx + tw > r[0] && ly < r[1] + r[3] && ly + th > r[1]);
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'top';
    const o: [number, number, number] = [0, 0, 0];
    const p: Vec3 = [0, 0, 0];

    // the results of the latest search: rank and lemma name on a thin leader beside each anchored star
    ctx.font = `${11.5 * D}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    for (const m of this.marks) {
      this.starPos(m.star, this.simT, p);
      if (!this.project(p, o)) continue;
      const name = m.name.length > 38 ? '\u2026' + m.name.slice(-37) : m.name;
      const text = `${m.rank + 1}  ${name}`;
      const tw = ctx.measureText(text).width;
      const lx = o[0] + 26 * D;
      const ly = o[1] - 20 * D;
      if (lx > this.W + 10 || o[1] < -10 || o[1] > this.H + 10) continue;
      const rgb = m.color.map((v) => Math.min(255, (v * 255 + 40) | 0)).join(',');
      ctx.globalAlpha = Math.min(1, m.alpha);
      ctx.strokeStyle = `rgba(${rgb},.55)`;
      ctx.lineWidth = 1 * D;
      ctx.beginPath();
      ctx.moveTo(o[0] + 5 * D, o[1] - 5 * D);
      ctx.lineTo(lx - 7 * D, ly + 7 * D);
      ctx.lineTo(lx - 3 * D, ly + 7 * D);
      ctx.stroke();
      ctx.fillStyle = 'rgba(4,5,10,.6)';
      ctx.fillRect(lx - 2 * D, ly - 2 * D, tw + 8 * D, 17 * D);
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.fillRect(lx - 2 * D, ly - 2 * D, 1.5 * D, 17 * D);
      ctx.fillStyle = 'rgba(232,240,255,.92)';
      ctx.fillText(text, lx + 4 * D, ly);
      placed.push([lx - 2 * D, ly - 2 * D, tw + 8 * D, 17 * D]);
    }

    let best: UniverseLib | null = null;
    let bd = 1e9;
    ctx.font = `${11 * D}px ui-sans-serif, system-ui, sans-serif`;
    this.libsBySize.forEach((l, rank) => {
      if (!this.project(l.c, o)) return;
      const [x, y, w] = o;
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
      if (hits(lx, ly, tw, 13 * D)) return;
      placed.push([lx, ly, tw, 13 * D]);
      ctx.globalAlpha = a * 0.9;
      ctx.lineWidth = 2.5 * D;
      ctx.strokeStyle = 'rgba(4,5,10,.8)';
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
      tip.innerHTML = `<b>${esc(nice(b.name))} galaxy</b><br><span>${(b.t + b.u).toLocaleString()} theorems</span>`;
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

  // ---------- performance ----------
  // GPU time is the real headroom number: rAF is capped at the display's refresh rate, so "60 fps" alone cannot tell a GPU at 10% from one at 99%.
  private beginGpu(): boolean {
    const x = this.timerExt;
    if (!x || this.gpuPending.length >= 3) return false;
    const q = this.gl.createQuery();
    if (!q) return false;
    this.gl.beginQuery(x.TIME_ELAPSED_EXT, q);
    this.gpuPending.push(q);
    return true;
  }
  private endGpu(): void {
    if (this.timerExt) this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
  }
  private pollGpu(): void {
    const x = this.timerExt;
    const gl = this.gl;
    const q = this.gpuPending[0];
    if (!x || !q) return;
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return;
    this.gpuPending.shift();
    if (!gl.getParameter(x.GPU_DISJOINT_EXT)) {
      const ms = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
      this.gpuMs = this.gpuMs === null ? ms : this.gpuMs * 0.85 + ms * 0.15;
    }
    gl.deleteQuery(q);
  }
  private showPerf(): void {
    const n = Math.min(this.nPerf, 240);
    if (n < 8) return;
    const win = Math.min(n, 120); // the last ~second or two
    const last = this.nPerf;
    const ds: number[] = [];
    let sum = 0;
    let cpu = 0;
    let worst = 0;
    for (let k = 1; k <= win; k++) {
      const i = (last - k) % 240;
      ds.push(this.dts[i]);
      sum += this.dts[i];
      cpu += this.cpus[i];
      worst = Math.max(worst, this.dts[i]);
    }
    ds.sort((a, b) => a - b);
    const avg = sum / win;
    const p99 = ds[Math.min(win - 1, Math.floor(win * 0.99))];
    const set = (k: string, v: string): void => {
      if (this.el[k].textContent !== v) this.el[k].textContent = v;
    };
    set('fps', (1000 / avg).toFixed(0));
    set('perfA', `${avg.toFixed(1)} ms · 1% low ${(1000 / p99).toFixed(0)} fps`);
    const gpu = this.gpuMs === null ? (this.timerExt ? '…' : 'n/a') : this.gpuMs.toFixed(1);
    set('perfB', `cpu ${(cpu / win).toFixed(1)} · gpu ${gpu} ms`);
    set('perfC', `${Math.floor((this.N * this.drawFrac) / 1000).toLocaleString()}k stars · ${this.W}×${this.H}`);
    // frame-time graph: one bar per frame, 0-40 ms, with the 60 fps and 30 fps budgets ruled in
    const cv = this.el.perfGraph as HTMLCanvasElement;
    const c = cv.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, cv.width, cv.height);
    const H = cv.height;
    const y = (ms: number): number => H - Math.min(1, ms / 40) * (H - 2);
    c.fillStyle = 'rgba(255,217,138,.10)';
    c.fillRect(0, y(33.4), cv.width, 1);
    c.fillRect(0, y(16.7), cv.width, 1);
    for (let k = 0; k < 120 && k < n; k++) {
      const ms = this.dts[(last - 1 - k) % 240];
      c.fillStyle = ms > 33.4 ? '#f2503a' : ms > 20 ? '#ff9e4d' : '#ffd98a';
      c.fillRect(cv.width - 1 - k, y(ms), 1, H - y(ms));
    }
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const t0 = performance.now();
    const raw = now - this.last;
    const dt = Math.min(0.1, raw / 1000);
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
    const hdr = this.hdr;
    if (hdr) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fbo);
      gl.viewport(0, 0, this.W, this.H);
      gl.clearColor(0, 0, 0, 1);
    } else gl.clearColor(0.022, 0.024, 0.014, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const gpuQ = this.beginGpu();
    const ps = this.DPR * (this.H / 900) * 2.1;
    gl.useProgram(this.progStar);
    gl.bindVertexArray(this.vaoStars);
    gl.uniformMatrix4fv(this.u(this.progStar, 'u_vp'), false, this.VP);
    gl.uniform1f(this.u(this.progStar, 'u_scale'), this.SC);
    gl.uniform1f(this.u(this.progStar, 'u_time'), this.simT);
    gl.uniform1f(this.u(this.progStar, 'u_psize'), ps);
    gl.uniform1f(this.u(this.progStar, 'u_dim'), this.dimNow);
    gl.uniform1f(this.u(this.progStar, 'u_gain'), hdr ? 0.34 : 0.34);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.uniform1i(this.u(this.progStar, 'u_pal'), 0);
    if (!hdr) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); // without a float target, screen blending keeps dense cores from burning out
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
    if (hdr) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.BLEND);
      gl.useProgram(this.progTone);
      gl.bindVertexArray(this.vaoTone);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hdr.tex);
      gl.uniform1i(this.u(this.progTone, 'u_tex'), 0);
      gl.uniform1f(this.u(this.progTone, 'u_exposure'), 2.3);
      gl.uniform1f(this.u(this.progTone, 'u_aspect'), this.W / this.H);
      gl.uniform2f(this.u(this.progTone, 'u_cam'), this.yaw, this.pitch);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.BLEND);
    }
    if (gpuQ) this.endGpu();
    if (this.frames % 30 === 0) this.refreshHud();
    this.drawLabels();

    this.frames++;
    if (raw < 1000) {
      // a hidden tab's long gap is not a frame
      const i = this.nPerf++ % 240;
      this.dts[i] = raw;
      this.cpus[i] = performance.now() - t0;
    }
    this.pollGpu();
    if (now - this.perfAt > 400) {
      this.perfAt = now;
      this.showPerf();
    }
    if (now - this.fpsT > 1000) {
      const fps = (this.frames * 1000) / (now - this.fpsT);
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
