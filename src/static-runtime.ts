/**
 * GitHub Pages runs the same demo domain commands inside this browser.
 * Only fictional fixtures are bundled. No API request leaves this origin and
 * each visitor owns an independent localStorage state, including offline CSVs.
 */
import { createSeed } from "../server/seed";
import { createMotionBusiness } from "../shared/motion-poc";
import { handleOrchestration } from "../server/domains/orchestration";
import {
  handleProduction,
  validateProductionTransition,
} from "../server/domains/production";
import { handleProcess } from "../server/domains/process";
import { handleRisk, evaluateRisks } from "../server/domains/risk";
import { handleReports } from "../server/domains/reports";
import {
  requireValue,
  record,
  type Command,
  type Context,
  type State,
} from "../shared/types";

export const PUBLIC_DEMO_STORAGE_KEY = "pmc-public-demo-v1";
let installed = false;

function publicSeed(): State {
  const state = createSeed();
  if (!state.businesses.some((b) => b.id === "motion-poc")) {
    state.businesses.push(createMotionBusiness());
    state.production["motion-poc"] = {
      chains: [],
      tasks: [],
      deliveries: [],
      acceptances: [],
      audit: [],
      budgetHistory: [],
      costConfirmed: false,
    };
  }
  return state;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validState(value: unknown): value is State {
  const s = value as State;
  return !!(
    s &&
    s.schemaVersion === 1 &&
    Number.isInteger(s.revision) &&
    s.revision >= 0 &&
    [
      "businesses",
      "users",
      "tasks",
      "risks",
      "followups",
      "notifications",
      "files",
      "decisions",
      "imports",
      "audit",
    ].every((key) => Array.isArray((s as any)[key])) &&
    ["production", "settings", "drafts", "riskConfig"].every(
      (key) =>
        (s as any)[key] &&
        typeof (s as any)[key] === "object" &&
        !Array.isArray((s as any)[key]),
    ) &&
    s.users.length > 0 &&
    s.users.every(
      (u) =>
        u.id &&
        u.name &&
        ["pm", "finance", "approver", "viewer"].includes(u.role),
    )
  );
}

function persist(s: State): void {
  try {
    // Prototype ledger retains recent operations; data files stay in their platforms.
    s.audit = s.audit.slice(-200);
    if (s.drafts["production-plan:motion-poc"]?.schema === 2)
      delete s.drafts["orchestration:motion-poc"];
    localStorage.setItem(PUBLIC_DEMO_STORAGE_KEY, JSON.stringify(s));
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw Error(
        "浏览器演示存储空间不足。本次操作未保存，请先导出备份或释放空间后重试。",
      );
    }
    throw Error("浏览器禁止保存演示数据。请允许此站点使用本地存储后重试。");
  }
}

function read(): State {
  const raw = localStorage.getItem(PUBLIC_DEMO_STORAGE_KEY);
  if (raw === null) {
    const seeded = publicSeed();
    persist(seeded);
    return seeded;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Error(
      "浏览器中的演示数据损坏，请导出保留后恢复演示；原数据未被覆盖。",
    );
  }
  requireValue(
    validState(parsed),
    "浏览器中的演示数据版本不兼容；原数据未被覆盖。",
  );
  return parsed;
}

function applyCommand(cmd: Command, headers: Headers): Response {
  // Re-read after parsing the request body, so overlapping browser commands
  // observe the latest committed revision before any business mutation.
  const current = read();
  if (
    cmd.expectedRevision !== undefined &&
    cmd.expectedRevision !== current.revision
  ) {
    return json({ error: "数据已更新，请核对后重试" }, 409);
  }
  const s = structuredClone(current);
  const actor = s.users.find((u) => u.id === headers.get("x-actor"));
  requireValue(actor, "请选择演示身份");
  requireValue(typeof cmd.type === "string", "无效命令");
  requireValue(
    actor.role !== "viewer" ||
      /^(task\.read|task\.markRead|risk\.read|process\.columns$|notification\.|settings\.preferences)/.test(
        cmd.type,
      ),
    "只读成员不能修改业务",
  );
  const c: Context = {
    actor,
    now: new Date().toISOString(),
    id: () => crypto.randomUUID(),
  };
  const p = cmd.payload || {};
  let result: any;
  if (cmd.type === "system.reset") {
    requireValue(actor.role === "approver", "仅业务授权角色可恢复演示");
    const next = publicSeed();
    next.revision = s.revision + 1;
    persist(next);
    return json({ state: next, result: { ok: true } });
  }
  if (cmd.type === "system.restore") {
    requireValue(actor.role === "approver", "仅业务授权角色可恢复备份");
    requireValue(validState(p.state), "备份格式不正确");
    const next = structuredClone(p.state) as State;
    next.revision = s.revision + 1;
    record(next, c, "恢复备份", "从本浏览器备份恢复演示数据");
    persist(next);
    return json({ state: next, result: { ok: true } });
  }
  if (cmd.type === "notification.read") {
    for (const n of s.notifications) {
      if (n.userId === actor.id && (!p.id || n.id === p.id)) n.read = true;
    }
    result = { ok: true };
  }
  if (cmd.type === "settings.preferences") {
    s.settings[actor.id] = { ...s.settings[actor.id], ...p };
    result = { ok: true };
  }
  if (cmd.type === "process.transition") {
    const b = s.businesses.find((x) => x.id === p.businessId);
    if (b) validateProductionTransition(s, b, p.action || p.target, p, c);
  }
  if (result === undefined) result = handleOrchestration(s, cmd, c);
  if (result === undefined) result = handleProduction(s, cmd, c);
  if (result === undefined) result = handleProcess(s, cmd, c);
  if (result === undefined) result = handleRisk(s, cmd, c);
  if (result === undefined) result = handleReports(s, cmd, c);
  requireValue(result !== undefined, "尚未注册的业务操作：" + cmd.type);
  evaluateRisks(s, c);
  s.revision++;
  persist(s);
  return json({ state: s, result });
}

export function installPublicDemoRuntime(): void {
  if (installed) return;
  installed = true;
  const browserFetch = window.fetch.bind(window);
  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.href,
    );
    // Assets and explicitly external links keep normal browser semantics.
    if (
      url.origin !== window.location.origin ||
      !/(^|\/)api(?:\/|$)/.test(url.pathname)
    ) {
      return browserFetch(input, init);
    }
    try {
      const request = new Request(input instanceof Request ? input : url, init);
      if (request.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      const endpoint = url.pathname.slice(url.pathname.indexOf("/api"));
      if (endpoint === "/api/health" && request.method === "GET") {
        return json({ ok: true, mode: "public-browser-simulation" });
      }
      if (endpoint === "/api/state" && request.method === "GET")
        return json(read());
      if (endpoint === "/api/backup" && request.method === "GET") {
        return new Response(JSON.stringify(read(), null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition":
              "attachment; filename=pmc-public-demo-backup.json",
          },
        });
      }
      if (endpoint === "/api/command" && request.method === "POST") {
        const cmd = await request.json();
        requireValue(cmd && typeof cmd === "object", "无效命令");
        return applyCommand(cmd as Command, request.headers);
      }
      if (endpoint.startsWith("/api/files")) {
        return json(
          {
            error:
              "公开演示不保存项目附件。生产编排中的 CSV 下载和回传可直接使用。",
          },
          400,
        );
      }
      return json(
        { error: "公开演示未提供此接口，本次请求未发送到远程服务。" },
        404,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return json(
        { error: error instanceof Error ? error.message : "演示操作未完成" },
        400,
      );
    }
  };
}
