import { atom, useAtom, useQuery, useMutation, useAsync, useStore } from "nitro-query";

// Outside the component
const ex = atom(0);

// inside the App component
export default function App() {
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
}
