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
    apply: () => any; // eslint-disable-line
}

type Solution = SolutionReplacable | SolutionApplyable;

export interface Message {
    location: {
        file: string;
        position: Range;
    };
    reference?: {
        file: string;
        position?: Point;
    };
    url?: string; // external HTTP link
    icon?: string;
    excerpt: string;
    severity: "error" | "warning" | "info";
    solutions?: Solution[]; // Possible solutions to the error (user can invoke them at will)
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
