import type { ProductionPlan } from "./production-plan";

/** Visual scheduling state, derived from the plan; never generates production events. */
export function planFlowStates(plan: ProductionPlan) {
  const states = new Map<string, { streaming: boolean; active: boolean }>();
  const visiting = new Set<string>();
  function resolve(id: string): { streaming: boolean; active: boolean } {
    if (states.has(id)) return states.get(id)!;
    if (visiting.has(id)) return { streaming: false, active: false };
    const node = plan.nodes.find((n) => n.id === id);
    if (!node) return { streaming: false, active: false };
    visiting.add(id);
    const parents = plan.edges
      .filter((e) => e.target === id)
      .map((e) => resolve(e.source));
    const ownStream =
      node.kind === "source"
        ? node.mode === "collection"
        : node.kind === "stage"
          ? node.outputMode === "append"
          : plan.lots.some(
              (l) =>
                l.nodeId === id &&
                l.remaining > 0 &&
                l.cid &&
                plan.cidMeta?.[l.cid]?.mode === "append",
            );
    // A fixed-output stage ends a continuous output path, even with streamed input.
    const streaming =
      ownStream ||
      (node.kind !== "source" &&
        node.kind !== "stage" &&
        parents.some((s) => s.streaming));
    const active =
      streaming && !node.paused && (ownStream || parents.some((s) => s.active));
    visiting.delete(id);
    const state = { streaming, active };
    states.set(id, state);
    return state;
  }
  plan.nodes.forEach((n) => resolve(n.id));
  return states;
}
