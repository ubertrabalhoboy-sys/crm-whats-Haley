type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AnyRecord;
}

function readPath(payload: unknown, ...path: string[]) {
  let current: unknown = payload;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readBool(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const v = value.toLowerCase();
      if (["true", "1", "yes"].includes(v)) return true;
      if (["false", "0", "no"].includes(v)) return false;
    }
  }
  return false;
}

export function extractButtonClicked(payload: AnyRecord) {
  const eventType = readString(
    readPath(payload, "EventType"),
    readPath(payload, "eventType"),
    readPath(payload, "event"),
    readPath(payload, "type")
  );
  const messageType = readString(
    readPath(payload, "message", "messageType"),
    readPath(payload, "data", "message", "messageType")
  );
  const fromMe = readBool(
    readPath(payload, "message", "fromMe"),
    readPath(payload, "data", "message", "fromMe")
  );

  if (!eventType || eventType.toLowerCase() !== "messages") return null;
  if (!messageType || messageType !== "ButtonsResponseMessage") return null;
  if (fromMe) return null;

  const buttonId = readString(
    readPath(payload, "message", "buttonOrListid"),
    readPath(payload, "message", "content", "selectedButtonID"),
    readPath(payload, "message", "content", "Response", "SelectedButtonID")
  );

  if (!buttonId) return null;

  const displayText = readString(
    readPath(payload, "message", "content", "Response", "SelectedDisplayText"),
    readPath(payload, "message", "content", "selectedDisplayText")
  );

  const messageId = readString(
    readPath(payload, "message", "id"),
    readPath(payload, "message", "key", "id"),
    readPath(payload, "data", "message", "id"),
    readPath(payload, "data", "message", "key", "id")
  );

  const chatId = readString(
    readPath(payload, "message", "chatid"),
    readPath(payload, "message", "chatId"),
    readPath(payload, "chatId"),
    readPath(payload, "chat_id"),
    readPath(payload, "data", "chatId"),
    readPath(payload, "data", "chat_id")
  );

  return {
    trigger: "button_clicked" as const,
    buttonId,
    displayText,
    messageId,
    chatId,
  };
}

export function extractPollVoted(payload: AnyRecord) {
  const eventType = readString(
    readPath(payload, "EventType"),
    readPath(payload, "eventType"),
    readPath(payload, "event"),
    readPath(payload, "type")
  );
  const messageType = readString(
    readPath(payload, "message", "messageType"),
    readPath(payload, "data", "message", "messageType")
  );

  if (!eventType || eventType.toLowerCase() !== "messages") return null;
  if (!messageType || messageType !== "PollUpdateMessage") return null;

  const vote = readPath(payload, "message", "vote") ?? readPath(payload, "data", "message", "vote") ?? null;
  if (!vote) return null;

  return {
    trigger: "poll_voted" as const,
    vote,
  };
}

export function extractLocationShared(payload: AnyRecord) {
  const eventType = readString(
    readPath(payload, "EventType"),
    readPath(payload, "eventType"),
    readPath(payload, "event"),
    readPath(payload, "type")
  );
  const messageType = readString(
    readPath(payload, "message", "messageType"),
    readPath(payload, "data", "message", "messageType")
  );

  if (!eventType || eventType.toLowerCase() !== "messages") return null;
  if (!messageType || messageType !== "LocationMessage") return null;

  const lat =
    readPath(payload, "message", "content", "degreesLatitude") ??
    readPath(payload, "data", "message", "content", "degreesLatitude");
  const lng =
    readPath(payload, "message", "content", "degreesLongitude") ??
    readPath(payload, "data", "message", "content", "degreesLongitude");

  if (lat == null || lng == null) return null;

  return {
    trigger: "location_shared" as const,
    latitude: lat,
    longitude: lng,
  };
}
