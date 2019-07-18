import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import which from "which";
import tempWrite from "temp-write";
import execa from "execa";
import * as glslify from "glslify-lite";
import * as convert from "convert-source-map";
import * as sourceMap from "source-map";
import prebuiltValidator from "glslang-validator-prebuilt";

import * as Atom from "atom";
import { MessagePanelView } from "atom-message-panel";
import { LinterBody, Message, Severity } from "./types";
const { PlainMessageView } = require("atom-message-panel"); // eslint-disable-line

const char1glslRegex = /^(.*)(?:\.|_)(v|g|f)(\.glsl)$/;
const char2glslRegex = /^(.*)(?:\.|_)(vs|tc|te|gs|fs|cs)(\.glsl)$/;
const char1shRegex = /^(.*)\.(v|g|f)sh$/;
const char2Regex = /^(.*)\.(vs|tc|te|gs|fs|cs)$/;
const defaultRegex = /^(.*)\.(vert|frag|geom|tesc|tese|comp|glsl)$/;
const compileRegex = /^([\w -]+): (\d+):(\d+): (.*)$/;

interface LintResult {
    severity: Severity;
    excerpt: string;
    location: {
        file?: string;
        position: [[number, number], [number, number]];
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
    comp: "comp",
    glsl: "frag"
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

interface Pos {
    line: number;
    column: number;
}
interface MapPos extends Pos {
    name: string | null;
    source: string | null;
}

const shiftPos = (p: Pos, shift: number): Pos => ({
    ...p,
    line: p.line + shift,
    column: p.column + shift
});

// Util: get original position
export const getOriginalPos = (
    src: string,
    _pos: Pos, // Position in 0-origin
    consumer: sourceMap.SourceMapConsumer
): Pos | undefined => {
    // Position in 1-origin
    const pos = shiftPos(_pos, 1);

    // Try exact line
    const op = consumer.originalPositionFor(pos);
    if (op.line !== null) {
        return shiftPos(op as MapPos, -1);
    }

    const lines = src.split("\n");
    const line = lines[pos.line - 1]; // pos.line is 1-origin

    // Find nearest mappings
    let pBefore: MapPos | undefined;
    let pAfter: MapPos | undefined;
    for (let i = pos.column - 1; i > 0; i--) {
        const p = consumer.originalPositionFor({
            line: pos.line,
            column: i
        });
        if (p.line !== null) {
            pBefore = p as MapPos;
            break;
        }
    }
    for (let i = pos.column + 1; i <= line.length + 1; i++) {
        const p = consumer.originalPositionFor({
            line: pos.line,
            column: i
        });
        if (p.line !== null) {
            pAfter = p as MapPos;
            break;
        }
    }

    let result: Pos | undefined;
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
    public config = {
        glslangValidatorPath: {
            title: "Custom glslangValidator path (optional)",
            type: "string",
            default: "",
            order: 1
        }
    };

    private glslangValidatorPath: string = prebuiltValidator.path;
    private subscriptions = new Atom.CompositeDisposable();
    private messagePanel = new MessagePanelView({
        title: "linter-glslify"
    });

    public activate(): void {
        require("atom-package-deps").install("linter-glslify");

        this.messagePanel.attach();
        this.subscriptions.add(
            atom.config.observe(
                "linter-glslify.glslangValidatorPath",
                this.onChangeValidatorPath
            )
        );

        // SourceMapConsumer must be initialized before using it
        // because Atom is regarded as a browser environment.
        (sourceMap.SourceMapConsumer as any).initialize({
            "lib/mappings.wasm": path.resolve(__dirname, "../mappings.wasm")
        });
    }

    public deactivate(): void {
        this.subscriptions.dispose();
    }

    public provideLinter(): LinterBody {
        return {
            name: "glslify",
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

                const basedir = path.dirname(filepath);

                try {
                    const compiledContent = await glslify.compile(content, {
                        basedir
                    });

                    // Save files to tempfile, then run validator with them
                    const tmpfile = await tempWrite(
                        compiledContent,
                        shaderName
                    );
                    const result = await execa(this.glslangValidatorPath, [
                        tmpfile
                    ])
                        .then(r => r.stdout)
                        .catch(e => e.message);

                    const messages = parseGlslValidatorResponse(
                        shaderName,
                        filepath,
                        result
                    );

                    // Fix error positions with sourcemaps
                    const sm = convert.fromSource(compiledContent);
                    if (sm) {
                        const consumer = await new sourceMap.SourceMapConsumer(
                            sm.toObject()
                        );

                        for (const m of messages) {
                            let [from, to] = m.location.position;

                            const originalFrom = getOriginalPos(
                                compiledContent,
                                { line: from[0], column: from[1] },
                                consumer
                            );
                            const originalTo = getOriginalPos(
                                compiledContent,
                                { line: to[0], column: 9999 },
                                consumer
                            );

                            if (originalFrom && originalTo) {
                                m.location.position = [
                                    [originalFrom.line, originalFrom.column],
                                    [originalTo.line, originalTo.column]
                                ];
                            }
                        }
                        return messages;
                    }
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

        // Do nothing if the path is empty
        if (!validatorPath) {
            return;
        }

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

module.exports = new Linter();
