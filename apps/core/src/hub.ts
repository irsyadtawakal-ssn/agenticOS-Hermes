export interface Hub {
  publish(topic: string, data: unknown): void;
  subscribe(send: (message: string) => void): () => void;
  size(): number;
}

export function createHub(): Hub {
  const subscribers = new Set<(message: string) => void>();
  return {
    publish(topic, data) {
      const message = JSON.stringify({ topic, data });
      for (const send of [...subscribers]) {
        try {
          send(message);
        } catch {
          subscribers.delete(send);
        }
      }
    },
    subscribe(send) {
      subscribers.add(send);
      return () => subscribers.delete(send);
    },
    size: () => subscribers.size,
  };
}
