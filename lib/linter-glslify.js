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
const Atom = __importStar(require("atom"));
const atom_message_panel_1 = require("atom-message-panel");
const { PlainMessageView } = require("atom-message-panel");
const char1glslRegex = /^(.*(?:\.|_))(v|g|f)(\.glsl)$/;
const char2glslRegex = /^(.*(?:\.|_))(vs|tc|te|gs|fs|cs)(\.glsl)$/;
const char1shRegex = /^(.*\.)(v|g|f)sh$/;
const char2Regex = /^(.*\.)(vs|tc|te|gs|fs|cs)$/;
const defaultRegex = /^(.*\.)(vert|frag|geom|tesc|tese|comp)$/;
const compileRegex = "^([\\w \\-]+): (\\d+):(\\d+): (.*)$";
const shaderTypes = [
    {
        char1: "v",
        char2: "vs",
        char4: "vert",
        name: "vertex"
    },
    {
        char1: "f",
        char2: "fs",
        char4: "frag",
        name: "fragment"
    },
    {
        char1: "g",
        char2: "gs",
        char4: "geom",
        name: "geometry"
    },
    {
        char2: "te",
        char4: "tese",
        name: "tessellation evaluation"
    },
    {
        char2: "tc",
        char4: "tesc",
        name: "tessellation control"
    },
    {
        char2: "cs",
        char4: "comp",
        name: "compute"
    }
];
const isValidSeverity = x => {
    return ["error", "warning", "info"].includes(x);
};
const getSeverity = _str => {
    const str = _str.toLowerCase();
    return isValidSeverity(str) ? str : "warning";
};
const shaderTypeLookup = (fieldName, fieldValue) =>
    shaderTypes.filter(shaderType => shaderType[fieldName] === fieldValue)[0];
const shaderByChar1 = char1 => shaderTypeLookup("char1", char1);
const shaderByChar2 = char2 => shaderTypeLookup("char2", char2);
const shaderByChar4 = char4 => shaderTypeLookup("char4", char4);
const parseGlslValidatorResponse = (shader, output) =>
    new Promise(resolve => {
        const toReturn = [];
        output.split(os.EOL).forEach(line => {
            if (line.endsWith(shader.name)) {
                return;
            }
            const match = new RegExp(compileRegex).exec(line);
            if (match) {
                const lineStart = parseInt(match[3], 10);
                const colStart = parseInt(match[2], 10);
                const lineEnd = lineStart;
                const colEnd = colStart;
                toReturn.push({
                    severity: getSeverity(match[1]),
                    excerpt: match[4].trim(),
                    location: {
                        file: shader.fullFilename,
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
        resolve(toReturn);
    });
const extractShaderFilenameTokens = shaderFilename => {
    const fileName = path.basename(shaderFilename);
    const dirName = path.dirname(shaderFilename);
    let baseFilename;
    let baseShaderType;
    const extChar1GlslMatch = char1glslRegex.exec(fileName);
    const extChar2GlslMatch = char2glslRegex.exec(fileName);
    const extChar2Match = char2Regex.exec(fileName);
    const extChar1ShMatch = char1shRegex.exec(fileName);
    const extDefaultMatch = defaultRegex.exec(fileName);
    if (extChar1GlslMatch) {
        baseFilename = extChar1GlslMatch[1];
        baseShaderType = shaderByChar1(extChar1GlslMatch[2]);
    } else if (extChar2GlslMatch) {
        baseFilename = extChar2GlslMatch[1];
        baseShaderType = shaderByChar2(extChar2GlslMatch[2]);
    } else if (extChar1ShMatch) {
        baseFilename = extChar1ShMatch[1];
        baseShaderType = shaderByChar1(extChar1ShMatch[2]);
    } else if (extChar2Match) {
        baseFilename = extChar2Match[1];
        baseShaderType = shaderByChar2(extChar2Match[2]);
    } else if (extDefaultMatch) {
        baseFilename = extDefaultMatch[1];
        baseShaderType = shaderByChar4(extDefaultMatch[2]);
    } else {
        throw Error("Unknown shader type");
    }
    let outFilename = baseFilename;
    if (!outFilename.endsWith(".")) outFilename += ".";
    outFilename += baseShaderType.char4;
    return {
        baseFilename,
        baseShaderType,
        dirName,
        outFilename,
        fullFilename: shaderFilename
    };
};
const DEFAULT_VALIDATOR_PATH = "glslangValidator";
class Linter {
    constructor() {
        this.config = {
            glslangValidatorPath: {
                type: "string",
                default: DEFAULT_VALIDATOR_PATH,
                order: 1
            }
        };
        this.subscriptions = undefined;
        this.glslangValidatorPath = DEFAULT_VALIDATOR_PATH;
        this.messagePanel = new atom_message_panel_1.MessagePanelView({
            title: "linter-glslify"
        });
        this.onChangeValidatorPath = _validatorPath => {
            let isValid = true;
            let validatorPath = _validatorPath;
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
        require("atom-package-deps").install("linter-glsl");
        this.messagePanel.attach();
        this.subscriptions = new Atom.CompositeDisposable();
        this.subscriptions.add(
            atom.config.observe(
                "linter-glslify.glslangValidatorPath",
                this.onChangeValidatorPath
            )
        );
    }
    deactivate() {
        if (this.subscriptions) {
            this.subscriptions.dispose();
        }
    }
    provideLinter() {
        const helpers = require("atom-linter");
        return {
            name: "glsl",
            grammarScopes: ["source.glsl"],
            scope: "file",
            lintsOnChange: true,
            lint: editor =>
                __awaiter(this, void 0, void 0, function*() {
                    const file = editor.getPath();
                    const content = editor.getText();
                    if (!file) {
                        throw "editor.getPath failed";
                    }
                    const shaderFileTokens = extractShaderFilenameTokens(file);
                    const filesToValidate = [
                        {
                            name: shaderFileTokens.outFilename,
                            fullFilename: file,
                            contents: content
                        }
                    ];
                    try {
                        const output = yield helpers.tempFiles(
                            filesToValidate,
                            files =>
                                helpers.exec(this.glslangValidatorPath, files, {
                                    stream: "stdout",
                                    ignoreExitCode: true
                                })
                        );
                        return yield parseGlslValidatorResponse(
                            filesToValidate[0],
                            output
                        );
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
exports.default = new Linter();
//# sourceMappingURL=linter-glslify.js.map
