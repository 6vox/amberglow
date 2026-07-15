import { VISUAL } from './config'
import { FluidSim } from './fluid2d'
import type { VisualParams } from './visualParams'

interface Stir {
  x: number
  y: number
  ang: number
  orbit: number
  speed: number
  force: number
}

interface Dropper {
  x: number
  y: number
  channel: 0 | 1 | 2
  period: number
  phase: number
  radius: number
}

type Program = {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
}

type FBO = {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  width: number
  height: number
}

/**
 * WebGL 表示 + CPU Stam 流体。
 * シミュレーションは気に入っている Canvas 版と同じ実装を使い、
 * 拡大・にじみ・端フェードだけ GPU で行う（アナログ感を優先）。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly sim: FluidSim
  private readonly image: ImageData
  private readonly dyeTexture: WebGLTexture
  private readonly blit: () => void
  private readonly paintProgram: Program
  private readonly blurProgram: Program
  private readonly presentProgram: Program
  private blurA: FBO | null = null
  private blurB: FBO | null = null
  private width = 0
  private height = 0
  private time = 0
  private stirs: Stir[] = []
  private droppers: Dropper[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error('WebGL2 not available')
    this.gl = gl

    this.sim = new FluidSim(VISUAL.fluidSize)
    this.image = new ImageData(VISUAL.fluidSize, VISUAL.fluidSize)
    this.dyeTexture = createTexture(gl)
    gl.bindTexture(gl.TEXTURE_2D, this.dyeTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      VISUAL.fluidSize,
      VISUAL.fluidSize,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )

    this.blit = createBlit(gl)
    this.paintProgram = compile(gl, VERT, PAINT_FRAG)
    this.blurProgram = compile(gl, VERT, BLUR_FRAG)
    this.presentProgram = compile(gl, VERT, PRESENT_FRAG)

    this.initActors()
    this.seedInitialDye()
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = width
    this.height = height
    this.canvas.width = Math.floor(width * dpr)
    this.canvas.height = Math.floor(height * dpr)
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.ensureBlurTargets(this.canvas.width, this.canvas.height)
  }

  update(dt: number, params: VisualParams): void {
    const speed = Math.max(0.05, params.speed)
    this.time += dt * speed
    this.drive(dt * speed)
    const stepDt = Math.min(0.033, dt * speed)
    this.sim.step(
      stepDt,
      VISUAL.viscosity,
      VISUAL.diffusion,
      VISUAL.dissipation,
    )
    this.rasterize(params)
    this.paint(params)
  }

  private initActors(): void {
    this.stirs = [
      { x: 0.35, y: 0.45, ang: 0.2, orbit: 0.12, speed: 0.16, force: 1 },
      { x: 0.65, y: 0.5, ang: 2.4, orbit: 0.1, speed: -0.13, force: 0.85 },
      { x: 0.5, y: 0.4, ang: 1.1, orbit: 0.08, speed: 0.1, force: 0.55 },
    ]
    this.droppers = [
      { x: 0.3, y: 0.42, channel: 0, period: 9.5, phase: 0.2, radius: 0.07 },
      { x: 0.4, y: 0.55, channel: 1, period: 11.0, phase: 2.1, radius: 0.06 },
      { x: 0.72, y: 0.45, channel: 2, period: 12.5, phase: 4.0, radius: 0.08 },
      { x: 0.62, y: 0.58, channel: 2, period: 14.0, phase: 1.3, radius: 0.05 },
    ]
  }

  private seedInitialDye(): void {
    this.sim.addDye(0.32, 0.45, 2.4, 0, 0.14)
    this.sim.addDye(0.4, 0.52, 1.8, 1, 0.12)
    this.sim.addDye(0.7, 0.48, 2.0, 2, 0.15)
    this.sim.addDye(0.55, 0.4, 1.2, 1, 0.08)
    this.sim.addForce(0.45, 0.48, 12, -6, 0.16)
    this.sim.addForce(0.62, 0.5, -8, 5, 0.12)
  }

  private drive(dt: number): void {
    const force = VISUAL.stirForce * dt
    for (const s of this.stirs) {
      s.ang += s.speed * dt
      const x = s.x + Math.cos(s.ang) * s.orbit
      const y = s.y + Math.sin(s.ang) * s.orbit * 0.85
      const tx = -Math.sin(s.ang) * s.force * force
      const ty = Math.cos(s.ang) * s.force * force
      this.sim.addForce(x, y, tx, ty, 0.08)
    }

    for (const d of this.droppers) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * ((Math.PI * 2) / d.period) + d.phase)
      if (pulse > 0.82) {
        const wobbleX = d.x + 0.02 * Math.sin(this.time * 0.3 + d.phase)
        const wobbleY = d.y + 0.02 * Math.cos(this.time * 0.25 + d.phase)
        this.sim.addDye(
          wobbleX,
          wobbleY,
          VISUAL.dyeAmount * (pulse - 0.82) * 4,
          d.channel,
          d.radius,
        )
      }
    }
  }

  /** Canvas 版と同じ色合成で ImageData → テクスチャへ */
  private rasterize(params: VisualParams): void {
    const n = this.sim.n
    const colors = params.colors
    const data = this.image.data
    const gain = VISUAL.liquidGain * params.opacity
    const c0 = colors[0]
    const c1 = colors[1]
    const c2 = colors[2]
    const c3 = colors[3]

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = this.sim.ix(i + 1, j + 1)
        const a = Math.min(1.5, this.sim.d[0][idx])
        const b = Math.min(1.5, this.sim.d[1][idx])
        const c = Math.min(1.5, this.sim.d[2][idx])
        const dens = a + b + c
        const p = (j * n + i) * 4
        if (dens < 0.002) {
          data[p] = 0
          data[p + 1] = 0
          data[p + 2] = 0
          data[p + 3] = 0
          continue
        }

        let r = c0[0] * a + c1[0] * b + c2[0] * c
        let g = c0[1] * a + c1[1] * b + c2[1] * c
        let bl = c0[2] * a + c1[2] * b + c2[2] * c
        const sum = a + b + c
        r /= sum
        g /= sum
        bl /= sum
        const bright = Math.min(1, dens * 0.55)
        r = r + (c3[0] - r) * bright * 0.25
        g = g + (c3[1] - g) * bright * 0.25
        bl = bl + (c3[2] - bl) * bright * 0.25

        const alpha = Math.min(255, dens * 200 * gain)
        data[p] = clamp(r * (0.85 + dens * 0.35))
        data[p + 1] = clamp(g * (0.85 + dens * 0.35))
        data[p + 2] = clamp(bl * (0.85 + dens * 0.35))
        data[p + 3] = alpha
      }
    }

    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.dyeTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      n,
      n,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    )
  }

  private paint(params: VisualParams): void {
    const gl = this.gl
    if (!this.blurA || !this.blurB) return

    // 1) dye を画面解像度へ（やわらかく）
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurA.framebuffer)
    gl.viewport(0, 0, this.blurA.width, this.blurA.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.disable(gl.BLEND)
    gl.useProgram(this.paintProgram.program)
    bindTexture(gl, this.dyeTexture, 0)
    gl.uniform1i(this.paintProgram.uniforms.uTexture, 0)
    this.blit()

    // 2) 分離ぼかし（アナログのにじみ）
    const blurPx = Math.max(1, VISUAL.upscaleBlur)
    this.runBlur(this.blurA, this.blurB, blurPx, true)
    this.runBlur(this.blurB, this.blurA, blurPx, false)

    // 3) もう一段うすく重ねて Canvas 版の二重描画に近づける
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurB.framebuffer)
    gl.viewport(0, 0, this.blurB.width, this.blurB.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.paintProgram.program)
    bindTexture(gl, this.blurA.texture, 0)
    gl.uniform1i(this.paintProgram.uniforms.uTexture, 0)
    this.blit()
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.paintProgram.program)
    bindTexture(gl, this.dyeTexture, 0)
    gl.uniform1i(this.paintProgram.uniforms.uTexture, 0)
    // わずかにシャープ層
    gl.blendColor(0, 0, 0, 0.55)
    gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA)
    this.blit()
    gl.disable(gl.BLEND)

    // 4) 端フェードして黒床へ
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.presentProgram.program)
    bindTexture(gl, this.blurB.texture, 0)
    gl.uniform1i(this.presentProgram.uniforms.uTexture, 0)
    gl.uniform2f(this.presentProgram.uniforms.uResolution, this.width, this.height)
    gl.uniform1f(this.presentProgram.uniforms.uEdgeFadePx, params.edgeFadePx)
    this.blit()
    gl.disable(gl.BLEND)
  }

  private runBlur(src: FBO, dst: FBO, px: number, horizontal: boolean): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer)
    gl.viewport(0, 0, dst.width, dst.height)
    gl.disable(gl.BLEND)
    gl.useProgram(this.blurProgram.program)
    bindTexture(gl, src.texture, 0)
    gl.uniform1i(this.blurProgram.uniforms.uTexture, 0)
    gl.uniform2f(
      this.blurProgram.uniforms.uDirection,
      horizontal ? px / dst.width : 0,
      horizontal ? 0 : px / dst.height,
    )
    this.blit()
  }

  private ensureBlurTargets(w: number, h: number): void {
    if (this.blurA && this.blurA.width === w && this.blurA.height === h) return
    if (this.blurA) destroyFbo(this.gl, this.blurA)
    if (this.blurB) destroyFbo(this.gl, this.blurB)
    this.blurA = createFbo(this.gl, w, h)
    this.blurB = createFbo(this.gl, w, h)
  }
}

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const PAINT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
void main() {
  fragColor = texture(uTexture, vUv);
}`

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uDirection;
void main() {
  vec4 sum = texture(uTexture, vUv) * 0.227027;
  sum += texture(uTexture, vUv + uDirection * 1.384615) * 0.316216;
  sum += texture(uTexture, vUv - uDirection * 1.384615) * 0.316216;
  sum += texture(uTexture, vUv + uDirection * 3.230769) * 0.070270;
  sum += texture(uTexture, vUv - uDirection * 3.230769) * 0.070270;
  fragColor = sum;
}`

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uEdgeFadePx;
void main() {
  vec4 c = texture(uTexture, vUv);
  float d = min(
    min(vUv.x, 1.0 - vUv.x) * uResolution.x,
    min(vUv.y, 1.0 - vUv.y) * uResolution.y
  );
  c.a *= smoothstep(0.0, max(uEdgeFadePx, 1.0), d);
  fragColor = c;
}`

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function createBlit(gl: WebGL2RenderingContext): () => void {
  const vao = gl.createVertexArray()
  const buf = gl.createBuffer()
  if (!vao || !buf) throw new Error('blit failed')
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
  const ibo = gl.createBuffer()
  if (!ibo) throw new Error('ibo failed')
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return () => {
    gl.bindVertexArray(vao)
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
    gl.bindVertexArray(null)
  }
}

function compile(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): Program {
  const program = gl.createProgram()
  if (!program) throw new Error('program failed')
  const vs = gl.createShader(gl.VERTEX_SHADER)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  if (!vs || !fs) throw new Error('shader failed')
  gl.shaderSource(vs, vertSrc)
  gl.shaderSource(fs, fragSrc)
  gl.compileShader(vs)
  gl.compileShader(fs)
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(vs) || 'vert compile failed')
  }
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(fs) || 'frag compile failed')
  }
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'link failed')
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(program, i)
    if (!info) continue
    uniforms[info.name] = gl.getUniformLocation(program, info.name)
  }
  return { program, uniforms }
}

function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()
  if (!t) throw new Error('texture failed')
  return t
}

function createFbo(gl: WebGL2RenderingContext, w: number, h: number): FBO {
  const texture = createTexture(gl)
  const framebuffer = gl.createFramebuffer()
  if (!framebuffer) throw new Error('fbo failed')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { texture, framebuffer, width: w, height: h }
}

function destroyFbo(gl: WebGL2RenderingContext, fbo: FBO): void {
  gl.deleteTexture(fbo.texture)
  gl.deleteFramebuffer(fbo.framebuffer)
}

function bindTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, unit: number): void {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
}
