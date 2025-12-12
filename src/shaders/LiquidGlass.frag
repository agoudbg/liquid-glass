precision mediump float;

varying vec2 vUv;

uniform sampler2D u_background;
uniform vec2 u_scroll_offset;
uniform float u_time;

void main() {
  vec2 uv = vUv;
  
  // Apply scroll offset
  // uv += u_scroll_offset;
  
  // Simple pass-through for now
  gl_FragColor = texture2D(u_background, uv);
}
