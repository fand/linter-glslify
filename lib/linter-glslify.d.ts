import { LinterBody } from "./types";
declare const _default: {
    config: {
        glslangValidatorPath: {
            type: string;
            default: string;
            order: number;
        };
    };
    activate(): void;
    deactivate(): void;
    provideLinter(): LinterBody;
};
export default _default;
