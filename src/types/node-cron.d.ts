declare module 'node-cron' {
  interface ScheduledTask {
    stop(): void;
    start(): void;
  }

  interface CronModule {
    schedule(expression: string, func: () => void | Promise<void>): ScheduledTask;
    validate(expression: string): boolean;
  }

  const cron: CronModule;
  export default cron;
}
