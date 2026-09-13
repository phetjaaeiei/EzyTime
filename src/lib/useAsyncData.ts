import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_ERROR = "โหลดข้อมูลไม่สำเร็จ";

export interface AsyncData<T> {
  data: T;
  loading: boolean;
  refreshing: boolean;
  error: string;
  reload: () => void;
}

/**
 * Load async data once on mount and expose a `reload()` for manual refreshes
 * (refresh button, post-save). Consolidates the load-callback + guarded
 * mount-effect pattern previously duplicated across stock screens.
 *
 * The mount effect never calls setState synchronously in its body (it only
 * sets state inside the promise resolution), to satisfy
 * react-hooks/set-state-in-effect. `reload()` is meant for event handlers, so
 * it may flip loading synchronously. All updates are guarded against firing
 * after unmount.
 */
export function useAsyncData<T>(loader: () => Promise<T>, initial: T): AsyncData<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const loaderRef = useRef(loader);
  const mountedRef = useRef(true);

  // Keep the latest loader without re-running the mount fetch when its
  // identity changes. Synced in an effect (not during render) per react-hooks.
  useEffect(() => {
    loaderRef.current = loader;
  });

  const applyResult = useCallback(
    () =>
      loaderRef.current().then(
        (next) => {
          if (mountedRef.current) {
            setData(next);
            setLoading(false);
            setRefreshing(false);
          }
        },
        (cause) => {
          if (mountedRef.current) {
            setError(cause instanceof Error ? cause.message : DEFAULT_ERROR);
            setLoading(false);
            setRefreshing(false);
          }
        },
      ),
    [],
  );

  // reload() keeps the current data on screen (stale-while-revalidate) instead of
  // blanking to a skeleton — so a refresh after saving does not collapse the list
  // height and scroll the page back to the top.
  const reload = useCallback(() => {
    setRefreshing(true);
    setError("");
    void applyResult();
  }, [applyResult]);

  useEffect(() => {
    mountedRef.current = true;
    void applyResult();
    return () => {
      mountedRef.current = false;
    };
  }, [applyResult]);

  return { data, loading, refreshing, error, reload };
}
