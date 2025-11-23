import type { ElementHandle, Page } from 'puppeteer-core';

type SelectorMap = {
  cardItem: string;
  rightPanel: string;
  kebabInRightPanel: string;
  menuRoot: string;
  menuItem: string;
  promptInput: string;
  submitButton: string;
  enabledSubmitButton: string;
  fileInput: string;
  draftCard: string;
  downloadButton: string;
};

const baseSelectors: Omit<SelectorMap, 'kebabInRightPanel' | 'enabledSubmitButton'> = {
  cardItem: "a[href*='/d/']",
  rightPanel: 'div.absolute.right-0.top-0',
  menuRoot: "[role='menu']",
  menuItem: "[role='menuitem']",
  promptInput: "textarea[data-testid='prompt-input']",
  submitButton: "button[data-testid='submit']",
  fileInput: "input[type='file']",
  draftCard: '.sora-draft-card',
  downloadButton: "button[data-testid='download']",
};

const kebabInRightPanel = `${baseSelectors.rightPanel} button[aria-haspopup='menu']:not([aria-label='Settings'])`;
const enabledSubmitButton = `${baseSelectors.submitButton}:not([disabled])`;

export const selectors: SelectorMap = {
  ...baseSelectors,
  kebabInRightPanel,
  enabledSubmitButton,
};

const DEFAULT_TIMEOUT_MS = 15_000;

export async function waitForVisible(
  page: Page,
  selector: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ElementHandle<Element>> {
  const handle = await page.waitForSelector(selector, { timeout: timeoutMs, visible: true });
  if (!handle) {
    throw new Error(`Selector not found or visible: ${selector}`);
  }

  return handle;
}

export async function waitForClickable(
  page: Page,
  selector: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
  const handle = await waitForVisible(page, selector, timeoutMs);
  await page.waitForFunction(
    (el) => !(el as HTMLElement).hasAttribute('disabled'),
    { timeout: timeoutMs },
    handle
  );
  return handle;
}

export async function waitForDisappear(
  page: Page,
  selector: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
  return page.waitForSelector(selector, { timeout: timeoutMs, hidden: true });
}
