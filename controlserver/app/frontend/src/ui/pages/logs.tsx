import { useLogs } from "@/store/use-logs";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { LOGS_DOWNLOAD_PATH } from "../urls";
import { ArrowUp, ArrowDown, Download, Eraser, Trash2, Search, X } from "lucide-react";

// Constants
const SCROLL_THRESHOLD = 50;
const AUTO_SCROLL_DELAY = 100;
const SCROLL_DEBOUNCE_DELAY = 150;
const MANUAL_SCROLL_LOCK_DURATION = 1000;

type ScrollMode = "follow" | "paused";

type LogLevel = "TRC" | "DBG" | "INF" | "WRN" | "ERR" | "FTL" | "PNC";

interface ParsedLog {
    timestamp: string | null;
    level: LogLevel | null;
    message: string;
}

// Helper functions
const parseLogLine = (log: string): ParsedLog => {
    // Parse zerolog format: "TIME LEVEL message"
    // Example: "2025-11-25T09:58:59Z DBG hello world"
    const match = log.match(/^(.+?)\s+(TRC|DBG|INF|WRN|ERR|FTL|PNC)\s+(.*)/);

    if (match) {
        const [, timestamp, level, message] = match;
        return { timestamp, level: level as LogLevel, message };
    }

    // If no match, return the whole log as message
    return { timestamp: null, level: null, message: log };
};

const getLevelColor = (level: LogLevel | null): string => {
    if (!level) return "text-gray-400";

    const colorMap: Record<LogLevel, string> = {
        TRC: "text-gray-500",    // Trace
        DBG: "text-blue-400",    // Debug
        INF: "text-green-400",   // Info
        WRN: "text-yellow-400",  // Warning
        ERR: "text-red-400",     // Error
        FTL: "text-red-600",     // Fatal
        PNC: "text-red-600",     // Panic
    };

    return colorMap[level] || "text-gray-400";
};

