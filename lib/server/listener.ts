import { Client } from 'pg';

type Subscriber = (table: string) => void;

class TripListener {
  private subscribers = new Map<string, Set<Subscriber>>();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;

  private async ensureConnected(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      client.on('notification', (msg) => {
        if (!msg.payload) return;
        try {
          const { table, trip_id } = JSON.parse(msg.payload) as {
            table: string;
            trip_id: string;
          };
          this.subscribers.get(trip_id)?.forEach((fn) => fn(table));
        } catch {
          // битый payload — игнорируем
        }
      });
      client.on('error', () => this.scheduleReconnect());
      await client.connect();
      await client.query('listen trip_events');
      this.client = client;
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private scheduleReconnect() {
    this.client = null;
    setTimeout(() => {
      // реконнект нужен только если кто-то слушает
      if (this.subscribers.size > 0) {
        this.ensureConnected().catch(() => this.scheduleReconnect());
      }
    }, 3000);
  }

  async subscribe(tripId: string, fn: Subscriber): Promise<() => void> {
    await this.ensureConnected();
    let set = this.subscribers.get(tripId);
    if (!set) {
      set = new Set();
      this.subscribers.set(tripId, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subscribers.delete(tripId);
    };
  }
}

// Синглтон, переживающий HMR в dev
const globalForListener = globalThis as unknown as { tripListener?: TripListener };
export const tripListener = globalForListener.tripListener ?? new TripListener();
if (process.env.NODE_ENV !== 'production') globalForListener.tripListener = tripListener;
