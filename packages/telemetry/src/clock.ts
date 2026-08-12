export interface Clock {
  wallClock(): string;
  monotonicNs(): bigint;
}

export class SystemClock implements Clock {
  wallClock(): string {
    return new Date().toISOString();
  }

  monotonicNs(): bigint {
    return process.hrtime.bigint();
  }
}
