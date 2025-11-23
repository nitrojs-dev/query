## Nitro Query - A Tanstack Query Alternative With State Management Built-In

A lightweight, TypeScript-first data-fetching and caching library for React inspired by TanStack Query that combines query/mutation handling with built-in state management. It offers: 
- declarative caching and background refetching
- optimistic updates with rollback
- simple cache invalidation and query keys
- SSR/hydration support

...and a small reactive-friendly API designed for easy integration and debugging (devtools-friendly).

Example:

```tsx
// Outside the component
const ex = atom(0);

// inside the App component
const { data, loading, error } = useQuery({
  async fn() {
    await new Promise(
      (r) => setTimeout(r, 5000)
    );
  },
});

const reactiveEx = useAtom(ex);
const automaticallyReactive = useStore(0);
const { ...query, mutate } = useMutation({
  async fn() {
    await new Promise(
      (r) => setTimeout(r, 5000)
    );
  },
});

const fn = useAsync(async () => {
  await new Promise(
    (r) => setTimeout(r, 5000)
  );
});

useEffect(() => {
    mutate();
    fn();
}, []);

return (
    ...
);
```
