// The Tengoku universe: every theorem is a star, every library a galaxy. Leak's tool calls move through it: the driver is a glowing probe, a
// search dims the field and lights its results in rank order, a verified step leaves a constellation behind.
// Plain WebGL2, no dependencies. It builds its own canvas and HUD inside a container so the same code runs on /leak and in a standalone page.

import type { ReplayRun, UniverseEvent, UniverseLib, UniverseMeta } from './types';
import { NameIndex } from './names';
import { LiveInterpreter, type ProverEventLike, type UniverseSink, type Vec3 } from './events';
import { FINALE, igniteTime, lineageSummary, traceLineage, type Lineage } from './lineage';
import { STAR_FLUX_EXPONENT, emptySky, fadeOf, libRadius, linkBrightness, pairKey, seedGain, strongestLinks } from './lighting';
import { NOVA, flashEnvelope, novaView, shakeOffset, shouldFire, sparks as novaSparks } from './nova';

export interface UniverseData {
  meta: UniverseMeta;
  pos: Int16Array;
  lib: Uint16Array;
  names: NameIndex | null;
  replays: ReplayRun[];
}

export interface UniverseOptions {
  mode?: 'replay' | 'live';
  /** Grips in the bottom corners that let the reader drag the universe taller (default on; off when it already fills the window). */
  resizable?: boolean;
  /** The target's star goes off (the finale; nova.ts). `x` and `y` are where, in the window's CSS pixels, so the page can flash around it. */
  onNova?: (at: { x: number; y: number }) => void;
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
  memory: [0.72, 0.55, 1.0], // violet: the memory's own colour, nothing else in the sky is this
  memhot: [0.95, 0.9, 1.0],
  driver: [0.12, 0.72, 1.0], // ice: the driver, and nothing else
  driverHot: [0.5, 0.92, 1.0],
};

const CSS = `
.tku{position:relative;width:100%;height:100%;overflow:hidden;background:#07080a;color:#f1ecdc;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;-webkit-font-smoothing:antialiased;container-type:inline-size;
 --dim:#a39c86;--gold:#ffd98a;--panel:rgba(12,13,9,.62);--line:rgba(255,217,138,.16)}
.tku canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.tku canvas.tku-drag{cursor:grabbing}
.tku .tku-labels{pointer-events:none}
.tku .tku-hud{position:absolute;inset:0;z-index:2;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:8px 10px;text-shadow:0 0 8px #000,0 0 2px #000}
.tku .tku-top{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:3px 16px}
.tku .tku-title{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#ffe9a8;white-space:nowrap}
.tku .tku-live{display:none;color:#f2503a;margin-left:8px;white-space:nowrap}.tku.live .tku-live{display:inline}.tku .tku-clock{color:var(--dim);font-variant-numeric:tabular-nums;margin-left:6px}.tku .tku-clock.run{color:#ffe9a8}
.tku .tku-right{margin-left:auto;text-align:right;color:var(--dim);font-size:10px;line-height:1.5;font-variant-numeric:tabular-nums;max-width:100%;overflow-wrap:anywhere}
.tku b{color:#fff4dc;font-weight:600}
.tku .tku-bottom{display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 14px}
.tku .tku-ticker{font-size:10.5px;color:#cfc8b2;text-align:center;max-width:min(720px,100%);overflow-wrap:anywhere;min-height:14px}.tku .tku-ticker:not(:empty){padding:3px 11px;background:rgba(6,7,10,.62);border-radius:999px;backdrop-filter:blur(6px);text-shadow:none}
.tku .tku-bar{pointer-events:auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:5px;padding:5px 7px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:8px;backdrop-filter:blur(10px)}
.tku .tku-bar button,.tku .tku-bar select{box-sizing:border-box;height:22px;padding:0 8px;margin:0;background:rgba(255,255,255,.04);color:#e9e2cc;border:1px solid var(--line);border-radius:5px;font:inherit;font-size:10.5px;line-height:20px;cursor:pointer;-webkit-appearance:none;appearance:none}
.tku .tku-bar select{padding-right:18px;max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'><path d='M1 1l3 3 3-3' fill='none' stroke='%23a39c86' stroke-width='1.2'/></svg>");background-repeat:no-repeat;background-position:right 6px center}
.tku .tku-bar button:hover,.tku .tku-bar select:hover{background-color:rgba(255,217,138,.1)}
.tku .tku-bar button.on{background-color:rgba(255,217,138,.16);border-color:rgba(255,217,138,.45);color:#fff1cc}
.tku .tku-bar input[type=range]{flex:1 1 120px;min-width:70px;height:22px;margin:0;accent-color:#ffd98a}
.tku .tku-bar label{color:var(--dim);display:flex;align-items:center;gap:4px;white-space:nowrap}
.tku .tku-time{color:var(--dim);font-variant-numeric:tabular-nums;white-space:nowrap}
.tku .tku-tip{position:absolute;z-index:4;pointer-events:none;padding:5px 8px;background:var(--panel);border:1px solid var(--line);border-radius:6px;font-size:10.5px;backdrop-filter:blur(8px);display:none;max-width:240px}.tku .tku-tip span{color:var(--dim)}
.tku .tku-grip{position:absolute;bottom:0;width:16px;height:16px;z-index:3;opacity:.45;transition:opacity .15s;touch-action:none}
.tku .tku-grip:hover,.tku .tku-grip.tku-drag{opacity:1}
.tku .tku-grip-r{right:0;cursor:nwse-resize;background:linear-gradient(135deg,transparent 0 50%,#ffd98a 50% 56%,transparent 56% 72%,#ffd98a 72% 78%,transparent 78%)}
.tku .tku-grip-l{left:0;cursor:nesw-resize;background:linear-gradient(225deg,transparent 0 50%,#ffd98a 50% 56%,transparent 56% 72%,#ffd98a 72% 78%,transparent 78%)}
.tku.live .tku-replay-only{display:none}
@container (max-width:640px){.tku .tku-bar .tku-opt{display:none}.tku .tku-bar .tku-seek{order:9;flex:1 1 100%}.tku .tku-bar .tku-time{order:8}}
`;

const HASH_GLSL = `float hash(uint x){ x ^= x>>16; x *= 0x7feb352du; x ^= x>>15; x *= 0x846ca68bu; x ^= x>>16; return float(x)/4294967295.0; }`;
const FLOW_GLSL = `vec3 flow(vec3 p, float h, float h2, float t){ return 0.0042*vec3(sin(p.y*9.0+t*0.23+h*6.283), sin(p.z*9.0+t*0.19+h2*6.283), sin(p.x*9.0+t*0.21+(h+h2)*3.1))*(0.5+h2); }`;

