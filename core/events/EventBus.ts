type AnyEvent = { type: string; [key: string]: any };
type Handler<E> = (event: E) => void;

export class EventBus<T extends AnyEvent = AnyEvent> {
  private map = new Map<string, Set<Function>>();

  on<K extends T['type']>(type: K, cb: Handler<Extract<T, { type: K }>>): () => void {
    const key = String(type);
    const set = this.map.get(key) ?? new Set();
    set.add(cb as any);
    this.map.set(key, set);
    return () => this.off(type, cb as any);
  }

  once<K extends T['type']>(type: K, cb: Handler<Extract<T, { type: K }>>): () => void {
    const wrapped = (e: any) => {
      this.off(type as any, wrapped);
      (cb as any)(e);
    };
    return this.on(type, wrapped as any);
  }

  off<K extends T['type']>(type: K, cb: Handler<Extract<T, { type: K }>>): void {
    const key = String(type);
    const set = this.map.get(key);
    if (!set) return;
    set.delete(cb as any);
    if (set.size === 0) this.map.delete(key);
  }

  emit<E extends T>(event: E): void {
    const key = String(event.type);
    const set = this.map.get(key);
    if (!set || set.size === 0) return;
    // Copy to avoid mutation during iteration
    [...set].forEach((fn) => {
      try {
        (fn as Handler<E>)(event);
      } catch (err) {
        // Swallow to avoid breaking other listeners; real apps might re-emit an 'error' event
        // or log via a provided logger.
        // eslint-disable-next-line no-console
        console.error('EventBus listener error for', key, err);
      }
    });
  }

  removeAll(type?: T['type']): void {
    if (typeof type === 'undefined') {
      this.map.clear();
      return;
    }
    const key = String(type);
    this.map.delete(key);
  }

  listenerCount(type: T['type']): number {
    const set = this.map.get(String(type));
    return set ? set.size : 0;
  }

  async waitFor<K extends T['type']>(
    type: K,
    opts?: { timeoutMs?: number; predicate?: (e: Extract<T, { type: K }>) => boolean }
  ): Promise<Extract<T, { type: K }>> {
    const timeoutMs = opts?.timeoutMs ?? 0;
    const predicate = opts?.predicate;
    return new Promise((resolve, reject) => {
      let unsub: (() => void) | undefined;
      let timer: any;

      const handler = (e: any) => {
        if (predicate && !predicate(e)) return;
        if (timer) clearTimeout(timer);
        if (unsub) unsub();
        resolve(e);
      };

      unsub = this.on(type, handler as any);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (unsub) unsub();
          reject(new Error(`EventBus.waitFor timeout after ${timeoutMs} ms for type "${String(type)}"`));
        }, timeoutMs);
      }
    });
  }

  pipeTo<U extends AnyEvent>(
    other: EventBus<U>,
    transform?: (e: T) => U | null | undefined
  ): () => void {
    const allTypes = new Set(this.map.keys());
    // If there are no listeners yet, we still want to subscribe dynamically.
    // We'll subscribe to all emitted events by monkey-patching emit is not desirable.
    // Instead, expose a wildcard by convention: subscribe to '*' if used.
    const unsubscribeMap = new Map<string, () => void>();

    const subscribe = (type: string) => {
      if (unsubscribeMap.has(type)) return;
      const off = this.on(type as any, (e: any) => {
        const mapped = transform ? transform(e) : (e as unknown as U);
        if (mapped) other.emit(mapped);
      });
      unsubscribeMap.set(type, off);
    };

    // Subscribe to current known event types
    for (const t of allTypes) subscribe(t);

    // Return unsubscriber to remove all pipes
    return () => {
      for (const off of unsubscribeMap.values()) off();
      unsubscribeMap.clear();
    };
  }
}
