/**
 * WebGL2 Stam 系流体（速度＋3ch 染料）。
 * CPU 版 (fluid2d) と同じ工程: diffuse → project → advect。
 */

type FBO = {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  width: number
  height: number
  texelX: number
  texelY: number
}

type DoubleFBO = {
  width: number
  height: number
  texelX: number
  texelY: number
  read: FBO
  write: FBO
  swap: () => void
}

type Program = {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
}

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const SPLAT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;
uniform float uAspect;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  float r = max(uRadius, 1e-4);
  float w = exp(-dot(p, p) / (r * r) * 2.5);
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + uValue * w, 1.0);
}`

const ADVECT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel;
  coord = clamp(coord, uTexel, 1.0 - uTexel);
  fragColor = uDissipation * texture(uSource, coord);
}`

const DIVERGENCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`

const PRESSURE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  float p = (L + R + B + T - div) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}`

const GRADIENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel -= 0.5 * vec2(R - L, T - B);
  fragColor = vec4(vel, 0.0, 1.0);
}`

const DIFFUSE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform sampler2D uTarget;
uniform vec2 uTexel;
uniform float uA;
uniform float uCRecip;
void main() {
  vec4 x0 = texture(uSource, vUv);
  vec4 L = texture(uTarget, vUv - vec2(uTexel.x, 0.0));
  vec4 R = texture(uTarget, vUv + vec2(uTexel.x, 0.0));
  vec4 B = texture(uTarget, vUv - vec2(0.0, uTexel.y));
  vec4 T = texture(uTarget, vUv + vec2(0.0, uTexel.y));
  fragColor = (x0 + uA * (L + R + B + T)) * uCRecip;
}`

const CLEAR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float uValue;
void main() {
  fragColor = uValue * texture(uTexture, vUv);
}`

const DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uDye;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uGain;
void main() {
  vec3 dens = texture(uDye, vUv).rgb;
  float sum = dens.r + dens.g + dens.b;
  if (sum < 0.002) {
    fragColor = vec4(0.0);
    return;
  }
  vec3 col = (uC0 * dens.r + uC1 * dens.g + uC2 * dens.b) / sum;
  float bright = min(1.0, sum * 0.55);
  col = mix(col, uC3, bright * 0.25);
  col *= 0.85 + sum * 0.35;
  float alpha = min(1.0, sum * (200.0 / 255.0) * uGain);
  fragColor = vec4(col, alpha);
}`

export class FluidSimGl {
  readonly size: number
  private readonly gl: WebGL2RenderingContext
  private readonly blit: () => void
  private readonly programs: {
    splat: Program
    advect: Program
    divergence: Program
    pressure: Program
    gradient: Program
    diffuse: Program
    clear: Program
    display: Program
  }
  private readonly velocity: DoubleFBO
  private readonly dye: DoubleFBO
  private readonly pressure: DoubleFBO
  private readonly divergence: FBO
  private readonly displayFbo: FBO
  private readonly pressureIters: number

  constructor(gl: WebGL2RenderingContext, size: number) {
    this.gl = gl
    this.size = size
    this.pressureIters = 16

    const ext = gl.getExtension('EXT_color_buffer_float')
    if (!ext) throw new Error('EXT_color_buffer_float required')

    // float/half テクスチャは LINEAR 非対応環境だと incomplete → サンプルが真っ黒になる。
    // シミュレーション用は常に NEAREST。表示用 RGBA8 だけ LINEAR。
    const half = gl.getExtension('EXT_color_buffer_half_float')
    const internalFormat = half ? gl.RGBA16F : gl.RGBA32F
    const type = half ? gl.HALF_FLOAT : gl.FLOAT
    const filter = gl.NEAREST

    this.blit = createBlit(gl)
    this.programs = {
      splat: compile(gl, VERT, SPLAT),
      advect: compile(gl, VERT, ADVECT),
      divergence: compile(gl, VERT, DIVERGENCE),
      pressure: compile(gl, VERT, PRESSURE),
      gradient: compile(gl, VERT, GRADIENT),
      diffuse: compile(gl, VERT, DIFFUSE),
      clear: compile(gl, VERT, CLEAR),
      display: compile(gl, VERT, DISPLAY),
    }

    this.velocity = createDoubleFbo(gl, size, size, internalFormat, type, filter)
    this.dye = createDoubleFbo(gl, size, size, internalFormat, type, filter)
    this.pressure = createDoubleFbo(gl, size, size, internalFormat, type, filter)
    this.divergence = createFbo(gl, size, size, internalFormat, type, filter)
    this.displayFbo = createFbo(gl, size, size, gl.RGBA8, gl.UNSIGNED_BYTE, gl.LINEAR)
  }

