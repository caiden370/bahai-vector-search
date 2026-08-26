/**
 * Minimal WebGL point renderer for the constellation map.
 *
 * Deliberately dependency free: the whole corpus is ~52k stars drawn in a
 * single gl.POINTS call from one static buffer, which is what keeps this
 * smooth on a phone. Highlighted results and the query marker are drawn as
 * small extra passes so they always land on top.
 */

const VERTEX_SHADER = `
  attribute vec2 a_pos;
  attribute vec3 a_color;

  uniform vec2 u_center;
  uniform float u_scale;
  uniform vec2 u_viewport;
  uniform float u_size;

  varying vec3 v_color;

  void main() {
    vec2 offset = (a_pos - u_center) * u_scale;
    gl_Position = vec4(offset / (u_viewport * 0.5), 0.0, 1.0);
    gl_PointSize = u_size;
    v_color = a_color;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying vec3 v_color;

  uniform float u_alpha;
  uniform float u_glow;

  void main() {
    // Round off the square point sprite, with a soft edge so stars don't
    // alias into hard pixels when zoomed out.
    float r = length(gl_PointCoord - vec2(0.5));
    float core = smoothstep(0.5, 0.15, r);
    float halo = smoothstep(0.5, 0.0, r) * u_glow;
    float alpha = clamp(core + halo, 0.0, 1.0) * u_alpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(v_color, alpha);
  }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

export function createRenderer(canvas) {
  const options = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  };

  const gl =
    canvas.getContext('webgl', options) ||
    canvas.getContext('experimental-webgl', options);
  if (!gl) return null;

  const program = createProgram(gl);
  gl.useProgram(program);

  const attribs = {
    pos: gl.getAttribLocation(program, 'a_pos'),
    color: gl.getAttribLocation(program, 'a_color'),
  };
  const uniforms = {
    center: gl.getUniformLocation(program, 'u_center'),
    scale: gl.getUniformLocation(program, 'u_scale'),
    viewport: gl.getUniformLocation(program, 'u_viewport'),
    size: gl.getUniformLocation(program, 'u_size'),
    alpha: gl.getUniformLocation(program, 'u_alpha'),
    glow: gl.getUniformLocation(program, 'u_glow'),
  };

  const buffers = {
    basePos: gl.createBuffer(),
    baseColor: gl.createBuffer(),
    markPos: gl.createBuffer(),
    markColor: gl.createBuffer(),
  };

  let baseCount = 0;

  gl.enable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);

  function uploadBase(positions, colors) {
    baseCount = positions.length / 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.basePos);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.baseColor);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  }

  function bind(posBuffer, colorBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.enableVertexAttribArray(attribs.pos);
    gl.vertexAttribPointer(attribs.pos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(attribs.color);
    gl.vertexAttribPointer(attribs.color, 3, gl.UNSIGNED_BYTE, true, 0, 0);
  }

  /**
   * camera : { center: [x, y], scale, width, height, dpr }
   * style  : { baseSize, baseAlpha }
   * layers : array of { positions, colors, size, alpha, glow } drawn
   *          additively on top, in order
   */
  function draw(camera, style, layers) {
    const { width, height, dpr } = camera;

    const targetWidth = Math.max(1, Math.round(width * dpr));
    const targetHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    gl.viewport(0, 0, targetWidth, targetHeight);

    gl.clearColor(0.043, 0.055, 0.106, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.uniform2f(uniforms.center, camera.center[0], camera.center[1]);
    gl.uniform1f(uniforms.scale, camera.scale);
    gl.uniform2f(uniforms.viewport, width, height);

    // Ordinary stars: source-over, so dense regions read as a soft nebula
    // rather than blowing out to white.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(uniforms.size, style.baseSize * dpr);
    gl.uniform1f(uniforms.alpha, style.baseAlpha);
    gl.uniform1f(uniforms.glow, 0.0);
    bind(buffers.basePos, buffers.baseColor);
    gl.drawArrays(gl.POINTS, 0, baseCount);

    if (!layers) return;

    // Highlights glow additively so they stay legible over a bright field.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    layers.forEach((layer) => {
      if (!layer || layer.positions.length === 0) return;

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.markPos);
      gl.bufferData(gl.ARRAY_BUFFER, layer.positions, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.markColor);
      gl.bufferData(gl.ARRAY_BUFFER, layer.colors, gl.DYNAMIC_DRAW);

      gl.uniform1f(uniforms.size, layer.size * dpr);
      gl.uniform1f(uniforms.alpha, layer.alpha);
      gl.uniform1f(uniforms.glow, layer.glow);
      bind(buffers.markPos, buffers.markColor);
      gl.drawArrays(gl.POINTS, 0, layer.positions.length / 2);
    });
  }

  function dispose() {
    Object.keys(buffers).forEach((key) => gl.deleteBuffer(buffers[key]));
    gl.deleteProgram(program);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }

  return { uploadBase, draw, dispose };
}
