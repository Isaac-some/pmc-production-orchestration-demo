/** F02: dashboard sets and click-through sets share the same business identities. */
import { type State, type Business, day, addDays } from "./types";
import { displayProjectRisk } from "./reports";
export function dashboardFacts(state: State, today = day()) {
  const opportunities = state.businesses.filter(
    (b) => b.kind === "opportunity",
  );
  const projects = state.businesses.filter((b) => b.kind === "project");
  const active = (b: Business) =>
    !b.completed && !["LOST", "CLOSED", "SUSPENDED"].includes(b.stage);
  const converted = opportunities.filter((o) =>
    projects.some(
      (p) =>
        p.common.sourceOpportunityId === o.id ||
        p.id === o.common.linkedProjectId,
    ),
  );
  const ongoing = projects.filter(active);
  const due = ongoing.filter(
    (b) => b.deadline >= today && b.deadline <= addDays(7, today),
  );
  return {
    opportunities,
    projects,
    converted,
    unconverted: opportunities.filter((o) => !converted.includes(o)),
    opps: opportunities.filter(active),
    ongoing,
    due,
    risky: ongoing.filter((b) => !!displayProjectRisk(state, b)),
    active,
  };
}
