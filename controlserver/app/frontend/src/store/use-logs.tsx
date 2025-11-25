import { toast } from 'sonner';
import { create } from 'zustand';
import { LOGS_TAIL_PATH, LOGS_TRUNCATE_PATH } from '../ui/urls';

const MAX_LOGS = 10000; // Prevent unbounded memory growth

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

        addLog: (log: string) => set((state) => {
            const newLogs = [...state.logs, log];
            // Keep only the most recent MAX_LOGS entries
            if (newLogs.length > MAX_LOGS) {
                return { logs: newLogs.slice(-MAX_LOGS) };
            }
            return { logs: newLogs };
        }),

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
                set((state) => {
                    const newLogs = [...state.logs, (event as MessageEvent).data];
                    // Keep only the most recent MAX_LOGS entries
                    if (newLogs.length > MAX_LOGS) {
                        return { logs: newLogs.slice(-MAX_LOGS) };
                    }
                    return { logs: newLogs };
                });
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