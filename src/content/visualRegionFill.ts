import type {
  Message,
  MessageResponse,
  VisualRegionControlCandidate,
  VisualRegionFillMapping,
  VisualRegionFillMappingResult,
  VisualRegionFillPayload,
  VisualRegionFillRequestPayload,
  VisualRegionSelectionRect,
} from '../shared/types.ts';

type WritableControl =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

type FillValuesInput = Array<{
  element: WritableControl | { id?: string };
  value: string;
}>;

type FillElementValues = (
  values: FillValuesInput,
  shouldContinue: () => boolean,
) => Promise<number>;

type SelectionBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

interface VisualControlBinding extends VisualRegionControlCandidate {
  element?: WritableControl;
  value?: string;
  rect: VisualRegionControlCandidate['rect'] & {
    right?: number;
    bottom?: number;
  };
}

interface VisualRegionStatusHandle {
  setCancelHandler(handler: () => void | Promise<void>): void;
  update(
    text: string,
    type?: 'normal' | 'success' | 'warning' | 'error',
  ): void;
}

interface VisualRegionFillControllerDeps {
  sendRuntimeMessage<T = unknown>(message: Message): Promise<MessageResponse<T>>;
  fillElementValues: FillElementValues;
}

const DEFAULT_FILL_ELEMENT_VALUES: FillElementValues = async () => {
  throw new Error('缺少表单写回实现');
};

export function createVisualRegionFillController(
  deps: VisualRegionFillControllerDeps,
): { beginVisualRegionFill(): void } {
  let cleanupSelection: (() => void) | null = null;

  const beginVisualRegionFill = () => {
    if (cleanupSelection) {
      cleanupSelection();
      cleanupSelection = null;
      return;
    }

    const overlay = document.createElement('div');
    const label = document.createElement('div');
    const tip = document.createElement('div');
    let selectedRegion: HTMLElement | null = null;
    let dragStart: { x: number; y: number } | null = null;
    let dragging = false;
    let suppressClick = false;

    overlay.style.cssText = 'position:fixed;z-index:1000001;border:3px solid #7657e8;border-radius:8px;background:rgba(118,87,232,.08);pointer-events:none;display:none;box-sizing:border-box;';
    label.style.cssText = 'position:fixed;z-index:1000002;padding:5px 9px;border-radius:5px;background:#7657e8;color:#fff;font:500 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none;display:none;';
    tip.textContent = '单击自动识别模块，或按住鼠标拖动画框；按 Esc 取消';
    tip.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:1000003;padding:10px 16px;border-radius:8px;background:rgba(32,33,39,.92);color:#fff;font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2);pointer-events:none;';
    document.body.append(overlay, label, tip);

    const clearOverlay = () => {
      overlay.style.display = 'none';
      label.style.display = 'none';
    };

    const updateOverlay = () => {
      if (!selectedRegion) {
        clearOverlay();
        return;
      }
      const rect = selectedRegion.getBoundingClientRect();
      overlay.style.display = 'block';
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      label.style.display = 'block';
      label.style.left = `${Math.max(8, rect.left)}px`;
      label.style.top = `${Math.max(8, rect.top - 28)}px`;
      label.textContent = getRegionName(selectedRegion);
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', updateOverlay, true);
      overlay.remove();
      label.remove();
      tip.remove();
      cleanupSelection = null;
    };

    const handleMove = (event: MouseEvent) => {
      if (dragStart) {
        const distance = Math.hypot(
          event.clientX - dragStart.x,
          event.clientY - dragStart.y,
        );
        if (distance >= 8) dragging = true;
        if (dragging) {
          selectedRegion = null;
          const left = Math.min(dragStart.x, event.clientX);
          const top = Math.min(dragStart.y, event.clientY);
          const width = Math.abs(event.clientX - dragStart.x);
          const height = Math.abs(event.clientY - dragStart.y);
          overlay.style.display = 'block';
          overlay.style.left = `${left}px`;
          overlay.style.top = `${top}px`;
          overlay.style.width = `${width}px`;
          overlay.style.height = `${height}px`;
          label.style.display = 'block';
          label.style.left = `${Math.max(8, left)}px`;
          label.style.top = `${Math.max(8, top - 28)}px`;
          label.textContent = '自定义补填区域';
          return;
        }
      }

      const target = event.target as Element | null;
      selectedRegion = target ? findSelectableRegion(target) : null;
      updateOverlay();
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      dragStart = { x: event.clientX, y: event.clientY };
      dragging = false;
    };

    const handleMouseUp = async (event: MouseEvent) => {
      if (!dragStart || !dragging) {
        dragStart = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const left = Math.min(dragStart.x, event.clientX);
      const top = Math.min(dragStart.y, event.clientY);
      const width = Math.abs(event.clientX - dragStart.x);
      const height = Math.abs(event.clientY - dragStart.y);
      dragStart = null;
      dragging = false;
      suppressClick = true;
      cleanup();

      if (width < 8 || height < 8) {
        return;
      }

      await runVisualRegionFill(
        {
          root: document.body,
          selectionRect: new DOMRect(left, top, width, height),
          pageContext: document.body.innerText || document.body.textContent || '',
        },
        deps,
      );
    };

    const handleClick = async (event: MouseEvent) => {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!selectedRegion) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const region = selectedRegion;
      cleanup();
      await runVisualRegionFill(
        {
          root: region,
          selectionRect: region.getBoundingClientRect(),
          pageContext: region.innerText || region.textContent || '',
        },
        deps,
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cleanup();
      }
    };

    cleanupSelection = cleanup;
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', updateOverlay, true);
  };

  return { beginVisualRegionFill };
}

