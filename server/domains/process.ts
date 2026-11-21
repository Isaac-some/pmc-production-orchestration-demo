import {
  type State,
  type Command,
  type Context,
  type Business,
  type Task,
  requireValue,
  mutable,
  record,
  STAGES,
  stageNames,
} from "../../shared/types";
import {
  businessBlockers,
  currentBlockers,
  draftKey,
  mentionsIn,
  DATA_TYPES,
  PROJECT_STAGES,
  OPPORTUNITY_STAGES,
} from "../../shared/process";
const clone = <T>(v: T): T => structuredClone(v);
function edit(s: State, id: string, c: Context) {
  requireValue(
    c.actor.role === "pm" || c.actor.role === "approver",
    "当前身份不能修改业务",
  );
  return mutable(s, id, c);
}
function checkVersion(b: Business, p: any) {
  if (p.version != null)
    requireValue(p.version === b.version, "业务已更新，请刷新后重试");
}
function txt(v: any, max: number, label: string, required = false) {
  const x = String(v ?? "").trim();
  requireValue(!required || x.length > 0, label + "不能为空");
  requireValue(x.length <= max, label + "过长");
  return x;
}
function date(v: any, required = false) {
  const x = String(v || "");
  requireValue(!required || !!x, "请选择截止日期");
  requireValue(
    !x ||
      (/^\d{4}-\d{2}-\d{2}$/.test(x) &&
        !isNaN(Date.parse(x)) &&
        new Date(x + "T12:00:00Z").toISOString().slice(0, 10) === x),
    "日期格式无效",
  );
  return x;
}
function people(s: State, ids: any, required = false) {
  const a = [...new Set(Array.isArray(ids) ? ids : [])];
  requireValue(!required || a.length > 0, "至少选择一位负责人");
  requireValue(
    a.every((id) => s.users.some((u) => u.id === id)),
    "所选人员不存在",
  );
  return a as string[];
}
function files(s: State, v: any, maxMB = 50) {
  const a = Array.isArray(v) ? v : [];
  requireValue(a.length <= 10, "最多10个附件");
  requireValue(
    a.every((x) => {
      const f = s.files.find((f) => f.id === x.id);
      return f && f.size > 0 && f.size <= maxMB * 1024 * 1024;
    }),
    "附件不存在或大小超限",
  );
  return a.map((x) => s.files.find((f) => f.id === x.id)!);
}
function addresses(v: any) {
  const a = Array.isArray(v) ? v : [];
  requireValue(a.length <= 10, "最多10个TOS地址");
  return a
    .filter((x) => String(x.url || "").trim())
    .map((x) => {
      requireValue(/^tos:\/\/[^/]+\/.+/.test(x.url), "TOS地址须包含桶和路径");
      return { url: x.url, note: txt(x.note, 100, "地址备注") };
    });
}
function notify(
  s: State,
  c: Context,
  ids: string[],
  title: string,
  detail: string,
  businessId: string,
  taskId?: string,
  extra: any = {},
) {
  for (const userId of new Set(ids))
    s.notifications.unshift({
      id: c.id(),
      userId,
      title,
      detail,
      at: c.now,
      read: false,
      businessId,
      taskId,
      simulated: true,
      ...extra,
    });
}
function getTask(s: State, p: any, c: Context) {
  const t = s.tasks.find((t) => t.id === p.taskId);
  requireValue(t, "任务不存在");
  const b = edit(s, t.businessId, c);
  return { t, b };
}
function taskFields(s: State, p: any) {
  return {
    title: txt(p.title, 200, "任务标题", true),
    description: txt(p.description, 4000, "任务描述"),
    owners: people(s, p.owners, true),
    followers: people(s, p.followers),
    stage: txt(p.stage, 50, "关联阶段"),
    due: date(p.due),
    files: files(s, p.files, 2),
  };
}
function addTask(
  s: State,
  c: Context,
  b: Business,
  p: any,
  followupId?: string,
) {
  const f = taskFields(s, p);
  requireValue(
    !f.stage || [...PROJECT_STAGES, ...OPPORTUNITY_STAGES].includes(f.stage),
    "关联阶段无效",
  );
  const t: Task = {
    id: c.id(),
    businessId: b.id,
    ...f,
    status: "待处理",
    createdAt: c.now,
    updatedAt: c.now,
    subtasks: [],
    comments: [],
    history: [],
    followupId,
  };
  s.tasks.unshift(t);
  notify(s, c, t.owners, "新任务：" + t.title, t.description, b.id, t.id);
  record(s, c, "创建任务", t.title, b.id);
  return t;
}
function historyTask(
  s: State,
  t: Task,
  c: Context,
  action: string,
  detail: string,
) {
  t.updatedAt = c.now;
  t.history.unshift(record(s, c, action, detail, t.businessId));
}
function commonFields(s: State, b: Business, p: any, c: Context) {
  const before = clone(b);
  const changed: any = {};
  for (const key of [
    "name",
    "customer",
    "crmId",
    "description",
    "clarification",
    "requirementUrl",
    "ownerId",
    "salesId",
    "presalesId",
    "developerId",
    "grade",
    "deadline",
    "target",
    "budget",
    "unit",
    "startDate",
    "dataTypes",
  ])
    if (key in p) changed[key] = p[key];
  for (const k of ["description", "clarification"])
    if (changed[k] != null)
      changed[k] = txt(
        changed[k],
        4000,
        k === "description" ? "需求描述" : "需求澄清",
        true,
      );
  if (changed.name != null) changed.name = txt(changed.name, 200, "名称", true);
  if (changed.customer != null)
    changed.customer = txt(changed.customer, 200, "客户", true);
  for (const k of ["ownerId", "presalesId"])
    if (k in changed) people(s, [changed[k]], true);
  for (const k of ["salesId", "developerId"])
    if (changed[k]) people(s, [changed[k]]);
  if (changed.requirementUrl)
    requireValue(
      /^https?:\/\//.test(changed.requirementUrl),
      "需求文档须为http(s)地址",
    );
  if (changed.grade)
    requireValue(["A", "B", "UNRATED"].includes(changed.grade), "评级无效");
  if (changed.dataTypes)
    requireValue(
      changed.dataTypes.length &&
        changed.dataTypes.every((x: string) => DATA_TYPES.includes(x)),
      "请选择有效数据类型",
    );
  if (changed.deadline != null) date(changed.deadline);
  if (changed.startDate != null) date(changed.startDate);
  if (changed.target != null)
    requireValue(
      Number.isInteger(Number(changed.target)) && Number(changed.target) > 0,
      "交付量必须为正整数",
    );
  if (changed.budget != null)
    requireValue(
      Number.isFinite(Number(changed.budget)) &&
        Number(changed.budget) >= 0 &&
        Number.isInteger(Number(changed.budget)),
      "预算须为非负整数分",
    );
  if (b.target > 0 && changed.unit != null && changed.unit !== b.unit)
    requireValue(false, "已设置交付单位，不可变更");
  if (
    b.kind === "project" &&
    ["target", "deadline", "budget"].some(
      (k) => k in changed && String(changed[k]) !== String((b as any)[k]),
    )
  )
    requireValue(
      txt(p.reason, 500, "变更原因").length >= 5,
      "交付量、截止时间或预算变更需填写至少5字原因",
    );
  if (b.kind === "opportunity")
    requireValue(
      !s.businesses.some((x) => x.kind === "project" && x.pid === b.pid),
      "已立项商机的公共字段不可修改",
    );
  const common = { ...b.common, ...p.common };
  for (const k of ["productionPlan", "projectManagementDoc"])
    if (p.common?.[k])
      requireValue(
        String(common[k]).trim().length > 10 && !/^(.)\1+$/.test(common[k]),
        "生产方案和项目管理文档须超过10字且不能重复填充",
      );
  if (common.formalDeliveryStorage)
    requireValue(
      /^tos:\/\/tc[^/]*\/.+/.test(common.formalDeliveryStorage),
      "正式交付存储地址须为tos://tc…/路径",
    );
  if (changed.target != null) changed.target = Number(changed.target);
  if (changed.budget != null) changed.budget = Number(changed.budget);
  Object.assign(b, changed, { common });
  record(s, c, "公共字段变更", p.reason || "更新业务信息", b.id, {
    before,
    after: clone(b),
    patch: clone(changed),
  });
  return b;
}
function baseProject(s: State, o: Business, c: Context, values: any = {}) {
  const b: Business = {
    ...clone(o),
    name: txt(values.projectName || o.name, 200, "项目名称", true),
    ownerId: values.ownerId || o.ownerId,
    presalesId: values.presalesId || o.presalesId,
    salesId: values.salesId ?? o.salesId,
    developerId: values.developerId ?? o.developerId,
    id: c.id(),
    kind: "project",
    stage: "ESTABLISHED",
    completed: false,
    version: 1,
    createdAt: c.now,
    updatedAt: c.now,
    history: [],
    common: {
      ...clone(o.common),
      sourceOpportunityId: o.id,
      projectInitiationCode:
        values.projectInitiationCode || o.common.projectInitiationCode || "",
      suppliers: values.suppliers || o.common.suppliers || [],
    },
  };
  people(s, [b.ownerId, b.presalesId], true);
  s.businesses.push(b);
  o.common.linkedProjectId = b.id;
  o.completed = true;
  record(s, c, "发起项目", "商机已转为项目", o.id, { projectId: b.id });
  record(s, c, "项目立项", "继承商机公共信息", b.id);
  return b;
}
const NEXT: Record<string, string> = {
  DEMO_DELIVERY: "DEMO_FEEDBACK",
  DEMO_FEEDBACK: "INITIATE_PROJECT",
  ESTABLISHED: "FORMAL_DELIVERY",
  INITIATE_CLOSE: "CLOSE",
  CLOSE: "CLOSED",
};
export function seedProcess(s: State) {
  s.settings.processColumns ??= {};
  s.settings.crmSyncedAt ??= "";
}
export function handleProcess(s: State, cmd: Command, c: Context): any {
  const p = cmd.payload || {};
  seedProcess(s);
  if (cmd.type === "process.columns") {
    const allowed = [
      "name",
      "customer",
      "stage",
      "owner",
      "presales",
      "types",
      "target",
      "deadline",
      "budget",
      "cost",
      "progress",
      "risk",
      "updatedAt",
      "actions",
      "pid",
      "crm",
      "linked",
      "crmStage",
      "demoStatus",
      "grade",
      "forecast",
      "sales",
      "createdAt",
      "deliveryMethod",
      "initiation",
    ];
    requireValue(
      ["project", "opportunity"].includes(p.kind) &&
        Array.isArray(p.columns) &&
        p.columns.includes("name") &&
        new Set(p.columns).size === p.columns.length &&
        p.columns.every((k: string) => allowed.includes(k)),
      "列设置无效",
    );
    s.settings.processColumns[c.actor.id + ":" + p.kind] = p.columns;
    return { saved: true };
  }
  if (cmd.type === "process.sync") {
    requireValue(
      c.actor.role === "pm" || c.actor.role === "approver",
      "当前身份不能同步",
    );
    s.settings.crmSyncedAt = c.now;
    record(s, c, "模拟CRM同步", "本地虚构数据时间已更新");
    return { simulated: true };
  }
  if (cmd.type === "process.create") {
    requireValue(
      c.actor.role === "pm" || c.actor.role === "approver",
      "当前身份不能创建商机",
    );
    const ownerId = p.ownerId || c.actor.id;
    people(s, [ownerId], true);
    requireValue(
      c.actor.role !== "pm" || ownerId === c.actor.id,
      "只能为本人创建业务",
    );
    const b: Business = {
      id: c.id(),
      pid: Math.max(10000, ...s.businesses.map((x) => x.pid)) + 1,
      kind: "opportunity",
      name: txt(p.name, 200, "商机名称", true),
      customer: txt(p.customer, 200, "客户名称", true),
      crmId: txt(p.crmId || "LOCAL-" + c.id(), 100, "CRM编号"),
      stage: "DEMO_DELIVERY",
      completed: false,
      ownerId,
      salesId: p.salesId || "",
      presalesId: p.presalesId,
      developerId: p.developerId || "",
      dataTypes: p.dataTypes || [],
      grade: p.grade || "UNRATED",
      description: txt(p.description, 4000, "需求描述", true),
      clarification: txt(p.clarification, 4000, "需求澄清", true),
      requirementUrl: p.requirementUrl,
      target: Number(p.target) || Number(p.demoScale),
      unit: p.unit || "条",
      deadline: date(p.deadline, true),
      budget: Number(p.budget) || 0,
      startDate: c.now.slice(0, 10),
      createdAt: c.now,
      updatedAt: c.now,
      version: 1,
      history: [],
      common: {
        nature: p.nature || "需求承接",
        demoScale: Number(p.demoScale || p.target),
        demoDeadline: p.deadline,
        formalDeadline: p.formalDeadline || "",
        selfCreated: true,
        demoStorage: p.demoStorage || "",
      },
    };
    people(s, [b.presalesId], true);
    requireValue(
      /^https?:\/\//.test(b.requirementUrl),
      "需求文档须为http(s)地址",
    );
    requireValue(
      b.dataTypes.length && b.dataTypes.every((x) => DATA_TYPES.includes(x)),
      "请选择数据类型",
    );
    requireValue(b.target > 0, "Demo量级须大于0");
    s.businesses.unshift(b);
    record(s, c, "创建商机", b.name, b.id);
    return { businessId: b.id };
  }
  if (cmd.type === "process.update") {
    const b = edit(s, p.businessId, c);
    checkVersion(b, p);
    return commonFields(s, b, p, c);
  }
  if (cmd.type === "process.draft") {
    edit(s, p.businessId, c);
    const key = draftKey(c.actor.id, p.businessId, p.action);
    if (p.clear) delete s.drafts[key];
    else s.drafts[key] = { values: clone(p.values), savedAt: c.now };
    return { saved: true };
  }
  // The platform path records human declarations only. Production source ledgers
  // remain exclusively owned by production.* commands and their validation.
  if (cmd.type === "process.platformUpdate") {
    // Information corrections remain available after closure; this command never
    // accepts stage/completed/owner fields and cannot reopen a terminal flow.
    requireValue(
      c.actor.role === "pm" || c.actor.role === "approver",
      "当前身份不能修改业务信息",
    );
    const b = s.businesses.find((x) => x.id === p.businessId);
    requireValue(b, "业务不存在");
    requireValue(
      c.actor.role !== "pm" || b.ownerId === c.actor.id,
      "只能修改本人负责的业务",
    );
    checkVersion(b, p);
    const before = clone(b);
    for (const key of [
      "name",
      "customer",
      "description",
      "clarification",
      "requirementUrl",
    ])
      if (key in p)
        (b as any)[key] = txt(
          p[key],
          key === "requirementUrl" ? 2000 : 4000,
          key,
          ["name", "customer", "description", "clarification"].includes(key),
        );
    if (p.requirementUrl)
      requireValue(
        /^https?:\/\//.test(p.requirementUrl),
        "需求文档须为http(s)地址",
      );
    if (p.dataTypes) {
      requireValue(
        Array.isArray(p.dataTypes) &&
          p.dataTypes.every((x: string) => DATA_TYPES.includes(x)),
        "数据类型无效",
      );
      b.dataTypes = p.dataTypes;
    }
    if (p.common) {
      const allowed = [
        "nature",
        "formalDeadline",
        "formalScale",
        "deliveryMethod",
        "productionPlan",
        "projectManagementDoc",
        "projectInitiationCode",
      ];
      for (const key of allowed)
        if (key in p.common) b.common[key] = txt(p.common[key], 4000, key);
      if ("formalDeadline" in p.common) {
        date(p.common.formalDeadline);
        if (b.kind === "project") b.deadline = p.common.formalDeadline;
      }
      if ("formalScale" in p.common && /^\d+$/.test(p.common.formalScale))
        b.target = Number(p.common.formalScale);
    }
    record(s, c, "公共信息变更", "更新平台业务公共信息", b.id, {
      before,
      after: clone(b),
    });
    return { businessId: b.id };
  }
  if (cmd.type === "process.platformTransition") {
    const b = s.businesses.find((x) => x.id === p.businessId);
    requireValue(b, "业务不存在");
    checkVersion(b, p);
    const action = p.action || "SUBMIT";
    const from = b.stage;
    if (action === "ROLLBACK") {
      requireValue(c.actor.role === "approver", "仅业务授权角色可回退");
      requireValue(txt(p.reason, 500, "回退原因", true), "请填写回退原因");
      const stages = b.kind === "project" ? PROJECT_STAGES : OPPORTUNITY_STAGES;
      requireValue(
        stages.includes(p.target) &&
          p.target !== from &&
          (b.history.some(
            (h) => h.snapshot?.from === p.target || h.snapshot?.to === p.target,
          ) ||
            stages.indexOf(p.target) < stages.indexOf(from)),
        "只能回退至已经过的节点",
      );
      b.stage = p.target;
      b.completed = false;
      record(s, c, "流程回退", p.reason, b.id, {
        from,
        to: b.stage,
        source: "platform",
      });
      return { businessId: b.id };
    }
    edit(s, b.id, c);
    requireValue(
      ["SUBMIT", "SUSPEND", "RESUME", "LOSE"].includes(action),
      "流程操作无效",
    );
    const v = clone(p.values || {});
    v.files = files(s, v.files);
    const addr = Array.isArray(v.addresses) ? v.addresses : [];
    requireValue(addr.length <= 10, "最多10个存储地址");
    v.addresses = addr
      .filter((x: any) => String(x.url || "").trim())
      .map((x: any) => {
        requireValue(
          /^(tos:\/\/[^/]+\/.+|https?:\/\/\S+)$/.test(x.url),
          "存储地址须为TOS或http(s)地址",
        );
        return { url: x.url, note: txt(x.note, 100, "地址备注") };
      });
    const person = (key: string, required = false) => {
      if (required)
        requireValue(
          v[key],
          "请选择" +
            (
              {
                ownerId: "项目经理",
                presalesId: "售前",
                salesId: "销售",
              } as any
            )[key],
        );
      if (v[key]) people(s, [v[key]]);
    };
    for (const key of [
      "ownerId",
      "presalesId",
      "salesId",
      "developerId",
      "resourceId",
    ])
      person(key);
    const attachment = (label: string) =>
      requireValue(v.files.length || v.addresses.length, "请添加" + label);
    let to: string | undefined;
    if (action === "SUSPEND") {
      requireValue(
        b.kind === "opportunity" && from !== "SUSPENDED",
        "当前业务不能挂起",
      );
      txt(v.reason, 4000, "挂起原因", true);
      date(v.resumeDate, true);
      b.previousStage = from;
      to = "SUSPENDED";
    } else if (action === "RESUME") {
      requireValue(from === "SUSPENDED", "业务未挂起");
      to = b.previousStage || "DEMO_DELIVERY";
      delete b.previousStage;
    } else if (action === "LOSE") {
      person("ownerId", true);
      person("presalesId", true);
      if (b.kind === "project") {
        // The platform's project termination form requires the review document;
        // its attachment section is optional. Opportunity loss uses CRM reasons.
        txt(v.reviewDoc, 4000, "项目复盘文档", true);
      } else {
        requireValue(
          ["主动丢单", "被动丢单"].includes(v.lossType),
          "请选择主动/被动丢单",
        );
        txt(v.lossReason, 200, "输单原因", true);
        txt(v.lossSubReason, 200, "输单二级归因", true);
        txt(v.reason, 4000, "输单描述", true);
      }
      to = "LOST";
    } else {
      requireValue(from !== "SUSPENDED", "请先恢复挂起流程");
      requireValue(
        !businessBlockers(s, b).length,
        "当前阶段有未解除的 # 任务阻塞",
      );
      if (from === "DEMO_DELIVERY") {
        person("presalesId", true);
        person("salesId", true);
        date(v.demoDeadline, true);
        to = "DEMO_FEEDBACK";
      } else if (from === "DEMO_FEEDBACK") {
        requireValue(["pass", "fail"].includes(v.result), "请选择Demo反馈");
        txt(v.feedback, 4000, "Demo客户反馈", true);
        person("ownerId", true);
        person("presalesId", true);
        to = v.result === "pass" ? "INITIATE_PROJECT" : "DEMO_DELIVERY";
      } else if (from === "INITIATE_PROJECT") {
        txt(v.projectInitiationCode, 200, "项目立项编号", true);
        txt(v.projectName, 200, "项目名称", true);
        person("ownerId", true);
        requireValue(
          b.dataTypes.length &&
            b.common.nature &&
            b.requirementUrl &&
            (b.common.formalDeadline || b.deadline) &&
            (b.common.formalScale || b.target) &&
            b.common.deliveryMethod,
          "请先填写完整商机公共信息",
        );
        requireValue(
          !s.businesses.some((x) => x.kind === "project" && x.pid === b.pid),
          "该商机已存在项目",
        );
        const project = baseProject(s, b, c, v);
        project.deadline = b.common.formalDeadline || b.deadline;
        project.common.platformFlowForms = {};
        record(s, c, "平台发起项目", v.projectName, b.id, {
          from,
          to: "ESTABLISHED",
          values: v,
          source: "platform",
        });
        delete s.drafts[draftKey(c.actor.id, b.id, "PLATFORM_" + from)];
        return { businessId: project.id };
      } else if (from === "ESTABLISHED") {
        person("ownerId", true);
        person("presalesId", true);
        to = "FORMAL_DELIVERY";
      } else if (["FORMAL_DELIVERY", "SUPPLEMENT_DELIVERY"].includes(from)) {
        person("ownerId", true);
        person("presalesId", true);
        attachment(
          from === "FORMAL_DELIVERY" ? "正式交付存储地址" : "补交付存储地址",
        );
        to = "CUSTOMER_ACCEPTANCE";
      } else if (from === "CUSTOMER_ACCEPTANCE") {
        person("ownerId", true);
        person("presalesId", true);
        requireValue(["pass", "fail"].includes(v.result), "请选择客户验收结果");
        txt(v.feedback, 4000, "客户验收反馈", true);
        attachment("客户验收附件");
        to = v.result === "pass" ? "INITIATE_CLOSE" : "SUPPLEMENT_DELIVERY";
      } else if (from === "INITIATE_CLOSE") {
        person("ownerId", true);
        person("presalesId", true);
        txt(v.feedback, 4000, "客户验收反馈", true);
        txt(v.costReview, 4000, "执行成本盘点", true);
        attachment("附件");
        to = "CLOSE";
      } else if (from === "CLOSE") {
        person("ownerId", true);
        person("presalesId", true);
        txt(v.reviewDoc, 4000, "项目复盘文档", true);
        to = "CLOSED";
      }
      requireValue(to, "当前阶段无可提交的流程");
    }
    b.stage = to!;
    b.completed = ["CLOSED", "LOST"].includes(b.stage);
    b.common.platformFlowForms ??= {};
    const snapshot = {
      ...v,
      submittedAt: c.now,
      submittedBy: c.actor.id,
      from,
      to,
    };
    const key = action === "SUBMIT" ? from : action;
    b.common.platformFlowForms[key] ??= [];
    b.common.platformFlowForms[key].push(snapshot);
    if (
      ["FORMAL_DELIVERY", "SUPPLEMENT_DELIVERY"].includes(from) &&
      action === "SUBMIT"
    )
      b.common.formalDeliveryStorage = v.addresses
        .map((x: any) => x.url)
        .join("\n");
    for (const key of ["ownerId", "presalesId", "salesId", "developerId"])
      if (v[key]) (b as any)[key] = v[key];
    record(
      s,
      c,
      action === "SUBMIT"
        ? "平台流程提交"
        : action === "SUSPEND"
          ? "挂起流程"
          : action === "RESUME"
            ? "恢复流程"
            : "终止项目",
      v.reason || stageNames[from] + " → " + stageNames[to!],
      b.id,
      { from, to, values: v, source: "platform" },
    );
    delete s.drafts[
      draftKey(
        c.actor.id,
        b.id,
        "PLATFORM_" + (action === "SUBMIT" ? from : action),
      )
    ];
    notify(
      s,
      c,
      people(s, v.notifyUsers || []),
      "业务流程更新",
      b.name + "：" + stageNames[to!],
      b.id,
    );
    return { businessId: b.id };
  }
  if (cmd.type === "process.transition") {
    let b = s.businesses.find((x) => x.id === p.businessId);
    requireValue(b, "业务不存在");
    const action = p.action || "ADVANCE";
    requireValue(
      [
        "ADVANCE",
        "CREATE_PROJECT",
        "SUSPEND",
        "RESUME",
        "LOSE",
        "ROLLBACK",
        "SUBMIT_DEMO_DELIVERY",
        "SUBMIT_DEMO_FEEDBACK",
        "START_FORMAL_DELIVERY",
        "SUBMIT_INITIATE_CLOSE",
        "SUBMIT_CLOSE",
      ].includes(action),
      "当前节点不允许该操作",
    );
    checkVersion(b, p);
    if (action === "ROLLBACK") {
      requireValue(c.actor.role === "approver", "仅业务授权角色可回滚");
      requireValue(
        txt(p.reason, 500, "回滚原因").length >= 5,
        "回滚原因至少5字",
      );
      const stages = b.kind === "project" ? PROJECT_STAGES : OPPORTUNITY_STAGES;
      requireValue(
        stages.includes(p.target) && p.target !== b.stage,
        "回滚目标无效",
      );
      requireValue(
        b.history.some(
          (h) => h.snapshot?.from === p.target || h.snapshot?.to === p.target,
        ) || stages.indexOf(p.target) < stages.indexOf(b.stage),
        "只能回滚至已经过的阶段",
      );
      const from = b.stage;
      b.stage = p.target;
      b.completed = false;
      record(s, c, "流程回滚", p.reason, b.id, { from, to: b.stage });
      return { businessId: b.id };
    }
    b = edit(s, b.id, c);
    if (action === "SUSPEND") {
      requireValue(
        txt(p.reason, 500, "挂起原因").length >= 5,
        "挂起原因至少5字",
      );
      requireValue(b.stage !== "SUSPENDED", "已挂起");
      b.previousStage = b.stage;
      b.stage = "SUSPENDED";
    } else if (action === "RESUME") {
      requireValue(b.stage === "SUSPENDED", "业务未挂起");
      b.stage =
        b.previousStage ||
        (b.kind === "project" ? "ESTABLISHED" : "DEMO_DELIVERY");
      delete b.previousStage;
    } else if (action === "LOSE") {
      requireValue(
        txt(p.reason, 500, "终止原因").length >= 5,
        "终止原因至少5字",
      );
      b.stage = "LOST";
      b.completed = true;
    } else {
      requireValue(b.stage !== "SUSPENDED", "请先恢复挂起业务");
      requireValue(
        businessBlockers(s, b).length === 0,
        "当前阶段有未解除的 # 任务阻塞",
      );
      const values = clone(p.values || {});
      values.files = files(s, values.files);
      values.addresses = addresses(values.addresses);
      if (["ESTABLISHED", "INITIATE_CLOSE", "CLOSE"].includes(b.stage)) {
        requireValue(
          b.target > 0 && !!b.unit && !!b.deadline,
          "请先补齐正式交付量、单位和截止日期",
        );
        if (b.stage === "ESTABLISHED") {
          for (const key of ["productionPlan", "projectManagementDoc"])
            requireValue(
              String(b.common[key] || "").trim().length > 10,
              "请先完善生产方案和项目管理文档",
            );
          requireValue(
            /^tos:\/\/tc[^/]*\/.+/.test(b.common.formalDeliveryStorage || ""),
            "请先补齐正式交付存储地址",
          );
        } else
          requireValue(
            values.files.length || values.addresses.length,
            "结项阶段至少需要一个附件或TOS地址",
          );
      }
      if (b.stage === "DEMO_DELIVERY") {
        requireValue(
          values.files?.length ||
            values.addresses?.length ||
            values.deliveryUrl,
          "请提供Demo交付附件或地址",
        );
        values.files = files(s, values.files);
        values.addresses = addresses(values.addresses);
      }
      if (b.stage === "DEMO_FEEDBACK") {
        requireValue(
          values.result === "pass" || values.result === "fail",
          "请选择Demo反馈结果",
        );
        requireValue(
          txt(values.feedback, 4000, "反馈说明", true),
          "请填写反馈",
        );
        if (values.result === "fail") {
          b.common.flowForms ??= {};
          b.common.flowForms.DEMO_FEEDBACK = {
            ...clone(values),
            submittedAt: c.now,
            submittedBy: c.actor.id,
          };
          b.stage = "LOST";
          b.completed = true;
          record(s, c, "Demo反馈未通过", values.feedback, b.id, {
            from: "DEMO_FEEDBACK",
            to: "LOST",
            values: clone(values),
          });
          delete s.drafts[draftKey(c.actor.id, b.id, action)];
          return { businessId: b.id };
        }
      }
      if (action === "CREATE_PROJECT" || b.stage === "INITIATE_PROJECT") {
        requireValue(b.stage === "INITIATE_PROJECT", "尚未到发起项目阶段");
        requireValue(
          !s.businesses.some((x) => x.kind === "project" && x.pid === b!.pid),
          "该商机已存在项目",
        );
        const project = baseProject(s, b, c, values);
        delete s.drafts[draftKey(c.actor.id, b.id, action)];
        return { businessId: project.id };
      }
      if (!b.completed) {
        requireValue(
          ![
            "FORMAL_DELIVERY",
            "SUPPLEMENT_DELIVERY",
            "CUSTOMER_ACCEPTANCE",
          ].includes(b.stage),
          "请使用生产区的交付或验收操作",
        );
        const next = NEXT[b.stage];
        requireValue(next, "当前阶段无可提交的流程");
        const from = b.stage;
        b.stage = next;
        b.completed = next === "CLOSED";
        b.common.flowForms ??= {};
        b.common.flowForms[from] = {
          ...clone(values),
          submittedAt: c.now,
          submittedBy: c.actor.id,
        };
        record(
          s,
          c,
          "流程提交",
          stageNames[from] + " → " + stageNames[next],
          b.id,
          { from, to: next, values: clone(values) },
        );
        delete s.drafts[draftKey(c.actor.id, b.id, action)];
        notify(
          s,
          c,
          people(
            s,
            values.notifyUsers ?? [b.ownerId, b.presalesId].filter(Boolean),
          ),
          "业务阶段已更新",
          b.name + "：" + stageNames[next],
          b.id,
        );
        return { businessId: b.id };
      }
    }
    record(
      s,
      c,
      action === "SUSPEND"
        ? "挂起业务"
        : action === "RESUME"
          ? "恢复业务"
          : "终止业务",
      p.reason || stageNames[b.stage],
      b.id,
      { to: b.stage },
    );
    return { businessId: b.id };
  }
  if (cmd.type === "task.create") {
    const b = edit(s, p.businessId, c);
    return addTask(s, c, b, p);
  }
  if (cmd.type === "task.update") {
    const { t } = getTask(s, p, c);
    const before = t.status;
    if (p.status) {
      requireValue(
        ["待处理", "进行中", "已完成"].includes(p.status),
        "状态无效",
      );
      t.status = p.status;
    }
    if (p.title != null) Object.assign(t, taskFields(s, { ...t, ...p }));
    historyTask(s, t, c, "更新任务", t.title);
    if (before !== t.status)
      notify(
        s,
        c,
        t.followers,
        "任务" + (t.status === "已完成" ? "已完成" : "已重新打开"),
        t.title,
        t.businessId,
        t.id,
      );
    return t;
  }
  if (cmd.type === "task.subtask") {
    const { t } = getTask(s, p, c);
    if (p.operation === "reorder") {
      requireValue(
        Array.isArray(p.ids) &&
          p.ids.length === t.subtasks.length &&
          new Set(p.ids).size === t.subtasks.length &&
          p.ids.every((id: string) => t.subtasks.some((x) => x.id === id)),
        "子任务排序无效",
      );
      t.subtasks = p.ids.map((id: string) =>
        t.subtasks.find((x) => x.id === id),
      );
    } else if (p.operation === "restore") {
      t.subtasks.sort(
        (a, b) =>
          (a.createdOrder ?? Date.parse(a.createdAt)) -
          (b.createdOrder ?? Date.parse(b.createdAt)),
      );
    } else if (p.operation === "delete") {
      requireValue(
        t.subtasks.some((x) => x.id === p.id),
        "子任务不存在",
      );
      t.subtasks = t.subtasks.filter((x) => x.id !== p.id);
    } else {
      let sub = t.subtasks.find((x) => x.id === p.id);
      const next = {
        content: txt(p.content ?? sub?.content, 4000, "子任务", true),
        ownerId: p.ownerId ?? sub?.ownerId ?? "",
        due: date(p.due ?? sub?.due),
        done: p.done ?? sub?.done ?? false,
        files: files(s, p.files ?? sub?.files, 2),
      };
      if (next.ownerId) people(s, [next.ownerId]);
      if (sub) Object.assign(sub, next);
      else {
        sub = {
          id: c.id(),
          createdAt: c.now,
          createdOrder:
            Math.max(-1, ...t.subtasks.map((x) => x.createdOrder ?? 0)) + 1,
          ...next,
        };
        t.subtasks.push(sub);
        if (sub.ownerId)
          notify(
            s,
            c,
            [sub.ownerId],
            "子任务分配",
            sub.content,
            t.businessId,
            t.id,
            { subtaskId: sub.id },
          );
      }
    }
    historyTask(s, t, c, "更新子任务", t.title);
    return t;
  }
  if (cmd.type === "task.comment") {
    const { t } = getTask(s, p, c);
    let row = t.comments.find((x) => x.id === p.id);
    if (row) {
      requireValue(row.actor === c.actor.id, "只能编辑或删除自己的评论");
      if (p.operation === "delete") {
        row.deleted = true;
        s.notifications = s.notifications.filter(
          (n) => !(n.taskId === t.id && (n as any).commentId === row.id),
        );
        historyTask(s, t, c, "删除任务评论", t.title);
        return t;
      }
    }
    const text = txt(p.text, 4000, "评论");
    const fs = files(s, p.files, 2);
    requireValue(text || fs.length, "评论或附件至少一项");
    const mentions = mentionsIn(text, s.users);
    const blockers = mentionsIn(text, s.users, "#");
    if (row) {
      const changed = JSON.stringify(row.blockers) !== JSON.stringify(blockers);
      Object.assign(row, {
        text,
        files: fs,
        mentions,
        blockers,
        updatedAt: c.now,
      });
      if (changed) row.resolvedUsers = [];
    } else {
      row = {
        id: c.id(),
        text,
        files: fs,
        mentions,
        blockers,
        resolvedUsers: [],
        actor: c.actor.id,
        createdAt: c.now,
      };
      t.comments.push(row);
    }
    for (const comment of t.comments.filter(
      (x) =>
        !x.deleted &&
        x.actor !== c.actor.id &&
        x.blockers?.includes(c.actor.id),
    )) {
      comment.resolvedUsers ??= [];
      if (!comment.resolvedUsers.includes(c.actor.id))
        comment.resolvedUsers.push(c.actor.id);
    }
    s.notifications = s.notifications.filter(
      (n) => (n as any).commentId !== row.id,
    );
    notify(
      s,
      c,
      [...mentions, ...blockers],
      "任务评论：" + t.title,
      text,
      t.businessId,
      t.id,
      { commentId: row.id },
    );
    historyTask(s, t, c, "任务评论", text);
    return t;
  }
  if (cmd.type === "task.release") {
    const { t } = getTask(s, p, c);
    requireValue(c.actor.role === "approver", "仅业务授权角色可强制解除阻塞");
    requireValue(txt(p.reason, 500, "解除原因").length >= 5, "解除原因至少5字");
    const row = t.comments.find((x) => x.id === p.commentId && !x.deleted);
    requireValue(row?.blockers?.includes(p.userId), "未找到阻塞");
    row.resolvedUsers = [...new Set([...(row.resolvedUsers || []), p.userId])];
    row.releases ??= [];
    row.releases.push({
      actor: c.actor.id,
      reason: p.reason,
      at: c.now,
      userId: p.userId,
    });
    historyTask(s, t, c, "解除任务阻塞", p.reason);
    return t;
  }
  if (cmd.type === "task.read") {
    for (const n of s.notifications.filter(
      (n) =>
        n.userId === c.actor.id &&
        (p.all || n.id === p.id || (p.taskId && n.taskId === p.taskId)),
    ))
      n.read = true;
    return { saved: true };
  }
  if (cmd.type.startsWith("followup.")) {
    const existing = s.followups.find((f) => f.id === p.id);
    const b = edit(s, existing?.businessId || p.businessId, c);
    if (existing)
      requireValue(
        existing.actor === c.actor.id ||
          (cmd.type === "followup.delete" && c.actor.role === "approver"),
        "只能修改自己的跟进记录",
      );
    if (cmd.type === "followup.delete") {
      requireValue(existing && !existing.deleted, "跟进不存在");
      requireValue(
        txt(p.reason, 500, "删除原因").length >= 5,
        "删除原因至少5字",
      );
      existing.deleted = true;
      record(s, c, "删除跟进", p.reason, b.id, clone(existing));
      return existing;
    }
    const text = txt(p.text, 2000, "跟进内容", !p.platform);
    if (p.deliveryRisk != null) {
      requireValue(
        b.kind === "project" &&
          ["无风险", "低风险", "中风险", "高风险"].includes(p.deliveryRisk),
        "风险等级无效",
      );
      if (p.deliveryRisk !== "无风险")
        txt(p.riskReason, 2000, "风险原因", true);
    }
    const mentions = people(s, [
      ...new Set([...(p.mentions || []), ...mentionsIn(text, s.users)]),
    ]);
    const due = date(p.due, mentions.length > 0);
    const fs = files(s, p.files);
    const addr = addresses(p.addresses);
    const f = existing || {
      id: c.id(),
      businessId: b.id,
      actor: c.actor.id,
      createdAt: c.now,
    };
    Object.assign(f, {
      text,
      mentions,
      due,
      files: fs,
      addresses: addr,
      updatedAt: c.now,
    });
    if (p.deliveryRisk != null) {
      Object.assign(f, {
        riskBefore: b.common.deliveryRisk || "未记录",
        riskAfter: p.deliveryRisk,
        riskReason: p.riskReason || "",
      });
      b.common.deliveryRisk = p.deliveryRisk;
      b.common.deliveryRiskReason = p.riskReason || "";
    }
    (f as any).stage ??= b.stage;
    if (!existing) s.followups.unshift(f as any);
    if (mentions.length) {
      let task = s.tasks.find((t) => t.id === (f as any).taskId);
      if (task) {
        Object.assign(task, {
          title: "跟进：" + text.slice(0, 80),
          description: text,
          owners: mentions,
          due,
          updatedAt: c.now,
        });
        historyTask(s, task, c, "跟进同步任务", text);
      } else {
        task = addTask(
          s,
          c,
          b,
          {
            title: "跟进：" + text.slice(0, 80),
            description: text,
            owners: mentions,
            followers: [c.actor.id],
            due,
            stage: b.stage,
            files: [],
          },
          f.id,
        );
        (f as any).taskId = task.id;
      }
      notify(s, c, mentions, "跟进提醒", text, b.id, task.id);
    }
    record(s, c, existing ? "编辑跟进" : "新增跟进", text, b.id);
    return f;
  }
  if (cmd.type === "import.preview") return previewImport(s, p, c);
  if (cmd.type === "import.apply") return applyImport(s, p, c);
  return undefined;
}
const aliases: Record<string, string> = {
  "Demo交付（L1-L2）": "DEMO_DELIVERY",
  "Demo反馈（L3）": "DEMO_FEEDBACK",
  "发起项目（L4-L5）": "INITIATE_PROJECT",
  立项: "ESTABLISHED",
  正式交付中: "FORMAL_DELIVERY",
  结项: "CLOSED",
  终止项目: "LOST",
  Demo交付: "DEMO_DELIVERY",
  Demo反馈: "DEMO_FEEDBACK",
  发起项目: "INITIATE_PROJECT",
  已立项: "ESTABLISHED",
  正式交付: "FORMAL_DELIVERY",
  客户验收: "CUSTOMER_ACCEPTANCE",
  补交付: "SUPPLEMENT_DELIVERY",
  发起结项: "INITIATE_CLOSE",
  结项确认: "CLOSE",
  已结项: "CLOSED",
  挂起: "SUSPENDED",
  已挂起: "SUSPENDED",
  丢单: "LOST",
  已丢单: "LOST",
  终止: "LOST",
};
function fingerprint(b: Business) {
  return JSON.stringify({
    id: b.id,
    version: b.version,
    updatedAt: b.updatedAt,
    stage: b.stage,
  });
}
function hash(v: any) {
  let h = 2166136261;
  for (const c of JSON.stringify(v)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function previewImport(s: State, p: any, c: Context) {
  requireValue(
    c.actor.role === "approver" || c.actor.role === "pm",
    "当前身份不能导入",
  );
  const input = p.rows;
  requireValue(
    Array.isArray(input) && input.length <= 2000 && input.length > 0,
    "导入需1—2000行",
  );
  const headers = p.headers || Object.keys(input[0]);
  requireValue(
    headers.every((x: any) => typeof x === "string" && x.trim()),
    "表头不能为空",
  );
  requireValue(new Set(headers).size === headers.length, "表头不能重复");
  requireValue(
    headers.includes("销售易商机ID") && headers.includes("商机状态"),
    "缺少销售易商机ID或商机状态表头",
  );
  const seen = new Set<string>();
  const rows = input.map((row: any, i: number) => {
    const result: any = {
      row: i + 2,
      status: "ready",
      errors: [],
      warnings: [],
      changes: {},
      source: row,
    };
    const crmId = String(row["销售易商机ID"] || "").trim();
    if (!crmId || !/^BH\d{8,}$|^SJ-DEMO-\d+$|^MOCK-[\w-]+$/.test(crmId)) {
      result.status = "filtered";
      result.errors.push("CRM编号为空或格式无效");
      return result;
    }
    if (seen.has(crmId)) {
      result.status = "skipped";
      result.warnings.push("文件内重复编号");
      return result;
    }
    seen.add(crmId);
    result.inputHash = hash(row);
    if (
      s.imports.some((batch) =>
        batch.rows?.some(
          (old: any) =>
            old.status === "applied" &&
            old.inputHash === result.inputHash &&
            old.source?.["销售易商机ID"] === row["销售易商机ID"],
        ),
      )
    ) {
      result.status = "skipped";
      result.warnings.push("本行相同内容已导入，重复执行不新增");
      return result;
    }
    const matches = s.businesses.filter((b) => b.crmId === crmId);
    const stage =
      aliases[String(row["商机状态"]).trim()] || String(row["商机状态"]).trim();
    if (
      ![...PROJECT_STAGES, ...OPPORTUNITY_STAGES, "SUSPENDED", "LOST"].includes(
        stage,
      )
    )
      result.errors.push("商机状态无法识别");
    let b =
      matches.find((b) =>
        PROJECT_STAGES.includes(stage)
          ? b.kind === "project"
          : b.kind === "opportunity",
      ) ||
      matches.find((b) => b.kind === "opportunity") ||
      matches[0];
    if (!b) {
      result.errors.push("CRM编号未在本地模拟CRM中找到");
      result.status = "error";
      return result;
    }
    result.businessId = b.id;
    result.fingerprint = fingerprint(b);
    result.createProject =
      PROJECT_STAGES.includes(stage) && b.kind === "opportunity";
    if (c.actor.role === "pm" && b.ownerId !== c.actor.id)
      result.errors.push("非本人负责业务");
    if (b.completed || b.stage === "LOST")
      result.errors.push("终态业务不可覆盖");
    result.changes.stage = stage;
    const mapping: Record<string, string> = {
      "正式交付 DDL": "deadline",
      项目名称: "name",
      需求文档: "requirementUrl",
      正式交付截止时间: "deadline",
      正式交付量级: "target",
      单位: "unit",
      预算: "budget",
    };
    for (const [header, key] of Object.entries(mapping)) {
      const v = row[header];
      if (v != null && String(v).trim() !== "") {
        result.changes[key] = ["target", "budget"].includes(key)
          ? Number(v)
          : String(v).trim();
        if (key === "target") {
          const quantity = String(v)
            .replaceAll(",", "")
            .match(/^(\d+)\s*(.*)$/);
          if (quantity) {
            result.changes.target = Number(quantity[1]);
            if (quantity[2] && !row["单位"]) result.changes.unit = quantity[2];
          }
        }
        if (key === "deadline")
          result.changes[key] = String(v).replaceAll("/", "-").slice(0, 10);
        if (
          key === "target" &&
          (!Number.isInteger(result.changes.target) ||
            result.changes.target <= 0)
        )
          result.errors.push("正式交付量级须为正整数");
        if (key === "budget")
          result.changes.budget = Math.round(Number(v) * 100);
        if (key === "budget" && (!Number.isFinite(Number(v)) || Number(v) < 0))
          result.errors.push("预算无效");
        if (key === "requirementUrl" && !/^https?:\/\//.test(String(v)))
          result.errors.push("需求文档地址无效");
        if (
          key === "deadline" &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(result.changes[key]) ||
            isNaN(Date.parse(result.changes[key])) ||
            new Date(result.changes[key] + "T12:00:00Z")
              .toISOString()
              .slice(0, 10) !== result.changes[key])
        )
          result.errors.push("日期须为YYYY-MM-DD");
      }
    }
    result.changes.common = {};
    const cm: Record<string, string> = {
      立项编号: "projectInitiationCode",
      "Demo 交付 DDL": "demoDeadline",
      Demo交付截止时间: "demoDeadline",
      "Demo 交付截止时间": "demoDeadline",
      Demo需求量级: "demoScale",
      Demo客户反馈: "demoFeedback",
      "补交付 DDL": "supplementDeadline",
      补交付说明: "supplementDescription",
      补交付原因: "supplementReason",
      客户验收反馈: "customerAcceptanceFeedback",
      执行成本盘点: "executionCostReview",
      项目复盘文档: "projectReviewDoc",
      项目立项编号: "projectInitiationCode",
      生产方案: "productionPlan",
      项目管理文档: "projectManagementDoc",
      正式交付存储地址: "formalDeliveryStorage",
      "Demo DDL": "demoDeadline",
      Demo量级: "demoScale",
      Demo反馈: "demoFeedback",
      客户反馈: "customerFeedback",
      补交付截止时间: "supplementDeadline",
      补交付量级: "supplementTarget",
      执行成本核对: "executionCostReview",
      执行成本文档: "reviewDoc",
    };
    for (const [h, k] of Object.entries(cm))
      if (row[h] != null && String(row[h]).trim())
        result.changes.common[k] = String(row[h]).trim();
    for (const key of ["demoDeadline", "supplementDeadline"])
      if (result.changes.common[key]) {
        const v = String(result.changes.common[key])
          .replaceAll("/", "-")
          .slice(0, 10);
        try {
          date(v, true);
          result.changes.common[key] = v;
        } catch {
          result.errors.push("Demo或补交付截止日期无效");
        }
      }
    for (const field of [
      "项目立项编号",
      "需求文档",
      "生产方案",
      "项目管理文档",
      "正式交付存储地址",
    ])
      if (!row[field]) result.warnings.push(field + "未提供，保留现有值");
    for (const [h, k] of Object.entries({
      项目经理: "ownerId",
      售前: "presalesId",
      销售: "salesId",
      销售人员: "salesId",
      研发: "developerId",
    })) {
      if (row[h]) {
        const u = s.users.find((u) =>
          [u.id, u.name, u.account].includes(String(row[h]).trim()),
        );
        if (u) result.changes[k] = u.id;
        else result.warnings.push(h + "未匹配，保留原值");
      }
    }
    for (const k of ["productionPlan", "projectManagementDoc"])
      if (result.changes.common[k] && result.changes.common[k].length <= 10)
        result.errors.push("生产方案/项目管理文档至少11字");
    if (
      result.changes.common.formalDeliveryStorage &&
      !/^tos:\/\/tc[^/]*\/.+/.test(result.changes.common.formalDeliveryStorage)
    )
      result.errors.push("正式交付存储地址格式无效");
    if (result.errors.length) result.status = "error";
    result.before = {
      name: b.name,
      stage: b.stage,
      target: b.target,
      deadline: b.deadline,
    };
    return result;
  });
  const batch = {
    id: c.id(),
    actor: c.actor.id,
    createdAt: c.now,
    filename: txt(p.filename, 250, "文件名"),
    hash: hash(input),
    status: "preview",
    rows,
  };
  s.imports.unshift(batch);
  return batch;
}
function applyImport(s: State, p: any, c: Context) {
  requireValue(
    c.actor.role === "pm" || c.actor.role === "approver",
    "当前身份不能导入",
  );
  const batch = s.imports.find((x) => x.id === p.batchId);
  requireValue(batch, "预检记录不存在");
  requireValue(
    batch.actor === c.actor.id || c.actor.role === "approver",
    "只能应用本人预检",
  );
  if (batch.status === "applied") return { ...batch, idempotent: true };
  for (const row of batch.rows.filter((x: any) => x.status === "ready")) {
    const b = s.businesses.find((b) => b.id === row.businessId);
    if (!b || fingerprint(b) !== row.fingerprint) {
      row.status = "error";
      row.errors.push("预检后业务发生变化，请重新预检");
      continue;
    }
    const snapshot = {
      businesses: clone(s.businesses),
      audit: clone(s.audit),
      notifications: clone(s.notifications),
    };
    try {
      edit(s, b.id, c);
      let dest = b;
      if (row.createProject) {
        requireValue(
          !s.businesses.some((x) => x.kind === "project" && x.pid === b.pid),
          "项目已存在，请重新预检",
        );
        dest = baseProject(s, b, c);
      }
      const changes = clone(row.changes);
      const common = changes.common;
      delete changes.common;
      Object.assign(dest, changes);
      dest.completed = dest.stage === "CLOSED" || dest.stage === "LOST";
      dest.common = {
        ...dest.common,
        ...common,
        importedAt: c.now,
        importBatchId: batch.id,
      };
      record(
        s,
        c,
        "历史数据导入",
        "导入第" + row.row + "行 · 不触发流程通知",
        dest.id,
        { before: row.before, changes: row.changes },
      );
      row.status = "applied";
      row.resultBusinessId = dest.id;
    } catch (e) {
      Object.assign(s, snapshot);
      row.status = "error";
      row.errors.push((e as Error).message);
    }
  }
  batch.status = "applied";
  batch.appliedAt = c.now;
  record(s, c, "导入批次完成", batch.filename || batch.id, undefined, {
    batchId: batch.id,
    summary: batch.rows.reduce(
      (a: any, r: any) => ((a[r.status] = (a[r.status] || 0) + 1), a),
      {},
    ),
  });
  return batch;
}
