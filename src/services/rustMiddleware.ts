import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ConnectionStatus, EnrollResult, PortInfo, TemplateInfo } from '../data/types';

export const EVT = {
  connected: 'authenticator://connected',
  disconnected: 'authenticator://disconnected',
  deviceReady: 'authenticator://device-ready',
  status: 'authenticator://status',
  templateInfo: 'authenticator://template-info',
  enrollmentStarted: 'authenticator://enrollment-started',
  enrollmentProgress: 'authenticator://enrollment-progress',
  enrollmentCompleted: 'authenticator://enrollment-completed',
  enrollmentFailed: 'authenticator://enrollment-failed',
  operationCancelled: 'authenticator://operation-cancelled',
  error: 'authenticator://error',
  message: 'authenticator://message',
} as const;

export const authenticatorApi = {
  listPorts: () => invoke<PortInfo[]>('get_serial_ports'),
  connect: (portName: string) => invoke<ConnectionStatus>('connect_authenticator', { portName }),
  disconnect: () => invoke<ConnectionStatus>('disconnect_authenticator'),
  connectionStatus: () => invoke<ConnectionStatus>('get_authenticator_connection_status'),
  send: <T = Record<string, unknown>>(command: string, params?: Record<string, unknown>) =>
    invoke<T>('authenticator_send_command', { command, params: params ?? null }),
  templateInfo: () => authenticatorApi.send<TemplateInfo>('get_template_info'),
  enroll: (slot: number, timeoutMs: number) =>
    invoke<EnrollResult>('authenticator_enroll', { slot, timeoutMs }),
  deleteTemplate: (slot: number) => authenticatorApi.send('delete_template', { slot }),
  clearTemplates: () => authenticatorApi.send('clear_templates'),
  saveToken: (token: string) => invoke<boolean>('save_enrollment_token', { token }),
  clearToken: () => invoke<boolean>('clear_enrollment_token'),
  tokenConfigured: () => invoke<boolean>('get_enrollment_token_status'),
};

export function on<T>(name: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(name, (e) => handler(e.payload));
}
