precision mediump float;
#pragma glslify: noise = require("glsl-noise/simplex/3d")
varying vec3 vpos;
void main () {
  gl_FragColor1 = vec4(noise(vpos*25.0),1);
}
