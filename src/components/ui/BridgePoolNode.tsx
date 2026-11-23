import React, { useRef, type ReactNode } from "react";
import { Popover } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";
import { AnimatedBeam } from "./klyv-animated-beam";
import "./bridge-pool-node.css";

export function BridgePoolNode({
  title,
  icon,
  terminal,
  subtitle,
  selected,
  flowing,
  streaming,
  paused,
  children,
  onAction,
  disabled,
}: {
  title: string;
  icon?: ReactNode;
  terminal?: boolean;
  subtitle: string;
  selected?: boolean;
  flowing?: boolean;
  streaming?: boolean;
  paused?: boolean;
  children?: ReactNode;
  actionLabel: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  const container = useRef<HTMLSpanElement>(null),
    input = useRef<HTMLSpanElement>(null),
    core = useRef<HTMLSpanElement>(null),
    output = useRef<HTMLSpanElement>(null);
  const status = paused
    ? "调度已暂停"
    : flowing
      ? "流式调度"
      : streaming
        ? "等待上游恢复"
        : subtitle;
  return (
    <div
      className={`bridge-pool-node${selected ? " is-selected" : ""}`}
      data-flowing={!!flowing}
    >
      <Popover
        trigger={["hover", "focus"]}
        mouseEnterDelay={0.15}
        mouseLeaveDelay={0.1}
        placement="top"
        zIndex={1250}
        content={
          <div className="bridge-pool-summary">
            <header>
              <strong>{title}</strong>
              <span>{status}</span>
            </header>
            <div className="bridge-pool-body">{children}</div>
            <small>点击节点查看详情与操作</small>
          </div>
        }
      >
        <button
          type="button"
          className="bridge-pool-trigger nopan"
          aria-label={`查看${title}详情`}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onAction?.();
          }}
        >
          <span className="bridge-pool-circle" ref={container}>
            <span ref={input} className="bridge-pool-terminal bridge-pool-in" />
            <AnimatedBeam
              containerRef={container}
              fromRef={input}
              toRef={core}
              curvature={-18}
              paused={!flowing}
            />
            {!terminal && (
              <AnimatedBeam
                containerRef={container}
                fromRef={core}
                toRef={output}
                curvature={18}
                delay={0.6}
                paused={!flowing}
              />
            )}
            <span className="bridge-pool-core" ref={core}>
              {icon || <DatabaseOutlined />}
            </span>
            <span
              ref={output}
              className="bridge-pool-terminal bridge-pool-out"
            />
          </span>
          <span className="bridge-pool-name" title={title}>
            {title}
          </span>
          <span className="bridge-pool-status">{status}</span>
        </button>
      </Popover>
    </div>
  );
}
