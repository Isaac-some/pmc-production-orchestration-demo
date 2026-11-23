import React, { useId, useState } from "react";
import { Alert, Modal } from "antd";
import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import "./batch-bindings.css";

export type BatchBinding = {
  key: string;
  executorId: string;
  batchId: string;
  bound: boolean;
  input: number;
  running: number;
  completed: number;
  failed: number;
};
export type BatchBindingsProps = {
  batches: BatchBinding[];
  disabled?: boolean;
  onBind: () => void;
  onCreate: () => void;
  onUnbind: (executorId: string, batchId: string) => Promise<void>;
};
const count = (value: number) => value.toLocaleString("zh-CN");
function batchState(batch: BatchBinding) {
  if (!batch.bound) return { label: "已解绑", kind: "history", Icon: DisconnectOutlined };
  if (batch.failed > 0) return { label: "有异常", kind: "error", Icon: ExclamationCircleOutlined };
  if (batch.running > 0) return { label: "生产中", kind: "processing", Icon: LoadingOutlined };
  if (batch.input > 0 && batch.completed >= batch.input)
    return { label: "已完成", kind: "done", Icon: CheckOutlined };
  return { label: "已绑定", kind: "idle", Icon: ClockCircleOutlined };
}

/** A batch is a bound production object; unlinking it never deletes its history. */
export function BatchBindings({ batches, disabled = false, onBind, onCreate, onUnbind }: BatchBindingsProps) {
  const titleId = useId();
  const [selected, setSelected] = useState<BatchBinding | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Recheck live props: a batch can begin running while confirmation is open.
  const current = selected ? batches.find((batch) => batch.key === selected.key) : undefined;
  const blocked = disabled || pending || !current?.bound || current.running > 0;
  async function confirmUnbind() {
    if (!selected || blocked || !current) return;
    setPending(true);
    setError("");
    try {
      await onUnbind(current.executorId, current.batchId);
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解绑未完成，请重试。");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="batch-bindings" aria-labelledby={titleId}>
      <header className="batch-bindings-header">
        <h4 id={titleId}>生产批次 <span>{batches.length}</span></h4>
        <div className="batch-bindings-toolbar">
          <button type="button" onClick={onBind} disabled={disabled}>绑定已有</button>
          <button type="button" onClick={onCreate} disabled={disabled}><PlusOutlined aria-hidden="true" />新建</button>
        </div>
      </header>
      {batches.length === 0 ? <p className="batch-bindings-empty">尚未绑定生产批次</p> : (
        <ul className="batch-bindings-list">
          {batches.map((batch) => {
            const { kind, label, Icon } = batchState(batch);
            const running = batch.bound && batch.running > 0;
            return (
              <li key={batch.key} className="batch-binding" data-state={kind}>
                <span className="batch-binding-media" title={label}><Icon aria-hidden="true" /></span>
                <div className="batch-binding-content">
                  <div className="batch-binding-title"><strong title={batch.batchId}>{batch.batchId}</strong><span>{label}</span></div>
                  <p className="batch-binding-executor" title={`执行器 ${batch.executorId}`}>执行器 {batch.executorId}</p>
                  <p className="batch-binding-progress">
                    <span>输入 {count(batch.input)}</span>
                    <span>完成 {count(batch.completed)}</span>
                    {batch.running > 0 && <span>进行中 {count(batch.running)}</span>}
                    {batch.failed > 0 && <span className="batch-binding-failed">失败 {count(batch.failed)}</span>}
                  </p>
                  {running && <p className="batch-binding-reason">生产中，完成或停止后可解绑</p>}
                </div>
                {batch.bound && (
                  <button
                    className="batch-binding-remove"
                    type="button"
                    aria-label={`解绑批次 ${batch.batchId}`}
                    disabled={disabled || pending || running}
                    title={running ? "批次仍在生产，暂不可解绑" : disabled ? "当前不可编辑" : "解绑此批次"}
                    onClick={() => { setSelected(batch); setError(""); }}
                  ><CloseOutlined aria-hidden="true" /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        title="解绑生产批次"
        className="batch-binding-dialog"
        open={!!selected}
        okText="确认解绑"
        cancelText="取消"
        confirmLoading={pending}
        okButtonProps={{ disabled: blocked }}
        cancelButtonProps={{ disabled: pending }}
        closable={!pending}
        maskClosable={!pending}
        keyboard={!pending}
        onCancel={() => { if (!pending) setSelected(null); }}
        onOk={confirmUnbind}
      >
        <p>解绑批次 <strong>{selected?.batchId}</strong>？</p>
        <p>仅解除它与当前工序的关联。已有生产记录、产出和历史统计保留，其他批次不受影响。</p>
        {current?.running ? <Alert type="warning" message="此批次已开始生产，请完成或停止后再解绑。" /> : null}
        {error && <Alert type="error" message={error} showIcon />}
      </Modal>
    </section>
  );
}
