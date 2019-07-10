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
    private glslangValidatorPath?;
    private messages?;
    activate(): void;
    deactivate(): void;
    provideLinter(): LinterBody;
}
declare const _default: Linter;
export default _default;
