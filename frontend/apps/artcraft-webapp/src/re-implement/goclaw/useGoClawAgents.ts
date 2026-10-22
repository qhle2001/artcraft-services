import { useEffect } from "react";
import { useSession } from "../../lib/session";
import { toast } from "../../components/toast/toast";
import { useGoClawStore } from "./goClawStore";

export function useGoClawAgents() {
  const { user, loggedIn, authChecked } = useSession();
  const agents = useGoClawStore((state) => state.agents);
  const loading = useGoClawStore((state) => state.loading);
  const error = useGoClawStore((state) => state.error);
  const loadAgents = useGoClawStore((state) => state.loadAgents);
  const reset = useGoClawStore((state) => state.reset);

  useEffect(() => {
    if (!authChecked) return;
    if (!loggedIn) {
      reset();
      return;
    }
    void loadAgents();
  }, [authChecked, loggedIn, user?.username, loadAgents, reset]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  return { agents, loading, error };
}
