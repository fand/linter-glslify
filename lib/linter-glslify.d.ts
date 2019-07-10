import { LinterBody } from "./types";
declare class Linter {
    config: {
        glslangValidatorPath: {
            type: string;
            default: string;
            order: number;
        };
    };
    private subscriptions?;
    private glslangValidatorPath;
    private messagePanel;
    activate(): void;
    deactivate(): void;
    provideLinter(): LinterBody;
    private onChangeValidatorPath;
    private showErrorOnMessagePanel;
    private hideMessagePanel;
}
declare const _default: Linter;
export default _default;
