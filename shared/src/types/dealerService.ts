import type { Cadence, DealerServiceStatus } from './enums';

export interface DealerService {
  id: string;
  dealerId: string;
  /** Plugin slug, matches ServicePlugin.id. */
  serviceId: string;
  /** Config validated against the plugin's defaultConfigSchema. */
  config: Record<string, unknown>;
  cadence: Cadence;
  /** Derived cron expression. May be overridden by customCron. */
  schedule: string;
  customCron?: string;
  status: DealerServiceStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachServiceInput {
  serviceId: string;
  config: Record<string, unknown>;
  /** Optional override of plugin's default cadence. */
  cadence?: Cadence;
  customCron?: string;
}

export interface UpdateDealerServiceInput {
  config?: Record<string, unknown>;
  cadence?: Cadence;
  customCron?: string;
  status?: DealerServiceStatus;
}
