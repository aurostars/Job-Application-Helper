export interface OpenEndedField {
  element: HTMLTextAreaElement | HTMLInputElement;
  questionText: string;
  context?: string;
}

const OPEN_QUESTION_PATTERNS = [
  /为什么|why/i,
  /请描述|请介绍|describe/i,
  /你的.*看法|观点|想法/i,
  /自我介绍|self.?introduction/i,
  /职业.*规划|career.*goal/i,
  /加入.*原因|reason.*join/i,
  /你如何|how.*you/i,
  /优势|strength|advantage/i,
  /期望|expectation/i,
  /经历|experience/i,
  /收获|achievement/i,
  /挑战|challenge/i,
  /未来.*计划|future.*plan/i,
];

export class OpenQuestionDetector {
  detect(): OpenEndedField[] {
    const results: OpenEndedField[] = [];

    const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
    const textInputs = document.querySelectorAll<HTMLInputElement>('input[type="text"]');

    for (const el of [...textareas, ...textInputs]) {
      if (el instanceof HTMLInputElement) {
        const maxLen = el.getAttribute('maxlength');
        if (maxLen && parseInt(maxLen) < 50) continue;
      }

      const questionText = this.extractQuestionText(el);
      if (!questionText) continue;

      const isOpenEnded = OPEN_QUESTION_PATTERNS.some(p => p.test(questionText))
        || (el instanceof HTMLTextAreaElement && questionText.length > 10);

      if (isOpenEnded) {
        results.push({
          element: el,
          questionText,
          context: this.extractContext(el),
        });
      }
    }

    return results;
  }

  private extractQuestionText(el: HTMLElement): string {
    const id = el.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    }

    const parentLabel = el.closest('label');
    if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();

    let prev = el.previousElementSibling;
    while (prev) {
      const text = prev.textContent?.trim();
      if (text && text.length > 5 && text.length < 200) return text;
      prev = prev.previousElementSibling;
    }

    const parent = el.parentElement;
    if (parent) {
      const siblings = parent.children;
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] === el) break;
        const text = siblings[i].textContent?.trim();
        if (text && text.length > 5 && text.length < 200) return text;
      }
    }

    return el.getAttribute('placeholder')
      || el.getAttribute('aria-label')
      || '';
  }

  private extractContext(el: HTMLElement): string {
    let parent = el.parentElement;
    const parts: string[] = [];
    let depth = 0;

    while (parent && depth < 5) {
      const heading = parent.querySelector('h1, h2, h3, h4, [class*="title"]');
      if (heading?.textContent?.trim()) {
        parts.unshift(heading.textContent.trim());
      }
      parent = parent.parentElement;
      depth++;
    }

    const pageTitle = document.title;
    if (pageTitle) parts.unshift(pageTitle);

    return parts.join(' > ');
  }
}
