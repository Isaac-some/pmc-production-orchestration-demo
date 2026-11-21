import React, { forwardRef, useId, type ReactNode } from "react";
import {
  CheckOutlined,
  ExclamationCircleOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import "./workflow-node-card.css";

export type WorkflowCardStatus =
  "idle" | "running" | "completed" | "error" | "paused";
export interface WorkflowNodeCardProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  variant: "source" | "sourcePool" | "stage" | "buffer" | "delivery" | "branch";
  status: WorkflowCardStatus;
  statusLabel: string;
  selected?: boolean;
  children?: ReactNode;
  footer: string;
  actionLabel: string;
  onAction?: () => void;
  disabled?: boolean;
  errorMessage?: string;
}
/** Visual structure adapted from the supplied workflow-card reference to the existing Ant Design tokens. */
export const WorkflowNodeCard = forwardRef<
  HTMLDivElement,
  WorkflowNodeCardProps
>(function WorkflowNodeCard(
  {
    title,
    subtitle,
    icon,
    variant,
    status,
    statusLabel,
    selected,
    children,
    footer,
    actionLabel,
    onAction,
    disabled,
    errorMessage,
  },
  ref,
) {
  const titleId = useId();
  return (
    <div
      ref={ref}
      className={`wf-card wf-${variant}${selected ? " wf-selected" : ""}`}
      data-status={status}
      role="group"
      aria-labelledby={titleId}
    >
      <header className="wf-card-header">
        <span className="wf-icon">{icon}</span>
        <div className="wf-heading">
          <h3 id={titleId} title={title}>
            {title}
          </h3>
          <p>{subtitle}</p>
        </div>
        <span className={`wf-status wf-status-${status}`} title={statusLabel}>
          {status === "error" ? (
            <ExclamationCircleOutlined aria-hidden="true" />
          ) : status === "completed" ? (
            <CheckOutlined aria-hidden="true" />
          ) : (
            <i />
          )}
          {statusLabel}
        </span>
      </header>
      <div className="wf-card-body">{children}</div>
      {errorMessage && (
        <div className="wf-error">
          <ExclamationCircleOutlined aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}
      <footer className="wf-card-footer">
        <span title={footer}>{footer}</span>
        <button
          type="button"
          className="nodrag nopan wf-card-action"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onAction?.();
          }}
        >
          {status === "running" ? (
            <PlayCircleOutlined aria-hidden="true" />
          ) : (
            <ArrowRightOutlined aria-hidden="true" />
          )}
          {actionLabel}
        </button>
      </footer>
    </div>
  );
});
export function WorkflowNodeParam({
  label,
  value,
  code = false,
}: {
  label: string;
  value: ReactNode;
  code?: boolean;
}) {
  return (
    <div className="wf-param">
      <span>{label}</span>
      <strong className={code ? "wf-code" : ""}>{value}</strong>
    </div>
  );
}
export function WorkflowNodeMetrics({
  values,
}: {
  values: { label: string; value: number; danger?: boolean }[];
}) {
  return (
    <div className="wf-metrics">
      {values.map((v) => (
        <div key={v.label}>
          <span>{v.label}</span>
          <strong className={v.danger ? "wf-danger" : ""}>
            {v.value.toLocaleString("zh-CN")}
            <small>条</small>
          </strong>
        </div>
      ))}
    </div>
  );
}
