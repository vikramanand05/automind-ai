"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { CheckCircle2, X } from "lucide-react";
type Theme = "dark" | "light" | "system";
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({ theme: "dark", setTheme: () => {} });
const ToastContext = createContext<(message: string) => void>(() => {});
export const useTheme = () => useContext(ThemeContext);
export const useToast = () => useContext(ToastContext);
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
      }),
  );
  const [theme, updateTheme] = usePreference<Theme>("automind-theme", "dark");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const setTheme = useCallback(
    (next: Theme) => updateTheme(next),
    [updateTheme],
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <ToastContext.Provider value={setMessage}>
          {children}
          <div className="toast-region" aria-live="polite">
            {message && (
              <div className="notification-toast">
                <CheckCircle2 size={18} />
                <span>{message}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss notification"
                  onClick={() => setMessage("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        </ToastContext.Provider>
      </ThemeContext.Provider>
    </QueryClientProvider>
  );
}

export function usePreference<T extends string>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("storage", listener);
    window.addEventListener("automind-preference", listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("automind-preference", listener);
    };
  }, []);
  const snapshot = useCallback(() => {
    try {
      return (localStorage.getItem(key) || fallback) as T;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const value = useSyncExternalStore(subscribe, snapshot, () => fallback);
  const setValue = useCallback(
    (next: T) => {
      localStorage.setItem(key, next);
      window.dispatchEvent(new Event("automind-preference"));
    },
    [key],
  );
  return [value, setValue];
}