const STAR_VS = `#version 300 es
precision highp float; precision highp int;
in vec3 a_pos; in uint a_lib; in float a_heat;
uniform mat4 u_vp; uniform float u_scale, u_time, u_psize, u_dim, u_gain, u_flow, u_tintMix, u_big; uniform vec3 u_tint; uniform sampler2D u_pal;
out vec4 v_col; out float v_big;
${HASH_GLSL}
${FLOW_GLSL}
void main(){
  uint id = uint(gl_VertexID); float h = hash(id), h2 = hash(id*747796405u+2891336453u), h3 = hash(id*2246822519u+3266489917u);
  vec3 p = a_pos*u_scale; p += flow(p,h,h2,u_time)*u_flow;
  gl_Position = u_vp*vec4(p,1.0);
  uint lib = a_lib & 0x7FFFu;
  vec3 hue = texelFetch(u_pal, ivec2(int(lib)&255, int(lib)>>8), 0).rgb;
  float tw = 0.72 + 0.28*sin(u_time*(0.6+h*1.4)+h2*40.0);
  // the landing page's warm spectrum - cream, amber, orange, ember - hashed per star, then tinted by its galaxy
  vec3 warm = mix(mix(vec3(1.0,0.95,0.80), vec3(1.0,0.80,0.55), smoothstep(0.25,0.55,h3)), mix(vec3(1.0,0.62,0.30), vec3(0.95,0.42,0.22), smoothstep(0.9,1.0,h3)), smoothstep(0.62,0.9,h3));
  // the driver's own library is drawn with this same shader, tinted violet, so it is lit and sized exactly like a galaxy
  vec3 col = mix(mix(warm, hue, 0.62), u_tint, u_tintMix);
  // heat: a star the run has searched for or built on keeps a warmer, brighter light; the more it was used, the more so (and it never floods:
  // the heat saturates, and it is the star itself that shines, not a line drawn over it)
  float ht = 1.6*(1.0-exp(-a_heat/1.2));
  // warmth ramps cream -> gold -> rose rather than toward white, so a heavily used star gains colour as it gains light
  float wm = clamp(ht/1.6, 0.0, 1.0);
  col = mix(col, mix(vec3(1.0,0.86,0.52), vec3(1.0,0.52,0.5), smoothstep(0.45, 1.0, wm)), min(1.0, ht)*0.65);
  // one star in sixty-odd is a bright one: a hot cream core, a halo and a diffraction cross
  float big = max(step(1.0-u_big, h), step(1.35, ht));
  v_big = big;
  float d = max(gl_Position.w, 0.05);
  // a star's light is conserved: drawn smaller than the smallest sprite it keeps that sprite's size but gives only the light of the area it
  // really covers, so a galaxy seen from twice as far has the same surface brightness and a quarter of the total light, as in the real sky
  float raw = (big > 0.5 ? u_psize*(2.4+h2*1.8+ht*2.0) : u_psize*(0.7+h*0.9+ht*1.2)) / d;
  float lo = big > 0.5 ? 4.0 : 1.0;
  gl_PointSize = clamp(raw, lo, big > 0.5 ? 15.0 : 5.0+ht*2.0);
  float flux = raw < lo ? pow(raw/lo, ${STAR_FLUX_EXPONENT.toFixed(2)}) : 1.0; // lighting.ts: the light a star keeps below the smallest sprite
  v_col = vec4(col*tw, flux*u_gain*(0.55+h2*0.9)*(u_dim + ht*(1.0-u_dim)*0.7 + ht*0.9)*(1.0+big*1.5));
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
precision highp float; uniform sampler2D u_tex; uniform float u_exposure, u_aspect, u_flash; uniform vec2 u_cam, u_novaC; uniform vec4 u_nova, u_nova2; in vec2 v_uv; out vec4 o;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x), mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x), f.y); }
float sq(float x){ return x*x; }
void main(){
  // the supernova's wave (nova.ts): a thin front and a fainter ripple around the star that went off, in screen heights. It bends the sky toward
  // its front like a lens and adds its own light. u_nova = (radius, half-width, brightness, 0). With no star going off the radius is far away and
  // the brightness 0, so it draws nothing; zoomed out, nova.ts has already faded it to nothing.
  vec2 pc = (v_uv - u_novaC) * vec2(u_aspect, 1.0);
  float dn = length(pc);
  vec2 dirn = pc / max(dn, 1e-5);
  float g1 = exp(-sq((dn - u_nova.x) / u_nova.y)) * u_nova.z;
  float g2 = exp(-sq((dn - u_nova2.x) / u_nova2.y)) * u_nova2.z;
  vec2 uv = v_uv - dirn / vec2(u_aspect, 1.0) * (g1 * u_nova.y * 0.9 + g2 * u_nova2.y * 0.5);
  vec3 c = texture(u_tex, uv).rgb;
  float behind = smoothstep(u_nova.x, u_nova.x * 0.15, dn) * u_nova.z;
  c += vec3(1.0, 0.78, 0.5) * (g1 * 1.8 + behind * 0.12) + vec3(0.7, 0.85, 1.0) * g2;
  float L = dot(c, vec3(0.2126,0.7152,0.0722)) + 1e-5; float k = L*u_exposure; float m = 1.0 - exp(-k);
  vec3 col = c*(m/L); col = mix(col, vec3(m), smoothstep(2.0,8.0,k)*0.2);
  vec2 q = v_uv-0.5; float vig = 1.0 - dot(q,q)*0.55;
  vec2 p = q*vec2(u_aspect,1.0)*1.7 + u_cam*0.75;
  float n = vn(p*1.3)*0.6 + vn(p*2.9+17.0)*0.4;
  float gate = smoothstep(0.42,0.78, vn(p*0.45+3.0));
  vec3 haze = mix(vec3(0.30,0.09,0.045), vec3(0.85,0.55,0.28), n)*gate*(0.002+0.009*n*n);
  // the flash: light, not matter, so it reaches the whole picture at once, brightest at the star
  vec3 flash = vec3(1.0, 0.96, 0.88) * u_flash * (0.5 + 1.1 * exp(-dn * 2.2) + 1.6 * exp(-dn * 12.0));
  o = vec4(pow(col, vec3(0.92)) + (vec3(0.022,0.024,0.014)+haze)*vig + flash, 1.0); }`;
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

  // camera: a flat map. target is the point at the centre of the view, dist the height of the view in world units
  private dist = 2.6;
  private target: Vec3 = [0, 0, 0];
  private tgoal: Vec3 = [0, 0, 0];
  private dgoal = 2.6;
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
  /** how many theorems the memory holds; the orb grows with it. 0 and unused until a memory variant reports. */
  private memSize = 0;
  private memUsed = false;
  private liveFinal: boolean | null = null;
  private liveFinAt = 0;
  private runStartMs: number | null = null;
  private runEndMs: number | null = null;
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
  // the heat of every star (how much it has been searched for and built on, fading with age), and where the run's home is
  private readonly heat: Float32Array;
  private readonly bufHeat: WebGLBuffer;
  private heatAt = -1e9;
  private heatUploadAt = -2e9;
  private home: Vec3 | null = null;
  // the backbone: every link between two lemmas the compiler has ever accepted together, weighted by how often; only the strongest are
  // drawn, so it can grow for ever and stay as dense as a nebula, never more
  private web: { a: number; b: number; w: number }[] = [];
  // the library's seeds, drawn as stars: positions, the galaxy each leans on, and a heat (general lemmas burn hotter)
  private readonly vaoSeeds: WebGLVertexArrayObject;
  private readonly bufSeedPos: WebGLBuffer;
  private readonly bufSeedLib: WebGLBuffer;
  private readonly bufSeedHeat: WebGLBuffer;
  private seedCap = 0;
  private seedN = 0;
  private libN = 0;
  private seedGain = 0.42;
  private seedKey = '';
  private carried: Ev[] = [];
  private seedPos: Vec3[] = [];
  // the finale: what the proof is built from, traced once when the target is proven
  private lineage: Lineage | null = null;
  private lineageKey = '';
  private finaleText = '';
  private finaleFa = -1;
  private finBox: { c: Vec3; r: number } | null = null;
  // the supernova (nova.ts): the previous frame's seconds since the star was born (to see it go off), where it went off on the canvas (uv),
  // and whether the reader asked for less motion: then there is no shake and no flash, only the wave
  private prevBorn = -1;
  private novaUV: [number, number] = [0.5, 0.5];
  private readonly calm: boolean = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // hud
  private readonly el: Record<string, HTMLElement> = {};
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly data: UniverseData,
    private readonly opts: UniverseOptions = {},
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
    this.heat = new Float32Array(this.N);
    this.bufHeat = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufHeat);
    gl.bufferData(gl.ARRAY_BUFFER, this.heat, gl.DYNAMIC_DRAW);
    loc = gl.getAttribLocation(this.progStar, 'a_heat');
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 4, 0);
    }

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

    this.vaoSeeds = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoSeeds);
    this.bufSeedPos = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedPos);
    loc = gl.getAttribLocation(this.progStar, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 12, 0);
    this.bufSeedLib = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedLib);
    loc = gl.getAttribLocation(this.progStar, 'a_lib');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribIPointer(loc, 1, gl.UNSIGNED_SHORT, 2, 0);
    this.bufSeedHeat = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedHeat);
    loc = gl.getAttribLocation(this.progStar, 'a_heat');
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 4, 0);
    }

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
    if (this.mode === 'replay' && data.replays.length) this.loadRun(0);
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

  /** The memory of a Control II variant changed or was loaded (live runs only). */
  pushMemory(op: 'save' | 'update' | 'load' | 'stats', size?: number, entry?: { name: string; closure: string }): void {
    this.memUsed = true;
    if (op === 'save' && size === undefined) this.memSize++;
    this.interp?.memory(op, size, entry);
    if (size !== undefined) this.memSize = size;
  }

  /** Replay: jump to just before the proof closes and play on, so the finale runs: the target is born about two seconds later. */
  jumpToFinale(): void {
    if (this.mode !== 'replay' || !this.run?.ok || !this.evs.length) return;
    const closes = this.evs[this.evs.length - 1].ds + 2.5;
    this.T = Math.max(0, closes - 1.0);
    this.playing = true;
    this.el.play.textContent = '⏸';
    (this.el.follow as HTMLInputElement).checked = true;
    this.freeUntil = 0;
  }

  /** Jump a replay to a fraction (0..1) of its length. */
  seekFraction(f: number): void {
    if (this.mode === 'replay') this.T = Math.max(0, Math.min(1, f)) * this.dur;
  }

  /** Forget the previous live run (call when a new one starts). */
  resetLive(): void {
    this.interp?.forgetSaves();
    this.evs = [];
    this.home = null;
    this.heatAt = -1e9;
    this.liveFinal = null;
    this.memSize = 0;
    this.memUsed = false;
    this.probe = [0, 0, 0];
    this.T = 0;
    this.clock = 0;
    this.interp = this.data.names ? new LiveInterpreter(this.data.names, this) : null;
  }

  /** A prover run has begun: the clock in the corner starts, so a quiet stretch reads as work in progress, not a hang. */
  startRun(): void {
    this.runStartMs = Date.now();
    this.runEndMs = null;
  }

  /** The run is over (verified, stopped or failed): the clock stops and keeps its final value. */
  endRun(): void {
    if (this.runStartMs !== null && this.runEndMs === null) this.runEndMs = Date.now();
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
    if (!this.home && e.focus) this.home = this.emptySky(e.focus);
    this.heatAt = -1e9;
  }
  starAt(i: number): Vec3 {
    return this.basePos(i);
  }
  attention(): Vec3 {
    return this.probe;
  }
  memorySize(n: number): void {
    this.memSize = n;
    this.memUsed = true;
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
  // where the library lives: the emptiest patch of sky near where the run began, so it is a thing of its own and not laid over a galaxy
  // or over the driver
  private emptySky(p: Vec3): Vec3 {
    return emptySky(p, this.data.meta.libs);
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

  private loadRun(i: number, keepT = -1): void {
    const run = this.data.replays[i];
    if (!run) return;
    this.run = run;
    let t = 1;
    const own: Ev[] = run.events.map((raw, k) => {
      if (k) t += Math.min(3.5, Math.max(0.5, raw.t - run.events[k - 1].t));
      const span = Math.min(3, Math.max(0.8, (raw.te ?? raw.t) - raw.t));
      const e: Ev = { ...(raw as Ev), ds: t, dres: t + span };
      e.focus = this.centroid(e.hits ?? e.used ?? []);
      e.chain = e.used && e.used.length > 1 ? this.chainOf(e.used.slice(0, 18)) : [];
      return e;
    });
    // a replay of a proof runs on through the finale: the proof closes 2.5 s after the last event, the star is born FINALE.stillness later,
    // and the ending is read out FINALE.settle seconds after the close (it used to loop 3.5 s into it)
    const span = (own.length ? own[own.length - 1].ds : 0) + (run.ok ? 2.5 + FINALE.settle + 1 : 6);
    this.evs = own;
    this.dur = span;
    this.home = null;
    for (const e of own) {
      if (e.focus) {
        this.home = this.emptySky(e.focus);
        break;
      }
    }
    this.T = keepT >= 0 ? keepT : 0;
    this.heatAt = -1e9;
    this.probe = this.home ?? [0, 0, 0];
    (this.el.seek as HTMLInputElement).value = String((this.T / this.dur) * 1000);
    (this.el.finale as HTMLButtonElement).disabled = !run.ok; // only a run that ended in a proof has a finale
  }

  // ---------- HUD ----------
  private buildHud(): void {
    const html = `
      <div class="tku-hud">
        <div class="tku-top">
          <div class="tku-title" data-k="title">Tengoku universe<span class="tku-live">● live<span class="tku-clock" data-k="clock"></span></span></div>
          <div class="tku-right">
            <div data-k="stats"><b data-k="search">0</b> searches · <b data-k="ok">0</b> ✅ <b data-k="fail">0</b> ❌ · <b data-k="lem">0</b> lemmas<span data-k="memwrap" style="display:none"> · <b data-k="mem" style="color:#cdb4ff">0</b> remembered</span></div>
            <div data-k="perf" aria-label="Performance" hidden></div>
          </div>
        </div>
        <div class="tku-bottom">
          <div class="tku-ticker" data-k="ticker"></div>
          <div class="tku-bar" data-k="bar" role="group" aria-label="Universe controls">
            <button data-k="live">Live</button><button data-k="replay">Replay</button>
            <button data-k="play" class="tku-replay-only" aria-label="Play or pause">⏸</button>
            <button data-k="finale" class="tku-replay-only" aria-label="Jump to the proof closing" title="Jump to the finale: the proof closes and the target is born">⏭ finale</button>
            <select data-k="run" class="tku-run tku-replay-only" aria-label="Replay run"></select>
            <input data-k="seek" class="tku-seek tku-replay-only" type="range" min="0" max="1000" value="0" aria-label="Timeline">
            <span class="tku-time tku-replay-only" data-k="time">0:00</span>
            <select data-k="speed" class="tku-replay-only" aria-label="Speed"><option value="1">1×</option><option value="2" selected>2×</option><option value="5">5×</option><option value="12">12×</option></select>
            <label class="tku-opt"><input data-k="follow" type="checkbox" checked> follow</label>
            <select data-k="quality" class="tku-opt" aria-label="Star density"><option value="1">all stars</option><option value="0.5">½ stars</option><option value="0.25">¼ stars</option></select>
          </div>
        </div>
      </div>
      <div class="tku-tip" data-k="tip"></div>
      ${this.opts.resizable === false ? '' : '<div class="tku-grip tku-grip-l" data-k="gripL" title="Drag to resize"></div><div class="tku-grip tku-grip-r" data-k="gripR" title="Drag to resize"></div>'}`;
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
    on(this.el.finale, 'click', () => this.jumpToFinale());
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
    // The corner grips resize the universe in both directions: the left one holds the right edge still, the right one holds the left edge.
    for (const k of ['gripL', 'gripR']) {
      const g = this.el[k];
      if (!g) continue;
      const left = k === 'gripL';
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        g.setPointerCapture(e.pointerId);
        const box = this.container.getBoundingClientRect(); // the host, border included: its width is what is set below
        const x0 = e.clientX;
        const y0 = e.clientY;
        const w0 = box.width;
        const h0 = box.height;
        const ml0 = parseFloat(this.container.style.marginLeft || '0') || 0;
        const edge = box.left;
        g.classList.add('tku-drag');
        const move = (ev: PointerEvent): void => {
          const dx = ev.clientX - x0;
          // the opposite edge stays where it is; the dragged one stays inside the window and leaves room for the controls
          const most = left ? box.right - 8 : window.innerWidth - 8 - box.left;
          const w = Math.max(280, Math.min(most, left ? w0 - dx : w0 + dx));
          this.container.style.width = `${w}px`;
          this.container.style.maxWidth = 'none';
          if (left) this.container.style.marginLeft = `${ml0 + (box.right - w - edge)}px`;
          this.container.style.height = `${Math.max(240, Math.min(window.innerHeight - 24, h0 + (ev.clientY - y0)))}px`;
        };
        const end = (): void => {
          g.classList.remove('tku-drag');
          g.removeEventListener('pointermove', move);
          g.removeEventListener('pointerup', end);
          g.removeEventListener('pointercancel', end);
        };
        g.addEventListener('pointermove', move);
        g.addEventListener('pointerup', end);
        g.addEventListener('pointercancel', end);
      });
    }
  }
  private syncMode(): void {
    this.root.classList.toggle('live', this.mode === 'live');
    this.el.live.classList.toggle('on', this.mode === 'live');
    this.el.replay.classList.toggle('on', this.mode === 'replay');
  }

  // ---------- input: drag pans, the wheel and a pinch zoom about the pointer, a double click hands the camera back to Leak ----------
  private bindInput(): void {
    const c = this.canvas;
    const rect = (): DOMRect => c.getBoundingClientRect();
    const free = (): void => {
      this.freeUntil = performance.now() + 20000;
    };
    const upp = (): number => this.dist / Math.max(1, rect().height); // world units per CSS pixel
    const zoomAt = (sx: number, sy: number, factor: number): void => {
      const r = rect();
      const u0 = upp();
      const wx = this.target[0] + (sx - r.left - r.width / 2) * u0;
      const wy = this.target[1] - (sy - r.top - r.height / 2) * u0;
      this.dist = Math.min(6, Math.max(0.03, this.dist * factor));
      const u1 = upp();
      this.target[0] = wx - (sx - r.left - r.width / 2) * u1;
      this.target[1] = wy + (sy - r.top - r.height / 2) * u1;
      free();
    };
    const pan = (dx: number, dy: number): void => {
      const u = upp();
      this.target[0] -= dx * u;
      this.target[1] += dy * u;
      free();
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.dragging = this.pointers.size === 1 ? { x: e.clientX, y: e.clientY } : null;
      c.classList.add('tku-drag');
      free();
    });
    const up = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      // the finger that stays after a pinch carries on panning from where it is, without a jump
      const rest = [...this.pointers.values()];
      this.dragging = rest.length === 1 ? { x: rest[0][0], y: rest[0][1] } : null;
      if (!this.pointers.size) c.classList.remove('tku-drag');
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
      if (!mine) return;
      if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const d0 = Math.hypot(mine[0] - other[0], mine[1] - other[1]);
        const d1 = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
        const mx = (e.clientX + other[0]) / 2;
        const my = (e.clientY + other[1]) / 2;
        pan(mx - (mine[0] + other[0]) / 2, my - (mine[1] + other[1]) / 2);
        zoomAt(mx, my, d0 / Math.max(d1, 1));
      } else if (this.dragging) {
        pan(e.clientX - this.dragging.x, e.clientY - this.dragging.y);
        this.dragging = { x: e.clientX, y: e.clientY };
      }
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // a trackpad pinch arrives as a wheel with ctrlKey and small deltas
        zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
    this.hudRects = ['title', 'stats', 'perf', 'ticker', 'bar'].map((k) => {
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
  private curve(A: Vec3, B: Vec3, seed: number, t: number, c: Rgb, a: number, pulse: number, segs = 14, sway = 0.16, strands = 3): void {
    if (this.nl + segs * 6 + 6 >= MAXL) return;
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const dz = B[2] - A[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    const px = -dy / len;
    const py = dx / len;
    const amp = len * sway * Math.sin(t * 0.55 + seed * 6.28);
    for (const [side, fade] of (strands === 1 ? [[0, 1]] : [[0, 1], [0.0011, 0.38], [-0.0011, 0.38]]) as readonly (readonly [number, number])[]) {
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
    const trail: { p: Vec3; t: number }[] = [];
    const saves: Ev[] = [];
    // heat: recomputed from the events now and then (it is a function of T, so scrubbing works), uploaded in frame()
    const reheat = Math.abs(T - this.heatAt) > 0.5;
    const webMap = new Map<number, number>();
    // light fades with age (lighting.ts), so what happened a moment ago burns bright and the sky stays readable however long the run
    const warm = (e: Ev, age: number): void => {
      const w = fadeOf(age);
      if (e.hits) for (let k = 0; k < e.hits.length; k++) this.heat[e.hits[k]] += 0.22 * (1 - k / Math.max(1, e.hits.length)) * w;
      if (e.k === 'compile' && e.ok) {
        if (e.used) for (const id of e.used) this.heat[id] += 0.7 * w;
        if (e.chain)
          for (const [a1, b1] of e.chain) {
            const key = pairKey(a1, b1);
            webMap.set(key, (webMap.get(key) ?? 0) + w);
          }
      }
    };
    if (reheat) {
      this.heat.fill(0);
      this.heatAt = T;
    }

    if (this.evs[0]?.focus) pr = [...(this.evs[0].focus as Vec3)] as Vec3;
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
        if (e.k === 'loogle' || e.k === 'moogle') search++;
        else if (e.k === 'compile' && e.ok) ok++;
        else if (e.k === 'compile') fail++;
      }
      if (e.k === 'save') saves.push(e);
      if (reheat && resolved) warm(e, age);
      if (e.focus && resolved && res > T - 150) trail.push({ p: e.focus, t: res });
      const base = e.k === 'compile' ? COL.pend : e.k === 'recall' || e.k === 'save' ? COL.memory : COL[e.k];
      const label =
        e.k === 'recall'
          ? !resolved
            ? 'opening the library…'
            : e.n
              ? `${e.n} saved theorem${e.n === 1 ? '' : 's'} recalled`
              : 'nothing saved matches'
          : e.k === 'save'
            ? 'a verified theorem saved to memory'
            : e.k === 'compile'
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

      if (e.k === 'recall' || e.k === 'save') {
        // the library lives at home: a recall is a violet pulse that runs from home to the driver and circles what came back round it;
        // a save is a spark that leaves the driver for home (where the new theorem appears, drawn with the library below)
        const hold = e.k === 'recall' ? 4 : 1.6;
        if (resolved && age < hold && this.home) {
          const fade = Math.max(0, 1 - age / hold);
          const o: Vec3 = [pr[0], pr[1], pr[2]];
          const H = this.home;
          const u = e.k === 'recall' ? Math.min(1, age / 0.9) : 1 - Math.min(1, age / 1.2);
          const at: Vec3 = [H[0] + (o[0] - H[0]) * u, H[1] + (o[1] - H[1]) * u, H[2] + (o[2] - H[2]) * u];
          this.curve(H, o, hash32(i * 977), simT, COL.memory, 0.35 * fade, 2.5, 18, 0.05);
          this.G(at, COL.memhot, 0.9 * fade, 7);
          this.G(at, COL.memory, 0.6 * fade, 16);
          if (e.k === 'recall' && (e.n ?? 0) > 0 && u >= 1) {
            const sat = Math.min(e.n ?? 0, 8);
            for (let k = 0; k < sat; k++) {
              const th = simT * (1.1 + 0.12 * k) + k * 2.4;
              const rad = 0.03 + 0.006 * k;
              this.G([o[0] + Math.cos(th) * rad, o[1] + Math.sin(th) * rad * 0.8, o[2]], COL.memory, fade * 0.8, 5);
            }
          }
        }
        continue;
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
        if (e.chain?.length) {
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
      if (e.k === 'compile' && e.ok && resolved && age < 120) {
        // a verified step lights the constellation Leak actually used, which stays two minutes and then lets go; its links join the web
        // and its stars keep their warmth, so the sky remembers without filling up
        const settle = Math.min(1, age / 1.5) * Math.exp(-Math.max(0, age - 20) / 35);
        for (const [a1, b1] of e.chain ?? []) {
          this.starPos(a1, simT, tmp);
          this.starPos(b1, simT, tmp2);
          this.curve(tmp, tmp2, hash32(a1 ^ b1), simT, COL.gold, 0.34 * settle * (1 + 1.6 * finGlow), 1.4 + 2 * finGlow, 10);
        }
        for (const id of (e.used ?? []).slice(0, 18)) {
          this.starPos(id, simT, tmp);
          this.G(tmp, COL.gold, 0.36 * settle, 3.4);
        }
      }
      if (e.hits && resolved) for (const id of e.hits) touched.add(id);
      if (e.used && e.ok && resolved) for (const id of e.used) touched.add(id);
    }

    if (reheat) {
      this.web = strongestLinks(webMap);
    }
    if (this.web.length) {
      // the backbone, drawn thin and warm; a link used again and again is brighter and rosier than one used once. The ink is bounded
      // (600 links, alpha by the logarithm of use), so the sky gains structure as it grows and never gains glare.
      for (const l of this.web) {
        const g = linkBrightness(l.w); // 0 for a link last used long ago, towards 1 for one used again and again, lately
        this.starPos(l.a, simT, tmp);
        this.starPos(l.b, simT, tmp2);
        const col: Rgb = [COL.gold[0], COL.gold[1] * (1 - 0.25 * g), COL.gold[2] * (1 - 0.4 * g) + 0.15 * g];
        const span = Math.hypot(tmp[0] - tmp2[0], tmp[1] - tmp2[1]);
        this.curve(tmp, tmp2, hash32(l.a ^ l.b), simT, col, (0.08 + 0.26 * g) / (1 + span * span * 14), 0.8, 8, 0.1, g > 0.55 ? 3 : 1);
      }
    }

    this.finaleFa = fa;
    this.marks = marks;
    this.probe = pr;
    // the proof closes: the sky holds its breath, then the whole universe comes up to full light
    if (fin) dimTarget = fa < FINALE.stillness ? 0.06 : 1;
    const anyActive = dimTarget < 0.8;
    this.drawComet(pr, trail, T, simT);
    this.drawLibrary(saves, T, simT);
    const finR = this.drawFinale(fa, saves, pr, simT);
    if (this.home) {
      const H = this.home;
      const libR = libRadius(Math.max(saves.length, this.mode === 'live' ? this.memSize : 0)) + 0.015;
      const sep = Math.hypot(pr[0] - H[0], pr[1] - H[1]);
      // the library sits in the lower half of the view, clear of the controls and the ticker
      this.tgoal = fin && fa > FINALE.settle - 2 && this.finBox ? [this.finBox.c[0], this.finBox.c[1] - 0.06 * this.dist, 0] : [(pr[0] + H[0]) * 0.5, (pr[1] + H[1]) * 0.5 - 0.09 * this.dist, 0];
      this.dgoal = Math.min(1.3, Math.max(0.3, Math.max(0.28 + 1.4 * (fin && fa > FINALE.settle - 2 ? Math.max(finR, 0.25) : anyActive ? this.maxR : 0.3), sep * 1.5 + libR * 2.2)));
    } else {
      this.tgoal = [pr[0] * 0.9, pr[1] * 0.9, 0];
      this.dgoal = Math.min(2.6, Math.max(0.3, 0.28 + 1.6 * (fin ? Math.max(finR, 0.25) : anyActive ? this.maxR : 0.5)));
    }
    this.dimTarget = dimTarget;

    const set = (k: string, v: string): void => {
      if (this.el[k].textContent !== v) this.el[k].textContent = v;
    };
    if (!this.evs.length && this.mode === 'live') ticker = this.runStartMs !== null && this.runEndMs === null ? 'waiting for the first tool call' : 'waiting for a prover run';
    if (fin) ticker = fa < FINALE.settle ? '<b style="color:#ffd98a">proved</b>' : `<b style="color:#ffd98a">proved</b> · ${esc(this.finaleText)}`;
    this.el.ticker.innerHTML = ticker;
    if (this.mode === 'live') {
      const t = this.runStartMs === null ? '' : fmt(((this.runEndMs ?? Date.now()) - this.runStartMs) / 1000);
      set('clock', t);
      this.el.clock.classList.toggle('run', this.runStartMs !== null && this.runEndMs === null);
    }
    set('search', String(search));
    set('ok', String(ok));
    set('fail', String(fail));
    set('lem', touched.size.toLocaleString());
    (this.el.memwrap as HTMLElement).style.display = this.memUsed && this.mode === 'live' ? '' : 'none';
    set('mem', String(this.memSize));
    return anyActive;
  }

  // ---------- the new views ----------
  // the driver is a comet: an ice-white head no other thing in the sky shares, a tail along the path its attention took in the last
  // minutes, and a thin ring that turns. Gold stays the colour of what it proved, violet of what it remembers.
  private drawComet(pr: Vec3, trail: { p: Vec3; t: number }[], T: number, simT: number): void {
    trail.sort((a, b) => a.t - b.t);
    // the tail is short: only where its attention was in the last half minute, a few points, fading to nothing; it points where it came from
    const pts = [...trail.filter((x) => T - x.t < 30).slice(-4).map((x) => ({ p: x.p, a: Math.max(0, 1 - (T - x.t) / 30) })), { p: pr, a: 1 }];
    // a smooth curve through the last few places its attention was (Catmull-Rom), so the tail bends and never kinks
    for (let q = 1; q < pts.length; q++) {
      const p0 = pts[Math.max(0, q - 2)].p;
      const p1 = pts[q - 1].p;
      const p2 = pts[q].p;
      const p3 = pts[Math.min(pts.length - 1, q + 1)].p;
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.min(90, Math.max(2, Math.round(len / 0.0008)));
      const aa = pts[q - 1].a;
      const bb = pts[q].a;
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const u2 = u * u;
        const u3 = u2 * u;
        const cr = (c: number): number => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
        const al = Math.pow(aa + (bb - aa) * u, 2.5) * 0.12;
        this.G([cr(0), cr(1), p2[2]], COL.driver, al, 1.6 + 1.6 * u);
      }
    }
    // the head is a reticle, which no star is: a hairline cross, a turning ring, a small hot core, and a second ring that pings every few seconds
    this.G(pr, COL.driver, 1.2, -80);
    this.G(pr, COL.driverHot, 0.9, 6);
    this.G(pr, COL.driver, 1.1, 1000 + 30 + 1.5 * Math.sin(simT * 3));
    const ping = (simT % 4) / 4;
    this.G(pr, COL.driver, (1 - ping) * 0.9, 1000 + 30 + 70 * ping);
    for (let q = 0; q < 4; q++) {
      const th = simT * 0.9 + (q * Math.PI) / 2;
      this.G([pr[0] + Math.cos(th) * 0.013, pr[1] + Math.sin(th) * 0.0105, pr[2]], COL.driverHot, 0.8, 3);
    }
  }

  // a saved theorem's colour: the memory's violet, warmed by the galaxy its proof leans on
  private seedColour(e: Ev): Rgb {
    const st = e.stars?.[0];
    if (st === undefined) return COL.memory;
    const lib = this.data.meta.libs[this.data.lib[st] & 0x7fff];
    if (!lib) return COL.memory;
    const h = hsv(lib.h, 0.55, 1);
    return [COL.memory[0] * 0.6 + h[0] * 0.4, COL.memory[1] * 0.6 + h[1] * 0.4, COL.memory[2] * 0.6 + h[2] * 0.4];
  }

  // the library: every theorem the run has saved, as a small galaxy of its own at the run's home (in the emptiest sky nearby).
  private drawLibrary(saves: Ev[], T: number, simT: number): void {
    const H = this.home;
    if (!H) return;
    // a library carried over from earlier sessions (live mode knows only how many theorems it holds) is drawn as that many plain seeds
    const carried = this.mode === 'live' ? Math.max(0, this.memSize - saves.length) : 0;
    if (carried !== this.carried.length) this.carried = Array.from({ length: carried }, (_, k) => ({ k: 'save', t: 0, ds: -1e9, dres: -1e9, name: `carried ${k}`, deps: [], stars: [] }) as Ev);
    const shown = carried ? this.carried.concat(saves.filter((e) => e.ds <= T)) : saves.filter((e) => e.ds <= T);
    if (!shown.length) {
      // no library yet: nothing to draw, and nothing to name
      this.libN = 0;
      this.seedN = 0;
      this.seedKey = '';
      return;
    }
    {
      // a sunflower: theorem k sits at radius a·√k and angle k·137.5°, so the library is always evenly packed, grows as the square root
      // of its size, and shows the Fibonacci spirals as it fills. Older in the middle, newest at the rim. Each seed takes a little of the
      // colour of the galaxy it leans on, so what the library is about reads as colour; what it builds on reads as filaments, which
      // thin out as the library grows so that the seed head itself stays the picture.
      const N = shown.length;
      this.libN = N;
      // each seed adds less light as the library grows, so a library of thousands is a luminous cloud with texture, never a solid ball
      this.seedGain = seedGain(N);
      const pos: Vec3[] = [];
      // the disc grows as the square root of the library until it is as big as a medium galaxy, then packs tighter, so it can grow for ever
      const Rtarget = libRadius(N);
      const a = Rtarget / Math.sqrt(Math.max(1, N));
      const GA = 2.399963;
      // the seeds are drawn by the star shader (one pixel at a distance, the same tone map), so the seed head is lit like a galaxy and
      // cannot burn out; glows are kept for what is happening now (a seed being born) and for the heart
      const norm = Math.min(1, Math.sqrt(40 / Math.max(40, N)));
      for (let k = 0; k < N; k++) {
        // dense and bright at the heart, thinning to nothing at the edge (no rim): the radius is bent inward by x^1.6
        const Rm = a * Math.sqrt(N + 0.5);
        const x = a * Math.sqrt(k + 0.5) / Rm;
        const jit = (Rm / Math.sqrt(N + 1)) * (0.35 + 1.4 * Math.pow(x, 0.6)) * (1 + 6 * Math.max(0, x - 0.55) * Math.max(0, x - 0.55) * 4); // the rim scatters into a soft fringe
        const rho = Math.max(0, Rm * Math.pow(x, 2.0) + (hash32(k * 3 + 1) - 0.5) * 2 * jit);
        const ang = k * GA + (hash32(k * 5 + 2) - 0.5) * (jit / Math.max(rho, jit)) * 1.2;
        pos[k] = [H[0] + Math.cos(ang) * rho, H[1] + Math.sin(ang) * rho * 0.86, H[2]];
      }
      // general lemmas burn hotter; in a small library they are its bright stars, in a large one the heat is spread thinner
      const key = `${N}:${H[0]},${H[1]}`;
      if (key !== this.seedKey) {
        this.seedKey = key;
        this.uploadSeeds(shown, pos);
      }
      this.seedPos = pos;
      const depAlpha = 0.26 * Math.min(1, 80 / Math.max(1, N));
      for (let k = 0; k < N; k++) {
        const e = shown[k];
        const p = pos[k];
        const age = T - e.ds;
        if (age < 1.5) {
          this.G(p, COL.memhot, (1 - age / 1.5) * 0.9, 1000 + 7 + 20 * (age / 1.5));
          this.G(p, COL.memhot, (1 - age / 1.5) * 0.8, 6);
        }
        if (depAlpha > 0.02)
          for (const d of e.deps ?? []) {
            const q = pos[d];
            if (q) this.curve(q, p, hash32(k * 31 + d), simT, this.seedColour(e), depAlpha, 1.2, 8, 0.05);
          }
      }
      // roots: one thread from the library to each galaxy it leans on, brighter the more of its theorems lean there. At most one per
      // galaxy, so it stays readable however large the library gets
      const lean = new Map<number, number>();
      for (const e of shown) {
        const st = e.stars?.[0];
        if (st === undefined) continue;
        const li = this.data.lib[st] & 0x7fff;
        lean.set(li, (lean.get(li) ?? 0) + 1);
      }
      let top = 1;
      for (const n of lean.values()) top = Math.max(top, n);
      // only the few strongest, and only where a real share of the library leans: a thread to every galaxy would be a starburst
      const roots = [...lean].filter(([, n]) => n >= 0.04 * N).sort((x, y) => y[1] - x[1]).slice(0, 6);
      for (const [li, n] of roots) {
        const l = this.data.meta.libs[li];
        if (!l) continue;
        const g = Math.log1p(n) / Math.log1p(top);
        this.curve(H, l.c as Vec3, hash32(li * 13 + 5), simT, COL.memory, 0.05 + 0.16 * g, 0.6, 12, 0.12);
      }
      // the heart of the library, and a faint rim that marks how far it has grown
      this.G(H, COL.memory, (0.25 + 0.08 * Math.sin(simT * 1.3)) * norm, 8);
      this.G(H, COL.memhot, 0.45 * norm, 2.5);
      // a soft halo behind the whole library, so it reads as one body of light
      const hp: [number, number, number] = [0, 0, 0];
      if (this.project(H, hp)) {
        const pxPerS = (((this.DPR * (this.H / 900) * 2.1 * 0.97) / this.dist) * 7) / hp[2];
        const rPx = libRadius(N) * (this.H / this.dist);
        this.G(H, COL.memory, 0.16 * Math.min(1, N / 40), Math.min(84, Math.max(8, 2.2 * rPx)) / pxPerS);
        this.G(H, COL.memory, 0.26 * Math.min(1, N / 40), Math.min(84, Math.max(6, 0.7 * rPx)) / pxPerS);
      }
    }
  }

  // hands the seed head to the GPU: a position, the galaxy it leans on (for its tint), and a heat per saved theorem
  private uploadSeeds(shown: Ev[], pos: Vec3[]): void {
    const gl = this.gl;
    const N = shown.length;
    if (N > this.seedCap) {
      this.seedCap = Math.max(256, N * 2);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedPos);
      gl.bufferData(gl.ARRAY_BUFFER, this.seedCap * 12, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedLib);
      gl.bufferData(gl.ARRAY_BUFFER, this.seedCap * 2, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedHeat);
      gl.bufferData(gl.ARRAY_BUFFER, this.seedCap * 4, gl.DYNAMIC_DRAW);
    }
    const p = new Float32Array(N * 3);
    const lib = new Uint16Array(N);
    const heat = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      p[k * 3] = pos[k][0];
      p[k * 3 + 1] = pos[k][1];
      p[k * 3 + 2] = pos[k][2];
      const st = shown[k].stars?.[0];
      lib[k] = st === undefined ? 0 : this.data.lib[st] & 0x7fff;
      heat[k] = shown[k].abstract ? 0.3 : 0.1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedLib);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, lib);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeedHeat);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, heat);
    this.seedN = N;
  }

  // ---------- the finale ----------
  // The target is proven. The sky holds its breath; the target is born as the brightest star in the library; light runs back through
  // what the proof is built from (the saved theorems it cites, what those cite, and so on down to the Mathlib stars), and what it was
  // built from keeps a golden thread and a glow for as long as the page is open, while the library theorems it did not use dim.
  // Returns how far the finale reaches (for the camera).
  private drawFinale(fa: number, saves: Ev[], pr: Vec3, simT: number): number {
    if (fa < 0) {
      this.lineage = null;
      this.lineageKey = '';
      this.finBox = null;
      return 0;
    }
    const H: Vec3 = this.home ?? pr;
    let last = -1;
    for (let i = this.evs.length - 1; i >= 0; i--)
      if (this.evs[i].k === 'compile' && this.evs[i].ok) {
        last = i;
        break;
      }
    const key = `${this.evs.length}:${saves.length}:${last}:${this.carried.length}`;
    if (this.lineageKey !== key) {
      this.lineageKey = key;
      const root = last >= 0 ? this.evs[last] : null;
      const off = this.carried.length;
      this.lineage = traceLineage(
        { saves: (root?.saves ?? []).map((k) => k + off), stars: root?.used ?? [] },
        [...this.carried.map(() => ({ deps: [], stars: [] })), ...saves.map((e) => ({ deps: (e.deps ?? []).map((d) => d + off), stars: e.stars ?? [] }))],
      );
      const seconds = this.mode === 'live' ? (this.runStartMs === null ? 0 : ((this.runEndMs ?? Date.now()) - this.runStartMs) / 1000) : (this.run?.seconds ?? 0);
      this.finaleText = lineageSummary(this.lineage, (id) => this.data.lib[id] & 0x7fff, seconds);
    }
    const L = this.lineage;
    const gold = COL.gold;
    const white: Rgb = [1, 0.97, 0.85];
    const p: Vec3 = [0, 0, 0];
    const q: Vec3 = [0, 0, 0];
    // where the closing step landed
    this.G(pr, gold, Math.exp(-fa * 1.2) * 0.8, 30);
    // the held breath: light gathers where the target will be
    if (fa < FINALE.ignite) this.G(H, white, Math.min(1, fa / FINALE.stillness) * 0.7, 6 + 10 * (fa / FINALE.ignite));
    // the target, born: one flare, one ring, then the brightest steady star in the library, pinged by a slow ring
    const born = fa - FINALE.stillness;
    if (born > 0) {
      const settle = Math.min(1, born / 1.5);
      this.G(H, white, 1.0 * settle, -(84 + 40 * Math.exp(-born * 1.2)));
      this.G(H, white, 1.0, 8);
      this.G(H, white, 0.7 * settle, 14);
      this.G(H, gold, 0.16 * settle, 30 + 6 * Math.sin(simT * 1.6));
      if (born < 2) this.G(H, gold, (1 - born / 2) * 0.9, 1000 + 12 + 90 * (born / 2));
      const ping = (simT % 5) / 5;
      if (born > 3) this.G(H, gold, (1 - ping) * 0.4, 1000 + 20 + 70 * ping);
      // the supernova's debris: pinpoints leaving the star, cooling from white to ember (nova.ts). A glow sprite's size is in units of the
      // zoom, so a few pixels is asked for in pixels and converted
      const nb = this.novaBorn(fa);
      if (nb > 0) {
        const psx = (this.DPR * (this.H / 900) * 2.1 * 0.97) / this.dist;
        for (const sp of novaSparks(nb)) {
          const col: Rgb = [1.0, 0.55 + 0.4 * sp.hot, 0.25 + 0.55 * sp.hot];
          this.G([H[0] + sp.dx, H[1] + sp.dy, H[2]], col, sp.alpha * 0.9, (sp.size * this.DPR) / (psx * 7));
        }
      }
    }
    if (!L || !L.nodes.length) {
      this.finBox = { c: H, r: 0.25 };
      return 0.25;
    }
    // the light runs back: each thing the proof rests on is reached at its depth, a thread grows to it, and it stays lit
    let x0 = H[0];
    let x1 = H[0];
    let y0 = H[1];
    let y1 = H[1];
    const pos = (n: { type: 'save' | 'star'; id: number }, out: Vec3): boolean => {
      if (n.type === 'star') {
        this.starPos(n.id, simT, out);
        return true;
      }
      const sp = this.seedPos[n.id];
      if (!sp) return false;
      out[0] = sp[0];
      out[1] = sp[1];
      out[2] = sp[2];
      return true;
    };
    for (let i = 0; i < L.nodes.length; i++) {
      const n = L.nodes[i];
      if (!pos(n, q)) continue;
      x0 = Math.min(x0, q[0]);
      x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]);
      y1 = Math.max(y1, q[1]);
      const t0 = igniteTime(n.depth, L.maxDepth) + hash32(i * 31 + 7) * 0.35;
      const prog = Math.min(1, Math.max(0, (fa - t0) / FINALE.travel));
      if (prog <= 0) continue;
      const par = n.parent >= 0 ? L.nodes[n.parent] : null;
      if (par && pos(par, p)) {
        /* the thread hangs from the saved theorem it was found in */
      } else {
        p[0] = H[0];
        p[1] = H[1];
        p[2] = H[2];
      }
      const tip: Vec3 = [p[0] + (q[0] - p[0]) * prog, p[1] + (q[1] - p[1]) * prog, p[2] + (q[2] - p[2]) * prog];
      const span = Math.hypot(q[0] - p[0], q[1] - p[1]);
      this.curve(p, tip, hash32(i * 17 + 3), simT, gold, 0.42 / (1 + span * span * 6), 1.6, 28, 0.2, 1);
      const flash = Math.exp(-Math.max(0, fa - t0 - FINALE.travel) * 2.2);
      if (n.type === 'star') {
        this.G(q, gold, 0.7 + 0.3 * flash, -(30 + 16 * flash));
        this.G(q, white, 0.6 * prog + 0.4 * flash, 7 + 8 * flash);
        this.G(q, gold, 0.3 * prog, 16);
      } else {
        this.G(q, gold, 0.3 * prog + 0.5 * flash, 4 + 6 * flash);
      }
    }
    const c: Vec3 = [(x0 + x1) / 2, (y0 + y1) / 2, 0];
    const r = Math.max(0.25, 0.6 * Math.max(x1 - x0, (y1 - y0) * 1.6));
    this.finBox = { c, r };
    return r;
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
    const f = this.H / this.dist; // world units to device pixels
    const placed: [number, number, number, number][] = this.hudRects.map(([x, y, w, h]) => [x * D, y * D, w * D, h * D]);
    const hits = (lx: number, ly: number, tw: number, th: number): boolean =>
      placed.some((r) => lx < r[0] + r[2] && lx + tw > r[0] && ly < r[1] + r[3] && ly + th > r[1]);
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'top';
    const o: [number, number, number] = [0, 0, 0];
    const p: Vec3 = [0, 0, 0];

    // the results of the latest search: rank and lemma name on a thin leader beside each anchored star
    ctx.font = `${10.5 * D}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    for (const m of this.marks) {
      this.starPos(m.star, this.simT, p);
      if (!this.project(p, o)) continue;
      if (o[0] < -10 || o[0] > this.W + 10 || o[1] < -10 || o[1] > this.H + 10) continue;
      const name = m.name.length > 38 ? '\u2026' + m.name.slice(-37) : m.name;
      const text = `${m.rank + 1}  ${name}`;
      const tw = ctx.measureText(text).width;
      const bw = tw + 8 * D;
      const bh = 15 * D;
      // four places beside the star, first that is free and on screen: to the right and above, right and below, then the left side
      let lx = 0;
      let ly = 0;
      let found = false;
      for (const [sx, sy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]] as const) {
        lx = sx > 0 ? o[0] + 26 * D : o[0] - 26 * D - bw;
        ly = sy < 0 ? o[1] - 20 * D : o[1] + 8 * D;
        if (lx - 2 * D < 0 || lx - 2 * D + bw > this.W || ly - 2 * D < 0 || ly - 2 * D + bh > this.H) continue;
        if (hits(lx - 2 * D, ly - 2 * D, bw, bh)) continue;
        found = true;
        break;
      }
      if (!found) continue;
      const rgb = m.color.map((v) => Math.min(255, (v * 255 + 40) | 0)).join(',');
      const right = lx > o[0];
      ctx.globalAlpha = Math.min(1, m.alpha);
      ctx.strokeStyle = `rgba(${rgb},.55)`;
      ctx.lineWidth = 1 * D;
      ctx.beginPath();
      ctx.moveTo(o[0] + (right ? 5 : -5) * D, o[1] + (ly < o[1] ? -5 : 5) * D);
      ctx.lineTo(right ? lx - 7 * D : lx + bw + 5 * D, ly + 7 * D);
      ctx.lineTo(right ? lx - 3 * D : lx + bw + 1 * D, ly + 7 * D);
      ctx.stroke();
      ctx.fillStyle = 'rgba(4,5,10,.6)';
      ctx.fillRect(lx - 2 * D, ly - 2 * D, bw, bh);
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.fillRect(right ? lx - 2 * D : lx - 2 * D + bw - 1.5 * D, ly - 2 * D, 1.5 * D, bh);
      ctx.fillStyle = 'rgba(232,240,255,.92)';
      ctx.fillText(text, lx + 4 * D, ly);
      placed.push([lx - 2 * D, ly - 2 * D, bw, bh]);
    }

    let best: UniverseLib | null = null;
    let bd = 1e9;
    ctx.font = `${9 * D}px ui-sans-serif, system-ui, sans-serif`;
    const hp: [number, number, number] = [0, 0, 0];
    const hasHome = !!this.home && this.libN > 0 && this.project(this.home, hp);
    const libPx = libRadius(this.libN) * f;
    this.libsBySize.forEach((l, rank) => {
      if (!this.project(l.c, o)) return;
      const [x, y] = o;
      if (hasHome && Math.hypot(x - hp[0], y - hp[1]) < Math.max(110 * D, libPx * 1.08)) return; // the library has its own name
      const pxR = l.r * f;
      if (x < -50 || y < -20 || x > this.W + 50 || y > this.H + 20) return;
      const d = Math.hypot(x / D - this.mouse.x, y / D - this.mouse.y);
      if (this.mouse.x >= 0 && d < bd && d < Math.max(36, pxR / D)) {
        bd = d;
        best = l;
      }
      // the biggest are always named; the rest appear as the camera comes close enough that the galaxy is a readable size
      const busy = this.marks.length > 0 ? 0.45 : 1;
      const want = busy * (rank < 4 ? 0.85 : Math.max(0, Math.min(1, (pxR / D - 22) / 14)));
      const prev = this.libLabelAlpha.get(l.name) ?? 0;
      const a = prev + (want - prev) * 0.15;
      this.libLabelAlpha.set(l.name, a);
      if (a < 0.04) return;
      const text = nice(l.name);
      const tw = ctx.measureText(text).width;
      const lx = x + 6 * D;
      const ly = y + 6 * D;
      if (hits(lx - 6 * D, ly - 3 * D, tw + 12 * D, 18 * D)) return;
      placed.push([lx - 6 * D, ly - 3 * D, tw + 12 * D, 18 * D]);
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = 2.5 * D;
      ctx.strokeStyle = 'rgba(4,5,10,.8)';
      ctx.strokeText(text, lx, ly);
      ctx.fillStyle = '#d7deef';
      ctx.fillText(text, lx, ly);
    });
    if (hasHome) {
      const text = 'the driver\u2019s library';
      ctx.font = `${9.5 * D}px ui-sans-serif, system-ui, sans-serif`;
      const tw = ctx.measureText(text).width;
      const R = libRadius(this.libN) * f;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2.5 * D;
      ctx.strokeStyle = 'rgba(4,5,10,.8)';
      ctx.strokeText(text, hp[0] - tw / 2, hp[1] + Math.min(R, 120 * D) + 6 * D);
      ctx.fillStyle = '#c6b0ff';
      ctx.fillText(text, hp[0] - tw / 2, hp[1] + Math.min(R, 120 * D) + 6 * D);
    }
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
  /** Seconds since the target's star was born, on the clock of the person watching: a replay at 5x runs the finale five times faster, the flash does not. Negative before. */
  private novaBorn(fa: number): number {
    if (fa < 0) return -1;
    return (fa - FINALE.stillness) / (this.mode === 'replay' ? Math.max(1, this.speed) : 1);
  }

  private updateCam(dt: number): void {
    const follow = (this.el.follow as HTMLInputElement).checked && performance.now() > this.freeUntil;
    if (follow) {
      const k = 1 - Math.exp(-dt * 1.6);
      this.target[0] += (this.tgoal[0] - this.target[0]) * k;
      this.target[1] += (this.tgoal[1] - this.target[1]) * k;
      this.dist += (this.dgoal - this.dist) * k;
    }
    const sx = 2 / (this.dist * (this.W / this.H));
    const sy = 2 / this.dist;
    this.VP = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, -0.01, 0, -this.target[0] * sx, -this.target[1] * sy, 0, 1];
    // the supernova shakes the view: a rough, decaying jitter that is a function of the time since the star was born (nova.ts)
    const born = this.novaBorn(this.finaleFa);
    if (born > 0 && !this.calm) {
      const [jx, jy] = shakeOffset(born);
      this.VP[12] += 2 * jx * (this.H / this.W);
      this.VP[13] += 2 * jy;
    }
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
    const win = Math.min(n, 120); // the last second or two
    let sum = 0;
    let cpu = 0;
    for (let k = 1; k <= win; k++) {
      const i = (this.nPerf - k) % 240;
      sum += this.dts[i];
      cpu += this.cpus[i];
    }
    const avg = sum / win;
    const gpu = this.gpuMs === null ? (this.timerExt ? '…' : 'n/a') : this.gpuMs.toFixed(1);
    const v = `${(1000 / avg).toFixed(0)} fps · ${avg.toFixed(1)} ms · cpu ${(cpu / win).toFixed(1)} · gpu ${gpu} ms`;
    if (this.el.perf.textContent !== v) this.el.perf.textContent = v;
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
    const born = this.novaBorn(this.finaleFa);
    const nova = born > 0 ? novaView(born, this.dist, this.H) : null;
    if (this.home) this.novaUV = [(this.VP[0] * this.home[0] + this.VP[12]) * 0.5 + 0.5, (this.VP[5] * this.home[1] + this.VP[13]) * 0.5 + 0.5];
    if (this.opts.onNova && shouldFire(this.prevBorn, born, this.mode === 'live' || this.playing)) {
      const r = this.canvas.getBoundingClientRect();
      this.opts.onNova({ x: r.left + this.novaUV[0] * r.width, y: r.top + (1 - this.novaUV[1]) * r.height });
    }
    this.prevBorn = born;

    const gl = this.gl;
    const hdr = this.hdr;
    if (hdr) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fbo);
      gl.viewport(0, 0, this.W, this.H);
      gl.clearColor(0, 0, 0, 1);
    } else gl.clearColor(0.022, 0.024, 0.014, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const gpuQ = this.beginGpu();
    const ps = (this.DPR * (this.H / 900) * 2.1 * 0.97) / this.dist; // what a perspective camera at this distance drew
    if (this.heatUploadAt !== this.heatAt) {
      this.heatUploadAt = this.heatAt;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufHeat);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.heat);
    }
    gl.useProgram(this.progStar);
    gl.bindVertexArray(this.vaoStars);
    gl.uniformMatrix4fv(this.u(this.progStar, 'u_vp'), false, this.VP);
    gl.uniform1f(this.u(this.progStar, 'u_scale'), this.SC);
    gl.uniform1f(this.u(this.progStar, 'u_time'), this.simT);
    gl.uniform1f(this.u(this.progStar, 'u_psize'), ps);
    gl.uniform1f(this.u(this.progStar, 'u_dim'), this.dimNow);
    gl.uniform1f(this.u(this.progStar, 'u_gain'), hdr ? 0.34 : 0.34);
    gl.uniform1f(this.u(this.progStar, 'u_flow'), 1);
    gl.uniform1f(this.u(this.progStar, 'u_tintMix'), 0);
    gl.uniform1f(this.u(this.progStar, 'u_big'), 0.015);
    gl.uniform3f(this.u(this.progStar, 'u_tint'), COL.memory[0], COL.memory[1], COL.memory[2]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.uniform1i(this.u(this.progStar, 'u_pal'), 0);
    if (!hdr) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); // without a float target, screen blending keeps dense cores from burning out
    gl.drawArrays(gl.POINTS, 0, Math.floor(this.N * this.drawFrac));
    if (this.seedN) {
      // the library's seed head, through the same shader: violet, never dimmed, barely drifting so the sunflower holds its pattern
      gl.bindVertexArray(this.vaoSeeds);
      gl.uniform1f(this.u(this.progStar, 'u_scale'), 1);
      gl.uniform1f(this.u(this.progStar, 'u_dim'), 1);
      gl.uniform1f(this.u(this.progStar, 'u_flow'), 0.08);
      gl.uniform1f(this.u(this.progStar, 'u_tintMix'), 0.8);
      gl.uniform1f(this.u(this.progStar, 'u_big'), 0.004);
      gl.uniform3f(this.u(this.progStar, 'u_tint'), 0.6, 0.38, 1.0);
      gl.uniform1f(this.u(this.progStar, 'u_gain'), this.seedGain * (1 - 0.55 * Math.min(1, Math.max(0, (this.finaleFa - 2) / 2))));
      gl.drawArrays(gl.POINTS, 0, this.seedN);
    }
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
      gl.uniform1f(this.u(this.progTone, 'u_exposure'), 1.9);
      gl.uniform1f(this.u(this.progTone, 'u_aspect'), this.W / this.H);
      gl.uniform2f(this.u(this.progTone, 'u_cam'), this.target[0] * 0.5, this.target[1] * 0.5);
      gl.uniform2f(this.u(this.progTone, 'u_novaC'), this.novaUV[0], this.novaUV[1]);
      gl.uniform4f(this.u(this.progTone, 'u_nova'), nova ? nova.ring : -10, nova ? nova.width : 1, nova ? nova.k : 0, 0);
      gl.uniform4f(this.u(this.progTone, 'u_nova2'), nova ? nova.ring2 : -10, nova ? Math.max(1.5 / this.H, nova.ring2 * 0.04) : 1, nova ? nova.k2 : 0, 0);
      gl.uniform1f(this.u(this.progTone, 'u_flash'), this.calm ? 0 : flashEnvelope(born) * NOVA.flashPeak);
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
