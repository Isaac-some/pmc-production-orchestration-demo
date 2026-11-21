/** F01–F15: authoritative local domain contracts; money is integer cents. */
export type Role = "pm" | "finance" | "approver" | "viewer";
export type EntityType = "opportunity" | "project";
export interface User {
  id: string;
  name: string;
  account: string;
  role: Role;
}
export interface Business {
  id: string;
  pid: number;
  kind: EntityType;
  name: string;
  customer: string;
  crmId: string;
  stage: string;
  previousStage?: string;
  completed: boolean;
  ownerId: string;
  salesId: string;
  presalesId: string;
  developerId?: string;
  dataTypes: string[];
  grade: string;
  description: string;
  clarification: string;
  requirementUrl: string;
  target: number;
  unit: string;
  deadline: string;
  budget: number;
  startDate: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  common: Record<string, any>;
  history: History[];
}
export interface History {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  snapshot?: any;
}
export interface FileRef {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  userId: string;
  title: string;
  detail: string;
  at: string;
  read: boolean;
  businessId?: string;
  taskId?: string;
  riskId?: string;
  commentId?: string;
  subtaskId?: string;
  simulated: boolean;
}
export interface Task {
  id: string;
  businessId: string;
  title: string;
  description: string;
  owners: string[];
  followers: string[];
  stage: string;
  due: string;
  status: "待处理" | "进行中" | "已完成";
  createdAt: string;
  updatedAt: string;
  files: FileRef[];
  subtasks: any[];
  comments: any[];
  history: History[];
  followupId?: string;
}
export interface Followup {
  id: string;
  businessId: string;
  text: string;
  mentions: string[];
  due: string;
  files: FileRef[];
  actor: string;
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  deleted?: boolean;
}
export interface State {
  schemaVersion: number;
  revision: number;
  createdAt: string;
  users: User[];
  businesses: Business[];
  tasks: Task[];
  followups: Followup[];
  notifications: Notification[];
  files: FileRef[];
  drafts: Record<string, any>;
  production: Record<string, any>;
  risks: any[];
  riskConfig: Record<string, any>;
  decisions: any[];
  imports: any[];
  audit: History[];
  settings: Record<string, any>;
}
export interface Command {
  type: string;
  payload: any;
  expectedRevision?: number;
}
export interface Context {
  actor: User;
  now: string;
  id: () => string;
}
export const STAGES = {
  opportunity: ["DEMO_DELIVERY", "DEMO_FEEDBACK", "INITIATE_PROJECT"],
  project: [
    "ESTABLISHED",
    "FORMAL_DELIVERY",
    "CUSTOMER_ACCEPTANCE",
    "INITIATE_CLOSE",
    "CLOSE",
    "CLOSED",
  ],
} as const;
export const stageNames: Record<string, string> = {
  DEMO_DELIVERY: "Demo交付",
  DEMO_FEEDBACK: "Demo反馈",
  INITIATE_PROJECT: "发起项目",
  ESTABLISHED: "已立项",
  FORMAL_DELIVERY: "正式交付",
  CUSTOMER_ACCEPTANCE: "客户验收",
  SUPPLEMENT_DELIVERY: "补交付",
  INITIATE_CLOSE: "发起结项",
  CLOSE: "结项确认",
  CLOSED: "已结项",
  SUSPENDED: "已挂起",
  LOST: "已丢单 / 终止",
};
export const roleNames: Record<Role, string> = {
  pm: "项目经理",
  finance: "成本核对",
  approver: "业务授权",
  viewer: "只读成员",
};
export function day(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
export function addDays(n: number, base = day()) {
  return day(new Date(Date.parse(base + "T12:00:00+08:00") + n * 86400000));
}
export function requireValue(ok: any, message: string): asserts ok {
  if (!ok) throw Error(message);
}
export function mutable(s: State, id: string, c: Context) {
  const b = s.businesses.find((x) => x.id === id);
  requireValue(b, "业务不存在");
  requireValue(c.actor.role !== "viewer", "只读成员不能修改");
  requireValue(!b.completed && b.stage !== "LOST", "终态业务只读");
  requireValue(
    c.actor.role !== "pm" || b.ownerId === c.actor.id,
    "只能修改本人负责的业务",
  );
  return b;
}
export function record(
  s: State,
  c: Context,
  action: string,
  detail: string,
  businessId?: string,
  snapshot?: any,
) {
  const row = {
    id: c.id(),
    at: c.now,
    actor: c.actor.name,
    action,
    detail,
    snapshot,
  };
  s.audit.unshift(row);
  if (businessId) {
    const b = s.businesses.find((x) => x.id === businessId);
    if (b) {
      b.history.unshift(row);
      b.updatedAt = c.now;
      b.version++;
    }
  }
  return row;
}
