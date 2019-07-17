# linter-glslify

TBD

## Requirements

-   [glslangValidator](https://www.khronos.org/opengles/sdk/tools/Reference-Compiler/)
-   [language-glsl](https://atom.io/packages/language-glsl/)
-   [linter](https://atom.io/packages/linter/)

## Installation

TBD

1. Install [glslangValidator](https://www.khronos.org/opengles/sdk/tools/Reference-Compiler/)
2. Install [linter](https://atom.io/packages/linter/), [language-glsl](https://atom.io/packages/language-glsl/) and [linter-glslify](https://atom.io/packages/linter-glslify/), either through 'Install Packages And Themes' or with apm:

    ```sh
    $ apm install linter language-glsl linter-glsl
    ```

3. Configure the path to glslangValidator in preferences.
4. Lint!

## Supported Filename formats

| Vertex     | Fragment   | Geometry   | Tessellation Control | Tessellation Evaluation | Compute    |
| ---------- | ---------- | ---------- | -------------------- | ----------------------- | ---------- |
| `.vert`    | `.frag`    | `.geom`    | `.tesc`              | `.tese`                 | `.comp`    |
| `.vs.glsl` | `.fs.glsl` | `.gs.glsl` | `.tc.glsl`           | `.te.glsl`              | `.cs.glsl` |
| `_vs.glsl` | `_fs.glsl` | `_gs.glsl` | `_tc.glsl`           | `_te.glsl`              | `_cs.glsl` |
| `.vs`      | `.fs`      | `.gs`      | `.tc`                | `.te`                   | `.cs`      |
| `.v.glsl`  | `.f.glsl`  | `.g.glsl`  |                      |                         |            |
| `_v.glsl`  | `_f.glsl`  | `_g.glsl`  |                      |                         |            |
| `.vsh`     | `.fsh`     | `.gsh`     |                      |                         |            |
|            | '.glsl'    |            |                      |                         |            |

## Developing

The glslangValidator tool is in development, and the released Windows and Linux versions appear to be built from a development branch rather than tags. This makes linting its output something of a moving target. This, combined with the fact that there is no official MacOS release has made consistent testing across the three main platforms hard.

## Acknowledgements

-   [linter-glsl](https://github.com/AtomLinter/linter-glsl/) was used as a reference for interacting with the atom-linter package, styling, and how to write specs for Atom.

## license

MIT
