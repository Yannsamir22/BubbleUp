import { lazy, Suspense, useEffect } from "react";
import { useStore } from "./store/index.js";
import { usePath, parseRoute, navigate, chatPath } from "./lib/router.js";
import { storage } from "./lib/browser.js";
import { useRealtime } from "./hooks/useRealtime.js";
import { AuthScreen } from "./components/auth/AuthScreen.jsx";
import { Welcome } from "./components/onboarding/Welcome.jsx";
import { Logo } from "./components/ui/primitives.jsx";
import { Toasts } from "./components/ui/Toasts.jsx";

// The chat UI is the heavy part: load it only after login.
const AppShell = lazy(() => import("./components/layout/AppShell.jsx"));

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
}

export function BootScreen() {
  return (
    <div className="boot" role="status" aria-label="Loading">
      <Logo size={40} />
    </div>
  );
}

export function App() {
  const status = useStore((s) => s.status);
  const classes = useStore((s) => s.classes);
  const path = usePath();
  const route = parseRoute(path);

  useTheme();
  useRealtime();
  useEffect(() => {
    useStore.getState().boot();
  }, []);

  // "/" → last visited class, or onboarding.
  useEffect(() => {
    if (status !== "ready" || route.name !== "home") return;
    if (classes.length === 0) return navigate("/welcome", { replace: true });
    const last = storage.get("lastClass", null);
    const target = classes.find((c) => c.id === last) ?? classes[0];
    navigate(chatPath(target.id), { replace: true });
  }, [status, route.name, classes]);

  let screen;
  if (status === "booting") screen = <BootScreen />;
  else if (status === "anon") screen = <AuthScreen />;
  else if (route.name === "chat")
    screen = (
      <Suspense fallback={<BootScreen />}>
        <AppShell classId={route.classId} channelId={route.channelId} />
      </Suspense>
    );
  else if (route.name === "welcome" || classes.length === 0) screen = <Welcome />;
  else screen = <BootScreen />;

  return (
    <>
      {screen}
      <Toasts />
    </>
  );
}
