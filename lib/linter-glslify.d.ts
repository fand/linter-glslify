import * as sourceMap from "source-map";
interface Pos {
    line: number;
    column: number;
}
export declare const getOriginalPos: (
    src: string,
    _pos: Pos,
    consumer: sourceMap.SourceMapConsumer
) => Pos | undefined;
export {};
