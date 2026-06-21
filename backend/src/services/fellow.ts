import axios from 'axios';

const BASE = 'https://api.fellow.app/v1';

function headers() {
  return { Authorization: `Bearer ${process.env.FELLOW_API_KEY}` };
}

export interface FellowActionItem {
  id: string;
  content: string;
  dueDate: string | null;
  assignee: string | null;
  completed: boolean;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  attendeeEmails: string[];
}

export interface FellowMeeting {
  id: string;
  title: string;
  date: string;
  attendeeEmails: string[];
  actionItems: { id: string; content: string; completed: boolean; assignee: string | null }[];
  notes: string;
}

export async function getMeetings(days = 30): Promise<FellowMeeting[]> {
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
    const res = await axios.get(`${BASE}/meetings`, {
      headers: headers(),
      params: { start_date: since, per_page: 100 },
    });

    const meetings: FellowMeeting[] = [];
    for (const m of res.data.data || res.data || []) {
      // Fetch full meeting detail to get action items
      try {
        const detail = await axios.get(`${BASE}/meetings/${m.id}`, { headers: headers() });
        const d = detail.data;
        meetings.push({
          id: d.id,
          title: d.title || d.name || 'Untitled Meeting',
          date: d.date || d.start_date || d.created_at,
          attendeeEmails: (d.attendees || []).map((a: any) => a.email).filter(Boolean),
          actionItems: (d.action_items || []).map((ai: any) => ({
            id: ai.id,
            content: ai.content || ai.text || '',
            completed: ai.completed || false,
            assignee: ai.assignee?.email || null,
          })),
          notes: d.notes || d.agenda || '',
        });
      } catch {
        // Skip meetings we can't fetch details for
      }
    }
    return meetings;
  } catch (err: any) {
    console.error('Fellow API error:', err.response?.data || err.message);
    return [];
  }
}

export async function getAllActionItems(): Promise<FellowActionItem[]> {
  const meetings = await getMeetings();
  const items: FellowActionItem[] = [];

  for (const m of meetings) {
    for (const ai of m.actionItems) {
      items.push({
        id: `${m.id}-${ai.id}`,
        content: ai.content,
        dueDate: null,
        assignee: ai.assignee,
        completed: ai.completed,
        meetingId: m.id,
        meetingTitle: m.title,
        meetingDate: m.date,
        attendeeEmails: m.attendeeEmails,
      });
    }
  }
  return items;
}