  addForce(x: number, y: number, fx: number, fy: number, radius: number): void {
    this.splat(this.velocity, x, y, [fx, fy, 0], radius)
  }

  addDye(x: number, y: number, amount: number, channel: 0 | 1 | 2, radius: number): void {
    const value: [number, number, number] = [0, 0, 0]
    value[channel] = amount
    this.splat(this.dye, x, y, value, radius)
  }

  step(dt: number, viscosity: number, diffusion: number, dissipation: number): void {
    const gl = this.gl
    const n = this.size
    gl.disable(gl.BLEND)
    gl.viewport(0, 0, n, n)

    // velocity viscosity (Jacobi diffuse)
    const va = dt * viscosity * n * n
    if (va > 1e-8) this.diffuseField(this.velocity, va, 1 + 4 * va, 8)

    this.project()

    this.advect(this.velocity, this.velocity, dt, 1)
    this.project()

    const da = dt * diffusion * n * n
    if (da > 1e-8) this.diffuseField(this.dye, da, 1 + 4 * da, 6)
    this.advect(this.dye, this.velocity, dt, dissipation)
  }

  /**
   * 染料をパレットで着色して displayFbo へ描く。
   * edge fade は画面合成側で行う。
   */
  renderDisplay(
    colors: readonly (readonly [number, number, number])[],
    gain: number,
  ): WebGLTexture {
    const gl = this.gl
    const p = this.programs.display
    gl.disable(gl.BLEND)
    gl.viewport(0, 0, this.displayFbo.width, this.displayFbo.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.displayFbo.framebuffer)
    gl.useProgram(p.program)
    bindTexture(gl, this.dye.read.texture, 0)
    gl.uniform1i(p.uniforms.uDye, 0)
    gl.uniform3f(p.uniforms.uC0, colors[0][0] / 255, colors[0][1] / 255, colors[0][2] / 255)
    gl.uniform3f(p.uniforms.uC1, colors[1][0] / 255, colors[1][1] / 255, colors[1][2] / 255)
    gl.uniform3f(p.uniforms.uC2, colors[2][0] / 255, colors[2][1] / 255, colors[2][2] / 255)
    gl.uniform3f(p.uniforms.uC3, colors[3][0] / 255, colors[3][1] / 255, colors[3][2] / 255)
    gl.uniform1f(p.uniforms.uGain, gain)
    this.blit()
    return this.displayFbo.texture
  }

  private splat(
    target: DoubleFBO,
    x: number,
    y: number,
    value: [number, number, number],
    radius: number,
  ): void {
    const gl = this.gl
    const p = this.programs.splat
    gl.viewport(0, 0, target.width, target.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.framebuffer)
    gl.useProgram(p.program)
    bindTexture(gl, target.read.texture, 0)
    gl.uniform1i(p.uniforms.uTarget, 0)
    gl.uniform2f(p.uniforms.uPoint, x, y)
    gl.uniform3f(p.uniforms.uValue, value[0], value[1], value[2])
    gl.uniform1f(p.uniforms.uRadius, radius)
    gl.uniform1f(p.uniforms.uAspect, 1)
    this.blit()
    target.swap()
  }

