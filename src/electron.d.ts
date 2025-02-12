export {};

declare global {
    interface Window {
      data: {
            save: (key: string, value: string) => void;
            get: (key: string) => Promise<string>;
            getAll: () => Promise<string>;
            delete: (key: string) => void;
        };
    }
}
