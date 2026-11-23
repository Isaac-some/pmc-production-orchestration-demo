import React from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { BeamPath } from "./klyv-animated-beam";

type BeamEdge = Edge<{ flowing: boolean }>;
export function ProductionBeamEdge(props: EdgeProps<BeamEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    curvature: 0.3,
  });
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd}
        label={props.label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={props.labelStyle}
        interactionWidth={props.interactionWidth}
        style={props.style}
      />
      <BeamPath d={path} paused={!props.data?.flowing} />
    </>
  );
}
