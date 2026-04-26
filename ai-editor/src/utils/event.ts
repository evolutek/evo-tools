export class EventEmitter<T extends unknown[]> {
  private listeners: ((...args: T) => void)[] = [];

  on(listener: (...args: T) => void): void {
    this.listeners.push(listener);
  }

  emit(...args: T): void {
    this.listeners.forEach((listener) => {
      listener(...args);
    });
  }
}
