import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

const Ctx = createContext(null);
export function AppProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = loading
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const refresh = useCallback(async () => {
    const m = await api.get("/auth/me").catch(() => ({ user: null, workspaces: [] }));
    setMe(m);
    if (m.user) { const [t, s] = await Promise.all([api.get("/teams"), api.get("/seasons")]); setTeams(t); setSeasons(s); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = async () => { await api.post("/auth/logout"); setMe({ user: null, workspaces: [] }); };
  return <Ctx.Provider value={{ me, user: me?.user || null, workspaces: me?.workspaces || [], llm: me?.llm, teams, seasons, refresh, logout }}>{children}</Ctx.Provider>;
}
export const useApp = () => useContext(Ctx);
export function useWorkspace(wid) { const { workspaces } = useApp(); return workspaces.find((w) => w.workspace_id === wid) || null; }
export function useTeam(teamId) { const { teams } = useApp(); return teams.find((t) => t.id === teamId) || null; }
export function useFetch(path, deps = []) {
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true);
  const load = useCallback(() => { if (!path) return; setLoading(true); api.get(path).then((d) => { setData(d); setError(null); }).catch((e) => setError(e)).finally(() => setLoading(false)); }, [path]);
  useEffect(() => { load(); }, [load, ...deps]);
  return { data, error, loading, reload: load };
}
