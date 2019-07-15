import * as sourceMap from "source-map";
interface MapPos {
    line: number;
    column: number;
    name: string | null;
    source: string | null;
}
export declare const getOriginalPos: (
    src: string,
    pos: {
        line: number;
        column: number;
    },
    consumer: sourceMap.SourceMapConsumer
) => MapPos | undefined;
export {};
