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
uniform float u_cell;
uniform float u_contrast;
uniform float u_soft;
uniform float u_gain;
uniform float u_audio;

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
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p * 2.02;
    a *= 0.5;
  }
  return v;
}

// 簡易 Voronoi（油滴のセル境界）
vec2 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md = 8.0;
  float md2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(n + g), hash(n + g + 19.19));
      o = 0.5 + 0.5 * sin(u_time * (0.15 + 0.1 * o.x) + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) {
        md2 = md;
        md = d;
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  return vec2(sqrt(md), sqrt(md2));
}

vec3 palette(float t) {
  float x = fract(t);
  float s = x * 4.0;
  float id = floor(s);
  float f = fract(s);
  f = smoothstep(0.5 - u_soft * 2.0, 0.5 + u_soft * 2.0, f);
  vec3 a = id < 0.5 ? u_c0 : id < 1.5 ? u_c1 : id < 2.5 ? u_c2 : u_c3;
  vec3 b = id < 0.5 ? u_c1 : id < 1.5 ? u_c2 : id < 2.5 ? u_c3 : u_c0;
  return mix(a, b, f);
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  p *= u_scale;

  float t = u_time * (0.12 + u_audio * 0.08);

  // ドメインワープ：油と水が押し合うマーブル
  vec2 q = vec2(
    fbm(p + vec2(0.0, t)),
    fbm(p + vec2(5.2, -t * 0.85))
  );
  vec2 r = vec2(
    fbm(p + u_warp * 1.7 * q + vec2(1.7, 9.2) + t * 0.35),
    fbm(p + u_warp * 1.7 * q + vec2(8.3, 2.8) - t * 0.28)
  );
  float marble = fbm(p + u_warp * 2.2 * r);

  // 油滴セル
  vec2 cellUv = p * u_cell * 0.35 + r * 0.85;
  vec2 cell = voronoi(cellUv + vec2(t * 0.08, -t * 0.05));
  float edge = clamp((cell.y - cell.x) * u_contrast * 3.2, 0.0, 1.0);
  float blob = 1.0 - smoothstep(0.05, 0.48, cell.x);
  float micro = smoothstep(0.4, 0.9, fbm(p * 7.5 + r * 2.0 + t * 0.15));

  vec3 col = palette(marble * 0.9 + edge * 0.15 + t * 0.015);
  // セル内部を明るく、境界で隣接色が立つ油膜感
  col = mix(col * 0.45, col, 0.35 + 0.65 * blob);
  col = mix(col, col.gbr, edge * 0.2);
  col += edge * 0.1;
  col += micro * 0.06 * col;

  float vig = smoothstep(1.35, 0.2, length((uv - 0.5) * vec2(aspect * 0.65, 1.0)));
  col *= 0.82 + 0.18 * vig;
  col *= u_opacity;
  col = pow(max(col * u_gain, 0.0), vec3(0.9));

  outColor = vec4(col, 1.0);
}
`

/**
 * WebGL のリキッドライト描画 + コンクリート合成。
 * VisualParams（speed / colors / opacity / audio*）のみを参照する。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly concrete: HTMLCanvasElement
  private readonly overlay: HTMLCanvasElement
  private readonly overlayCtx: CanvasRenderingContext2D
  private readonly uniforms: Record<string, WebGLUniformLocation | null>
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
      u_cell: gl.getUniformLocation(this.program, 'u_cell'),
      u_contrast: gl.getUniformLocation(this.program, 'u_contrast'),
      u_soft: gl.getUniformLocation(this.program, 'u_soft'),
      u_gain: gl.getUniformLocation(this.program, 'u_gain'),
      u_audio: gl.getUniformLocation(this.program, 'u_audio'),
    }

    this.concrete = document.createElement('canvas')
    this.overlay = document.createElement('canvas')
    const overlayCtx = this.overlay.getContext('2d')
    if (!overlayCtx) throw new Error('2D overlay failed')
    this.overlayCtx = overlayCtx

    // 合成用にキャンバスを absolute 重ねる
    this.overlay.style.position = 'fixed'
    this.overlay.style.inset = '0'
    this.overlay.style.width = '100%'
    this.overlay.style.height = '100%'
    this.overlay.style.pointerEvents = 'none'
    this.overlay.style.mixBlendMode = 'multiply'
    this.overlay.style.opacity = String(VISUAL.concreteMix)
    document.body.appendChild(this.overlay)
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

    this.overlay.width = pw
    this.overlay.height = ph
    this.overlay.style.width = `${width}px`
    this.overlay.style.height = `${height}px`
    this.overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    this.buildConcreteTexture(width, height)
    this.overlayCtx.clearRect(0, 0, width, height)
    this.overlayCtx.drawImage(this.concrete, 0, 0, width, height)
    this.overlay.style.opacity = String(VISUAL.concreteMix)
  }

  update(dt: number, params: VisualParams): void {
    const audio = params.audioEnergy
    this.time += dt * params.speed * (1 + audio * 0.3)
    this.drawLiquid(params)
  }

  private drawLiquid(params: VisualParams): void {
    const { gl } = this
    gl.useProgram(this.program)
    gl.disable(gl.BLEND)
    gl.clearColor(0.05, 0.045, 0.04, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const c = params.colors
    const toF = (rgb: RGB): [number, number, number] => [
      rgb[0] / 255,
      rgb[1] / 255,
      rgb[2] / 255,
    ]

    gl.uniform1f(this.uniforms.u_time, this.time)
    gl.uniform2f(this.uniforms.u_res, this.width, this.height)
    gl.uniform3fv(this.uniforms.u_c0, toF(c[0] ?? [1, 1, 1]))
    gl.uniform3fv(this.uniforms.u_c1, toF(c[1] ?? [1, 1, 1]))
    gl.uniform3fv(this.uniforms.u_c2, toF(c[2] ?? [1, 1, 1]))
    gl.uniform3fv(this.uniforms.u_c3, toF(c[3] ?? [1, 1, 1]))
    gl.uniform1f(this.uniforms.u_opacity, params.opacity)
    gl.uniform1f(this.uniforms.u_scale, VISUAL.patternScale)
    gl.uniform1f(this.uniforms.u_warp, VISUAL.warpStrength)
    gl.uniform1f(this.uniforms.u_cell, VISUAL.cellScale * (1 + params.audioHigh * 0.2))
    gl.uniform1f(this.uniforms.u_contrast, VISUAL.cellContrast)
    gl.uniform1f(this.uniforms.u_soft, VISUAL.blendSoftness)
    gl.uniform1f(this.uniforms.u_gain, VISUAL.liquidGain * (0.95 + params.audioBass * 0.15))
    gl.uniform1f(this.uniforms.u_audio, params.audioEnergy)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
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
