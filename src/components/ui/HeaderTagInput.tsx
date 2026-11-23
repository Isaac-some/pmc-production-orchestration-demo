import React, { useEffect, useId, useRef, useState } from "react";
import { SearchOutlined, PlusOutlined } from "@ant-design/icons";
import "./header-tag-input.css";

export interface HeaderTagInputProps {
  id?: string;
  value: string;
  headers: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}
const pattern = /【([^】\n]+)】/g;
function read(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (node instanceof HTMLElement && node.dataset.header)
    return `【${node.dataset.header}】`;
  if (node.nodeName === "BR") return "\n";
  const value = Array.from(node.childNodes).map(read).join("");
  return node.nodeName === "DIV" && node.previousSibling ? "\n" + value : value;
}
function offset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode))
    return read(root).length;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode!, selection.anchorOffset);
  return read(range.cloneContents()).length;
}
function caret(root: HTMLElement, at: number) {
  let remaining = at;
  const range = document.createRange();
  for (const node of Array.from(root.childNodes)) {
    const length = read(node).length;
    if (remaining <= length) {
      if (node.nodeType === Node.TEXT_NODE) range.setStart(node, remaining);
      else if (remaining === 0) range.setStartBefore(node);
      else range.setStartAfter(node);
      range.collapse(true);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(range);
      return;
    }
    remaining -= length;
  }
  range.selectNodeContents(root);
  range.collapse(false);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(range);
}

/** Text and atomic field references share one editable surface; the persisted form remains plain text. */
export function HeaderTagInput({
  id,
  value,
  headers,
  disabled = false,
  onChange,
}: HeaderTagInputProps) {
  const root = useRef<HTMLDivElement>(null);
  const position = useRef(value.length);
  const composing = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const uid = useId();
  const known = Array.from(new Set(headers.filter(Boolean)));
  const options = known.filter((h) =>
    h.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const canCreate =
    !!query.trim() && !known.includes(query.trim()) && !/[【】\n]/.test(query);
  const choices = [...options, ...(canCreate ? [query.trim()] : [])];
  function draw(text: string, at?: number) {
    const el = root.current;
    if (!el) return;
    el.replaceChildren();
    let end = 0;
    for (const m of text.matchAll(pattern)) {
      el.append(document.createTextNode(text.slice(end, m.index)));
      const chip = document.createElement("span");
      chip.className =
        "header-tag" + (known.includes(m[1]) ? "" : " header-tag-output");
      chip.dataset.header = m[1];
      chip.contentEditable = "false";
      chip.textContent = m[0];
      chip.title = known.includes(m[1])
        ? "输入表头：" + m[1]
        : "新输出表头：" + m[1];
      el.append(chip);
      end = m.index! + m[0].length;
    }
    el.append(document.createTextNode(text.slice(end)));
    if (at !== undefined) caret(el, at);
  }
  useEffect(() => {
    if (!root.current || composing.current) return;
    if (read(root.current) !== value) draw(value);
    else
      root.current
        .querySelectorAll<HTMLElement>("[data-header]")
        .forEach((e) => {
          const present = known.includes(e.dataset.header!);
          e.classList.toggle("header-tag-output", !present);
          e.title =
            (present ? "输入表头：" : "新输出表头：") + e.dataset.header;
        });
  }, [value, headers.join("\u0000")]);
  useEffect(() => {
    draw(value);
  }, []);
  function edited() {
    if (!root.current || composing.current) return;
    const at = offset(root.current),
      text = read(root.current).slice(0, 6000);
    position.current = Math.min(at, text.length);
    draw(text, position.current);
    onChange(text);
  }
  function insert(name: string) {
    if (disabled || !root.current) return;
    const text = read(root.current),
      at = Math.min(position.current, text.length),
      token = `【${name}】`;
    if (text.length + token.length > 6000) return;
    const result = text.slice(0, at) + token + text.slice(at);
    position.current = at + token.length;
    root.current.focus();
    draw(result, position.current);
    onChange(result);
    setOpen(false);
    setQuery("");
  }
  return (
    <div className={"header-tag-input" + (disabled ? " is-disabled" : "")}>
      <div
        id={id}
        ref={root}
        className="header-tag-editor"
        role="textbox"
        aria-label="处理要求"
        aria-multiline="true"
        aria-disabled={disabled}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder="描述处理要求，可插入表头引用，例如将【caption】清理后写入【clean_caption】"
        onInput={edited}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          edited();
        }}
        onBlur={() => {
          if (root.current) position.current = offset(root.current);
        }}
        onKeyUp={() => {
          if (root.current && !composing.current)
            position.current = offset(root.current);
        }}
        onMouseUp={() => {
          if (root.current) position.current = offset(root.current);
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          if (!root.current) return;
          const sel = window.getSelection();
          if (!sel?.rangeCount) return;
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          edited();
        }}
        onKeyDown={(event) => {
          if (composing.current || event.nativeEvent.isComposing) return;
          if ((event.ctrlKey || event.metaKey) && event.key === " ") {
            event.preventDefault();
            position.current = offset(root.current!);
            setOpen(true);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const sel = window.getSelection();
            if (!sel?.rangeCount) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const text = document.createTextNode("\n");
            range.insertNode(text);
            range.setStartAfter(text);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            edited();
            return;
          }
          if (event.key === "Backspace" || event.key === "Delete") {
            const sel = window.getSelection();
            if (!sel?.isCollapsed || !root.current) return;
            const at = offset(root.current),
              text = read(root.current);
            const token = Array.from(text.matchAll(pattern)).find((m) =>
              event.key === "Backspace"
                ? m.index! + m[0].length === at
                : m.index === at,
            );
            if (token) {
              event.preventDefault();
              const next =
                text.slice(0, token.index) +
                text.slice(token.index! + token[0].length);
              position.current = token.index!;
              draw(next, position.current);
              onChange(next);
            }
          }
        }}
      />
      <div className="header-tag-tools">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={uid}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen(!open);
            setQuery("");
            setActive(0);
          }}
        >
          <PlusOutlined aria-hidden="true" />
          插入表头
        </button>
        <span>输入表头 {known.length} 个</span>
      </div>
      {open && (
        <div className="header-tag-menu" id={uid}>
          <div className="header-tag-search">
            <SearchOutlined aria-hidden="true" />
            <input
              autoFocus
              aria-label="检索表头"
              value={query}
              placeholder="搜索列名，或输入新输出列名"
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  root.current?.focus();
                  caret(root.current!, position.current);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, choices.length - 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                }
                if (e.key === "Enter" && choices[active]) {
                  e.preventDefault();
                  insert(choices[active]);
                }
              }}
            />
          </div>
          <div role="listbox" aria-label="可引用的表头">
            {choices.length ? (
              choices.map((header, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  key={header}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(header)}
                >
                  <span>【{header}】</span>
                  <small>
                    {known.includes(header) ? "输入字段" : "新建输出字段"}
                  </small>
                </button>
              ))
            ) : (
              <p>暂无输入表头，输入列名可创建输出字段。</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
