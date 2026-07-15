import { VISUAL } from './config'
import { FluidSimGl } from './fluidGl'
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

/**
 * WebGL2 版: 流体シミュレーション結果を床へ投影する。
 * VisualParams の speed / colors / opacity を参照（将来の音声連動用に分離）。
 */
export class AmberglowRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly sim: FluidSimGl
  private readonly blit: () => void
  private readonly copyProgram: WebGLProgram
  private readonly uTexture: WebGLUniformLocation | null
  private readonly uResolution: WebGLUniformLocation | null
  private readonly uEdgeFadePx: WebGLUniformLocation | null
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
    this.sim = new FluidSimGl(gl, VISUAL.fluidSize)
    this.blit = createScreenBlit(gl)
    this.copyProgram = compileCopy(gl)
    this.uTexture = gl.getUniformLocation(this.copyProgram, 'uTexture')
    this.uResolution = gl.getUniformLocation(this.copyProgram, 'uResolution')
    this.uEdgeFadePx = gl.getUniformLocation(this.copyProgram, 'uEdgeFadePx')
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

  private paint(params: VisualParams): void {
    const gl = this.gl
    const gain = VISUAL.liquidGain * params.opacity
    const tex = this.sim.renderDisplay(params.colors, gain)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.copyProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(this.uTexture, 0)
    gl.uniform2f(this.uResolution, this.width, this.height)
    gl.uniform1f(this.uEdgeFadePx, params.edgeFadePx)
    this.blit()
    gl.disable(gl.BLEND)
  }
}

function createScreenBlit(gl: WebGL2RenderingContext): () => void {
  const vao = gl.createVertexArray()
  const buf = gl.createBuffer()
  if (!vao || !buf) throw new Error('screen blit failed')
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
  const ibo = gl.createBuffer()
  if (!ibo) throw new Error('screen index failed')
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

function compileCopy(gl: WebGL2RenderingContext): WebGLProgram {
  const vert = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`
  const frag = `#version 300 es
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
  const program = gl.createProgram()
  if (!program) throw new Error('copy program failed')
  const vs = gl.createShader(gl.VERTEX_SHADER)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  if (!vs || !fs) throw new Error('copy shader failed')
  gl.shaderSource(vs, vert)
  gl.shaderSource(fs, frag)
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
    throw new Error(gl.getProgramInfoLog(program) || 'copy link failed')
  }
  return program
}