  private advect(
    target: DoubleFBO,
    velocity: DoubleFBO,
    dt: number,
    dissipation: number,
  ): void {
    const gl = this.gl
    const p = this.programs.advect
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.framebuffer)
    gl.useProgram(p.program)
    bindTexture(gl, velocity.read.texture, 0)
    bindTexture(gl, target.read.texture, 1)
    gl.uniform1i(p.uniforms.uVelocity, 0)
    gl.uniform1i(p.uniforms.uSource, 1)
    gl.uniform2f(p.uniforms.uTexel, target.texelX, target.texelY)
    // CPU 版: cell' = cell - dt * n * vel → uv' = uv - dt * vel
    gl.uniform1f(p.uniforms.uDt, dt)
    gl.uniform1f(p.uniforms.uDissipation, dissipation)
    this.blit()
    target.swap()
  }

  private diffuseField(target: DoubleFBO, a: number, c: number, iters: number): void {
    const gl = this.gl
    const p = this.programs.diffuse
    const cRecip = 1 / c
    // source は拡散前の場を固定参照したいので、1回コピー相当として read を source に使う
    // Jacobi: 交互に write/read。初回 source=read。以降 target 近傍は更新側。
    // 簡略: 毎イテレーション uSource=元, uTarget=最新近傍 → 元を別 FBO に保持しないため
    // pressure と同様に ping-pong だけで近似（近傍のみ更新場）。
    gl.useProgram(p.program)
    gl.uniform1f(p.uniforms.uA, a)
    gl.uniform1f(p.uniforms.uCRecip, cRecip)
    gl.uniform2f(p.uniforms.uTexel, target.texelX, target.texelY)

    // 元場を divergence バッファに退避して固定ソースにする
    copyTexture(gl, target.read, this.divergence)

    for (let i = 0; i < iters; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.framebuffer)
      bindTexture(gl, this.divergence.texture, 0)
      bindTexture(gl, target.read.texture, 1)
      gl.uniform1i(p.uniforms.uSource, 0)
      gl.uniform1i(p.uniforms.uTarget, 1)
      this.blit()
      target.swap()
    }
  }

  private project(): void {
    const gl = this.gl
    const n = this.size
    gl.viewport(0, 0, n, n)

    // divergence
    {
      const p = this.programs.divergence
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergence.framebuffer)
      gl.useProgram(p.program)
      bindTexture(gl, this.velocity.read.texture, 0)
      gl.uniform1i(p.uniforms.uVelocity, 0)
      gl.uniform2f(p.uniforms.uTexel, this.velocity.texelX, this.velocity.texelY)
      this.blit()
    }

    // clear pressure
    {
      const p = this.programs.clear
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.write.framebuffer)
      gl.useProgram(p.program)
      bindTexture(gl, this.pressure.read.texture, 0)
      gl.uniform1i(p.uniforms.uTexture, 0)
      gl.uniform1f(p.uniforms.uValue, 0)
      this.blit()
      this.pressure.swap()
    }

    // jacobi pressure
    {
      const p = this.programs.pressure
      gl.useProgram(p.program)
      gl.uniform2f(p.uniforms.uTexel, this.pressure.texelX, this.pressure.texelY)
      bindTexture(gl, this.divergence.texture, 1)
      gl.uniform1i(p.uniforms.uDivergence, 1)
      for (let i = 0; i < this.pressureIters; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.write.framebuffer)
        bindTexture(gl, this.pressure.read.texture, 0)
        gl.uniform1i(p.uniforms.uPressure, 0)
        this.blit()
        this.pressure.swap()
      }
    }

    // gradient subtract
    {
      const p = this.programs.gradient
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.framebuffer)
      gl.useProgram(p.program)
      bindTexture(gl, this.pressure.read.texture, 0)
      bindTexture(gl, this.velocity.read.texture, 1)
      gl.uniform1i(p.uniforms.uPressure, 0)
      gl.uniform1i(p.uniforms.uVelocity, 1)
      gl.uniform2f(p.uniforms.uTexel, this.velocity.texelX, this.velocity.texelY)
      this.blit()
      this.velocity.swap()
    }
  }
}

function createBlit(gl: WebGL2RenderingContext): () => void {
  const vao = gl.createVertexArray()
  const buf = gl.createBuffer()
  if (!vao || !buf) throw new Error('blit geometry failed')
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
  const ibo = gl.createBuffer()
  if (!ibo) throw new Error('blit index failed')
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

function copyTexture(gl: WebGL2RenderingContext, src: FBO, dst: FBO): void {
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.framebuffer)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.framebuffer)
  gl.blitFramebuffer(
    0, 0, src.width, src.height,
    0, 0, dst.width, dst.height,
    gl.COLOR_BUFFER_BIT,
    gl.NEAREST,
  )
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

function compile(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): Program {
  const program = gl.createProgram()
  if (!program) throw new Error('program failed')
  const vs = shader(gl, gl.VERTEX_SHADER, vertSrc)
  const fs = shader(gl, gl.FRAGMENT_SHADER, fragSrc)
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

function shader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error('shader failed')
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'compile failed')
  }
  return s
}

function createFbo(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  type: number,
  filter: number,
): FBO {
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  if (!texture || !framebuffer) throw new Error('fbo failed')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, gl.RGBA, type, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`framebuffer incomplete: ${status}`)
  }
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return {
    texture,
    framebuffer,
    width: w,
    height: h,
    texelX: 1 / w,
    texelY: 1 / h,
  }
}

function createDoubleFbo(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  type: number,
  filter: number,
): DoubleFBO {
  let read = createFbo(gl, w, h, internalFormat, type, filter)
  let write = createFbo(gl, w, h, internalFormat, type, filter)
  return {
    width: w,
    height: h,
    texelX: 1 / w,
    texelY: 1 / h,
    get read() {
      return read
    },
    get write() {
      return write
    },
    swap() {
      const tmp = read
      read = write
      write = tmp
    },
  }
}

function bindTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, unit: number): void {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
}
