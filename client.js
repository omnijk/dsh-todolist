/**
 * dsh-todolist — Client half.
 *
 * Registers one full page in the main panel (`sidebar.panellist` entry + `main`
 * panel keyed by `todolist`) where the user lines up prompts while the model is
 * working. When a session reports the end of a turn the queue auto-submits the
 * next pending item into that same session, or into a freshly created one.
 */
window.__ModuleLoader__.load({
  id: 'dsh-todolist',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState } = React
    const h = React.createElement

    const NS = 'todolist'
    const PANEL_ID = 'todolist'
    const ROUTE = '/api/todolist.state'
    const DEFAULT_WORKSPACE = '__unscoped__'
    const MAX_CHARS = 20000
    const SELECT_ALL = snapshot => snapshot

    // ---------------------------------------------------------------- labels

    const zh = {
      panel: '待办事项',
      title: '项目待办',
      itemsUnit: '项待办',
      refresh: '刷新',
      add: '添加待办',
      placeholder: '写下要交给 AI 实现的完整事项，可包含背景、要求和注意点',
      empty: '暂无项目待办',
      emptyHint: '模型正在工作时，先把下一段提示词排好队；这一轮结束会自动接着开始。',
      autoRun: '自动续跑',
      autoRunHint: '这个工作区里任意会话结束一轮后，自动发送队列里的下一条',
      position: '续跑位置',
      modeSame: '同一会话',
      modeNew: '新建会话',
      modeSameHint: '接着刚结束的那一轮继续发',
      modeNewHint: '每条待办都新开一个会话',
      scope: '续跑范围：',
      scopeHint: '· 该工作区最近结束一轮的会话',
      fill: '填入对话',
      start: '开始',
      markDone: '标记完成',
      reopen: '恢复待办',
      edit: '编辑',
      remove: '删除',
      save: '保存',
      cancel: '取消',
      doneUnit: '项已完成',
      clearDone: '清除已完成',
      workspace: '工作区',
      loading: '正在载入…',
      loadError: '待办载入失败',
      retry: '重试',
      limitHint: '最多 20000 字',
      queued: '已发送，模型会接着处理',
      filled: '已填入会话输入框',
      autoStart: '自动开始：',
      submitted: '排队开始：',
      noPending: '队列已清空',
      saveFailed: '保存失败，改动可能没有落盘',
      dragHandle: '拖动排序',
      pendingUnit: '项待办',
      shortcut: 'Ctrl / ⌘ + Enter 直接添加',
    }

    const en = {
      panel: 'Todo queue',
      title: 'Project todos',
      itemsUnit: 'todos',
      refresh: 'Refresh',
      add: 'Add todo',
      placeholder: 'Write the next complete task for the AI — background, requirements and caveats included',
      empty: 'No project todos yet',
      emptyHint: 'While the model works, line up the next prompts; the queue starts them automatically when a turn ends.',
      autoRun: 'Auto-continue',
      autoRunHint: 'Send the next queued item when any session in this workspace finishes a turn',
      position: 'Continue in',
      modeSame: 'Same session',
      modeNew: 'New session',
      modeSameHint: 'Keep going in the session that just finished',
      modeNewHint: 'Open a fresh session for every todo',
      scope: 'Runs in: ',
      scopeHint: '· the session that last finished a turn here',
      fill: 'To composer',
      start: 'Start',
      markDone: 'Mark done',
      reopen: 'Reopen',
      edit: 'Edit',
      remove: 'Delete',
      save: 'Save',
      cancel: 'Cancel',
      doneUnit: 'done',
      clearDone: 'Clear done',
      workspace: 'Workspace',
      loading: 'Loading…',
      loadError: 'Could not load todos',
      retry: 'Retry',
      limitHint: '20000 characters max',
      queued: 'Sent — the model will pick it up',
      filled: 'Filled into the session composer',
      autoStart: 'Auto-started: ',
      submitted: 'Queued: ',
      noPending: 'Queue is empty',
      saveFailed: 'Could not save — changes may be lost',
      dragHandle: 'Drag to reorder',
      pendingUnit: 'pending',
      shortcut: 'Ctrl / ⌘ + Enter adds directly',
    }

    // --------------------------------------------------------------- styling

    const CSS = `
.dtl-root { position: relative; display: flex; flex-direction: column; min-height: 100%; box-sizing: border-box;
  padding: calc(var(--dsh-frame-top-clearance, 0px) + 16px) 28px 96px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base);
  font-size: 14px; line-height: 1.55; }
.dtl-inner { width: 100%; max-width: 940px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.dtl-head { display: flex; align-items: center; gap: 14px; }
.dtl-badge { width: 52px; height: 52px; flex: none; display: flex; align-items: center; justify-content: center;
  border-radius: 16px; background: var(--dsw-alias-bg-module-platform, #f5f6f7); color: var(--dsw-alias-label-primary); }
.dtl-headtext { display: flex; flex-direction: column; min-width: 0; }
.dtl-h1 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: 0.1px; }
.dtl-sub { margin: 1px 0 0; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
.dtl-headside { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.dtl-iconbtn { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; flex: none;
  border: 0; border-radius: 10px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
  transition: background .14s ease, color .14s ease; }
.dtl-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dtl-iconbtn[data-busy="true"] svg { animation: dtl-spin 1s linear infinite; }
@keyframes dtl-spin { to { transform: rotate(360deg); } }

.dtl-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; height: 32px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary); font-size: 12.5px; cursor: pointer; }
.dtl-chip:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dtl-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dtl-menu { position: absolute; z-index: 30; margin-top: 6px; min-width: 220px; max-height: 320px; overflow: auto;
  padding: 6px; border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 12px 32px rgba(0,0,0,.16); }
.dtl-menu-title { padding: 6px 8px 4px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
  color: var(--dsw-alias-label-caption, #a8adb5); }
.dtl-menuitem { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; border: 0; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-primary); font-size: 13px; text-align: left; cursor: pointer; }
.dtl-menuitem:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dtl-menuitem[data-active="true"] { background: var(--dsw-alias-interactive-bg-active); }
.dtl-menuitem > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dtl-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 1px 2px rgba(15, 18, 24, .04); }
.dtl-composer { padding: 12px 14px 10px; }
.dtl-textarea { display: block; width: 100%; min-height: 122px; box-sizing: border-box; resize: vertical;
  border: 0; outline: 0; background: transparent; color: inherit; font: inherit; font-size: 14.5px; line-height: 1.7;
  padding: 4px 2px; }
.dtl-textarea::placeholder { color: var(--dsw-alias-label-caption, #a8adb5); }
.dtl-composerfoot { display: flex; align-items: center; gap: 12px; padding-top: 8px; }
.dtl-counter { font-size: 12px; color: var(--dsw-alias-label-caption, #a8adb5); font-variant-numeric: tabular-nums; }
.dtl-counter[data-over="true"] { color: var(--dsw-alias-label-error); }
.dtl-hint { margin-left: auto; font-size: 11.5px; color: var(--dsw-alias-label-caption, #a8adb5); }

.dtl-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 0; border-radius: 10px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: background .14s ease, opacity .14s ease, color .14s ease;
  background: var(--dsw-alias-button-elevated-fill); color: var(--dsw-alias-label-primary); }
.dtl-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dtl-btn[disabled] { opacity: .45; cursor: not-allowed; }
.dtl-btn-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-on-color); }
.dtl-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.dtl-btn-primary[disabled] { background: var(--dsw-alias-button-primary-dimmed); opacity: 1; }

.dtl-settings { display: flex; align-items: center; gap: 14px; padding: 12px 14px; flex-wrap: wrap; }
.dtl-switchwrap { display: flex; align-items: center; gap: 10px; }
.dtl-switch { position: relative; width: 38px; height: 22px; flex: none; padding: 0; border: 0; border-radius: 999px;
  background: var(--dsw-alias-border-l3); cursor: pointer; transition: background .16s ease; }
.dtl-switch[data-on="true"] { background: var(--dsw-alias-state-success-primary); }
.dtl-switch > i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--dsw-alias-switch-thumb); transition: transform .16s ease; }
.dtl-switch[data-on="true"] > i { transform: translateX(16px); }
.dtl-switchlabel { display: flex; flex-direction: column; }
.dtl-switchlabel > b { font-size: 13px; font-weight: 600; }
.dtl-switchlabel > small { font-size: 11.5px; color: var(--dsw-alias-label-caption, #a8adb5); }
.dtl-segmented { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  margin-left: auto; }
.dtl-seg { height: 26px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; cursor: pointer;
  font-size: 12.5px; color: var(--dsw-alias-label-tertiary); }
.dtl-seg[data-active="true"] { background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary); box-shadow: 0 1px 2px rgba(15,18,24,.08); }
.dtl-seghint { font-size: 11.5px; color: var(--dsw-alias-label-caption, #a8adb5); }
.dtl-anchor { flex: 1 0 100%; display: flex; align-items: center; gap: 6px; padding-top: 2px;
  font-size: 11.5px; color: var(--dsw-alias-label-caption, #a8adb5); }
.dtl-anchor-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 420px;
  color: var(--dsw-alias-label-secondary); }
.dtl-anchor-hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dtl-list { padding: 2px 8px 4px; }
.dtl-row { position: relative; display: flex; align-items: center; gap: 8px; padding: 12px 6px;
  border-radius: 0; }
.dtl-row + .dtl-row { border-top: 1px solid var(--dsw-alias-border-l1, #0000000a); }
.dtl-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dtl-row[data-dragging="true"] { opacity: .45; }
.dtl-row[data-drop="true"] { box-shadow: inset 0 2px 0 var(--dsw-alias-brand-primary, #0f1115); }
.dtl-grip { width: 20px; height: 26px; flex: none; display: flex; align-items: center; justify-content: center;
  border: 0; background: transparent; color: var(--dsw-alias-label-caption, #a8adb5); cursor: grab; opacity: .45; padding: 0; }
.dtl-row:hover .dtl-grip { opacity: 1; }
.dtl-grip:active { cursor: grabbing; }
.dtl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding-top: 0; }
.dtl-title { font-size: 14px; overflow-wrap: anywhere; white-space: pre-wrap; cursor: text; }
.dtl-row[data-done="true"] .dtl-title { color: var(--dsw-alias-label-tertiary); text-decoration: line-through;
  text-decoration-color: var(--dsw-alias-border-l3); }
.dtl-meta { font-size: 11.5px; color: var(--dsw-alias-label-caption, #a8adb5); display: flex; gap: 10px; }
.dtl-edit { width: 100%; min-height: 68px; box-sizing: border-box; resize: vertical; padding: 6px 8px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base);
  color: inherit; font: inherit; font-size: 14px; line-height: 1.6; outline: none; }
.dtl-edit:focus { border-color: var(--dsw-alias-brand-primary); }
.dtl-actions { display: flex; align-items: center; gap: 4px; flex: none; opacity: 0; transition: opacity .12s ease; }
.dtl-row:hover .dtl-actions, .dtl-row[data-editing="true"] .dtl-actions { opacity: 1; }
.dtl-act { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #0000001a); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer;
  box-shadow: 0 1px 2px rgba(15,18,24,.06); }
.dtl-act:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dtl-act[disabled] { opacity: .35; cursor: default; }
.dtl-act[disabled]:hover { background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary); }
.dtl-act-icon { width: 28px; padding: 0; justify-content: center; background: transparent; border-color: transparent; box-shadow: none;
  color: var(--dsw-alias-label-tertiary); }
.dtl-act-icon:hover { color: var(--dsw-alias-label-primary); }
.dtl-act-icon[data-danger="true"]:hover { background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-label-error); }

.dtl-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 74px 18px 84px;
  text-align: center; }
.dtl-emptytile { width: 62px; height: 62px; display: flex; align-items: center; justify-content: center;
  border-radius: 18px; background: var(--dsw-alias-bg-module-platform, #f5f6f7); color: var(--dsw-alias-label-tertiary); }
.dtl-emptytitle { font-size: 14.5px; font-weight: 600; }
.dtl-emptyhint { max-width: 380px; font-size: 12.5px; color: var(--dsw-alias-label-caption, #a8adb5); }

.dtl-foot { display: flex; align-items: center; gap: 10px; padding: 8px 14px; font-size: 12px;
  color: var(--dsw-alias-label-caption, #a8adb5); border-top: 1px solid var(--dsw-alias-border-l2, #0000001a); }
.dtl-foot button { margin-left: auto; }
.dtl-error { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; font-size: 12.5px;
  color: var(--dsw-alias-label-error); background: var(--dsw-alias-bg-module-platform, #f5f6f7); }
.dtl-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 60; max-width: 520px;
  padding: 9px 16px; border-radius: 999px; font-size: 12.5px; background: var(--dsw-alias-toast-bg);
  color: var(--dsw-alias-toast-label); box-shadow: 0 10px 26px rgba(0,0,0,.2);
  animation: dtl-rise .18s ease-out; pointer-events: none; }
@keyframes dtl-rise { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
`

    // ----------------------------------------------------------------- icons

    function svg(size, children, extra) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          ...extra,
        },
        children,
      )
    }

    const IconList = size =>
      svg(size, [
        h('path', { key: 'a', d: 'M4 5.6l1.5 1.5L8.2 4.4' }),
        h('path', { key: 'b', d: 'M11.4 5.9h5' }),
        h('path', { key: 'c', d: 'M4 14.2l1.5 1.5 2.7-2.7' }),
        h('path', { key: 'd', d: 'M11.4 14.5h5' }),
      ])

    const IconRefresh = size =>
      svg(size, [
        h('path', { key: 'a', d: 'M16.2 9.2a6.2 6.2 0 1 1-1.9-4.4' }),
        h('path', { key: 'b', d: 'M16.4 3.6v4.1h-4.1' }),
      ])

    const IconPlus = size => svg(size, [h('path', { key: 'a', d: 'M10 4.6v10.8M4.6 10h10.8' })])

    const IconGrip = size =>
      svg(size, [0, 1, 2].map(i =>
        h('g', { key: i }, [
          h('circle', { key: 'l', cx: 7.4, cy: 6.4 + i * 3.6, r: 1.15, fill: 'currentColor', stroke: 'none' }),
          h('circle', { key: 'r', cx: 12.6, cy: 6.4 + i * 3.6, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        ]),
      ))

    const IconPlay = size => svg(size, [h('path', { key: 'a', d: 'M7 4.6l8 5.4-8 5.4z', strokeLinejoin: 'round' })], { fill: 'currentColor', strokeWidth: 1 })

    const IconBolt = size => svg(size, [h('path', { key: 'a', d: 'M10.8 2.4L4.6 11h4l-.9 6.6L15.4 9h-4z' })])

    const IconChat = size =>
      svg(size, [
        h('path', { key: 'a', d: 'M16.4 10.2c0 3-2.9 5.4-6.4 5.4-.8 0-1.6-.1-2.3-.3l-3.1 1 .9-2.6c-.9-1-1.4-2.2-1.4-3.5 0-3 2.9-5.4 6.4-5.4s5.9 2.4 5.9 5.4z' }),
      ])

    const IconPencil = size =>
      svg(size, [
        h('path', { key: 'a', d: 'M12.9 3.6l3.5 3.5-8.6 8.6-4.3.8.8-4.3z' }),
        h('path', { key: 'b', d: 'M11.3 5.2l3.5 3.5' }),
      ])

    const IconTrash = size =>
      svg(size, [
        h('path', { key: 'a', d: 'M3.8 5.6h12.4' }),
        h('path', { key: 'b', d: 'M7.4 5.6V3.9h5.2v1.7' }),
        h('path', { key: 'c', d: 'M5.6 5.6l.8 9.1c0 .8.7 1.4 1.5 1.4h4.2c.8 0 1.5-.6 1.5-1.4l.8-9.1' }),
      ])

    const IconUp = size => svg(size, [h('path', { key: 'a', d: 'M10 15.4V5.2M5.6 9.4L10 5l4.4 4.4' })])

    const IconDown = size => svg(size, [h('path', { key: 'a', d: 'M10 4.6v10.2M5.6 10.6L10 15l4.4-4.4' })])

    const IconFolder = size =>
      svg(size, [h('path', { key: 'a', d: 'M3.4 6.1c0-.9.7-1.6 1.6-1.6h2.6l1.6 1.9h6c.9 0 1.6.7 1.6 1.6v5.9c0 .9-.7 1.6-1.6 1.6H5c-.9 0-1.6-.7-1.6-1.6z' })])

    const IconChevron = size => svg(size, [h('path', { key: 'a', d: 'M6.2 8l3.8 3.9L13.8 8' })])

    const IconCheck = size => svg(size, [h('path', { key: 'a', d: 'M4.5 10.4l3.5 3.5 7.5-7.6' })])

    const IconUndo = size =>
      svg(size, [
        h('path', { key: 'a', d: 'M6.6 7.2H12a3.6 3.6 0 010 7.2H7.4' }),
        h('path', { key: 'b', d: 'M8.8 4.4L5.9 7.2l2.9 2.8' }),
      ])

    /** Give a bare icon element a React key when it joins a children array. */
    function ic(key, element) {
      return element === null || element === undefined ? null : React.cloneElement(element, { key })
    }

    // --------------------------------------------------------------- helpers

    function newId() {
      return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    }

    function requestId() {
      return `todolist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }

    function titleOf(text) {
      const line = text
        .split('\n')
        .map(part => part.trim())
        .find(part => part.length > 0)
      const flat = (line ?? '').replace(/\s+/g, ' ').trim()
      return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat
    }

    function emptyEntry() {
      return { items: [], autoRun: false, mode: 'same', sessionId: null, draft: '' }
    }

    function normalizeEntry(raw) {
      if (raw === null || typeof raw !== 'object') return emptyEntry()
      const items = Array.isArray(raw.items)
        ? raw.items
            .filter(item => item !== null && typeof item === 'object' && typeof item.text === 'string')
            .map(item => ({
              id: typeof item.id === 'string' && item.id.length > 0 ? item.id : newId(),
              text: item.text,
              title: typeof item.title === 'string' && item.title.length > 0 ? item.title : titleOf(item.text),
              status: item.status === 'done' ? 'done' : 'pending',
              createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
              doneAt: typeof item.doneAt === 'number' ? item.doneAt : undefined,
            }))
        : []
      return {
        items,
        autoRun: raw.autoRun === true,
        mode: raw.mode === 'new' ? 'new' : 'same',
        sessionId: typeof raw.sessionId === 'string' && raw.sessionId.length > 0 ? raw.sessionId : null,
        draft: typeof raw.draft === 'string' ? raw.draft.slice(0, MAX_CHARS) : '',
      }
    }

    function timeLabel(value) {
      if (typeof value !== 'number') return ''
      const date = new Date(value)
      const pad = n => String(n).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function workspaceNameOf(view) {
      if (view === undefined) return ''
      const title = typeof view.title === 'string' ? view.title.trim() : ''
      if (title.length > 0) return title
      const path = typeof view.path === 'string' ? view.path : ''
      const parts = path.split(/[\\/]/).filter(part => part.length > 0)
      return parts[parts.length - 1] ?? path
    }

    // ----------------------------------------------------------------- store

    function createTodoStore() {
      let snapshot = {
        phase: 'loading',
        workspaces: {},
        error: null,
        revision: 0,
        notice: null,
      }
      const listeners = new Set()
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      return {
        get: () => snapshot,
        set(patch) {
          snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 }
          emit()
        },
        patch(update) {
          const next = update(snapshot)
          snapshot = { ...next, revision: snapshot.revision + 1 }
          emit()
        },
        notice(text) {
          snapshot = { ...snapshot, notice: { text, at: Date.now(), seq: (snapshot.notice?.seq ?? 0) + 1 } }
          emit()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      }
    }

    const store = createTodoStore()

    function useStoreSnapshot() {
      const [snapshot, setSnapshot] = useState(store.get)
      useEffect(() => store.subscribe(() => setSnapshot(store.get())), [])
      return snapshot
    }

    function entryFor(workspaces, workspaceId) {
      return normalizeEntry(workspaces[workspaceId])
    }

    // ---------------------------------------------------------------- plugin

    const inject = [
      'slots',
      'locale',
      'remote',
      'remote.session',
      'sessions',
      'workspaces',
      'uiWorkspace',
      'conversation',
      'layout',
    ]

    function apply(ctx) {
      const api = createApi(ctx)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-todolist: dictionaries')
      const t = ctx.locale.bind(NS)

      function TodoPanelEntry(props) {
        return h(TodoPage, { ...props, api, t })
      }

      ctx.effect(
        () =>
          ctx.slots.inject('main', () =>
            ctx.slots.register(
              {
                name: 'main',
                key: PANEL_ID,
                locale: NS,
              },
              TodoPanelEntry,
            ),
          ),
        'dsh-todolist: panel',
      )

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 30,
                locale: NS,
                label: () => t('panel'),
              },
              SidebarIcon,
            ),
          ),
        'dsh-todolist: sidebar entry',
      )

      void api.load()
      api.watchSessions()
    }

    function SidebarIcon({ size }) {
      return IconList(typeof size === 'number' && size > 0 ? size : 18)
    }

    // ------------------------------------------------------------- behaviour

    function createApi(ctx) {
      const t = ctx.locale.bind(NS)
      const running = new Map()
      const state = {
        viewWorkspaceId: null,
        viewSessionId: null,
        submitting: false,
      }

      function sessionsOf() {
        return ctx.sessions.list.getSnapshot()
      }

      function workspacesOf() {
        return ctx.workspaces.list.getSnapshot()
      }

      function workspaceOfSession(sessionId) {
        const snapshot = workspacesOf()
        for (const view of snapshot.items ?? []) {
          if (Array.isArray(view.sessionIds) && view.sessionIds.includes(sessionId)) return view.workspaceId
        }
        return undefined
      }

      function samePath(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return false
        const norm = value => value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
        return norm(a) === norm(b)
      }

      function detectWorkspaceId() {
        const sessions = sessionsOf()
        const byId = sessions.byId ?? {}
        const items = workspacesOf().items ?? []
        for (const row of Object.values(byId)) {
          if ((row.retainedBy?.mainView ?? 0) <= 0) continue
          // The session's own cwd is the most reliable pointer at its project,
          // and unlike a sessionIds scan it cannot answer for two workspaces.
          const cwd = typeof row.cwd === 'string' ? row.cwd : undefined
          if (cwd !== undefined) {
            const byPath = items.find(view => samePath(view.path, cwd))
            if (byPath !== undefined) return byPath.workspaceId
          }
          const owned = workspaceOfSession(row.id)
          if (owned !== undefined) return owned
        }
        return items.length > 0 ? items[0].workspaceId : DEFAULT_WORKSPACE
      }

      function currentWorkspaceId() {
        return state.viewWorkspaceId ?? detectWorkspaceId()
      }

      function mainViewSessionId() {
        const byId = sessionsOf().byId ?? {}
        for (const row of Object.values(byId)) {
          if ((row.retainedBy?.mainView ?? 0) > 0) return row.id
        }
        return state.viewSessionId ?? undefined
      }

      function entryNow() {
        return entryFor(store.get().workspaces, currentWorkspaceId())
      }

      /**
       * The composer keeps half-typed text alive while the panel is unmounted
       * (switching sessions or panels must not eat it). The text lives in this
       * map for the lifetime of the page and is flushed into the entry — hence
       * onto disk — whenever it loses focus, so even a reload restores it.
       */
      const draftMemory = new Map()

      function draftFor(workspaceId) {
        if (draftMemory.has(workspaceId)) return draftMemory.get(workspaceId)
        return entryFor(store.get().workspaces, workspaceId).draft
      }

      /** Keep the text in memory only; called on every keystroke. */
      function holdDraft(text, workspaceId) {
        draftMemory.set(workspaceId ?? currentWorkspaceId(), text)
      }

      /** Flush a held draft into the entry (and disk) when the field loses focus. */
      function commitDraft(text, workspaceId) {
        const target = workspaceId ?? currentWorkspaceId()
        draftMemory.set(target, text)
        if (entryFor(store.get().workspaces, target).draft === text) return
        store.patch(snapshot => {
          const entry = entryFor(snapshot.workspaces, target)
          return {
            ...snapshot,
            workspaces: { ...snapshot.workspaces, [target]: { ...entry, draft: text } },
          }
        })
        persist(target)
      }

      function updateEntry(mutate, workspaceId) {
        const target = workspaceId ?? currentWorkspaceId()
        store.patch(snapshot => {
          const current = entryFor(snapshot.workspaces, target)
          const next = mutate({ ...current, items: [...current.items] }) ?? current
          return {
            ...snapshot,
            workspaces: { ...snapshot.workspaces, [target]: next },
          }
        })
        persist(target)
      }

    // One debounce timer per workspace: two workspaces saving at the same time
    // must not cancel each other. Before, a single shared timer meant a queue
    // item marked done in the background could lose its write and be sent
    // again on the next turn.
    const saveTimers = new Map()
    const writeChains = new Map()

    function persist(workspaceId) {
      const pending = saveTimers.get(workspaceId)
      if (pending !== undefined) clearTimeout(pending)
      saveTimers.set(
        workspaceId,
        setTimeout(() => {
          saveTimers.delete(workspaceId)
          void flush(workspaceId)
        }, 220),
      )
    }

    /** Write the entry now, strictly after any write that is already running. */
    async function flush(workspaceId) {
      const previous = writeChains.get(workspaceId) ?? Promise.resolve()
      const next = previous.then(
        () => sendEntry(workspaceId),
        () => sendEntry(workspaceId),
      )
      writeChains.set(workspaceId, next)
      try {
        await next
      } finally {
        if (writeChains.get(workspaceId) === next) writeChains.delete(workspaceId)
      }
    }

    /** Skip the debounce: used when the next turn must already see the state. */
    async function flushNow(workspaceId) {
      const pending = saveTimers.get(workspaceId)
      if (pending !== undefined) {
        clearTimeout(pending)
        saveTimers.delete(workspaceId)
      }
      await flush(workspaceId)
    }

    async function sendEntry(workspaceId) {
      const entry = entryFor(store.get().workspaces, workspaceId)
      const stamp = store.get().revision
      try {
        const response = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceId, entry }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = await response.json()
        if (body !== null && typeof body === 'object' && body.workspaces !== null && typeof body.workspaces === 'object') {
          // The echo is only authoritative when nothing changed locally while
          // the request was in flight; adopting it otherwise silently reverts
          // what the user just typed or toggled.
          if (store.get().revision !== stamp) {
            persist(workspaceId)
            return
          }
          store.set({ phase: 'ready', workspaces: body.workspaces, error: null })
        }
      } catch (error) {
        store.set({ error: String((error && error.message) || error) })
      }
    }

      async function load() {
        store.set({ phase: store.get().phase === 'ready' ? 'ready' : 'loading', error: null })
        try {
          const response = await fetch(ROUTE, { cache: 'no-store', headers: { accept: 'application/json' } })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const body = await response.json()
          store.set({
            phase: 'ready',
            workspaces: body !== null && typeof body === 'object' && body.workspaces ? body.workspaces : {},
            error: null,
          })
        } catch (error) {
          store.set({ phase: 'error', error: String((error && error.message) || error) })
        }
      }

      function watchSessions() {
        ctx.effect(
          () =>
            ctx.remote.$on('api-session/status', (sessionId, isRunning) => {
              const previous = running.get(sessionId)
              running.set(sessionId, isRunning === true)
              if (isRunning === true) return
              if (previous !== true) return
              void afterTurnEnd(sessionId)
            }),
          'dsh-todolist: session status',
        )
      }

      function eligible(sessionId) {
        const row = (sessionsOf().byId ?? {})[sessionId]
        if (row === undefined) return false
        if (row.parentId !== undefined && row.parentId !== null) return false
        if (state.submitting) return false
        return true
      }

      /**
       * A turn ended somewhere. Only the workspace that owns that session can
       * pull its next todo — and it never navigates: the prompt is queued into
       * the session that just finished, so nothing moves under the user's hands
       * while they are typing in the panel.
       */
      async function afterTurnEnd(sessionId) {
        if (!eligible(sessionId)) return
        if (store.get().phase !== 'ready') return
        const workspaceId = workspaceOfSession(sessionId)
        if (workspaceId === undefined) return
        const entry = entryFor(store.get().workspaces, workspaceId)
        if (!entry.autoRun) return
        const next = entry.items.find(item => item.status === 'pending')
        if (next === undefined) return
        state.submitting = true
        try {
          const result = await dispatch(next, entry.mode, sessionId, workspaceId)
          store.notice(result.ok ? `${t('autoStart')}${next.title}` : result.message)
        } finally {
          state.submitting = false
        }
      }

      const dispatched = new Set()

      /** Send one todo into the model: same session, or a freshly created one. */
      async function dispatch(item, mode, sessionId, workspaceId) {
        const target = workspaceId ?? currentWorkspaceId()
        if (dispatched.has(item.id)) return { ok: false, message: t('submitted') }
        dispatched.add(item.id)
        // Mark the item done and get that onto disk *before* the prompt goes
        // out. If the write were late, a turn could end in between and the very
        // same todo would be queued twice.
        markDone(item.id, target)
        await flushNow(target)
        let targetSession = sessionId
        if (mode === 'new' || targetSession === undefined) {
          try {
            const created = await ctx.sessions.create(target === DEFAULT_WORKSPACE ? {} : { workspaceId: target })
            targetSession = typeof created === 'string' ? created : created?.sessionId
          } catch {
            targetSession = undefined
          }
        }
        if (typeof targetSession !== 'string' || targetSession.length === 0) {
          markPending(item.id, target)
          dispatched.delete(item.id)
          await flushNow(target)
          return { ok: false, message: t('saveFailed') }
        }
        const response = await ctx.remote.session.prompt({
          requestId: requestId(),
          sessionId: targetSession,
          mode: 'queue',
          content: [{ type: 'text', text: item.text }],
        })
        if (response !== null && typeof response === 'object' && response.ok === true) {
          return { ok: true, sessionId: targetSession }
        }
        const message = response?.error?.message ?? response?.error?.code ?? 'prompt rejected'
        markPending(item.id, target)
        dispatched.delete(item.id)
        await flushNow(target)
        return { ok: false, message: String(message) }
      }

      function markDone(itemId, workspaceId) {
        updateEntry(
          entry => ({
            ...entry,
            items: entry.items.map(item =>
              item.id === itemId ? { ...item, status: 'done', doneAt: Date.now() } : item,
            ),
          }),
          workspaceId,
        )
      }

      function markPending(itemId, workspaceId) {
        updateEntry(
          entry => ({
            ...entry,
            items: entry.items.map(item =>
              item.id === itemId ? { ...item, status: 'pending', doneAt: undefined } : item,
            ),
          }),
          workspaceId,
        )
      }

      function fillDraft(text, workspaceId) {
        const conversation = ctx.get('conversation')
        const target = mainViewSessionId()
        if (conversation !== undefined && target !== undefined) {
          const binding = ctx.sessions.binding(target)
          if (binding !== undefined) {
            try {
              const result = conversation.input.requestDraftInitialization(binding, {
                prompt: text,
                whenDraftExists: 'append',
              })
              if (result !== 'blocked') {
                ctx.uiWorkspace.openSession(target)
                return true
              }
            } catch {
              // fall through to a new session draft
            }
          }
        }
        try {
          ctx.uiWorkspace.startSession(workspaceId === DEFAULT_WORKSPACE ? undefined : workspaceId, {
            prompt: text,
            whenDraftExists: 'append',
          })
          return true
        } catch {
          return false
        }
      }

      return {
        store,
        load,
        watchSessions,
        detectWorkspaceId,
        currentWorkspaceId,
        entryNow,
        runState: state,

        setViewWorkspace(workspaceId) {
          state.viewWorkspaceId = workspaceId
        },
        setViewSession(sessionId) {
          state.viewSessionId = sessionId ?? null
        },

        refresh() {
          void load()
        },

        addItem(text) {
          const trimmed = text.trim()
          if (trimmed.length === 0) return
          updateEntry(entry => ({
            ...entry,
            draft: '',
            items: [
              ...entry.items,
              { id: newId(), text: trimmed, title: titleOf(trimmed), status: 'pending', createdAt: Date.now() },
            ],
          }))
          draftMemory.set(currentWorkspaceId(), '')
        },

        draftFor,
        holdDraft,
        commitDraft,

        updateText(itemId, text) {
          const trimmed = text.trim()
          if (trimmed.length === 0) {
            this.removeItem(itemId)
            return
          }
          updateEntry(entry => ({
            ...entry,
            items: entry.items.map(item =>
              item.id === itemId
                ? { ...item, text: trimmed, title: titleOf(trimmed), status: 'pending', doneAt: undefined }
                : item,
            ),
          }))
        },

        removeItem(itemId) {
          updateEntry(entry => ({ ...entry, items: entry.items.filter(item => item.id !== itemId) }))
        },

        toggleDone(itemId) {
          updateEntry(entry => ({
            ...entry,
            items: entry.items.map(item =>
              item.id !== itemId
                ? item
                : item.status === 'done'
                  ? { ...item, status: 'pending', doneAt: undefined }
                  : { ...item, status: 'done', doneAt: Date.now() },
            ),
          }))
        },

        clearDone() {
          updateEntry(entry => ({ ...entry, items: entry.items.filter(item => item.status !== 'done') }))
        },

        moveItem(itemId, targetId) {
          updateEntry(entry => {
            const from = entry.items.findIndex(item => item.id === itemId)
            const to = entry.items.findIndex(item => item.id === targetId)
            if (from < 0 || to < 0 || from === to) return entry
            const items = [...entry.items]
            const [moved] = items.splice(from, 1)
            items.splice(to, 0, moved)
            return { ...entry, items }
          })
        },

        setAutoRun(enabled) {
          updateEntry(entry => ({ ...entry, autoRun: enabled }))
        },

        setMode(mode) {
          updateEntry(entry => ({ ...entry, mode: mode === 'new' ? 'new' : 'same' }))
        },

        async startItem(item) {
          if (state.submitting) return
          state.submitting = true
          try {
            const entry = entryNow()
            const result = await dispatch(item, entry.mode, mainViewSessionId(), currentWorkspaceId())
            store.notice(result.ok ? `${t('submitted')}${item.title}` : result.message)
          } finally {
            state.submitting = false
          }
        },

        fillItem(item) {
          const ok = fillDraft(item.text, currentWorkspaceId())
          store.notice(ok ? t('filled') : t('saveFailed'))
        },
      }
    }

    // ------------------------------------------------------------------ page

    function TodoPage(props) {
      const { api, t } = props
      const snapshot = useStoreSnapshot()
      const sessions = props.useSessions(SELECT_ALL)
      const workspaces = props.useWorkspaces(SELECT_ALL)

      const [draft, setDraft] = useState('')
      const [dragging, setDragging] = useState(null)
      const [dropTarget, setDropTarget] = useState(null)
      const [editing, setEditing] = useState(null)
      const [menuOpen, setMenuOpen] = useState(false)
      const [toast, setToast] = useState(null)
      const menuRef = useRef(null)
      const textareaRef = useRef(null)

      const detected = useMemo(() => api.detectWorkspaceId(), [sessions, workspaces])
      const workspaceId = api.runState.viewWorkspaceId ?? detected
      const entry = entryFor(snapshot.workspaces, workspaceId)

      // The half-typed composer text must survive panel unmounts and workspace
      // switches: it is held by the api while the field is away, restored when
      // the panel comes back, and flushed onto disk when it loses focus.
      const draftRef = useRef(draft)
      draftRef.current = draft
      const draftWorkspace = useRef(null)
      useEffect(() => {
        if (draftWorkspace.current === workspaceId) return
        if (draftWorkspace.current !== null) api.commitDraft(draftRef.current, draftWorkspace.current)
        draftWorkspace.current = workspaceId
        setDraft(api.draftFor(workspaceId))
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [workspaceId])
      useEffect(
        () => () => {
          if (draftWorkspace.current !== null) api.commitDraft(draftRef.current, draftWorkspace.current)
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
      )
      // Opening the panel always shows what is actually on disk, and returning
      // to the window re-syncs it: a stale panel must never write an old entry
      // over items that another window added in the meantime.
      useEffect(() => {
        void api.refresh()
        const onFocus = () => {
          void api.refresh()
        }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const pending = entry.items.filter(item => item.status === 'pending').length
      const done = entry.items.length - pending

      api.setViewWorkspace(workspaceId)

      const mainSessionId = useMemo(() => {
        for (const row of Object.values(sessions.byId ?? {})) {
          if ((row.retainedBy?.mainView ?? 0) > 0) return row.id
        }
        return undefined
      }, [sessions])

      useEffect(() => {
        api.setViewSession(mainSessionId)
      }, [mainSessionId])

      const workspaceViews = workspaces.items ?? []
      const currentView = workspaceViews.find(view => view.workspaceId === workspaceId)
      const workspaceLabel = workspaceNameOf(currentView) || t('workspace')

      useEffect(() => {
        const notice = snapshot.notice
        if (notice === null || notice === undefined) return
        setToast(notice.text)
        const timer = setTimeout(() => setToast(null), 2600)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [snapshot.notice?.seq])

      useEffect(() => {
        if (!menuOpen) return undefined
        const onDown = event => {
          if (menuRef.current !== null && menuRef.current.contains(event.target)) return
          setMenuOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [menuOpen])

      const submitDraft = useCallback(() => {
        if (draft.trim().length === 0) return
        api.addItem(draft)
        setDraft('')
        textareaRef.current?.focus()
      }, [api, draft])

      const flushDraft = useCallback(() => {
        api.commitDraft(draftRef.current, draftWorkspace.current ?? workspaceId)
      }, [api, workspaceId])

      const onKeyDown = event => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          submitDraft()
        }
      }

      const rows = entry.items.map((item, index) =>
        h(Row, {
          key: item.id,
          item,
          index,
          total: entry.items.length,
          t,
          api,
          editing: editing === item.id,
          onEdit: () => setEditing(item.id),
          onEditDone: () => setEditing(null),
          dragging: dragging === item.id,
          dropTarget: dropTarget === item.id,
          onDragStart: () => setDragging(item.id),
          onDragOver: () => setDropTarget(item.id),
          onDrop: () => {
            if (dragging !== null && dragging !== item.id) api.moveItem(dragging, item.id)
            setDragging(null)
            setDropTarget(null)
          },
          onDragEnd: () => {
            setDragging(null)
            setDropTarget(null)
          },
        }),
      )

      const body =
        snapshot.phase === 'loading'
          ? h('div', { className: 'dtl-empty' }, [h('div', { key: 't', className: 'dtl-emptyhint' }, t('loading'))])
          : entry.items.length === 0
            ? h('div', { className: 'dtl-empty' }, [
                h('div', { key: 'i', className: 'dtl-emptytile' }, IconList(26)),
                h('div', { key: 't', className: 'dtl-emptytitle' }, t('empty')),
                h('div', { key: 'h', className: 'dtl-emptyhint' }, t('emptyHint')),
              ])
            : h('div', { className: 'dtl-list' }, rows)

      return h(
        'div',
        { className: 'dtl-root' },
        h('style', { key: 'css' }, CSS),
        h('div', { className: 'dtl-inner' }, [
          h('header', { key: 'head', className: 'dtl-head' }, [
            h('div', { key: 'b', className: 'dtl-badge' }, IconList(24)),
            h('div', { key: 'tx', className: 'dtl-headtext' }, [
              h('h1', { key: 'h', className: 'dtl-h1' }, t('title')),
              h('p', { key: 's', className: 'dtl-sub' }, `${entry.items.length} ${t('itemsUnit')}`),
            ]),
            h('div', { key: 'side', className: 'dtl-headside' }, [
              workspaceViews.length > 1
                ? h(
                    'div',
                    { key: 'ws', style: { position: 'relative' }, ref: menuRef },
                    [
                      h(
                        'button',
                        {
                          key: 'chip',
                          className: 'dtl-chip',
                          type: 'button',
                          title: t('workspace'),
                          onClick: () => setMenuOpen(open => !open),
                        },
                        [ic('f', IconFolder(14)), h('span', { key: 'n' }, workspaceLabel), ic('c', IconChevron(14))],
                      ),
                      menuOpen
                        ? h('div', { key: 'menu', className: 'dtl-menu', style: { right: 0, top: '100%' } }, [
                            h('div', { key: 'mt', className: 'dtl-menu-title' }, t('workspace')),
                            ...workspaceViews.map(view =>
                              h(
                                'button',
                                {
                                  key: view.workspaceId,
                                  type: 'button',
                                  className: 'dtl-menuitem',
                                  'data-active': String(view.workspaceId === workspaceId),
                                  onClick: () => {
                                    api.setViewWorkspace(view.workspaceId)
                                    setMenuOpen(false)
                                  },
                                },
                                [ic('f', IconFolder(14)), h('span', { key: 'l' }, workspaceNameOf(view) || view.workspaceId)],
                              ),
                            ),
                          ])
                        : null,
                    ],
                  )
                : null,
              h(
                'button',
                {
                  key: 'refresh',
                  type: 'button',
                  className: 'dtl-iconbtn',
                  title: t('refresh'),
                  'aria-label': t('refresh'),
                  'data-busy': String(snapshot.phase === 'loading'),
                  onClick: () => api.refresh(),
                },
                IconRefresh(17),
              ),
            ]),
          ]),

          h(
            'section',
            { key: 'composer', className: 'dtl-card dtl-composer' },
            [
              h('textarea', {
                key: 'input',
                ref: textareaRef,
                className: 'dtl-textarea',
                value: draft,
                placeholder: t('placeholder'),
                maxLength: MAX_CHARS,
                spellCheck: false,
                onChange: event => {
                  const next = event.target.value.slice(0, MAX_CHARS)
                  setDraft(next)
                  api.holdDraft(next, workspaceId)
                },
                onBlur: flushDraft,
                onKeyDown,
              }),
              h('div', { key: 'foot', className: 'dtl-composerfoot' }, [
                h(
                  'span',
                  { key: 'c', className: 'dtl-counter', 'data-over': String(draft.length > MAX_CHARS) },
                  `${draft.length}/${MAX_CHARS}`,
                ),
                h('span', { key: 'hint', className: 'dtl-hint' }, t('shortcut')),
                h(
                  'button',
                  {
                    key: 'add',
                    type: 'button',
                    className: 'dtl-btn dtl-btn-primary',
                    disabled: draft.trim().length === 0,
                    onClick: submitDraft,
                  },
                  [ic('p', IconPlus(15)), h('span', { key: 'l' }, t('add'))],
                ),
              ]),
            ],
          ),

          h('section', { key: 'settings', className: 'dtl-card dtl-settings' }, [
            h('div', { key: 'sw', className: 'dtl-switchwrap' }, [
              h(
                'button',
                {
                  key: 'b',
                  type: 'button',
                  className: 'dtl-switch',
                  role: 'switch',
                  'aria-checked': String(entry.autoRun),
                  'data-on': String(entry.autoRun),
                  onClick: () => api.setAutoRun(!entry.autoRun),
                },
                [h('i', { key: 'thumb' })],
              ),
              h('div', { key: 'l', className: 'dtl-switchlabel' }, [
                h('b', { key: 'n' }, t('autoRun')),
                h('small', { key: 'd' }, t('autoRunHint')),
              ]),
            ]),
            h('div', { key: 'pos', className: 'dtl-segmented' }, [
              h(
                'button',
                {
                  key: 'same',
                  type: 'button',
                  className: 'dtl-seg',
                  'data-active': String(entry.mode === 'same'),
                  title: t('modeSameHint'),
                  onClick: () => api.setMode('same'),
                },
                t('modeSame'),
              ),
              h(
                'button',
                {
                  key: 'new',
                  type: 'button',
                  className: 'dtl-seg',
                  'data-active': String(entry.mode === 'new'),
                  title: t('modeNewHint'),
                  onClick: () => api.setMode('new'),
                },
                t('modeNew'),
              ),
            ]),
            entry.autoRun
              ? h('div', { key: 'scope', className: 'dtl-anchor' }, [
                  ic('i', IconFolder(13)),
                  h('span', { key: 't', className: 'dtl-anchor-text' }, `${t('scope')}${workspaceLabel}`),
                  h('span', { key: 'h', className: 'dtl-anchor-hint' }, t('scopeHint')),
                ])
              : null,
          ]),

          snapshot.error !== null && snapshot.error !== undefined
            ? h('div', { key: 'err', className: 'dtl-error' }, [
                h('span', { key: 'm' }, `${snapshot.phase === 'error' ? t('loadError') : t('saveFailed')} · ${String(snapshot.error)}`),
                h(
                  'button',
                  { key: 'r', type: 'button', className: 'dtl-btn', onClick: () => api.refresh() },
                  t('retry'),
                ),
              ])
            : null,

          h('section', { key: 'list', className: 'dtl-card' }, [
            React.cloneElement(body, { key: 'body' }),
            done > 0
              ? h('div', { key: 'foot', className: 'dtl-foot' }, [
                  h('span', { key: 'd' }, `${done} ${t('doneUnit')}`),
                  h(
                    'button',
                    { key: 'c', type: 'button', className: 'dtl-btn', onClick: () => api.clearDone() },
                    t('clearDone'),
                  ),
                ])
              : null,
          ]),
        ]),

        toast !== null
          ? h('div', { key: 'toast', className: 'dtl-toast', role: 'status' }, toast)
          : null,
      )
    }

    function Row(props) {
      const { item, index, total, t, api, editing, onEdit, onEditDone, dragging, dropTarget } = props
      const [value, setValue] = useState(item.text)

      useEffect(() => {
        if (editing) setValue(item.text)
      }, [editing, item.text])

      const commit = () => {
        api.updateText(item.id, value)
        onEditDone()
      }

      const body = editing
        ? h('div', { className: 'dtl-body' }, [
            h('textarea', {
              key: 'e',
              className: 'dtl-edit',
              value,
              autoFocus: true,
              onChange: event => setValue(event.target.value.slice(0, MAX_CHARS)),
              onKeyDown: event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onEditDone()
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  commit()
                }
              },
            }),
            h('div', { key: 'm', className: 'dtl-meta' }, [
              h('span', { key: 'a' }, t('shortcut')),
            ]),
          ])
        : h('div', { className: 'dtl-body' }, [
            h(
              'div',
              {
                key: 't',
                className: 'dtl-title',
                onDoubleClick: onEdit,
                title: item.text.length > 200 ? `${item.text.slice(0, 200)}…` : item.text,
              },
              item.title || titleOf(item.text),
            ),
            h('div', { key: 'm', className: 'dtl-meta' }, [
              h('span', { key: 'i' }, `#${index + 1}`),
              h('span', { key: 'c' }, timeLabel(item.createdAt)),
              item.status === 'done'
                ? h('span', { key: 'd' }, `${t('doneUnit')} · ${timeLabel(item.doneAt)}`)
                : null,
            ]),
          ])

      const actions = editing
        ? [
            h(
              'button',
              { key: 'save', type: 'button', className: 'dtl-act', onClick: commit },
              [ic('c', IconCheck(14)), h('span', { key: 'l' }, t('save'))],
            ),
            h(
              'button',
              { key: 'cancel', type: 'button', className: 'dtl-act', onClick: onEditDone },
              t('cancel'),
            ),
          ]
        : [
            item.status === 'pending'
              ? h(
                  'button',
                  {
                    key: 'start',
                    type: 'button',
                    className: 'dtl-act',
                    title: t('start'),
                    onClick: () => void api.startItem(item),
                  },
                  [ic('p', IconPlay(13)), h('span', { key: 'l' }, t('start'))],
                )
              : null,
            h(
              'button',
              {
                key: 'fill',
                type: 'button',
                className: 'dtl-act',
                title: t('fill'),
                onClick: () => api.fillItem(item),
              },
              [ic('c', IconChat(14)), h('span', { key: 'l' }, t('fill'))],
            ),
            h(
              'button',
              {
                key: 'done',
                type: 'button',
                className: 'dtl-act dtl-act-icon',
                title: item.status === 'done' ? t('reopen') : t('markDone'),
                onClick: () => api.toggleDone(item.id),
              },
              item.status === 'done' ? IconUndo(14) : IconCheck(14),
            ),
            h(
              'button',
              {
                key: 'edit',
                type: 'button',
                className: 'dtl-act dtl-act-icon',
                title: t('edit'),
                onClick: onEdit,
              },
              IconPencil(14),
            ),
            h(
              'button',
              {
                key: 'remove',
                type: 'button',
                className: 'dtl-act dtl-act-icon',
                title: t('remove'),
                'data-danger': 'true',
                onClick: () => api.removeItem(item.id),
              },
              IconTrash(14),
            ),
          ]

      const grip = h(
        'button',
        {
          key: 'g',
          type: 'button',
          className: 'dtl-grip',
          title: t('dragHandle'),
          draggable: true,
          onDragStart: event => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', item.id)
            props.onDragStart()
          },
          onDragEnd: props.onDragEnd,
        },
        IconGrip(18),
      )

      return h(
        'div',
        {
          className: 'dtl-row',
          'data-done': String(item.status === 'done'),
          'data-dragging': String(dragging),
          'data-drop': String(dropTarget),
          'data-editing': String(editing),
          onDragOver: event => {
            if (dragging === null) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            props.onDragOver()
          },
          onDrop: event => {
            event.preventDefault()
            props.onDrop()
          },
        },
        [grip === null ? null : React.cloneElement(grip, { key: 'grip' }), React.cloneElement(body, { key: 'body' }), h('div', { key: 'a', className: 'dtl-actions' }, actions)],
      )
    }

    return { inject, apply }
  },
})
