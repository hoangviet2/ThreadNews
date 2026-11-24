import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet, ScrollRestoration, useNavigate } from "react-router";
import { useApplyTheme } from "@threadnews/shared";
import { OfflineBanner } from "@threadnews/shared/ui";
import { DemoBanner, SiteFooter, SiteHeader } from "./components/site-chrome";
import { AboutPage } from "./routes/about";
import { CheckPage } from "./routes/check";
import { ExplorePage } from "./routes/explore";
import { FollowingPage } from "./routes/following";
import { HomePage } from "./routes/home";
import { NotFoundPage } from "./routes/not-found";
import { SettingsPage } from "./routes/settings";
import { StoryPage } from "./routes/story";

const StoryGraphPage = lazy(() => import("./routes/story-graph"));

/** Shared components render plain <a>; keep same-origin clicks inside the SPA. */
function useInternalLinks() {
  const navigate = useNavigate();
  return (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  };
}

function Layout() {
  useApplyTheme();
  const onClick = useInternalLinks();
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg" onClick={onClick}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2">
        Skip to content
      </a>
      <DemoBanner />
      <OfflineBanner />
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/check", element: <CheckPage /> },
      { path: "/explore", element: <ExplorePage /> },
      { path: "/story/:storyId", element: <StoryPage /> },
      {
        path: "/story/:storyId/graph",
        element: (
          <Suspense fallback={<div className="mx-auto max-w-[1120px] px-6 py-10 text-sm text-muted">Loading story map…</div>}>
            <StoryGraphPage />
          </Suspense>
        ),
      },
      { path: "/following", element: <FollowingPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/about", element: <AboutPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
