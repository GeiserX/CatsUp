export type BAState = 'idle' | 'initializing' | 'ready' | 'error' | 'closed';

export interface BAInitOptions {
  headless?: boolean;
  profileDir?: string;               // persistent profile path
  userAgent?: string;
  viewport?: { width: number; height: number; deviceScaleFactor?: number };
  timeoutMs?: number;                // default navigation/action timeout
  downloadsDir?: string;
}

export interface BAOpenOptions {
  referer?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  timeoutMs?: number;
}

export interface BAWaitForSelectorOptions {
  timeoutMs?: number;
  visible?: boolean;                 // wait for visibility
}

export interface BAScreenshotOptions {
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  quality?: number;                  // 1..100 for JPEG
  type?: 'png' | 'jpeg' | 'webp';
}

export interface BACookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;                  // epoch seconds
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

export interface BAConsoleEvent {
  pageId: string;
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  text: string;
  args?: string[];
  ts: number;
}

export interface BARequestEvent {
  pageId: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  postData?: string;
  ts: number;
}

export interface BAResponseEvent {
  pageId: string;
  url: string;
  status: number;
  headers?: Record<string, string>;
  ts: number;
}

export interface IBrowserAutomation {
  // Lifecycle
  init(options?: BAInitOptions): Promise<void>;
  shutdown(): Promise<void>;
  readonly state: BAState;

  // Pages
  open(url: string, options?: BAOpenOptions): Promise<string>;    // returns pageId
  close(pageId: string): Promise<void>;
  navigate(pageId: string, url: string, options?: BAOpenOptions): Promise<void>;
  reload(pageId: string, options?: { timeoutMs?: number; waitUntil?: BAOpenOptions['waitUntil'] }): Promise<void>;
  goBack(pageId: string, options?: { timeoutMs?: number }): Promise<void>;
  goForward(pageId: string, options?: { timeoutMs?: number }): Promise<void>;

  // Interaction
  waitForSelector(pageId: string, selector: string, options?: BAWaitForSelectorOptions): Promise<void>;
  click(pageId: string, selector: string, options?: { button?: 'left' | 'right' | 'middle'; clickCount?: 1 | 2; delayMs?: number }): Promise<void>;
  type(pageId: string, selector: string, text: string, options?: { delayMs?: number; clear?: boolean }): Promise<void>;
  fill(pageId: string, selector: string, value: string, options?: { delayMs?: number }): Promise<void>;
  select(pageId: string, selector: string, values: string[]): Promise<void>;
  pressKey(pageId: string, key: string, options?: { delayMs?: number; modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'> }): Promise<void>;

  // Extraction
  getText(pageId: string, selector: string): Promise<string | null>;
  getHTML(pageId: string, selector?: string): Promise<string>;
  getAttribute(pageId: string, selector: string, name: string): Promise<string | null>;
  evaluate<T = any>(pageId: string, fn: string, args?: any[]): Promise<T>; // fn as stringified function body

  // State
  setViewport(size: { width: number; height: number; deviceScaleFactor?: number }): Promise<void>;
  screenshot(pageId: string, options?: BAScreenshotOptions): Promise<Uint8Array>;
  getCookies(pageId?: string): Promise<BACookie[]>;
  setCookies(cookies: BACookie[], pageId?: string): Promise<void>;
  saveStorageState(pageId?: string): Promise<Uint8Array>;         // serialized browser state
  restoreStorageState(state: Uint8Array, pageId?: string): Promise<void>;

  // Convenience
  isLoggedIn(pageId: string, heuristics: Array<{ selector?: string; textContains?: string }>, timeoutMs?: number): Promise<boolean>;

  // Events
  onConsole(cb: (e: BAConsoleEvent) => void): () => void;
  onRequest(cb: (e: BARequestEvent) => void): () => void;
  onResponse(cb: (e: BAResponseEvent) => void): () => void;
}
