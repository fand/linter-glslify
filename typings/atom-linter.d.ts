// import { TextEditor } from 'atom';

interface ExecOptions {
    stream: string;
    ignoreExitCode: boolean;
}

// ref. https://www.npmjs.com/package/atom-linter
declare module "atom-linter" {
    export function exec(
        command: string,
        args: string[],
        options: ExecOptions
    ): Promise<void>;
    export function tempFiles<T>(
        filesNames: { name: string; contents: string }[],
        callback: (result: T) => void
    ): Promise<T>;
}
