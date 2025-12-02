/**
 * LICENSE: MIT
 * Copyright (c) 2025-present Nitro.js Contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import { useState, useEffect, useCallback, useRef, type JSX, type ReactNode } from "react";

/** A type that represents anything React can render without server components (RSC) */
export type Renderable = JSX.Element | Exclude<ReactNode, Promise<ReactNode>>;
export interface FC<P = {}> {
  (props: P): Renderable;
}

// --- Type Definitions ---
export interface QueryFn<A extends unknown[], R> {
  (...args: A): R | Promise<R>;
}
export interface QueryOptions<A extends unknown[], R> {
  fn: QueryFn<A, R>;
  callerArgs?: A;
  /** Optional: set to `false` to disable caching for this specific query. Defaults to true. */
  useCache?: boolean;
  customQueryKey?: string;
}

export interface QueryResult<R> {
  loading: boolean;
  data?: R;
  error?: Error;
  refetch(): void;
}

// --- Caching Mechanism ---
// Global in-memory cache storage
export const cache = new Map<string, unknown>();

/**
 * Generates a consistent cache key for a given function and its arguments.
 */
export const generateCacheKey = <A extends unknown[]>(
  fn: QueryFn<A, unknown>,
  args: A | undefined
): string => {
  // Use the function name (if available) or convert the function to a string
  const fnIdentifier = fn.name || fn.toString();
  const argsString = JSON.stringify(args);
  return `${fnIdentifier}-${argsString}`;
};

/**
 * A React hook that wraps a query function with caching and loading state management.
 * It returns an object with the query result data, a boolean indicating if the query is loading,
 * an error object if the query failed, and a function to refetch the data.
 * @param {QueryOptions<A, R>} opts - An object with the query function and its arguments, and an optional boolean to indicate if caching should be enabled.
 * @returns {QueryResult<R>} An object with the query result data, a boolean indicating if the query is loading, an error object if the query failed, and a function to refetch the data.
 */
