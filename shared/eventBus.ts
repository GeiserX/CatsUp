
// Simple event bus stub
type Callback = (data: any) => void;

class EventBus {
    private listeners: Record<string, Callback[]> = {};

    on(event: string, callback: Callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
        return () => this.off(event, callback);
    }

    off(event: string, callback: Callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event: string, data?: any) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => cb(data));
    }
}

export const bus = new EventBus();
