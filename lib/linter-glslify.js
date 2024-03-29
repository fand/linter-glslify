"use strict";
var __awaiter =
    (this && this.__awaiter) ||
    function(thisArg, _arguments, P, generator) {
        return new (P || (P = Promise))(function(resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator["throw"](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : new P(function(resolve) {
                          resolve(result.value);
                      }).then(fulfilled, rejected);
            }
            step(
                (generator = generator.apply(thisArg, _arguments || [])).next()
            );
        });
    };
var __importStar =
    (this && this.__importStar) ||
    function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null)
            for (var k in mod)
                if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
        result["default"] = mod;
        return result;
    };
var __importDefault =
    (this && this.__importDefault) ||
    function(mod) {
        return mod && mod.__esModule ? mod : { default: mod };
    };
Object.defineProperty(exports, "__esModule", { value: true });
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const which_1 = __importDefault(require("which"));
const temp_write_1 = __importDefault(require("temp-write"));
const execa_1 = __importDefault(require("execa"));
const glslify = __importStar(require("glslify-lite"));
const convert = __importStar(require("convert-source-map"));
const sourceMap = __importStar(require("source-map"));
const glslang_validator_prebuilt_1 = __importDefault(
    require("glslang-validator-prebuilt")
);
const Atom = __importStar(require("atom"));
const atom_message_panel_1 = require("atom-message-panel");
const { PlainMessageView } = require("atom-message-panel");
const char1glslRegex = /^(.*)(?:\.|_)(v|g|f)(\.glsl)$/;
const char2glslRegex = /^(.*)(?:\.|_)(vs|tc|te|gs|fs|cs)(\.glsl)$/;
const char1shRegex = /^(.*)\.(v|g|f)sh$/;
const char2Regex = /^(.*)\.(vs|tc|te|gs|fs|cs)$/;
const defaultRegex = /^(.*)\.(vert|frag|geom|tesc|tese|comp|glsl)$/;
const compileRegex = /^([\w -]+): (\d+):(\d+): (.*)$/;
const formatExt = {
    v: "vert",
    vs: "vert",
    vert: "vert",
    f: "frag",
    fs: "frag",
    frag: "frag",
    g: "geom",
    gs: "geom",
    geom: "geom",
    te: "tese",
    tese: "tese",
    tc: "tesc",
    tesc: "tesc",
    cs: "comp",
    comp: "comp",
    glsl: "frag"
};
const isValidSeverity = x => {
    return ["error", "warning", "info"].includes(x);
};
const getSeverity = _str => {
    const str = _str.toLowerCase();
    return isValidSeverity(str) ? str : "warning";
};
const parseGlslValidatorResponse = (shaderName, fullFileName, output) => {
    const toReturn = [];
    output.split(os.EOL).forEach(line => {
        if (line.endsWith(shaderName)) {
            return;
        }
        const match = compileRegex.exec(line);
        if (match) {
            const lineStart = parseInt(match[3], 10);
            const colStart = parseInt(match[2], 10);
            const lineEnd = lineStart;
            const colEnd = colStart;
            toReturn.push({
                severity: getSeverity(match[1]),
                excerpt: match[4].trim(),
                location: {
                    file: fullFileName,
                    position: [
                        [
                            lineStart > 0 ? lineStart - 1 : 0,
                            colStart > 0 ? colStart - 1 : 0
                        ],
                        [
                            lineEnd > 0 ? lineEnd - 1 : 0,
                            colEnd > 0 ? colEnd - 1 : 0
                        ]
                    ]
                }
            });
        }
    });
    return toReturn;
};
const getShaderName = shaderFilename => {
    const basename = path.basename(shaderFilename);
    const m =
        char1glslRegex.exec(basename) ||
        char2glslRegex.exec(basename) ||
        char2Regex.exec(basename) ||
        char1shRegex.exec(basename) ||
        defaultRegex.exec(basename);
    if (!m) {
        throw Error("Unknown shader type");
    }
    const name = m[1];
    const ext = formatExt[m[2]];
    return `${name}.${ext}`;
};
const shiftPos = (p, shift) =>
    Object.assign({}, p, { line: p.line + shift, column: p.column + shift });
