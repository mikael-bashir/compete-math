// The film's fragment shader is assembled from focused GLSL chunks, joined
// in dependency order (WebGL2/GLSL ES 3.00 has no #include - a function
// must be declared or forward-declared before it's called). Edit ONE
// chunk file for a single concern (e.g. shader/blackHole.ts) instead of
// the whole shader; this file only ever needs to change when the join
// order itself changes.
import { FRAG_HEADER } from "./header"
import { FRAG_JULIA } from "./julia"
import { FRAG_SPIRALS } from "./spirals"
import { FRAG_LOD } from "./lod"
import { FRAG_FLY_FIELD } from "./flyField"
import { FRAG_NOISE } from "./noise"
import { FRAG_NEBULA } from "./nebula"
import { FRAG_BODIES } from "./bodies"
import { FRAG_GLIMMER } from "./glimmer"
import { FRAG_BLACK_HOLE } from "./blackHole"
import { FRAG_MAIN } from "./main"

export const FRAG = [
  FRAG_HEADER,
  FRAG_JULIA,
  FRAG_SPIRALS,
  FRAG_LOD,
  FRAG_FLY_FIELD,
  FRAG_NOISE,
  FRAG_NEBULA,
  FRAG_BODIES,
  FRAG_GLIMMER,
  FRAG_BLACK_HOLE,
  FRAG_MAIN,
].join("\n")

export { VERT } from "./vert"
