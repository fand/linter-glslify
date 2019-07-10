import { Range, Point, TextEditor } from "atom";
interface SolutionReplacable {
    title?: string;
    position: Range;
    priority?: number;
    currentText?: string;
    replaceWith: string;
}
interface SolutionApplyable {
    title?: string;
    position: Range;
    priority?: number;
    apply: () => any;
}
declare type Solution = SolutionReplacable | SolutionApplyable;
export interface Message {
    location: {
        file: string;
        position: Range;
    };
    reference?: {
        file: string;
        position?: Point;
    };
    url?: string;
    icon?: string;
    excerpt: string;
    severity: "error" | "warning" | "info";
    solutions?: Solution[];
    description?: string | (() => Promise<string> | string);
    linterName?: string;
    key: string;
    version: 2;
}
export interface LinterBody {
    name: string;
    grammarScopes: string[];
    scope: "file" | "project";
    lintsOnChange: boolean;
    lint(editor: TextEditor): Message | null | Promise<Message | null>;
}
export {};