export function serializeVisualControls(
  source: ParentNode | VisualControlBinding[],
  selectionRect: SelectionBounds | DOMRect,
): VisualRegionFillPayload['controls'] {
  const candidates = Array.isArray(source)
    ? source
    : collectVisualControlBindings(source);
  const bounds = normalizeSelectionBounds(selectionRect);

  return candidates
    .filter(candidate => !String(candidate.value || '').trim())
    .filter(candidate => intersectsSelection(candidate.rect, bounds))
    .map(candidate => ({
      controlId: candidate.controlId,
      tagName: candidate.tagName,
      label: candidate.label,
      name: candidate.name,
      placeholder: candidate.placeholder || '',
      options: candidate.options || [],
      rect: {
        left: candidate.rect.left,
        top: candidate.rect.top,
        width: candidate.rect.width,
        height: candidate.rect.height,
      },
      contextText: candidate.contextText || '',
    }));
}

export async function applyVisualRegionMappings(
  mappings: VisualRegionFillMapping[],
  controlsById: Map<string, { element?: WritableControl | { id?: string } }>,
  shouldContinue: () => boolean,
  fillElementValues: FillElementValues = DEFAULT_FILL_ELEMENT_VALUES,
): Promise<number> {
  const values: FillValuesInput = [];

  for (const mapping of mappings) {
    if (!shouldContinue()) break;
    const control = controlsById.get(mapping.controlId);
    if (!control?.element || !String(mapping.value || '').trim()) continue;
    if (isDomWritableControl(control.element) && currentControlValue(control.element)) continue;
    values.push({ element: control.element, value: mapping.value });
  }

  if (values.length === 0) {
    return 0;
  }

  values.sort((left, right) => {
    if (!isDomWritableControl(left.element) || !isDomWritableControl(right.element)) {
      return 0;
    }
    return getDateRangeFillPriority(left.element) - getDateRangeFillPriority(right.element);
  });

  return fillElementValues(values, shouldContinue);
}

async function runVisualRegionFill(
  input: {
    root: ParentNode;
    selectionRect: DOMRect | SelectionBounds;
    pageContext: string;
  },
  deps: VisualRegionFillControllerDeps,
): Promise<void> {
  const status = showAIRegionStatus('正在采集框选区域...');
  const requestId = crypto.randomUUID();
  let cancelled = false;

  status.setCancelHandler(async () => {
    if (cancelled) return;
    cancelled = true;
    status.update('正在终止 AI 补填...');
    await deps.sendRuntimeMessage({
      type: 'CANCEL_AI_FILL',
      payload: { requestId },
    });
    status.update('AI 补填已终止', 'warning');
  });

  try {
    const candidates = collectVisualControlBindings(input.root);
    const controls = serializeVisualControls(candidates, input.selectionRect);
    if (controls.length === 0) {
      status.update('当前选区内没有可补填的输入控件', 'warning');
      return;
    }

    const allowedIds = new Set(controls.map(control => control.controlId));
    const controlsById = new Map(
      candidates
        .filter(candidate => allowedIds.has(candidate.controlId))
        .map(candidate => [candidate.controlId, { element: candidate.element }]),
    );

    status.update(`AI 正在识别 ${controls.length} 个空白字段...`);
    const response = await deps.sendRuntimeMessage<VisualRegionFillMappingResult>({
      type: 'AI_FILL_VISUAL_REGION',
      payload: {
        requestId,
        domain: window.location.hostname,
        controls,
        region: normalizeRuntimeSelectionRect(input.selectionRect),
        pageContext: normalizeContextText(input.pageContext),
      } satisfies VisualRegionFillRequestPayload,
    });

    if (cancelled) return;
    if (!response.success || !response.data) {
      throw new Error(response.error || 'AI 未返回补填结果');
    }

    const filledCount = await applyVisualRegionMappings(
      response.data.mappings,
      controlsById,
      () => !cancelled,
      deps.fillElementValues,
    );
    if (cancelled) return;

    if (filledCount === 0) {
      status.update('AI 已识别到候选结果，但未能写入任何字段', 'warning');
      return;
    }

    const failedCount = Math.max(0, response.data.mappings.length - filledCount);
    status.update(
      failedCount > 0
        ? `AI 识别完成，成功补填 ${filledCount} 项，${failedCount} 项未能写入`
        : `AI 识别完成，成功补填 ${filledCount} 项`,
      failedCount > 0 ? 'warning' : 'success',
    );
  } catch (error) {
    if (cancelled || (error instanceof Error && /已终止|abort/i.test(error.message))) {
      status.update('AI 补填已终止', 'warning');
      return;
    }
    console.error('Visual region fill failed:', error);
    status.update(
      `AI 补填失败：${error instanceof Error ? error.message : '未知错误'}`,
      'error',
    );
  }
}

