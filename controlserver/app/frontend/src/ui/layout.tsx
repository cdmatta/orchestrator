import { useEffect } from "react";
import { Outlet } from "react-router";
import { useLogs } from "../store/use-logs";

export default function Layout() {
    const { startListening, stopListening } = useLogs();

    useEffect(() => {
        startListening();

        return () => {
            stopListening();
        }
    }, []);

    return <div>Layout
        <div>
            <Outlet />
        </div>
    </div>
}