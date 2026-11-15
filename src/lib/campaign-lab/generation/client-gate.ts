/**
 * Monotonic gate for asynchronous preview requests. Any edit or newer request
 * advances the gate, so an older response can be recognised and discarded.
 */
export class GenerationRequestGate {
  private current = 0;

  begin(): number {
    this.current += 1;
    return this.current;
  }

  invalidate(): number {
    this.current += 1;
    return this.current;
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.current;
  }
}