function collectVisualControlBindings(root: ParentNode): VisualControlBinding[] {
  const elements = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select',
    ),
  );

  return elements.flatMap(element => {
    if (!isWritableControl(element) || element.offsetParent === null) {
      return [];
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return [];
    }

    const container = element.closest<HTMLElement>(
      '[data-form-field-id], [data-form-field-name], [data-form-field-i18n-name], label, .ud__select, [class*=formItem], [class*=applyFormItem]',
    );
    const label = (
      element.getAttribute('data-form-field-i18n-name')
      || container?.getAttribute('data-form-field-i18n-name')
      || container?.querySelector('label')?.textContent
      || findLabelText(element)
      || ''
    ).trim();
    const name = (
      element.getAttribute('data-form-field-name')
      || container?.getAttribute('data-form-field-name')
      || element.getAttribute('data-form-field-id')
      || container?.getAttribute('data-form-field-id')
      || element.name
      || ''
    ).trim();

    return [{
      controlId: `ctrl-${crypto.randomUUID()}`,
      element,
      value: currentControlValue(element),
      tagName: element.tagName.toLowerCase(),
      label,
      name,
      placeholder: element.getAttribute('placeholder') || '',
      options: collectControlOptions(element, label, name),
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      },
      contextText: normalizeContextText(container?.textContent || element.closest<HTMLElement>('form, section, article, div')?.textContent || ''),
    }];
  });
}

function intersectsSelection(
  rect: VisualControlBinding['rect'],
  selectionRect: SelectionBounds,
): boolean {
  const right = rect.right ?? rect.left + rect.width;
  const bottom = rect.bottom ?? rect.top + rect.height;

  return !(
    right < selectionRect.left
    || rect.left > selectionRect.right
    || bottom < selectionRect.top
    || rect.top > selectionRect.bottom
  );
}

function normalizeSelectionBounds(rect: SelectionBounds | DOMRect): SelectionBounds {
  const bounds = rect as SelectionBounds;
  if (typeof bounds.right === 'number' && typeof bounds.bottom === 'number') {
    return {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
    };
  }

  const domRect = rect as DOMRect;
  return {
    left: domRect.left,
    top: domRect.top,
    right: domRect.left + domRect.width,
    bottom: domRect.top + domRect.height,
  };
}

function normalizeRuntimeSelectionRect(
  rect: SelectionBounds | DOMRect,
): VisualRegionSelectionRect {
  const bounds = normalizeSelectionBounds(rect);
  return {
    x: Math.max(0, Math.round(bounds.left)),
    y: Math.max(0, Math.round(bounds.top)),
    width: Math.max(1, Math.round(bounds.right - bounds.left)),
    height: Math.max(1, Math.round(bounds.bottom - bounds.top)),
  };
}

function normalizeContextText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function isWritableControl(
  target: EventTarget | null,
): target is WritableControl {
  if (
    !(target instanceof HTMLInputElement)
    && !(target instanceof HTMLTextAreaElement)
    && !(target instanceof HTMLSelectElement)
  ) {
    return false;
  }
  if (target.disabled) return false;

  if (target instanceof HTMLInputElement) {
    const unsupportedTypes = new Set([
      'hidden',
      'file',
      'button',
      'submit',
      'reset',
      'checkbox',
      'radio',
      'image',
    ]);
    if (unsupportedTypes.has(target.type.toLowerCase())) return false;
    if (target.readOnly) {
      return target.getAttribute('role') === 'combobox'
        && Boolean(target.closest('.ud__select'));
    }
  }

  if (target instanceof HTMLTextAreaElement && target.readOnly) return false;
  return true;
}

