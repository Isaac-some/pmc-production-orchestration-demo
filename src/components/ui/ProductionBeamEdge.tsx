import React from "react";
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { BeamPath } from "./klyv-animated-beam";

type BeamEdge = Edge<{ flowing: boolean }> & {
  pathOptions?: { offset?: number; stepPosition?: number };
};
export function ProductionBeamEdge(props: EdgeProps<BeamEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    ...props.pathOptions,
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
