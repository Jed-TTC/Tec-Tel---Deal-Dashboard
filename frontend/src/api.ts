import axios from 'axios';
import { Deal, ActionItem, QueueItem } from './types';

const http = axios.create({ baseURL: '/api' });

export const api = {
  getDeals: () => http.get<Deal[]>('/deals').then(r => r.data),

  getActionItems: () => http.get<ActionItem[]>('/action-items').then(r => r.data),
  markDone: (id: string, done: boolean) =>
    http.patch(`/action-items/${id}/done`, { done }).then(r => r.data),

  getQueue: () => http.get<QueueItem[]>('/queue').then(r => r.data),
  refreshQueue: () => http.post('/queue/refresh').then(r => r.data),
  approveQueueItem: (id: string, note?: string) =>
    http.patch<QueueItem>(`/queue/${id}`, { action: 'approve', note }).then(r => r.data),
  rejectQueueItem: (id: string) =>
    http.patch<QueueItem>(`/queue/${id}`, { action: 'reject' }).then(r => r.data),
  editQueueItem: (id: string, note: string) =>
    http.patch<QueueItem>(`/queue/${id}`, { action: 'edit', note }).then(r => r.data),

  getAuthStatus: () => http.get<{ microsoft: boolean }>('/auth/status').then(r => r.data),
};
