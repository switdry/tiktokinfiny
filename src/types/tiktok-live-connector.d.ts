declare module 'tiktok-live-connector' {
    export interface WebcastPushConnectionOptions {
        enableExtendedGiftInfo?: boolean;
    }

    export class WebcastPushConnection {
        constructor(username: string, options?: WebcastPushConnectionOptions);
        on(event: string, callback: (data: any) => void): void;
        off(event: string, callback: (data: any) => void): void;
        connect(): Promise<void>;
        disconnect(): Promise<void>;
    }
}

