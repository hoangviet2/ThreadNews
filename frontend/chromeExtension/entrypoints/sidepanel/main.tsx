import "@fontsource-variable/inter";
import "./style.css";
import { PlatformProvider, useApplyTheme } from "@threadnews/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { platform } from "../../platform";
import { App } from "./App";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

function Root() {
  useApplyTheme();
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlatformProvider value={platform}>
      <QueryClientProvider client={queryClient}>
        <Root />
      </QueryClientProvider>
    </PlatformProvider>
  </StrictMode>,
);
