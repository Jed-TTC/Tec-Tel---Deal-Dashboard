import axios from 'axios';
import { Deal, PartnerQueueItem } from './types';

export interface PipelineStage { id: string; name: string; }
export interface Pipeline { id: string; name: string; stages: PipelineStage[]; }

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
});

export const api = {
  getDeals: () => http.get<Deal[]>('/deals').then(r => r.data),
  getPipelines: () => http.get<Pipeline[]>('/pipelines').then(r => r.data),
  getAuthStatus: () => http.get<{ microsoft: boolean }>('/auth/status').then(r => r.data),
  getPartnerQueue: () => http.get<PartnerQueueItem[]>('/partner-queue').then(r => r.data),
  approvePartnerQueueItem: (threadId: string, dealId: string, noteText: string) =>
    http.post(`/partner-queue/${threadId}/approve`, { dealId, noteText }).then(r => r.data),
  skipPartnerQueueItem: (threadId: string) =>
    http.post(`/partner-queue/${threadId}/skip`).then(r => r.data),
};
