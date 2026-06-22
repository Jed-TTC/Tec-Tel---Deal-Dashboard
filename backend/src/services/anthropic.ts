import Anthropic from '@anthropic-ai/sdk';
import { Deal } from '../types.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';


const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Cache: dealId → { synthesis, nextStep, generatedAt }
const synthesisCache = new Map<string, { synthesis: string; nextStep: string; generatedAt: number }>();

export async function synthesizeDealUpdates(
  deals: Deal[],
  activitiesMap: Record<string, string[]>
): Promise<Record<string, { synthesis: string; nextStep: string }>> {
  const now = Date.now();
  const result: Record<string, { synthesis: string; nextStep: string }> = {};

  const toGenerate = deals.filter(d => {
    const cached = synthesisCache.get(d.id);
    if (cached && now - cached.generatedAt < CACHE_TTL) {
      result[d.id] = { synthesis: cached.synthesis, nextStep: cached.nextStep };
      return false;
    }
    return true;
  });

  if (!toGenerate.length) return result;

  const dealSections = toGenerate.map((d, i) => {
    const activities = activitiesMap[d.id] || [];
    const activityText = activities.length
      ? activities.map(a => `  - ${a}`).join('\n')
      : '  - No recent communications found';
    return `Deal ${i + 1}: "${d.name}" | Stage: ${d.stage} | Owner: ${d.owner} | Value: $${d.value.toLocaleString()}\nActivities (newest first):\n${activityText}`;
  }).join('\n\n');

  const prompt = `You are a sales operations assistant for a B2B sales team. For each deal, you are given a list of recent activities (notes, emails, meetings). Use ONLY the information in those activities to write the following — do not invent or assume anything not stated in the activities.

1. "synthesis": A well-written paragraph (3–5 sentences) summarizing what has happened with this deal based solely on the provided activities. Cover: what communications took place, who was involved, what was discussed or agreed upon, and where the deal currently stands. Write as if briefing a sales manager reviewing their pipeline.

2. "nextStep": A clear action-oriented paragraph (2–3 sentences) describing the specific next actions needed to move this deal forward, based on what the activities reveal. Name the action, who should take it, and any timing or urgency based on the deal stage and how recently activity occurred.

${dealSections}

Respond with ONLY a valid JSON object (no markdown, no extra text):
{"1": {"synthesis": "...", "nextStep": "..."}, "2": {"synthesis": "...", "nextStep": "..."}}`;

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '{}';
    const parsed: Record<string, { synthesis: string; nextStep: string }> = JSON.parse(text);
    for (const [indexStr, data] of Object.entries(parsed)) {
      const deal = toGenerate[parseInt(indexStr) - 1];
      if (deal && data?.synthesis && data?.nextStep) {
        synthesisCache.set(deal.id, { synthesis: data.synthesis, nextStep: data.nextStep, generatedAt: now });
        result[deal.id] = { synthesis: data.synthesis, nextStep: data.nextStep };
      }
    }
  } catch (err: any) {
    console.warn('synthesizeDealUpdates: AI unavailable, skipping.', err.message);
  }

  return result;
}

export async function synthesizePartnerThread(
  subject: string,
  emails: string[],
  candidateDeals: { id: string; name: string; pipeline: string; stage: string; value: number }[]
): Promise<{ dealId: string | null; confidence: 'high' | 'medium' | 'low'; synthesis: string; proposedNote: string } | null> {
  const dealsList = candidateDeals.length
    ? candidateDeals.map(d => `- ID: ${d.id} | ${d.name} | ${d.pipeline} | ${d.stage} | $${d.value.toLocaleString()}`).join('\n')
    : 'No associated deals found.';

  const emailsText = emails.map((e, i) => `[Email ${i + 1}]\n${e}`).join('\n\n---\n\n');

  const prompt = `You are a communications analyst for Tec-Tel Communications, a security systems integrator. You are reviewing an email thread between Tec-Tel and one of their partner/subcontractor companies.

Thread subject: "${subject}"

Emails:
${emailsText}

Deals that contacts in this thread are associated with:
${dealsList}

Based on the email content, respond with valid JSON only (no markdown, no extra text):
{
  "dealId": "the most likely deal ID from the list above, or null if unclear",
  "confidence": "high if clearly about one deal, medium if likely but uncertain, low if genuinely ambiguous or no deals found",
  "synthesis": "2-3 sentences summarizing what this email thread is about and what it means for the deal's progress",
  "proposedNote": "A professional update note to log on the deal (2-3 sentences). Written as a manager briefing: what the partner communicated, any action items or blockers, current status. Start with 'Partner update:'"
}`;

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      dealId: parsed.dealId || null,
      confidence: (['high', 'medium', 'low'] as const).includes(parsed.confidence) ? parsed.confidence : 'low',
      synthesis: parsed.synthesis || '',
      proposedNote: parsed.proposedNote || '',
    };
  } catch (err: any) {
    console.warn('synthesizePartnerThread: AI unavailable, skipping.', err.message);
    return null;
  }
}

// Cache: dealId → { step, generatedAt }
const nextStepCache = new Map<string, { step: string; generatedAt: number }>();

function daysSince(dateStr: string | null) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

export async function generateDealNextSteps(deals: Deal[]): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const toGenerate = deals.filter(d => {
    const cached = nextStepCache.get(d.id);
    if (cached && now - cached.generatedAt < CACHE_TTL) {
      result[d.id] = cached.step;
      return false;
    }
    return true;
  });

  if (!toGenerate.length) return result;

  const dealList = toGenerate.map((d, i) => {
    let line = `${i + 1}. Name: "${d.name}" | Stage: ${d.stage} | Value: $${d.value.toLocaleString()} | Days in stage: ${daysSince(d.stageChangedAt)} | Days since activity: ${daysSince(d.lastActivityDate)}`;
    if (d.lastNote) line += ` | Latest activity: "${d.lastNote.slice(0, 250)}"`;
    return line;
  }).join('\n');

  const prompt = `You are a sales manager assistant. For each deal below, suggest ONE specific actionable next step to move it forward.

Deals:
${dealList}

Rules:
- Start each step with a verb (Schedule, Send, Follow up, Confirm, etc.)
- Be specific to the stage and how long it's been stagnant
- Max 12 words per step
- No punctuation at end of each step

Respond with ONLY a JSON object mapping the deal number (as a string) to the next step. Example:
{"1": "Send follow-up email to confirm budget approval", "2": "Schedule product demo with technical team"}`;

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '{}';
    const parsed: Record<string, string> = JSON.parse(text);
    for (const [indexStr, step] of Object.entries(parsed)) {
      const deal = toGenerate[parseInt(indexStr) - 1];
      if (deal && step) {
        nextStepCache.set(deal.id, { step, generatedAt: now });
        result[deal.id] = step;
      }
    }
  } catch (err: any) {
    console.warn('generateDealNextSteps: AI unavailable, skipping.', err.message);
  }

  return result;
}

