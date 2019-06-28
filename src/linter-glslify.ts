import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import which from 'which';

import { TextEditor, CompositeDisposable } from 'atom';
const { MessagePanelView } = require('atom-message-panel');

const VALID_SEVERITY = new Set(['error', 'warning', 'info']);
const char1glslRegex = /^(.*(?:\.|_))(v|g|f)(\.glsl)$/;
const char2glslRegex = /^(.*(?:\.|_))(vs|tc|te|gs|fs|cs)(\.glsl)$/;
const char1shRegex = /^(.*\.)(v|g|f)sh$/;
const char2Regex = /^(.*\.)(vs|tc|te|gs|fs|cs)$/;
const defaultRegex = /^(.*\.)(vert|frag|geom|tesc|tese|comp)$/;

const compileRegex = '^([\\w \\-]+): (\\d+):(\\d+): (.*)$';
const linkRegex = '^([\\w \\-]+): Linking {{typeName}} stage: (.*)$';

type ShaderType = {
    char1?: string;
    char2: string;
    char4: string;
    name: string;
};

type Shader = {
  type: ShaderType;
  name: string;
  fullFilename?: string;
  contents: string;
}

type Range = [[number, number], [number, number]];
type LintResult = {
  severity: string;
  excerpt: string;
  location: {
    file?: string;
    position: Range;
  },
}

const shaderTypes: ShaderType[] = [{
  char1: 'v',
  char2: 'vs',
  char4: 'vert',
  name: 'vertex',
}, {
  char1: 'f',
  char2: 'fs',
  char4: 'frag',
  name: 'fragment',
}, {
  char1: 'g',
  char2: 'gs',
  char4: 'geom',
  name: 'geometry',
}, {
  char2: 'te',
  char4: 'tese',
  name: 'tessellation evaluation',
}, {
  char2: 'tc',
  char4: 'tesc',
  name: 'tessellation control',
}, {
  char2: 'cs',
  char4: 'comp',
  name: 'compute',
}];

const getSeverity = (givenSeverity: string): string => {
  const severity = givenSeverity.toLowerCase();
  return VALID_SEVERITY.has(severity) ? severity : 'warning';
};

const shaderTypeLookup = (fieldName: keyof ShaderType, fieldValue: string): ShaderType => (
  shaderTypes.filter(shaderType => shaderType[fieldName] === fieldValue)[0]
);

const shaderByChar1 = (char1: string): ShaderType => shaderTypeLookup('char1', char1);
const shaderByChar2 = (char2: string): ShaderType => shaderTypeLookup('char2', char2);
const shaderByChar4 = (char4: string): ShaderType => shaderTypeLookup('char4', char4);

const parseGlslValidatorResponse = (inputs: Shader[], output: string, firstRowRange: Range) => new Promise((resolve) => {
  const toReturn: LintResult[] = [];

  inputs.forEach((shader) => {
    let compileStarted = false;
    const typeName = shader.type.name;

    output.split(os.EOL).forEach((line: string) => {
      if (line.endsWith(shader.name)) {
        compileStarted = true;
      } else if (compileStarted || inputs.length === 1) {
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
                [lineStart > 0 ? lineStart - 1 : 0, colStart > 0 ? colStart - 1 : 0],
                [lineEnd > 0 ? lineEnd - 1 : 0, colEnd > 0 ? colEnd - 1 : 0],
              ],
            },
          });
        } else {
          compileStarted = false;
        }
      }

      const linkMatch = new RegExp(linkRegex.replace('{{typeName}}', typeName)).exec(line);
      if (linkMatch) {
        toReturn.push({
          severity: getSeverity(linkMatch[1]),
          excerpt: linkMatch[2].trim(),
          location: {
            file: shader.fullFilename,
            position: firstRowRange,
          },
        });
      }
    });
  });
  resolve(toReturn);
});

const extractShaderFilenameTokens = (shaderFilename: string) => {
  const fileName = path.basename(shaderFilename);
  const dirName = path.dirname(shaderFilename);

  let baseFilename;
  let baseShaderType: ShaderType;
  let baseExtension;

  let linkTargetPattern;
  let linkTargets;

  const extChar1GlslMatch = char1glslRegex.exec(fileName);
  const extChar2GlslMatch = char2glslRegex.exec(fileName);
  const extChar2Match = char2Regex.exec(fileName);
  const extChar1ShMatch = char1shRegex.exec(fileName);
  const extDefaultMatch = defaultRegex.exec(fileName);

  if (extChar1GlslMatch) {
    baseFilename = extChar1GlslMatch[1];
    baseShaderType = shaderByChar1(extChar1GlslMatch[2]);
    baseExtension = extChar1GlslMatch[3];

    linkTargets = shaderTypes.filter(shaderType => shaderType !== baseShaderType);
    linkTargetPattern = `${baseFilename}{{char1}}${baseExtension}`;
  } else if (extChar2GlslMatch) {
    baseFilename = extChar2GlslMatch[1];
    baseShaderType = shaderByChar2(extChar2GlslMatch[2]);
    baseExtension = extChar2GlslMatch[3];

    linkTargets = shaderTypes.filter(shaderType => shaderType !== baseShaderType);
    linkTargetPattern = `${baseFilename}{{char2}}${baseExtension}`;
  } else if (extChar1ShMatch) {
    baseFilename = extChar1ShMatch[1];
    baseShaderType = shaderByChar1(extChar1ShMatch[2]);
    baseExtension = extChar1ShMatch[3];

    linkTargets = shaderTypes.filter(shaderType => shaderType !== baseShaderType);
    linkTargetPattern = `${baseFilename}{{char1}}${baseExtension}`;
  } else if (extChar2Match) {
    baseFilename = extChar2Match[1];
    baseShaderType = shaderByChar2(extChar2Match[2]);
    baseExtension = extChar2Match[3];

    linkTargets = shaderTypes.filter(shaderType => shaderType !== baseShaderType);
    linkTargetPattern = `${baseFilename}{{char2}}${baseExtension}`;
  } else if (extDefaultMatch) {
    baseFilename = extDefaultMatch[1];
    baseShaderType = shaderByChar4(extDefaultMatch[2]);
    baseExtension = extDefaultMatch[2];

    linkTargets = shaderTypes.filter(shaderType => shaderType !== baseShaderType);
    linkTargetPattern = `${baseFilename}{{char4}}`;
  } else {
    throw Error('Unknown shader type');
  }

  let outFilename = baseFilename;
  if (!outFilename.endsWith('.')) outFilename += '.';

  outFilename += baseShaderType.char4;

  return {
    linkTargets,
    linkTargetPattern,
    baseFilename,
    baseShaderType,
    dirName,
    outFilename,
    fullFilename: shaderFilename,
  };
};