exports.getOriginalPos = (src, _pos, consumer) => {
    const pos = shiftPos(_pos, 1);
    const op = consumer.originalPositionFor(pos);
    if (op.line !== null) {
        return shiftPos(op, -1);
    }
    const lines = src.split("\n");
    const line = lines[pos.line - 1];
    let pBefore;
    let pAfter;
    for (let i = pos.column - 1; i > 0; i--) {
        const p = consumer.originalPositionFor({
            line: pos.line,
            column: i
        });
        if (p.line !== null) {
            pBefore = p;
            break;
        }
    }
    for (let i = pos.column + 1; i <= line.length + 1; i++) {
        const p = consumer.originalPositionFor({
            line: pos.line,
            column: i
        });
        if (p.line !== null) {
            pAfter = p;
            break;
        }
    }
    let result;
    if (pBefore && pAfter) {
        result =
            pos.column - pBefore.column < pAfter.column - pos.column
                ? pBefore
                : pAfter;
    } else if (pBefore || pAfter) {
        result = pBefore || pAfter;
    }
    return result ? shiftPos(result, -1) : undefined;
};
class Linter {
    constructor() {
        this.config = {
            glslangValidatorPath: {
                title: "Custom glslangValidator path (optional)",
                type: "string",
                default: "",
                order: 1
            }
        };
        this.glslangValidatorPath = glslang_validator_prebuilt_1.default.path;
        this.subscriptions = new Atom.CompositeDisposable();
        this.messagePanel = new atom_message_panel_1.MessagePanelView({
            title: "linter-glslify"
        });
        this.onChangeValidatorPath = _validatorPath => {
            let isValid = true;
            let validatorPath = _validatorPath;
            if (!validatorPath) {
                return;
            }
            if (
                fs.existsSync(validatorPath) &&
                fs.statSync(validatorPath).isFile()
            ) {
                try {
                    fs.accessSync(validatorPath, fs.constants.X_OK);
                } catch (error) {
                    console.log(error);
                    isValid = false;
                }
            } else {
                try {
                    validatorPath = which_1.default.sync(validatorPath);
                } catch (error) {
                    console.log(error);
                    isValid = false;
                }
            }
            if (isValid) {
                this.glslangValidatorPath = validatorPath;
                this.hideMessagePanel();
            } else {
                this.showErrorOnMessagePanel(
                    `Unable to locate glslangValidator at '${validatorPath}'`
                );
            }
        };
    }
    activate() {
        require("atom-package-deps").install("linter-glslify");
        this.messagePanel.attach();
        this.subscriptions.add(
            atom.config.observe(
                "linter-glslify.glslangValidatorPath",
                this.onChangeValidatorPath
            )
        );
        sourceMap.SourceMapConsumer.initialize({
            "lib/mappings.wasm": path.resolve(__dirname, "../mappings.wasm")
        });
    }
    deactivate() {
        this.subscriptions.dispose();
    }
    provideLinter() {
        return {
            name: "glslify",
            grammarScopes: ["source.glsl"],
            scope: "file",
            lintsOnChange: true,
            lint: editor =>
                __awaiter(this, void 0, void 0, function*() {
                    const filepath = editor.getPath();
                    const content = editor.getText();
                    if (!filepath) {
                        throw "editor.getPath failed";
                    }
                    const shaderName = getShaderName(filepath);
                    const basedir = path.dirname(filepath);
                    try {
                        const compiledContent = yield glslify.compile(content, {
                            basedir
                        });
                        const tmpfile = yield temp_write_1.default(
                            compiledContent,
                            shaderName
                        );
                        const result = yield execa_1
                            .default(this.glslangValidatorPath, [tmpfile])
                            .then(r => r.stdout)
                            .catch(e => e.message);
                        const messages = parseGlslValidatorResponse(
                            shaderName,
                            filepath,
                            result
                        );
                        const sm = convert.fromSource(compiledContent);
                        if (sm) {
                            const consumer = yield new sourceMap.SourceMapConsumer(
                                sm.toObject()
                            );
                            for (const m of messages) {
                                let [from, to] = m.location.position;
                                const originalFrom = exports.getOriginalPos(
                                    compiledContent,
                                    { line: from[0], column: from[1] },
                                    consumer
                                );
                                const originalTo = exports.getOriginalPos(
                                    compiledContent,
                                    { line: to[0], column: 9999 },
                                    consumer
                                );
                                if (originalFrom && originalTo) {
                                    m.location.position = [
                                        [
                                            originalFrom.line,
                                            originalFrom.column
                                        ],
                                        [originalTo.line, originalTo.column]
                                    ];
                                }
                            }
                            return messages;
                        }
                    } catch (e) {
                        console.error(e);
                    }
                    return null;
                })
        };
    }
    showErrorOnMessagePanel(msg) {
        this.messagePanel.clear();
        this.messagePanel.add(
            new PlainMessageView({
                message: msg,
                className: "text-error"
            })
        );
    }
    hideMessagePanel() {
        this.messagePanel.close();
    }
}
module.exports = new Linter();
//# sourceMappingURL=linter-glslify.js.map
