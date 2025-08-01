// app/providers.tsx (or components/QueryProvider.tsx)
"use client";

// import { ReactNode, useState } from "react";
import { useState } from "react";
import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

// export function QueryProvider({ children }: { children: ReactNode }) {
export function QueryProvider() {
    // keep queryClient stable
    const [qc] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={qc}>
        <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}
