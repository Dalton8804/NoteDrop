import type { IntegrationsConfig, TestResult } from './integrations/types';

export {};

declare global {
    interface Window {
      data: {
            save: (key: string, value: string) => void;
            get: (key: string) => Promise<string>;
            getAll: () => Promise<string>;
            delete: (key: string) => void;
            /** Fires when the window is shown, after vault reconciliation. */
            onRefresh: (callback: () => void) => void;
        };
      integrations: {
            getConfig: () => Promise<IntegrationsConfig>;
            setConfig: (patch: Partial<IntegrationsConfig>) => Promise<IntegrationsConfig>;
            test: (id: string) => Promise<TestResult>;
            /** Native folder picker. Resolves to null if cancelled. */
            pickVault: () => Promise<string | null>;
        };
    }
}
