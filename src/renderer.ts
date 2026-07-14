import { VISUAL, type RGB } from './config'
import type { VisualParams } from './visualParams'

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_opacity;
uniform float u_scale;
uniform float u_warp;
uniform float u_region;
uniform float u_bubble;
uniform float u_bubbleContrast;
uniform float u_core;
uniform float u_gain;
uniform float u_edgeFade;
uniform float u_floorEdge;
uniform float u_floorCenter;
uniform vec3 u_floor;
uniform float u_audio;
uniform sampler2D u_concrete;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p * 2.03;
    a *= 0.5;
  }
  return v;
}

vec2 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md = 8.0;
  float md2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(n + g), hash(n + g + 19.19));
      o = 0.5 + 0.45 * sin(u_time * (0.12 + 0.08 * o.x) + 6.2831 * o);
      vec2 r = g + o - f;
      float d = length(r);
      if (d < md) {
        md2 = md;
        md = d;
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  return vec2(md, md2);
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float t = u_time * (0.1 + u_audio * 0.06);

  // --- 大きな色面（暖色側 / 寒色側）---
  vec2 rp = p * u_region;
  float warmField = fbm(rp * 1.1 + vec2(-0.4 + sin(t * 0.2) * 0.15, t * 0.12));
  float coolField = fbm(rp * 1.05 + vec2(1.8, -t * 0.1) + warmField * 0.35);
  float split = smoothstep(0.35, 0.65, warmField * 0.55 + (uv.x * 0.35) + sin(t * 0.15) * 0.05);

  // --- マーブル歪み（全体ぼかしはしない）---
  vec2 wp = p * u_scale;
  vec2 q = vec2(fbm(wp + t), fbm(wp + vec2(3.1, -t)));
  vec2 warped = wp + u_warp * q;

  // --- 油泡：小さめの丸い斑点（理想画の左寄り質感）---
  vec2 bp = warped * u_bubble * 0.45 + q * 1.2;
  vec2 cell = voronoi(bp);
  float rim = clamp((cell.y - cell.x) * u_bubbleContrast, 0.0, 1.0);
  float bubble = 1.0 - smoothstep(0.02, 0.22, cell.x);
  float darkSpot = smoothstep(0.08, 0.0, cell.x) * (0.35 + 0.65 * hash(floor(bp)));

  // --- 寒色の大きな半透明円 ---
  vec2 coolCenter = vec2(0.28 + 0.06 * sin(t * 0.23), 0.02 + 0.05 * cos(t * 0.19));
  float coolDisc = 1.0 - smoothstep(0.18, 0.55, length(p - coolCenter));

  // --- 中心寄りの明るい核と細い放射（繊維状）---
  vec2 corePos = vec2(-0.08 + 0.05 * sin(t * 0.17), 0.04 * cos(t * 0.21));
  vec2 toCore = p - corePos;
  float coreDist = length(toCore);
  float core = exp(-coreDist * 7.5) * u_core;
  float angle = atan(toCore.y, toCore.x);
  float fibers = pow(max(0.0, 1.0 - coreDist * 2.2), 2.0)
    * (0.55 + 0.45 * sin(angle * 18.0 + fbm(toCore * 8.0 + t) * 6.0));
  fibers *= smoothstep(0.55, 0.05, coreDist);

  // 色割り当て
  vec3 warm = mix(u_c0, u_c1, clamp(warmField, 0.0, 1.0));
  warm = mix(warm, u_c0 * 1.1, bubble * 0.35);
  warm *= 1.0 - darkSpot * 0.55;
  warm += rim * 0.08 * warm;

  vec3 cool = mix(u_c2, u_c3, clamp(coolField, 0.0, 1.0));
  cool = mix(cool, u_c2 * 1.2, coolDisc * 0.55);

  vec3 liquid = mix(warm, cool, split * 0.75);
  liquid = mix(liquid, cool, coolDisc * 0.35 * (1.0 - split * 0.4));
  liquid += vec3(1.0, 0.95, 0.75) * core;
  liquid += mix(u_c1, vec3(1.0), 0.4) * fibers * 0.45;
  liquid *= u_opacity * u_gain;
  liquid = clamp(liquid, 0.0, 1.4);

  // --- 外周だけ床へグラデーション（中央はくっきり）---
  float fx = smoothstep(0.0, u_edgeFade, uv.x) * smoothstep(0.0, u_edgeFade, 1.0 - uv.x);
  float fy = smoothstep(0.0, u_edgeFade, uv.y) * smoothstep(0.0, u_edgeFade, 1.0 - uv.y);
  float rectMask = fx * fy;
  // 角を少し丸く落とす
  rectMask = pow(rectMask, 0.85);

  vec3 floorCol = texture(u_concrete, uv).rgb;
  // フォールバック兼ねて床ユニフォームも混ぜる
  floorCol = mix(u_floor, floorCol, 0.85);

  float floorAmt = mix(u_floorEdge, u_floorCenter, rectMask);
  vec3 color = mix(liquid, floorCol, floorAmt);
  // さらに外周で液面を落とす
  color = mix(floorCol, color, 0.25 + 0.75 * rectMask);

  outColor = vec4(color, 1.0);
}
`

/**
 * リキッドライト（中央はシャープ）+ 外周のみ床へフェード。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly concrete: HTMLCanvasElement
  private readonly uniforms: Record<string, WebGLUniformLocation | null>
  private concreteTexture: WebGLTexture | null = null
  private width = 0
  private height = 0
  private time = 0
  private dpr = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error('WebGL2 not available')
    this.gl = gl

    this.program = createProgram(gl, VERT, FRAG)
    gl.useProgram(this.program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const loc = gl.getAttribLocation(this.program, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    this.uniforms = {
      u_time: gl.getUniformLocation(this.program, 'u_time'),
      u_res: gl.getUniformLocation(this.program, 'u_res'),
      u_c0: gl.getUniformLocation(this.program, 'u_c0'),
      u_c1: gl.getUniformLocation(this.program, 'u_c1'),
      u_c2: gl.getUniformLocation(this.program, 'u_c2'),
      u_c3: gl.getUniformLocation(this.program, 'u_c3'),
      u_opacity: gl.getUniformLocation(this.program, 'u_opacity'),
      u_scale: gl.getUniformLocation(this.program, 'u_scale'),
      u_warp: gl.getUniformLocation(this.program, 'u_warp'),
      u_region: gl.getUniformLocation(this.program, 'u_region'),
      u_bubble: gl.getUniformLocation(this.program, 'u_bubble'),
      u_bubbleContrast: gl.getUniformLocation(this.program, 'u_bubbleContrast'),
      u_core: gl.getUniformLocation(this.program, 'u_core'),
      u_gain: gl.getUniformLocation(this.program, 'u_gain'),
      u_edgeFade: gl.getUniformLocation(this.program, 'u_edgeFade'),
      u_floorEdge: gl.getUniformLocation(this.program, 'u_floorEdge'),
      u_floorCenter: gl.getUniformLocation(this.program, 'u_floorCenter'),
      u_floor: gl.getUniformLocation(this.program, 'u_floor'),
      u_audio: gl.getUniformLocation(this.program, 'u_audio'),
      u_concrete: gl.getUniformLocation(this.program, 'u_concrete'),
    }

    this.concrete = document.createElement('canvas')
    this.concreteTexture = gl.createTexture()
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = width
    this.height = height

    const pw = Math.floor(width * this.dpr)
    const ph = Math.floor(height * this.dpr)
    this.canvas.width = pw
    this.canvas.height = ph
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.gl.viewport(0, 0, pw, ph)

    this.buildConcreteTexture(width, height)
    this.uploadConcreteTexture()
  }

  update(dt: number, params: VisualParams): void {
    this.time += dt * params.speed * (1 + params.audioEnergy * 0.25)
    this.draw(params)
  }

  private draw(params: VisualParams): void {
    const { gl } = this
    gl.useProgram(this.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.concreteTexture)
    gl.uniform1i(this.uniforms.u_concrete, 0)

    const c = params.colors
    const toF = (rgb: RGB): [number, number, number] => [
      rgb[0] / 255,
      rgb[1] / 255,
      rgb[2] / 255,
    ]
    const floor = toF(VISUAL.floorColor)

    gl.uniform1f(this.uniforms.u_time, this.time)
    gl.uniform2f(this.uniforms.u_res, this.width, this.height)
    gl.uniform3fv(this.uniforms.u_c0, toF(c[0] ?? [1, 1, 1]))
    gl.uniform3fv(this.uniforms.u_c1, toF(c[1] ?? [1, 1, 1]))
    gl.uniform3fv(this.uniforms.u_c2, toF(c[2] ?? [1, 1, 1]))
    gl.uniform3fv(this.uniforms.u_c3, toF(c[3] ?? [1, 1, 1]))
    gl.uniform1f(this.uniforms.u_opacity, params.opacity)
    gl.uniform1f(this.uniforms.u_scale, VISUAL.patternScale)
    gl.uniform1f(this.uniforms.u_warp, VISUAL.warpStrength)
    gl.uniform1f(this.uniforms.u_region, VISUAL.regionScale)
    gl.uniform1f(this.uniforms.u_bubble, VISUAL.bubbleScale)
    gl.uniform1f(this.uniforms.u_bubbleContrast, VISUAL.bubbleContrast)
    gl.uniform1f(this.uniforms.u_core, VISUAL.coreGain)
    gl.uniform1f(this.uniforms.u_gain, VISUAL.liquidGain * (0.95 + params.audioBass * 0.12))
    gl.uniform1f(this.uniforms.u_edgeFade, VISUAL.edgeFade)
    gl.uniform1f(this.uniforms.u_floorEdge, VISUAL.floorEdgeMix)
    gl.uniform1f(this.uniforms.u_floorCenter, VISUAL.floorCenterMix)
    gl.uniform3fv(this.uniforms.u_floor, floor)
    gl.uniform1f(this.uniforms.u_audio, params.audioEnergy)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private uploadConcreteTexture(): void {
    const { gl } = this
    if (!this.concreteTexture) return
    gl.bindTexture(gl.TEXTURE_2D, this.concreteTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.concrete)
  }

  private buildConcreteTexture(width: number, height: number): void {
    const dpr = this.dpr
    const pw = Math.floor(width * dpr)
    const ph = Math.floor(height * dpr)
    this.concrete.width = pw
    this.concrete.height = ph
    const ctx = this.concrete.getContext('2d')
    if (!ctx) return

    const [br, bg, bb] = VISUAL.floorColor
    const image = ctx.createImageData(pw, ph)
    const data = image.data
    const strength = VISUAL.floorNoiseStrength

    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * pw + x) * 4
        const sx = x / dpr
        const sy = y / dpr
        const n =
          0.5 * hash2(sx * 0.5, sy * 0.5)
          + 0.3 * hash2(sx * 0.12, sy * 0.12)
          + 0.2 * hash2(sx * 0.03, sy * 0.03)
        const grain = (hash2(sx * 3.8, sy * 3.5) - 0.5) * 16
        const v = (n - 0.5) * 255 * strength + grain
        data[i] = clampByte(br + v)
        data[i + 1] = clampByte(bg + v * 0.96)
        data[i + 2] = clampByte(bb + v * 0.9)
        data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  }
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc)
  const program = gl.createProgram()
  if (!program) throw new Error('program failed')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'link failed')
  }
  return program
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('shader failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'compile failed')
  }
  return shader
}

function fract(n: number): number {
  return n - Math.floor(n)
}

function hash2(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
