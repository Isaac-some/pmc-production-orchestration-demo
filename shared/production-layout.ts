import type { PlanNode, ProductionPlan } from "./production-plan";

export type PlanNodeSize = { id: string; width: number; height: number };
/** Arrange the DAG by dependency, aligning ports and allowing space for branches. */
export function arrangeProductionNodes(
  plan: ProductionPlan,
  sizes: PlanNodeSize[] = [],
): PlanNode[] {
  const ids = new Set(plan.nodes.map((node) => node.id));
  if (plan.edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target)))
    throw Error("编排存在无效关系，请先修正连线后整理");
  const incoming = new Map(
    plan.nodes.map((n) => [n.id, plan.edges.filter((e) => e.target === n.id)]),
  );
  const remaining = new Map(
    plan.nodes.map((n) => [n.id, incoming.get(n.id)!.length]),
  );
  const rank = new Map<string, number>(),
    ordered: PlanNode[] = [];
  const queue = plan.nodes.filter((n) => remaining.get(n.id) === 0);
  while (queue.length) {
    const node = queue.shift()!;
    rank.set(
      node.id,
      Math.max(
        0,
        ...incoming.get(node.id)!.map((e) => (rank.get(e.source) || 0) + 1),
      ),
    );
    ordered.push(node);
    for (const edge of plan.edges.filter((e) => e.source === node.id)) {
      remaining.set(edge.target, remaining.get(edge.target)! - 1);
      if (remaining.get(edge.target) === 0)
        queue.push(plan.nodes.find((n) => n.id === edge.target)!);
    }
  }
  if (ordered.length !== plan.nodes.length)
    throw Error("编排存在成环或无效关系，请先修正连线后整理");
  const dimensions = (n: PlanNode) => {
    const measured = sizes.find((s) => s.id === n.id);
    const pool = ["sourcePool", "buffer", "delivery"].includes(n.kind);
    return {
      width: measured?.width || (pool ? 160 : 300),
      height: measured?.height || (pool ? 130 : n.kind === "stage" ? 324 : 280),
      pool,
    };
  };
  const placed = new Map<string, PlanNode>();
  const portY = (n: PlanNode) =>
    n.y + (dimensions(n).pool ? 48 : dimensions(n).height / 2);
  let x = 40;
  for (let col = 0; col <= Math.max(0, ...rank.values()); col++) {
    const nodes = ordered.filter((n) => rank.get(n.id) === col);
    const desired = (n: PlanNode) => {
      const parents = incoming
        .get(n.id)!
        .map((e) => placed.get(e.source))
        .filter(Boolean) as PlanNode[];
      return parents.length
        ? parents.reduce((sum, p) => sum + portY(p), 0) / parents.length
        : 0;
    };
    nodes.sort((a, b) => desired(a) - desired(b));
    let bottom = 40;
    for (const node of nodes) {
      const size = dimensions(node),
        y = Math.max(
          bottom,
          desired(node) - (size.pool ? 48 : size.height / 2),
        );
      placed.set(node.id, { ...node, x, y });
      bottom = y + size.height + 72;
    }
    x += Math.max(160, ...nodes.map((n) => dimensions(n).width)) + 140;
  }
  return plan.nodes.map((n) => placed.get(n.id)!);
}
