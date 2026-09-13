import { useEffect, useRef, useState } from 'react'

/**
 * The aurora beam from DESIGN.md - a narrow vertical streak of electric iris
 * melting into ember and then white, with a warm radial glow at its base.
 * In this product it is the light leaking out of the vault.
 *
 * Rendered as a small raw-WebGL fragment shader so the beam actually
 * shimmers - slow noise ripples up its length and the core breathes - rather
 * than sitting as a static gradient. No three.js: one full-screen triangle.
 *
 * - Pauses off-screen; under reduced motion it renders one frame.
 * - Pixel ratio capped at 1.5; the beam is soft, extra pixels buy nothing.
 * - Without WebGL the CSS gradient version renders instead.
 */
const VERTEX = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`

const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_open;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  // Beam centre drifts a little with slow noise.
  float cx = 0.62 + (noise(vec2(uv.y * 2.0, u_time * 0.08)) - 0.5) * 0.05;
  float dx = (uv.x - cx) * aspect;

  // Width: narrow at the top, flaring toward the base.
  float width = mix(0.05, 0.22, pow(1.0 - uv.y, 1.6)) * (0.8 + 0.2 * u_open);
  float ripple = noise(vec2(dx * 6.0, uv.y * 4.0 - u_time * 0.25));
  float beam = exp(-pow(dx / (width * (0.85 + 0.3 * ripple)), 2.0));
  float core = exp(-pow(dx / (width * 0.18), 2.0));

  // Colour along the height: iris at the top, ember low, white in the core.
  vec3 iris = vec3(0.337, 0.514, 0.855);
  vec3 ember = vec3(1.0, 0.537, 0.392);
  vec3 col = mix(ember, iris, smoothstep(0.08, 0.75, uv.y));
  col = mix(col, vec3(1.0), core * 0.85 * (1.0 - uv.y * 0.6));

  // Fade the top out; keep the base hot.
  float vertical = smoothstep(1.02, 0.35, uv.y);
  float a = beam * vertical * 0.9;

  // Warm radial glow pooling at the base of the beam.
  vec2 base = vec2(cx, -0.02);
  float d = length((uv - base) * vec2(aspect, 1.0));
  float sun = exp(-d * d * 7.0) * (0.55 + 0.08 * sin(u_time * 0.6));
  vec3 sunCol = mix(vec3(1.0, 0.855, 0.624), vec3(1.0, 0.667, 0.506), smoothstep(0.0, 0.35, d));

  vec3 rgb = col * a + sunCol * sun * 0.75;
  float alpha = clamp(a + sun * 0.7, 0.0, 1.0);
  gl_FragColor = vec4(rgb, alpha);
}
`

function CssBeam({ className }: { className: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div
        className="absolute left-[62%] top-0 h-full w-[18%] -translate-x-1/2 blur-2xl"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgb(86 131 218 / 0.6) 25%, #ff8964 72%, #ffffff 100%)',
          clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)',
        }}
      />
      <div
        className="absolute bottom-[-18%] left-[62%] h-[55%] w-[60%] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgb(255 218 159 / 0.55), rgb(255 170 129 / 0.3) 45%, transparent 100%)',
        }}
      />
    </div>
  )
}

export default function AuroraBeam({
  className = '',
  open = 1,
}: {
  className?: string
  /** 0..1 - how far the vault is open; widens the beam. */
  open?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const openRef = useRef(open)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false })
    if (!gl) {
      setFallback(true)
      return
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      return shader
    }
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFallback(true)
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const location = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const uRes = gl.getUniformLocation(program, 'u_res')
    const uTime = gl.getUniformLocation(program, 'u_time')
    const uOpen = gl.getUniformLocation(program, 'u_open')

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio, 1.5)
      const w = Math.max(1, Math.floor(canvas.clientWidth * ratio))
      const h = Math.max(1, Math.floor(canvas.clientHeight * ratio))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    const draw = (ms: number) => {
      resize()
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, ms / 1000)
      gl.uniform1f(uOpen, openRef.current)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let running = !reduced
    const loop = (ms: number) => {
      draw(ms)
      if (running) frame = requestAnimationFrame(loop)
    }

    if (reduced) {
      draw(4000)
    } else {
      frame = requestAnimationFrame(loop)
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (reduced) return
      if (entry.isIntersecting && !running) {
        running = true
        frame = requestAnimationFrame(loop)
      } else if (!entry.isIntersecting) {
        running = false
        cancelAnimationFrame(frame)
      }
    })
    observer.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [])

  if (fallback) return <CssBeam className={`${className} overflow-hidden`} />
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
