import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useLogs } from "@/store/use-logs";

export default function Layout() {
    const { startListening, stopListening } = useLogs();
    const location = useLocation();

    useEffect(() => {
        startListening();

        return () => {
            stopListening();
        }
    }, []);

    const isActive = (path: string) => {
        return location.pathname === path;
    };

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            {/* Top Menu Bar */}
            <header className="bg-gray-800 text-white shadow-md shrink-0">
                <div className="px-4">
                    <nav className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-8">
                            <div className="text-2xl font-bold">Orchestrator</div>
                            <div className="flex space-x-4">
                                <Link
                                    to="/logs"
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive("/logs")
                                        ? "bg-gray-900 text-white"
                                        : "text-gray-300 hover:bg-gray-700 hover:text-white"
                                        }`}
                                >
                                    Logs
                                </Link>
                            </div>
                        </div>
                    </nav>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 bg-gray-50 overflow-hidden">
                <div className="h-full px-4 py-6">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}