import React, { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Input, InputNumber, Radio, Select, Space, Table, Tag } from 'antd';
import { AimOutlined, ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import './selection-platform-page.css';
const fields = ['rowkey', 'tos_path', 'caption'];
export function SelectionPlatformPage() {
  const [params] = useSearchParams();
  const [type, setType] = useState('video'), [field, setField] = useState('caption'), [keyword, setKeyword] = useState(''), [limit, setLimit] = useState<number | null>(null), [name, setName] = useState('');
  const [query, setQuery] = useState<{ id: string; phrase: string; quantity: number }>(), [picked, setPicked] = useState(false), [error, setError] = useState('');
  const bridge = useMemo(() => {
    try {
      const url = new URL(params.get('pmcReturn') || '');
      const requestId = params.get('pmcRequest'), nodeId = params.get('pmcNode'), projectId = params.get('pmcProject');
      const hash = new URLSearchParams(url.hash.split('?')[1] || '');
      if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash.startsWith('#/projects?') || hash.get('detail') !== projectId || !requestId || !nodeId || !projectId) return;
      return { url, requestId, nodeId };
    } catch { return; }
  }, [params]);
  function resetQuery() { setQuery(undefined); setPicked(false); setError(''); }
  function finish(cancel = false) {
    if (!bridge || (!cancel && (!query || !picked))) return;
    const url = new URL(bridge.url), [route, search] = url.hash.slice(1).split('?'), back = new URLSearchParams(search);
    back.set('pmcRequest', bridge.requestId); back.set('pmcNode', bridge.nodeId); back.set('status', cancel ? 'cancelled' : 'completed');
    if (!cancel && query) { back.set('selectionCid', 'DEMO-CID-' + crypto.randomUUID()); back.set('quantity', String(query.quantity)); back.set('headers', fields.join(',')); }
    url.hash = route + '?' + back; location.assign(url.href);
  }
  return <main className="selection-specialist">
    <header className="selection-platform-head"><div><AimOutlined aria-hidden="true" /><strong>AI 数据服务平台</strong><Tag>演示数据</Tag></div><Button icon={<ArrowLeftOutlined aria-hidden="true" />} disabled={!bridge} onClick={() => finish(true)}>取消圈选并返回</Button></header>
    <section className="selection-sheet"><header><h1>新建数据圈选</h1><span>专属圈选工作区 · 演示数据</span></header>
      {!bridge && <Alert type="warning" showIcon message="未识别编排来源" description="请从项目中枢画布的“去圈选”进入，避免将结果绑定到错误的项目。" />}
      <div className="selection-data-type"><strong>数据类型</strong><Radio.Group aria-label="圈选数据类型" value={type} onChange={e => { setType(e.target.value); resetQuery(); }} options={[{ value: 'video', label: '视频' }, { value: 'image', label: '图像' }, { value: 'audio', label: '音频' }]} /></div>
      <div className="selection-tabs"><strong>数据筛选</strong><span>本次圈选 {picked ? 1 : 0} 个任务</span></div>
      <div className="selection-query-bar"><span>临时查询 ID：{query?.id || '待查询生成'}　（已选择 {keyword.trim() ? 1 : 0} 个筛选条件）</span><Space><Button icon={<SearchOutlined aria-hidden="true" />} type="primary" disabled={!keyword.trim()} onClick={() => { setQuery({ id: 'DEMO-QUERY-' + crypto.randomUUID().slice(0, 8), phrase: keyword.trim(), quantity: Math.min(limit || 1000000, 1000000) }); setPicked(false); }}>查询演示数据</Button><Button onClick={() => { setKeyword(''); resetQuery(); }}>清空</Button></Space></div>
      <div className="selection-filter"><div className="selection-filter-toolbar"><strong>筛选条件</strong><label>圈选数量上限 <InputNumber aria-label="圈选数量上限" min={1} max={1000000000} precision={0} value={limit} placeholder="全部" onChange={v => { setLimit(v); resetQuery(); }} /></label><label>圈选任务名称 <Input aria-label="圈选任务名称" placeholder="选填" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label></div>
        <div className="selection-condition"><span>与</span><Select aria-label="筛选字段" value={field} onChange={v => { setField(v); resetQuery(); }} options={fields.map(value => ({ value, label: value }))} /><span>包含</span><Input aria-label="筛选关键词" value={keyword} placeholder="例如：运动场景" onChange={e => { setKeyword(e.target.value); resetQuery(); }} allowClear /></div>
      </div>
      <section className="selection-results" aria-label="圈选结果"><h2>圈选详情</h2>{query ? <><Table rowKey="id" pagination={false} size="middle" dataSource={[{ id: query.id, name: name.trim() || `${{ video: '视频', image: '图像', audio: '音频' }[type]}素材 · ${query.phrase}`, quantity: query.quantity }]} columns={[{ title: '选择', width: 70, render: () => <Checkbox aria-label="选中圈选结果" checked={picked} onChange={e => setPicked(e.target.checked)} /> }, { title: '圈选任务', dataIndex: 'name' }, { title: '匹配数量（条）', dataIndex: 'quantity', align: 'right', render: v => v.toLocaleString() }, { title: '返回表头', render: () => fields.join(', ') }, { title: 'CID', render: () => <span>确认圈选后生成</span> }]} /><p>已选择 {picked ? query.quantity.toLocaleString() : '0'} 条</p></> : <Empty description="填写筛选条件并点击“查询演示数据”查看圈选详情" />}</section>
      {error && <Alert type="error" message={error} />}
      <footer className="selection-confirm"><span>{picked && query ? `确认将 ${query.quantity.toLocaleString()} 条及表头回传至来源节点` : '选定检索结果后才可完成圈选'}</span><Button type="primary" disabled={!bridge || !query || !picked} onClick={() => finish()}>完成圈选并返回编排</Button></footer>
    </section>
  </main>;
}
