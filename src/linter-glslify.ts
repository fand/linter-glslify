import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import which from "which";
import tempWrite from "temp-write";
import execa from "execa";

import * as Atom from "atom";
import { MessagePanelView } from "atom-message-panel";
import { LinterBody, Message, RangeOrArray, Severity } from "./types";
const { PlainMessageView } = require("atom-message-panel"); // eslint-disable-line

const char1glslRegex = /^(.*(?:\.|_))(v|g|f)(\.glsl)$/;
const char2glslRegex = /^(.*(?:\.|_))(vs|tc|te|gs|fs|cs)(\.glsl)$/;
const char1shRegex = /^(.*\.)(v|g|f)sh$/;
const char2Regex = /^(.*\.)(vs|tc|te|gs|fs|cs)$/;
const defaultRegex = /^(.*\.)(vert|frag|geom|tesc|tese|comp)$/;

const compileRegex = "^([\\w \\-]+): (\\d+):(\\d+): (.*)$";

interface ShaderType {
    char1?: string;
    char2: string;
    char4: string;
    name: string;
}

interface Shader {
    name: string;
    fullFilename?: string;
    contents: string;
    outFilename?: string;
}

interface ShaderTokens {
    baseFilename: string;
    baseShaderType: ShaderType;
    dirName: string;
    outFilename: string;
    fullFilename: string;
}

interface LintResult {
    severity: Severity;
    excerpt: string;
    location: {
        file?: string;
        position: RangeOrArray;
    };
}

const shaderTypes: ShaderType[] = [
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

const isValidSeverity = (x: string): x is Severity => {
    return ["error", "warning", "info"].includes(x);
};
const getSeverity = (_str: string): Severity => {
    const str = _str.toLowerCase();
    return isValidSeverity(str) ? str : "warning";
};

const shaderTypeLookup = (
    fieldName: keyof ShaderType,
    fieldValue: string
): ShaderType =>
    shaderTypes.filter(
        (shaderType): boolean => shaderType[fieldName] === fieldValue
    )[0];

const shaderByChar1 = (char1: string): ShaderType =>
    shaderTypeLookup("char1", char1);
const shaderByChar2 = (char2: string): ShaderType =>
    shaderTypeLookup("char2", char2);
const shaderByChar4 = (char4: string): ShaderType =>
    shaderTypeLookup("char4", char4);

const parseGlslValidatorResponse = (
    shader: Shader,
    output: string
): Promise<LintResult[]> =>
    new Promise((resolve): void => {
        const toReturn: LintResult[] = [];

        output.split(os.EOL).forEach((line: string): void => {
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

const extractShaderFilenameTokens = (shaderFilename: string): ShaderTokens => {
    const fileName = path.basename(shaderFilename);
    const dirName = path.dirname(shaderFilename);

    let baseFilename;
    let baseShaderType: ShaderType;

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
    public config = {
        glslangValidatorPath: {
            type: "string",
            default: DEFAULT_VALIDATOR_PATH,
            order: 1
        }
    };
    private subscriptions?: Atom.CompositeDisposable = undefined;
    private glslangValidatorPath: string = DEFAULT_VALIDATOR_PATH;
    private messagePanel = new MessagePanelView({
        title: "linter-glslify"
    });

    public activate(): void {
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

    public deactivate(): void {
        if (this.subscriptions) {
            this.subscriptions.dispose();
        }
    }

    public provideLinter(): LinterBody {
        return {
            name: "glsl",
            grammarScopes: ["source.glsl"],
            scope: "file",
            lintsOnChange: true,
            lint: async (
                editor: Atom.TextEditor
            ): Promise<Message[] | null> => {
                const file = editor.getPath();
                const content = editor.getText();

                if (!file) {
                    throw "editor.getPath failed"; // TODO: fix
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
                    // Save files to tempfile, then run validator with them
                    const tmpfile = await tempWrite(content);
                    const result = await execa(this.glslangValidatorPath, [
                        tmpfile
                    ]);

                    return await parseGlslValidatorResponse(
                        filesToValidate[0],
                        result.stdout
                    );
                } catch (e) {
                    // Since something went wrong executing, return null so
                    // Linter doesn't update any current results.
                    console.error(e); // eslint-disable-line no-console
                }
                return null;
            }
        };
    }

    private onChangeValidatorPath = (_validatorPath: string): void => {
        let isValid = true;
        let validatorPath = _validatorPath;

        // Check new path
        if (
            fs.existsSync(validatorPath) &&
            fs.statSync(validatorPath).isFile()
        ) {
            try {
                fs.accessSync(validatorPath, fs.constants.X_OK);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.log(error);
                isValid = false;
            }
        } else {
            try {
                validatorPath = which.sync(validatorPath);
            } catch (error) {
                console.log(error); // eslint-disable-line no-console
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

    private showErrorOnMessagePanel(msg: string): void {
        this.messagePanel.clear();
        this.messagePanel.add(
            new PlainMessageView({
                message: msg,
                className: "text-error"
            })
        );
    }

    private hideMessagePanel(): void {
        this.messagePanel.close();
    }
}

export default new Linter();
