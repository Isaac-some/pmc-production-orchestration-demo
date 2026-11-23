import React, { forwardRef, useId, type ReactNode } from "react";
import {
  CheckOutlined,
  ExclamationCircleOutlined,
  PlayCircleOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import "./workflow-node-card.css";
import { BridgePoolNode } from "./BridgePoolNode";
import { BeamPath } from "./klyv-animated-beam";

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
  flowing?: boolean;
  streaming?: boolean;
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
    flowing,
    streaming,
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
  const isPool =
    variant === "sourcePool" || variant === "buffer" || variant === "delivery";
  if (isPool)
    return (
      <BridgePoolNode
        icon={icon}
        terminal={variant === "delivery"}
        title={title}
        subtitle={subtitle}
        selected={selected}
        flowing={flowing}
        streaming={streaming}
        paused={status === "paused"}
        actionLabel={actionLabel}
        onAction={onAction}
        disabled={disabled}
      >
        {children}
      </BridgePoolNode>
    );
  const FooterIcon = ArrowRightOutlined;
  return (
    <div
      ref={ref}
      className={`wf-card wf-${variant}${selected ? " wf-selected" : ""}`}
      data-status={status}
      data-flowing={!!flowing}
      role="group"
      aria-labelledby={titleId}
    >
      <header className="wf-card-header">
        <span className="wf-icon" aria-hidden="true">
          {icon}
        </span>
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
        <span title={footer} className="wf-footer-context">
          <FooterIcon aria-hidden="true" />
          {footer}
        </span>
        <button
          type="button"
          className="nodrag nopan wf-card-action"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onAction?.();
          }}
        >
          {status === "running" && variant === "stage" ? (
            <PlayCircleOutlined aria-hidden="true" />
          ) : (
            <ArrowRightOutlined aria-hidden="true" />
          )}
          {actionLabel}
        </button>
      </footer>
      {flowing && (
        <svg
          className="wf-stream-track"
          aria-hidden="true"
          width="296"
          height="4"
          viewBox="0 0 296 4"
        >
          <BeamPath d="M 2,2 L 294,2" />
        </svg>
      )}
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
          <strong
            className={v.danger ? "wf-danger" : ""}
            title={`${v.value.toLocaleString("zh-CN")} 条`}
          >
            {v.value >= 10000
              ? new Intl.NumberFormat("zh-CN", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(v.value)
              : v.value.toLocaleString("zh-CN")}
            <small>条</small>
          </strong>
        </div>
      ))}
    </div>
  );
}
