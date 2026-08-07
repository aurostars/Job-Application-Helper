# AI Scan Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate `AI 扫描填充` action that scans the whole page and fills fields through the existing AI section-fill pipeline, while preserving `快速填充`.

**Architecture:** The popup exposes a second action message. The content script collects blank writable fields across the page, groups them by detected form section, and sequentially reuses `AI_FILL_SECTION`; the background and prompt contracts remain unchanged except for the new content-script entry message.

**Tech Stack:** React, TypeScript, Chrome Extension Manifest V3, Vitest.

## Global Constraints

- Keep `FILL_FORM` behavior unchanged.
- AI scan fills only currently blank, visible, writable controls.
- Preserve existing select, combobox, date-range, cancellation, and resume-upload behavior.
- Do not add a screenshot or external vision dependency in this iteration.

### Task 1: Page field grouping

**Files:**
- Modify: `src/content/index.ts`
- Test: `src/content/pageScan.test.ts`

- [ ] Write a failing test for grouping fields by section and retaining field metadata.
- [ ] Run the focused test and verify it fails because the helper is missing.
- [ ] Implement the minimal exported pure helper and page scan entry.
- [ ] Run the focused test and verify it passes.

### Task 2: AI scan message and popup action

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/popup/App.tsx`
- Modify: `src/popup/index.css`
- Modify: `src/content/index.ts`

- [ ] Add `START_AI_PAGE_FILL` to the message union.
- [ ] Add the `AI 扫描填充` popup button with independent loading state.
- [ ] Handle the message in the content script and run grouped AI fills sequentially.
- [ ] Preserve the existing `FILL_FORM` action unchanged.

### Task 3: Verification

**Files:**
- Test: existing project test suite

- [ ] Run the focused page-scan test.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Inspect the final diff and confirm only the planned files changed.