// Internal states
type State = {
  subscriptions?: CompositeDisposable;
  linkSimilarShaders: boolean;
  glslangValidatorPath?: string;
  messages?: any;
}
const state: State = {
  linkSimilarShaders: false,
};

export default {
  config: {
    glslangValidatorPath: {
      type: 'string',
      default: 'glslangValidator',
      order: 1,
    },
    linkSimilarShaders: {
      type: 'boolean',
      default: false,
      order: 2,
    },
  },

  activate() {
    require('atom-package-deps').install('linter-glsl');

    // eslint-disable-next-line import/no-extraneous-dependencies
    const { PlainMessageView } = require('atom-message-panel');

    state.subscriptions = new CompositeDisposable();

    state.subscriptions.add(
      atom.config.observe('linter-glsl.linkSimilarShaders', (linkSimilarShaders) => {
        state.linkSimilarShaders = linkSimilarShaders;
      }),
      atom.config.observe('linter-glsl.glslangValidatorPath', (glslangValidatorPath) => {
        glslangValidatorPath = module.exports.config.glslangValidatorPath.default;
        if (fs.existsSync(glslangValidatorPath) && fs.statSync(glslangValidatorPath).isFile()) {
          try {
            fs.accessSync(glslangValidatorPath, fs.constants.X_OK);
            state.glslangValidatorPath = glslangValidatorPath;
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log(error);
          }
        } else {
          try {
            state.glslangValidatorPath = which.sync(glslangValidatorPath);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log(error);
          }
        }

        if (state.glslangValidatorPath) {
          if (state.messages) {
            state.messages.close();
            state.messages = undefined;
          }
        } else {
          if (!state.messages) {
            state.messages = new MessagePanelView({
              title: 'linter-glslify',
            });
            state.messages.attach();
            state.messages.toggle();
          }
          state.messages.clear();
          state.messages.add(new PlainMessageView({
            message: `Unable to locate glslangValidator at '${glslangValidatorPath}'`,
            className: 'text-error',
          }));
        }
      }),
    );
  },

  deactivate() {
    if (state.subscriptions) {
      state.subscriptions.dispose();
    }
  },

  provideLinter() {
    const helpers = require('atom-linter');

    return {
      name: 'glsl',
      grammarScopes: ['source.glsl'],
      scope: 'file',
      lintsOnChange: true,
      lint: (editor: TextEditor) => {
        const file = editor.getPath();
        const content = editor.getText();
        let command = state.glslangValidatorPath;

        if (state.glslangValidatorPath === undefined) {
          command = module.exports.config.glslangValidatorPath.default;
        }

        const shaderFileTokens = extractShaderFilenameTokens(file!);

        let filesToValidate = [{
          name: shaderFileTokens.outFilename,
          fullFilename: file,
          type: shaderFileTokens.baseShaderType,
          contents: content,
        }];
        let args: string[] = [];

        if (state.linkSimilarShaders) {
          filesToValidate = filesToValidate.concat(shaderFileTokens.linkTargets
            .map(target => shaderFileTokens.linkTargetPattern
              .replace('{{char1}}', target.char1!)
              .replace('{{char2}}', target.char2)
              .replace('{{char4}}', target.char4))
            .map(shader => path.join(shaderFileTokens.dirName, shader))
            .filter(fs.existsSync)
            .map(extractShaderFilenameTokens)
            .map(shader => ({
              name: shader.outFilename,
              fullFilename: shader.fullFilename,
              type: shader.baseShaderType,
              contents: fs.readFileSync(shader.fullFilename, 'UTF-8'),
            })));

          if (filesToValidate.length > 1) {
            args = ['-l'];
          }
        }
        return helpers.tempFiles(
          filesToValidate,
          (files: string[]) => helpers.exec(command, args.concat(files), {
            stream: 'stdout',
            ignoreExitCode: true,
          }),
        )
          .then((output: string) => (
            parseGlslValidatorResponse(filesToValidate, output, helpers.generateRange(editor, 0))
          ))
          .catch((error: Error) => {
            // eslint-disable-next-line no-console
            console.error(error);
            // Since something went wrong executing, return null so
            // Linter doesn't update any current results
            return null;
          });
      },
    };
  },
};
