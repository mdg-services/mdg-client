import type { ServiceRunStatus } from './enums';

export interface ServiceRunStep {
  name: string;
  status: 'start' | 'ok' | 'error';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  message?: string;
  meta?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

export interface ServiceRunArtifact {
  id: string;
  reportCode?: string;
  filename: string;
  size?: number;
  contentType?: string;
  createdAt: string;
}

export interface ServiceRun {
  id: string;
  dealerId: string;
  serviceId: string;
  dealerServiceId: string;
  startedAt: string;
  finishedAt?: string;
  status: ServiceRunStatus;
  durationMs?: number;
  output?: unknown;
  error?: {
    message: string;
    stack?: string;
  };
  steps?: ServiceRunStep[];
  artifacts?: ServiceRunArtifact[];
  createdAt: string;
  updatedAt: string;
}

export interface RunsListQuery {
  dealerId?: string;
  serviceId?: string;
  status?: ServiceRunStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