export default function Logs() {
    const { logs, isConnected, clearLogs, truncateLogs } = useLogs();
    const logsEndRef = useRef<HTMLDivElement>(null);
    const logsContainerRef = useRef<HTMLDivElement>(null);
    const [scrollMode, setScrollMode] = useState<ScrollMode>("follow");
    const scrollModeRef = useRef<ScrollMode>("follow");
    const isAutoScrollingRef = useRef(false);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeSearch, setActiveSearch] = useState("");

    // Update ref when state changes
    useEffect(() => {
        scrollModeRef.current = scrollMode;
    }, [scrollMode]);

    // Cleanup scroll timeout on unmount
    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);

    // Auto-scroll to bottom when in follow mode
    useEffect(() => {
        if (scrollModeRef.current === "follow") {
            isAutoScrollingRef.current = true;
            logsEndRef.current?.scrollIntoView({ behavior: "instant" });
            // Reset flag after a short delay
            setTimeout(() => {
                isAutoScrollingRef.current = false;
            }, AUTO_SCROLL_DELAY);
        }
    }, [logs]);

    // Set up wheel event listener to detect user scrolling
    useEffect(() => {
        const container = logsContainerRef.current;
        if (!container) return;

        let wheelTimeout: ReturnType<typeof setTimeout> | undefined;

        const handleWheel = (e: WheelEvent) => {
            if (isAutoScrollingRef.current) return;

            wheelTimeout = setTimeout(() => {
                const { scrollTop, scrollHeight, clientHeight } = container;
                const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

                if (e.deltaY < 0 && scrollModeRef.current === "follow") {
                    scrollModeRef.current = "paused";
                    setScrollMode("paused");
                }
                else if (distanceFromBottom < SCROLL_THRESHOLD && scrollModeRef.current === "paused") {
                    scrollModeRef.current = "follow";
                    setScrollMode("follow");
                }
            }, AUTO_SCROLL_DELAY);
        };

        container.addEventListener('wheel', handleWheel);
        return () => {
            container.removeEventListener('wheel', handleWheel);
            if (wheelTimeout) clearTimeout(wheelTimeout);
        };
    }, []);

    // Handle manual scroll detection with debouncing
    const handleScroll = () => {
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }

        scrollTimeoutRef.current = setTimeout(() => {
            const container = logsContainerRef.current;
            if (!container || isAutoScrollingRef.current) return;

            const { scrollTop, scrollHeight, clientHeight } = container;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            if (distanceFromBottom > SCROLL_THRESHOLD && scrollMode === "follow") {
                setScrollMode("paused");
            }
            else if (distanceFromBottom <= SCROLL_THRESHOLD && scrollMode === "paused") {
                setScrollMode("follow");
            }
        }, SCROLL_DEBOUNCE_DELAY);
    };

    const scrollToTop = useCallback(() => {
        const container = logsContainerRef.current;
        if (!container) return;

        isAutoScrollingRef.current = true;
        setScrollMode("paused");
        container.scrollTop = 0;
        setTimeout(() => {
            isAutoScrollingRef.current = false;
        }, MANUAL_SCROLL_LOCK_DURATION);
    }, []);

    const scrollToBottom = useCallback(() => {
        isAutoScrollingRef.current = true;
        setScrollMode("follow");
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        setTimeout(() => {
            isAutoScrollingRef.current = false;
        }, MANUAL_SCROLL_LOCK_DURATION);
    }, []);

    const handleSearch = useCallback(() => {
        setActiveSearch(searchTerm);
    }, [searchTerm]);

    const clearSearch = useCallback(() => {
        setSearchTerm("");
        setActiveSearch("");
    }, []);

    const downloadLogs = useCallback(() => {
        window.open(LOGS_DOWNLOAD_PATH, '_blank');
    }, []);

    // Memoize filtered and parsed logs for better performance
    const processedLogs = useMemo(() => {
        const lowerSearch = activeSearch.toLowerCase();
        return logs.map((log, index) => {
            const parsed = parseLogLine(log);
            const isHighlighted = activeSearch ? log.toLowerCase().includes(lowerSearch) : false;
            return { ...parsed, originalLog: log, index, isHighlighted };
        });
    }, [logs, activeSearch]);

    return (
        <div className="h-full flex flex-col max-h-full overflow-hidden">
            <div className="flex items-center justify-between mb-4 shrink-0 bg-white p-4 rounded-lg shadow">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-gray-800">Logs</h2>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm text-gray-600">
                            {isConnected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">
                            Auto-scroll: {scrollMode === "follow" ? "ON" : "OFF"}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search logs..."
                                className="px-3 py-2 pr-8 bg-white border-2 border-gray-400 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            {searchTerm && (
                                <button
                                    onClick={clearSearch}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                    title="Clear search"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={handleSearch}
                            className="px-3 py-2 bg-purple-600 border-2 border-purple-700 text-white rounded-md hover:bg-purple-700 transition-colors shadow-lg font-semibold"
                            title="Search logs"
                            aria-label="Search logs"
                        >
                            <Search size={18} />
                        </button>
                    </div>
                    <button
                        onClick={scrollToTop}
                        className="px-3 py-2 bg-gray-700 border-2 border-gray-800 text-white rounded-md hover:bg-gray-800 transition-colors shadow-lg font-semibold"
                        title="Scroll to top (pauses auto-scroll)"
                        aria-label="Scroll to top"
                    >
                        <ArrowUp size={18} />
                    </button>
                    <button
                        onClick={scrollToBottom}
                        className="px-3 py-2 bg-gray-700 border-2 border-gray-800 text-white rounded-md hover:bg-gray-800 transition-colors shadow-lg font-semibold"
                        title="Scroll to bottom (enables auto-scroll)"
                        aria-label="Scroll to bottom"
                    >
                        <ArrowDown size={18} />
                    </button>
                    <button
                        onClick={clearLogs}
                        className="px-3 py-2 bg-blue-600 border-2 border-blue-700 text-white rounded-md hover:bg-blue-700 transition-colors shadow-lg font-semibold"
                        title="Clear logs from view"
                        aria-label="Clear logs"
                    >
                        <Eraser size={18} />
                    </button>
                    <button
                        onClick={downloadLogs}
                        className="px-3 py-2 bg-green-600 border-2 border-green-700 text-white rounded-md hover:bg-green-700 transition-colors shadow-lg font-semibold"
                        title="Download logs"
                        aria-label="Download logs"
                    >
                        <Download size={18} />
                    </button>
                    <button
                        onClick={truncateLogs}
                        className="px-3 py-2 bg-red-600 border-2 border-red-700 text-white rounded-md hover:bg-red-700 transition-colors shadow-lg font-semibold"
                        title="Truncate logs permanently"
                        aria-label="Truncate logs"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            <div
                ref={logsContainerRef}
                onScroll={handleScroll}
                className="flex-1 bg-gray-900 rounded-lg p-4 overflow-auto font-mono text-sm relative"
            >
                {logs.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                        No logs yet. Waiting for log events...
                    </div>
                ) : (
                    <div className="space-y-1">
                        {processedLogs.map(({ timestamp, level, message, index, isHighlighted }) => (
                            <div
                                key={`log-${index}`}
                                className={`whitespace-pre-wrap break-all ${isHighlighted ? 'bg-yellow-900/50' : ''}`}
                            >
                                {timestamp && (
                                    <span className="text-gray-400">{timestamp} </span>
                                )}
                                {level && (
                                    <span className={getLevelColor(level)}>{level} </span>
                                )}
                                <span className="text-white">{message}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                )}
            </div>
        </div>
    );
}