function isDomWritableControl(
  target: unknown,
): target is WritableControl {
  return typeof Element !== 'undefined' && isWritableControl(target as EventTarget | null);
}

function currentControlValue(element: WritableControl): string {
  if (
    element instanceof HTMLInputElement
    && element.getAttribute('role') === 'combobox'
    && element.closest('.ud__select')
  ) {
    const container = element.closest<HTMLElement>(
      '[data-form-field-id], [data-form-field-name], [data-form-field-i18n-name]',
    );
    const selectedText = (
      container?.querySelector('.ud__select__selector__selectItem')?.textContent || ''
    ).trim();
    return selectedText || element.value.trim();
  }

  if (element instanceof HTMLSelectElement) {
    const selectedText = element.options[element.selectedIndex]?.text || '';
    return element.value.trim() || selectedText.trim();
  }

  return element.value.trim();
}

function collectControlOptions(
  element: WritableControl,
  label: string,
  name: string,
): string[] {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options)
      .map(option => option.text.trim())
      .filter(Boolean);
  }

  if (label === '学历类型' || name === 'education_type') {
    return ['海外及港澳台', '统招全日制', '统招非全日制', '自考', '其他'];
  }
  if (label === '学历' || name === 'degree') {
    return ['高中', '专科', '本科', '硕士', '博士'];
  }

  return [];
}

function findLabelText(element: WritableControl): string {
  const id = element.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return label.textContent;
  }

  const parentLabel = element.closest('label');
  return parentLabel?.textContent || '';
}

function findSelectableRegion(target: Element): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[class*=applyFormModuleWrapper]'),
  ).filter(region => {
    const rect = region.getBoundingClientRect();
    return (
      region.contains(target)
      && region.querySelectorAll('input, textarea, select, [role="combobox"]').length > 0
      && rect.width > 250
      && rect.height > 80
    );
  });

  return candidates.sort((left, right) => {
    const rectA = left.getBoundingClientRect();
    const rectB = right.getBoundingClientRect();
    return rectA.width * rectA.height - rectB.width * rectB.height;
  })[0] || target.closest<HTMLElement>('form, section, [class*=form]') || null;
}

function getRegionName(region: HTMLElement): string {
  const text = (region.innerText || '').replace(/\s+/g, ' ').trim();
  return ['基本信息', '教育经历', '实习经历', '工作经历', '项目经历']
    .find(name => text.includes(name)) || text.slice(0, 24) || '选中区域';
}

function showAIRegionStatus(initialText: string): VisualRegionStatusHandle {
  const element = document.createElement('div');
  const textElement = document.createElement('span');
  const cancelButton = document.createElement('button');
  element.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:1000005;max-width:440px;padding:12px 14px;border-radius:8px;background:#24262d;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.28);font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;gap:12px;';
  textElement.textContent = initialText;
  cancelButton.type = 'button';
  cancelButton.textContent = '终止';
  cancelButton.style.cssText = 'flex:none;padding:5px 10px;border:1px solid rgba(255,255,255,.65);border-radius:5px;background:transparent;color:#fff;cursor:pointer;font:500 12px inherit;';
  element.append(textElement, cancelButton);
  document.body.appendChild(element);

  return {
    setCancelHandler(handler) {
      cancelButton.onclick = () => {
        cancelButton.disabled = true;
        cancelButton.textContent = '终止中';
        void handler();
      };
    },
    update(text, type = 'normal') {
      textElement.textContent = text;
      element.style.background = type === 'success'
        ? '#15803d'
        : type === 'warning'
          ? '#a16207'
          : type === 'error'
            ? '#b91c1c'
            : '#24262d';
      if (type !== 'normal') {
        cancelButton.remove();
        setTimeout(() => element.remove(), 5000);
      }
    },
  };
}

function getDateRangeFillPriority(element: Element): number {
  const container = element.closest<HTMLElement>(
    '[data-form-field-id="start_end_time"], [data-form-field-name="start_end_time"], [data-form-field-i18n-name="起止时间"]',
  );
  if (!container) return 2;

  const inputs = Array.from(
    container.querySelectorAll('input:not([type="hidden"]), textarea, select'),
  ).sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left);
  return inputs.indexOf(element) === 1 ? 0 : 1;
}
