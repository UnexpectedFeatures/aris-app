export interface BridgeError {
  code: string;
  message: string;
  retryable: boolean;
  sensorCode?: number;
}

export interface PortInfo {
  name: string;
  kind: string;
  vid?: number | null;
  pid?: number | null;
  manufacturer?: string | null;
  product?: string | null;
}

export interface DeviceInfo {
  deviceId: string;
  firmwareVersion?: string | null;
  model?: string | null;
  sensorStatus?: string | null;
  enrollAuthRequired: boolean;
  protocolVersion: number;
}

export interface ConnectionStatus {
  connected: boolean;
  portName: string | null;
  baudRate: number;
  busy: boolean;
  device: DeviceInfo | null;
}

export interface TemplateInfo {
  deviceId: string;
  sensorConnected: boolean;
  capacity: number | null;
  templateCount: number | null;
  slotsFree: number | null;
  securityLevel?: number;
  enrollmentAllowed: boolean;
  enrollmentBlockedReason: string | null;
  slotOccupancyAvailable?: boolean;
  emptinessCheck?: string;
}

export interface EnrollResult {
  enrolled: boolean;
  deviceId: string;
  fingerprintId: number;
  slot: number;
  templateCount?: number;
  enrollmentAllowed: boolean;
  durationMs: number;
}

/** Envelope of derived events emitted by Rust. */
export interface DeviceEvent {
  requestId: string | null;
  command: string | null;
  event: string | null;
  data: Record<string, unknown> | null;
}

export type EnrollPhase = 'idle' | 'starting' | 'running' | 'done' | 'failed' | 'cancelled';

export interface EnrollState {
  phase: EnrollPhase;
  step?: string;
  sample?: number;
  retry?: string;
  result?: EnrollResult;
  error?: BridgeError;
}

export function toBridgeError(e: unknown): BridgeError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) return e as BridgeError;
  return { code: 'unknown', message: typeof e === 'string' ? e : 'Unexpected error', retryable: false };
}
