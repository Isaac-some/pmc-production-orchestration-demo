import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { App } from "antd";
import type { State, Command, User } from "../shared/types";
type Value = {
  state: State;
  user: User;
  setUser: (id: string) => void;
  command: (type: string, payload?: any) => Promise<any>;
  refresh: () => Promise<void>;
  busy: boolean;
};
const C = createContext<Value>(null!);
export function Provider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>();
  const stateRef = useRef<State | undefined>(undefined);
  const update = (s: State) => {
    stateRef.current = s;
    setState(s);
  };
  const [uid, setUid] = useState(localStorage.getItem("pmc-user") || "u1");
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  const refresh = useCallback(async () => {
    const r = await fetch("/api/state");
    if (!r.ok) throw Error("本地服务不可用");
    update(await r.json());
  }, []);
  useEffect(() => {
    refresh().catch((e) => message.error(e.message));
  }, [refresh]);
  async function command(type: string, payload: any = {}) {
    setBusy(true);
    try {
      const r = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Actor": uid },
        body: JSON.stringify({
          type,
          payload,
          expectedRevision: stateRef.current?.revision,
        } satisfies Command),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 409) await refresh();
        throw Error(d.error || "操作未完成");
      }
      update(d.state);
      return d.result;
    } catch (e) {
      message.error((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  if (!state) return <div className="boot">正在读取本地项目中枢…</div>;
  return (
    <C.Provider
      value={{
        state,
        user: state.users.find((x) => x.id === uid) || state.users[0],
        setUser: (id) => {
          setUid(id);
          localStorage.setItem("pmc-user", id);
        },
        command,
        refresh,
        busy,
      }}
    >
      {children}
    </C.Provider>
  );
}
export function usePMC() {
  return useContext(C);
}
