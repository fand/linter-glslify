declare module "atom-message-panel" {
    export class MessagePanelView {
        public constructor(opts: { title: string });
        public attach(): void;
        public toggle(): void;
        public clear(): void;
        public add(view: PlainMessageView): void;
        public close(): void;
    }
    export class PlainMessageView {
        public constructor(opts: { message: string; className: string });
    }
}
