import EventDictionaryView from '../components/EventDictionaryView';
import { getEventDictionaryData } from '../lib/event-data';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const data = await getEventDictionaryData();

  return <EventDictionaryView data={data} />;
}
