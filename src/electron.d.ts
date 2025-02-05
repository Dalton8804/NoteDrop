export {};

declare global {
    interface Window {
      electronAPI: {
            saveUserData: (filePath: string, data: string) => void;
            readUserData: (filePath: string) => Promise<string>;
        };
    }
}