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

const char1glslRegex = /^(.*)(?:\.|_)(v|g|f)(\.glsl)$/;
const char2glslRegex = /^(.*)(?:\.|_)(vs|tc|te|gs|fs|cs)(\.glsl)$/;
const char1shRegex = /^(.*)\.(v|g|f)sh$/;
const char2Regex = /^(.*)\.(vs|tc|te|gs|fs|cs)$/;
const defaultRegex = /^(.*)\.(vert|frag|geom|tesc|tese|comp)$/;
const compileRegex = /^([\\w \\-]+): (\\d+):(\\d+): (.*)$/;

interface LintResult {
    severity: Severity;
    excerpt: string;
    location: {
        file?: string;
        position: RangeOrArray;
    };
}

const formatExt: { [ext: string]: string } = {
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
    comp: "comp"
};

const isValidSeverity = (x: string): x is Severity => {
    return ["error", "warning", "info"].includes(x);
};
const getSeverity = (_str: string): Severity => {
    const str = _str.toLowerCase();
    return isValidSeverity(str) ? str : "warning";
};

const parseGlslValidatorResponse = (
    shaderName: string,
    fullFileName: string,
    output: string
): LintResult[] => {
    const toReturn: LintResult[] = [];

    output.split(os.EOL).forEach((line: string): void => {
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

const getShaderName = (shaderFilename: string): string => {
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

const DEFAULT_VALIDATOR_PATH = "glslangValidator";

class Linter {
    public config = {
        glslangValidatorPath: {
            type: "string",
            default: DEFAULT_VALIDATOR_PATH,
            order: 1
        }
    };

    private glslangValidatorPath: string = DEFAULT_VALIDATOR_PATH;
    private subscriptions = new Atom.CompositeDisposable();
    private messagePanel = new MessagePanelView({
        title: "linter-glslify"
    });

    public activate(): void {
        require("atom-package-deps").install("linter-glsl");

        this.messagePanel.attach();
        this.subscriptions.add(
            atom.config.observe(
                "linter-glslify.glslangValidatorPath",
                this.onChangeValidatorPath
            )
        );
    }

    public deactivate(): void {
        this.subscriptions.dispose();
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
                const filepath = editor.getPath();
                const content = editor.getText();

                if (!filepath) {
                    throw "editor.getPath failed"; // TODO: fix
                }
                const shaderName = getShaderName(filepath);

                try {
                    // Save files to tempfile, then run validator with them
                    const tmpfile = await tempWrite(content);
                    const result = await execa(this.glslangValidatorPath, [
                        tmpfile
                    ]);

                    return parseGlslValidatorResponse(
                        shaderName,
                        filepath,
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
