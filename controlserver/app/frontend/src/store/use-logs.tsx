import { toast } from 'sonner';
import { create } from 'zustand';
import { LOGS_TAIL_PATH, LOGS_TRUNCATE_PATH } from '../ui/urls';

interface LogState {
    logs: string[];
    isConnected: boolean;
}

interface LogActions {
    addLog: (log: string) => void;
    clearLogs: () => void;
    truncateLogs: () => void;
    startListening: () => void;
    stopListening: () => void;
}

export const useLogs = create<LogState & LogActions>((set) => {
    let eventSource: EventSource | null = null;

    return {
        logs: [],

        isConnected: false,

        addLog: (log: string) => set((state) => ({
            logs: [...state.logs, log]
        })),

        clearLogs: () => set({ logs: [] }),

        truncateLogs: async () => {
            try {
                await fetch(LOGS_TRUNCATE_PATH, { method: 'POST' });
                toast.success('Logs wiped successfully.');
            } catch (e) {
                toast.error('Failed to truncate logs.');
                return;
            }

            return set({ logs: [] });
        },

        startListening: () => {
            if (eventSource) {
                return;
            }

            eventSource = new EventSource(LOGS_TAIL_PATH);
            set((state) => ({ ...state, isConnected: true }));

            eventSource.addEventListener('log', (event) => {
                set((state) => ({
                    logs: [...state.logs, (event as MessageEvent).data]
                }))
            });
            eventSource.addEventListener('error', () => {
                set((state) => ({
                    logs: [...state.logs, `Error: Connection to ${LOGS_TAIL_PATH} failed.`],
                    isConnected: false
                }));
                eventSource?.close();
                eventSource = null;
            });
        },

        stopListening: () => {
            if (!eventSource) {
                return;
            }

            eventSource.close();
            eventSource = null;
            set((state) => ({ ...state, isConnected: false }));
        }
    }
})