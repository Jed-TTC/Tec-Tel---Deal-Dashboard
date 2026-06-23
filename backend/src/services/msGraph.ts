import axios from 'axios';
import { MsTokens } from '../types';

// In-memory token store (replace with persistent store in production)
let tokenStore: MsTokens | null = null;

export function setTokens(tokens: MsTokens) {
  tokenStore = tokens;
}

export function getTokens(): MsTokens | null {
  return tokenStore;
}

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.MS_REDIRECT_URI!,
    scope: 'Mail.Read offline_access',
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeCode(code: string): Promise<void> {
  const res = await axios.post(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.MS_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  tokenStore = {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
  };
}

async function ensureValidToken(): Promise<string> {
  if (!tokenStore) throw new Error('Not authenticated with Microsoft');

  if (Date.now() < tokenStore.expires_at - 60_000) {
    return tokenStore.access_token;
  }

  // Refresh
  const res = await axios.post(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      refresh_token: tokenStore.refresh_token,
      grant_type: 'refresh_token',
      scope: 'Mail.Read offline_access',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  tokenStore = {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token || tokenStore.refresh_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
  };
  return tokenStore.access_token;
}

export interface EmailThread {
  id: string;
  subject: string;
  lastDate: string;
  participants: string[];
  messages: { from: string; body: string; date: string }[];
}

export async function getRecentEmailThreads(days = 30): Promise<EmailThread[]> {
  const token = await ensureValidToken();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const res = await axios.get('https://graph.microsoft.com/v1.0/me/messages', {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      $filter: `receivedDateTime ge ${since}`,
      $select: 'id,subject,from,receivedDateTime,body,conversationId,toRecipients,ccRecipients',
      $orderby: 'receivedDateTime desc',
      $top: 100,
    },
  });

  // Group by conversationId
  const threadMap = new Map<string, EmailThread>();
  for (const msg of res.data.value) {
    const convId = msg.conversationId;
    const participants = [
      msg.from?.emailAddress?.address,
      ...(msg.toRecipients || []).map((r: any) => r.emailAddress?.address),
      ...(msg.ccRecipients || []).map((r: any) => r.emailAddress?.address),
    ].filter(Boolean);

    if (!threadMap.has(convId)) {
      threadMap.set(convId, {
        id: convId,
        subject: msg.subject || '(no subject)',
        lastDate: msg.receivedDateTime,
        participants: [],
        messages: [],
      });
    }
    const thread = threadMap.get(convId)!;
    thread.messages.push({
      from: msg.from?.emailAddress?.address || '',
      body: msg.body?.content?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) || '',
      date: msg.receivedDateTime,
    });
    for (const p of participants) {
      if (!thread.participants.includes(p)) thread.participants.push(p);
    }
  }

  return Array.from(threadMap.values());
}

export function isAuthenticated(): boolean {
  return tokenStore !== null;
}
