"use babel";

import {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    it,
    fit,
    wait,
    beforeEach,
    afterEach
    /* eslint-enable @typescript-eslint/no-unused-vars */
} from "jasmine-fix";
import path from "path";

const { lint } = require("../lib/linter-glslify").provideLinter();

const runLint = async path => {
    const editor = await atom.workspace.open(path);
    return lint(editor);
};

const test = async fileName => {
    const messages = await runLint(
        path.resolve(__dirname, "fixtures/glslify", fileName)
    );
    return messages;
};

describe("linter-glslify extension", () => {
    beforeEach(async () => {
        await atom.packages.activatePackage("linter-glslify");
    });

    it('finds one errors in "npm.vert"', async () => {
        const m = await test("npm.frag");
        expect(m[0].severity).toEqual("error");
        expect(m[0].excerpt).toEqual("'gl_FragColor1' : undeclared identifier");
        expect(m[1].severity).toEqual("error");
        expect(m[1].excerpt).toEqual("'' : compilation terminated");
    });

    it('finds two errors in "import-entry.frag"', async () => {
        const m = await test("import-entry.frag");
        expect(m[0].severity).toEqual("error");
        expect(m[0].excerpt).toEqual("'gl_FragColor2' : undeclared identifier");
        expect(m[1].severity).toEqual("error");
        expect(m[1].excerpt).toEqual("'' : compilation terminated");
    });

    it('finds two errors in "include-entry.frag"', async () => {
        const m = await test("include-entry.frag");
        expect(m[0].severity).toEqual("error");
        expect(m[0].excerpt).toEqual("'gl_FragColor3' : undeclared identifier");
        expect(m[1].severity).toEqual("error");
        expect(m[1].excerpt).toEqual("'' : compilation terminated");
    });
});
