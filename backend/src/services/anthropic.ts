import Anthropic from '@anthropic-ai/sdk';
import { Deal, ActionItem, QueueItem } from '../types.js';
import { EmailThread } from './msGraph.js';
import { FellowMeeting } from './fellow.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';

export async function extractEmailActionItems(
  thread: EmailThread,
  dealId: string,
  dealName: string
): Promise<Omit<ActionItem, 'done'>[]> {
  const prompt = `You are a sales operations assistant. Extract explicit action items, commitments, or follow-up tasks from this email thread related to the deal "${dealName}".

Email thread subject: ${thread.subject}
Date: ${thread.lastDate}

Messages:
${thread.messages.map(m => `From: ${m.from}\nDate: ${m.date}\n${m.body}`).join('\n---\n')}

Return a JSON array of action items. Each item must have:
- "description": the action item text (concise, starts with a verb)
- "identifiedAt": ISO date string

Only include concrete tasks or commitments ("I will send the contract by Friday", "Schedule a follow-up demo", etc.).
If there are no action items, return an empty array [].
Respond with ONLY valid JSON, no markdown.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = res.content[0].type === 'text' ? res.content[0].text : '[]';
    const items = JSON.parse(text);
    return items.map((item: any, i: number) => ({
      id: `email-${thread.id}-${i}`,
      dealId,
      dealName,
      source: 'outlook' as const,
      description: item.description,
      identifiedAt: item.identifiedAt || thread.lastDate,
      emailSubject: thread.subject,
    }));
  } catch {
    return [];
  }
}

export async function matchDealToConversation(
  deals: Deal[],
  subject: string,
  content: string,
  participantEmails: string[]
): Promise<{ dealId: string; dealName: string; reason: string; confidence: 'high' | 'medium' | 'low' } | null> {
  // First try email matching
  const emailMatches = deals.filter(deal =>
    deal.contacts.some(c => participantEmails.includes(c.email))
  );

  if (emailMatches.length === 1) {
    return {
      dealId: emailMatches[0].id,
      dealName: emailMatches[0].name,
      reason: `Contact email matched directly to this deal.`,
      confidence: 'high',
    };
  }

  const candidates = emailMatches.length > 1 ? emailMatches : deals.slice(0, 20);

  const prompt = `You are a CRM assistant. Based on the conversation below, identify which deal it most likely belongs to.

Conversation subject: ${subject}
Content snippet: ${content.slice(0, 1500)}

Candidate deals:
${candidates.map((d, i) => `${i + 1}. "${d.name}" (Stage: ${d.stage}, Owner: ${d.owner})`).join('\n')}

Respond with JSON:
{
  "dealIndex": <1-based index of best match, or null if none fit>,
  "confidence": "high" | "medium" | "low",
  "reason": "<one sentence explanation>"
}
Respond with ONLY valid JSON.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = res.content[0].type === 'text' ? res.content[0].text : '{}';
    const result = JSON.parse(text);
    if (!result.dealIndex) return null;
    const deal = candidates[result.dealIndex - 1];
    if (!deal) return null;
    return {
      dealId: deal.id,
      dealName: deal.name,
      reason: result.reason,
      confidence: result.confidence,
    };
  } catch {
    return null;
  }
}

export async function draftHubSpotNote(
  dealName: string,
  sourceType: 'email' | 'meeting',
  subject: string,
  content: string
): Promise<string> {
  const prompt = `You are a sales operations assistant. Draft a concise HubSpot deal note summarising the key points from this ${sourceType === 'email' ? 'email thread' : 'meeting'} for deal "${dealName}".

${sourceType === 'email' ? 'Email subject' : 'Meeting title'}: ${subject}
Content: ${content.slice(0, 2000)}

The note should:
- Be 2-4 sentences
- Summarise what was discussed or agreed
- Note any next steps or commitments
- Be written in third person, past tense
- NOT include names of participants directly

Respond with ONLY the note text, no markdown, no headers.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  return res.content[0].type === 'text' ? res.content[0].text.trim() : '';
}

export async function buildQueueFromEmails(
  threads: EmailThread[],
  deals: Deal[]
): Promise<QueueItem[]> {
  const items: QueueItem[] = [];

  for (const thread of threads) {
    const content = thread.messages.map(m => m.body).join('\n');
    const match = await matchDealToConversation(deals, thread.subject, content, thread.participants);
    if (!match) continue;

    const note = await draftHubSpotNote(match.dealName, 'email', thread.subject, content);
    if (!note) continue;

    items.push({
      id: `email-queue-${thread.id}`,
      dealId: match.dealId,
      dealName: match.dealName,
      suggestedNote: note,
      sourceType: 'email',
      sourceTitle: thread.subject,
      sourceDate: thread.lastDate,
      confidenceReason: match.reason,
      confidenceLevel: match.confidence,
      status: 'pending',
    });
  }

  return items;
}

export async function buildQueueFromMeetings(
  meetings: FellowMeeting[],
  deals: Deal[]
): Promise<QueueItem[]> {
  const items: QueueItem[] = [];

  for (const meeting of meetings) {
    const content = `${meeting.notes}\n\nAction items:\n${meeting.actionItems.map(ai => `- ${ai.content}`).join('\n')}`;
    const match = await matchDealToConversation(deals, meeting.title, content, meeting.attendeeEmails);
    if (!match) continue;

    const note = await draftHubSpotNote(match.dealName, 'meeting', meeting.title, content);
    if (!note) continue;

    items.push({
      id: `meeting-queue-${meeting.id}`,
      dealId: match.dealId,
      dealName: match.dealName,
      suggestedNote: note,
      sourceType: 'meeting',
      sourceTitle: meeting.title,
      sourceDate: meeting.date,
      confidenceReason: match.reason,
      confidenceLevel: match.confidence,
      status: 'pending',
    });
  }

  return items;
}
