import { TextEditor } from 'atom';
declare const _default: {
    config: {
        glslangValidatorPath: {
            type: string;
            default: string;
            order: number;
        };
        linkSimilarShaders: {
            type: string;
            default: boolean;
            order: number;
        };
    };
    activate(): void;
    deactivate(): void;
    provideLinter(): {
        name: string;
        grammarScopes: string[];
        scope: string;
        lintsOnChange: boolean;
        lint: (editor: TextEditor) => any;
    };
};
export default _default;