export function useQuery<A extends unknown[], R>(
  opts: QueryOptions<A, R>
): QueryResult<R> {
  const { fn, callerArgs, useCache: useCacheOption = true, customQueryKey } = opts;
  const [data, setData] = useState<R>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  // Track component mount status to prevent memory leaks
  const isMounted = useRef(true);
  // Determine the cache key
  const currentCallerArgs = callerArgs ?? ([] as unknown[] as A);
  const cacheKey = customQueryKey ?? generateCacheKey(fn, currentCallerArgs);
  const runQuery = async () => {
    // Check cache only if useCacheOption is true
    if (useCacheOption && cache.has(cacheKey)) {
      setData(cache.get(cacheKey) as R);
      setLoading(false);
      return;
    }
    // If not cached or caching is disabled, proceed with fetching
    try {
      setLoading(true);
      const res = fn(...currentCallerArgs);
      const returnData = res instanceof Promise ? await res : res;
      // Only update state if component is still mounted
      if (isMounted.current) {
        setData(returnData);
        // Store result in cache only if useCacheOption is true
        if (useCacheOption) {
          cache.set(cacheKey, returnData);
        }
      }
    } catch (e) {
      if (isMounted.current) {
        const err =
          e instanceof Error
            ? e
            : new Error("An unexpected error occured :(");
        setError(err);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const refetch = useCallback(() => {
    runQuery();
  }, [runQuery]);

  useEffect(() => {
    isMounted.current = true; // Set to true when effect runs (component mounts/updates)


    runQuery();
    return () => {
      isMounted.current = false; // Mark as unmounted on cleanup
    };
  }, [
    fn,
    currentCallerArgs,
    cacheKey,
    useCacheOption,
    customQueryKey
  ]); // Added all dependencies

  return { data, error, loading, refetch };
}

// --- Mutation Types and Implementation (with Invalidation Feature) ---

// Corrected Type: mutate function should allow triggering the mutation and returns void,
// the hook returns the state.
export interface MutateFn<A extends unknown[]> {
  (...args: A): void;
}

export interface MutationOptions<A extends unknown[], R>
  extends Omit<QueryOptions<A, R>, "callerArgs"> {
  onSuccess?: (data: R) => void;
}

export interface MutationResult<A extends unknown[], R> extends Omit<QueryResult<R>, "refetch"> {
  mutate: MutateFn<A>;
}

/**
 * A React hook that wraps a mutation function with caching, loading state management, and invalidation feature.
 * It returns an object with the mutation result data, a boolean indicating if the mutation is loading,
 * an error object if the mutation failed, and a function to trigger the mutation.
 * @param {MutationOptions<A, R>} opts - An object with the mutation function, its arguments, and an optional boolean to indicate if caching should be enabled.
 * @returns {MutationResult<A, R>} An object with the mutation result data, a boolean indicating if the mutation is loading, an error object if the mutation failed, and a function to trigger the mutation.
 */
export function useMutation<A extends unknown[], R>(
  opts: MutationOptions<A, R>
): MutationResult<A, R> {
  const { fn, useCache: useCacheOption = true, onSuccess, customQueryKey } = opts;
  const [data, setData] = useState<R>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const isMounted = useRef(true);

  // Mark component as unmounted on cleanup
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (...args: A) => {
      const currentCallerArgs = args ?? ([] as unknown[] as A);
      const cacheKey = customQueryKey ?? generateCacheKey(opts.fn, currentCallerArgs);

      try {
        if (isMounted.current) {
          setLoading(true);
        }

        const res = opts.fn(...currentCallerArgs);
        const returnData = res instanceof Promise ? await res : res;

        if (isMounted.current) {
          setData(returnData);

          // --- NEW: Invalidate the cache after a SUCCESSFUL mutation ---
          if (onSuccess) {
            onSuccess(returnData);
          }

          if (useCacheOption) {
            cache.set(cacheKey, returnData);
          }
        }
      } catch (e) {
        if (isMounted.current) {
          const err =
            e instanceof Error
              ? e
              : new Error("An unexpected error occured :(");
          setError(err);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    },

    [fn, useCacheOption, onSuccess, customQueryKey]
  ); // Added all dependencies including invalidateKeys

  const mutateFn: MutateFn<A> = useAsync(mutate);
  return { data, loading, error, mutate: mutateFn };
}


// --- useAsync Hook ---

export interface AsyncFn<A extends unknown[], R> {
  (...args: A): Promise<R>;
}

// Updated SyncFn to properly reflect R | undefined return type
export interface SyncFn<A extends unknown[], R> {
  (...args: A): R | undefined;
  state: AsyncFnState<R>;
}

export interface AsyncFnState<R> extends Omit<QueryResult<R>, "data"> { }

/**
 * A React hook that wraps an async function with loading state management and error handling.
 * It returns an object with the async function result data, a boolean indicating if the async function is loading,
 * an error object if the async function failed, and a function to trigger the async function.
 * @param {AsyncFn<A, R>} fn - An async function to be wrapped.
 * @returns {SyncFn<A, R>} A function that triggers the async function and an attached state object with loading and error information.
 */
export function useAsync<A extends unknown[], R>(
  fn: AsyncFn<A, R>
): SyncFn<A, R> {
  const [data, setData] = useState<R>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const newFn = useCallback(
    (...args: A) => {
      setError(undefined);
      // We rely on the async block to set loading true, 
      // as setting it false here immediately is incorrect for the state object flow.
      (async () => {
        try {
          setLoading(true);
          const returnData = await fn(...args);
          setData(returnData);
        } catch (e) {
          const err =
            e instanceof Error
              ? e
              : new Error("An unexpected error occured :(");
          setError(err);
        } finally {
          setLoading(false);
        }
      })();

      // Returns stale data immediately (for sync return signature compatibility)
      return data;
    },

    [fn]
  );

  // The state object attached to the function provides the up-to-date values via React re-renders
  return Object.assign(newFn, {
    state: {
      error,
      loading
    } as AsyncFnState<R>,
  }) as SyncFn<A, R>;
}

export interface Store<T> {
  value: T;
  reset(): void;
  asAtom(): Atom<T>;
}

export type StateInput<T> = T | (() => T);

/**
 * A React hook that creates a store with a value and a reset function.
 * The store's value is initialized with the given `initialValue`.
 * If `initialValue` is a function, the store's value is initialized with the result of calling that function.
 * The `reset` function resets the store's value to its initial value.
 * @template T
 * @param {StateInput<T>} initialValue - The initial value of the store.
 * @returns {Store<T>} An object with the store's value and a reset function.
 */
export function useStore<T>(initialValue: StateInput<T>): Store<T> {
  const [value, setValue] = useState<T>(initialValue);

  const reset = useCallback(() => {
    setValue(
      initialValue instanceof Function
        ? initialValue()
        : initialValue
    );
  }, [initialValue]);

  return {
    get value() {
      return value;
    },

    set value(v) {
      setValue(v);
    },

    reset,
    asAtom: () => atom(value),
  };
}

export interface Atom<T> {
  readonly $$typeof: symbol;
  readonly consume: () => T;
}

/**
 * A function that creates a store with a value and a reset function.
 * The store's value is initialized with the given `initialValue`.
 * If `initialValue` is a function, the store's value is initialized with the result of calling that function.
 * The `reset` function resets the store's value to its initial value.
 * @template T
 * @param {StateInput<T>} initialValue - The initial value of the store.
 * @returns {Atom<T>} An object with the store's value and a reset function.
 */
export function atom<T>(initialValue: StateInput<T>): Atom<T> {
  const id = Symbol("nitro.query.atom" + crypto.randomUUID());
  let value =
    initialValue instanceof Function
      ? initialValue()
      : initialValue;

  return {
    $$typeof: id,
    consume() {
      return value;
    }
  };
}

/**
 * A React hook that wraps a store with a value and a reset function.
 * The store's value is initialized with the given `store.value`.
 * The `reset` function resets the store's value to its initial value.
 * @template T
 * @param {Atom<T>} store - The store to wrap.
 * @returns {Store<T>} An object with the store's value and a reset function.
 */
export function useAtom<T>(store: Atom<T>): Store<T> {
  const st = useStore(store.consume);
  return st;
}

export interface AsyncComponent<P = {}> extends AsyncFn<[P], ReactNode> { }
export interface ErrorBoundaryProps {
  error: Error;
}

export interface AsyncComponentOptions {
  fallback?: ReactNode;
  errorBoundary?: FC<ErrorBoundaryProps>;
}

/**
 * A React hook that wraps an async component with a loading state, error boundary, and fallback component.
 * It uses the `useQuery` hook to manage the async component's state.
 * @template P - The type of the props passed to the async component.
 * @param {AsyncComponent<P>} fn - The async component to wrap.
 * @param {AsyncComponentOptions} options - An object with the loading state fallback component, error boundary component, and other options.
 * @returns {FC<P>} A React component that wraps the async component with the desired state management.
 */
export function useAsyncComponent<P = {}>(
  fn: AsyncComponent<P>,
  options?: AsyncComponentOptions
): FC<P> {
  const Comp = useCallback(
    ((props) => {
      const { data, error, loading } = useQuery({
        fn,
        callerArgs: [props]
      });

      if (loading) {
        return <>{options?.fallback ?? <></>}</>;
      } else if (error) {
        if (options?.errorBoundary) {
          const ErrorBoundary = options.errorBoundary;
          // @ts-ignore
          return <ErrorBoundary error={error} />;
        }

        return <>{null}</>;
      } else if (data) {
        return data;
      }

      return <>{null}</>;
    }) as FC<P>,

    [fn, options, options?.fallback, options?.errorBoundary]
  );

  return Comp;
}

export interface QueryProps<A extends unknown[], R> extends QueryOptions<A, R> {
  children?: FC<QueryResult<R>>;
}

/**
 * A React component that wraps the useQuery hook.
 * It uses the useQuery hook to manage the query state and provides the query result as a prop to its children.
 * This is especially useful for React class components that cannot use hooks directly.
 * @template A - The type of the arguments passed to the query function.
 * @template R - The type of the result returned by the query function.
 * @param {QueryProps<A, R>} props - An object with the query function, its arguments, and an optional child component.
 * @returns {Renderable} The result of calling the child component with the query result as a prop, or null if no child component is provided.
 */
export function Query<A extends unknown[], R>(props: QueryProps<A, R>): Renderable {
  const { children: CH, ...queryOptions } = props;
  const query = useQuery(queryOptions);

  // @ts-ignore
  return CH ? <CH {...query} /> : null;
}

export interface MutationProps<A extends unknown[], R> extends MutationOptions<A, R> {
  children?: FC<MutationResult<A, R>>;
}

/**
 * A React component that wraps the useMutation hook.
 * It uses the useMutation hook to manage the mutation state and provides the mutation result as a prop to its children.
 * This is especially useful for React class components that cannot use hooks directly.
 * @template A - The type of the arguments passed to the mutation function.
 * @template R - The type of the result returned by the mutation function.
 * @param {MutationProps<A, R>} props - An object with the mutation function, its arguments, and an optional child component.
 * @returns {Renderable} The result of calling the child component with the mutation result as a prop, or null if no child component is provided.
 */
export function Mutation<A extends unknown[], R>(props: MutationProps<A, R>): Renderable {
  const { children: CH, ...mutationOptions } = props;
  const mutation = useMutation(mutationOptions);

  // @ts-ignore
  return CH ? <CH {...mutation} /> : null;
}

export interface SuspenseQuery<A, R> extends Omit<QueryResult<R>, "loading"> { }
/**
 * A React hook that wraps a query function with suspense support.
 * It returns an object with the query result data and an error object if the query failed.
 * @param {QueryOptions<A, R>} opts - An object with the query function and its arguments, and an optional boolean to indicate if caching should be enabled.
 * @returns {SuspenseQuery<A, R>} An object with the query result data and an error object if the query failed.
 */
export function useSuspenseQuery<A extends unknown[], R>(
  opts: QueryOptions<A, R>
): SuspenseQuery<A, R> {
  const { fn, callerArgs, useCache: useCacheOption = true, customQueryKey } = opts;
  const currentCallerArgs = callerArgs ?? ([] as unknown[] as A);
  const cacheKey = customQueryKey ?? generateCacheKey(fn, currentCallerArgs);
  const [data, setData] = useState<R | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true; // Set to true when effect runs (component mounts/updates)

    (async () => {
      try {
        const res = fn(...currentCallerArgs);
        const returnData = res instanceof Promise ? await res : res;
        // Only update state if component is still mounted
        if (isMounted.current) {
          setData(returnData);
          // Store result in cache only if useCacheOption is true
          if (useCacheOption) {
            cache.set(cacheKey, returnData);
          }
        }
      } catch (e) {
        if (isMounted.current) {
          const err =
            e instanceof Error
              ? e
              : new Error("An unexpected error occured :(");
          setError(err);
        }
      }
    })();

    return () => {
      isMounted.current = false; // Mark as unmounted on cleanup
    };
  }, [
    fn,
    currentCallerArgs,
    cacheKey,
    useCacheOption
  ]); // Added all dependencies

  return {
    data,
    error,
    refetch() {
      (async () => {
        try {
          const res = fn(...currentCallerArgs);
          const returnData = res instanceof Promise ? await res : res;
          // Only update state if component is still mounted
          if (isMounted.current) {
            setData(returnData);
            // Store result in cache only if useCacheOption is true
            if (useCacheOption) {
              cache.set(cacheKey, returnData);
            }
          }
        } catch (e) {
          if (isMounted.current) {
            const err =
              e instanceof Error
                ? e
                : new Error("An unexpected error occured :(");
            setError(err);
          }
        }
      })();
    },
  } as SuspenseQuery<A, R>;
}

export interface SuspenseQueryProps<A extends unknown[], R> extends QueryOptions<A, R> {
  children?: FC<SuspenseQuery<A, R>>;
}

/**
 * A React component that wraps the useSuspenseQuery hook.
 * It uses the useSuspenseQuery hook to manage the query state and provides the query result as a prop to its children.
 * This is especially useful for React class components that cannot use hooks directly.
 * @template A - The type of the arguments passed to the query function.
 * @template R - The type of the result returned by the query function.
 * @param {SuspenseQueryProps<A, R>} props - An object with the query function, its arguments, and an optional child component.
 * @returns {Renderable} The result of calling the child component with the query result as a prop, or null if no child component is provided.
 */
export function SuspenseQuery<A extends unknown[], R>(props: SuspenseQueryProps<A, R>): Renderable {
  const { children: CH, ...queryOptions } = props;
  const query = useSuspenseQuery(queryOptions);

  // @ts-ignore
  return CH ? <CH {...query} /> : null;
}

export class QueryClient {
  /**
   * Clears the entire cache.
   * This is useful for invalidating all cached data,
   * or when you want to start fresh after a certain event.
   */
  clearCache() {
    cache.clear();
  }

  /**
   * Returns the global cache storage.
   * This is useful for inspecting the cache,
   * or for advanced use cases where you need to
   * access the cache directly.
   * @returns The global cache storage.
   */
  getCache() {
    return cache;
  }

  /**
   * Invalidates a single key in the cache.
   * If the key exists in the cache, it is deleted.
   * @param key - The key to invalidate.
   */
  invalidateKey(key: string) {
    if (cache.has(key)) {
      cache.delete(key);
    }
  }

  /**
   * Invalidates multiple keys in the cache.
   * If any of the keys exist in the cache, they are deleted.
   * @param keys - An array of keys to invalidate.
   */
  invalidateKeys(keys: string[]) {
    keys.forEach((key) => this.invalidateKey(key));
  }

  /**
   * Clears the entire cache and invalidates all keys.
   * This is useful for invalidating all cached data,
   * or when you want to start fresh after a certain event.
   */
  invalidateAll() {
    this.clearCache();
  }
}

/**
 * A React hook that returns a QueryClient instance.
 * The instance is memoized and will only change when the component is remounted.
 * This is useful for accessing the QueryClient instance in your React components.
 * @returns The QueryClient instance, or null if it has not been initialized.
 */
export const useQueryClient = () => {
  const [client, setClient] = useState<QueryClient | null>(null);

  useEffect(() => {
    if (!client) {
      setClient(new QueryClient());
    }
  }, [client]);

  return client!;
}

/*
  Note: When locally testing this file, ensure that you put // @ts-ignore
  above the lines where the FC type is used in JSX, as TypeScript sometimes
  has trouble inferring the types correctly in these cases. We have
  done our best to type everything correctly, but React component types
  can be tricky.

  If you have any suggestions for how to make this better, let me know!
  Also, Nitro.js 1.0 is coming soon, so stay tuned for that!

  With that said, happy coding! :)
  - The Nitro.js Team
*/
