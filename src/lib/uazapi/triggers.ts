type AnyRecord = Record<string, any>;

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
  const eventType = readString(payload?.EventType, payload?.eventType, payload?.event, payload?.type);
  const messageType = readString(payload?.message?.messageType, payload?.data?.message?.messageType);
  const fromMe = readBool(payload?.message?.fromMe, payload?.data?.message?.fromMe);

  if (!eventType || eventType.toLowerCase() !== "messages") return null;
  if (!messageType || messageType !== "ButtonsResponseMessage") return null;
  if (fromMe) return null;

  const buttonId = readString(
    payload?.message?.buttonOrListid,
    payload?.message?.content?.selectedButtonID,
    payload?.message?.content?.Response?.SelectedButtonID
  );

  if (!buttonId) return null;

  const displayText = readString(
    payload?.message?.content?.Response?.SelectedDisplayText,
    payload?.message?.content?.selectedDisplayText
  );

  const messageId = readString(
    payload?.message?.id,
    payload?.message?.key?.id,
    payload?.data?.message?.id,
    payload?.data?.message?.key?.id
  );

  const chatId = readString(
    payload?.message?.chatid,
    payload?.message?.chatId,
    payload?.chatId,
    payload?.chat_id,
    payload?.data?.chatId,
    payload?.data?.chat_id
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
  const eventType = readString(payload?.EventType, payload?.eventType, payload?.event, payload?.type);
  const messageType = readString(payload?.message?.messageType, payload?.data?.message?.messageType);

  if (!eventType || eventType.toLowerCase() !== "messages") return null;
  if (!messageType || messageType !== "PollUpdateMessage") return null;

  const vote = payload?.message?.vote ?? payload?.data?.message?.vote ?? null;
  if (!vote) return null;

  return {
    trigger: "poll_voted" as const,
    vote,
  };
}

export function extractLocationShared(payload: AnyRecord) {
  const eventType = readString(payload?.EventType, payload?.eventType, payload?.event, payload?.type);
  const messageType = readString(payload?.message?.messageType, payload?.data?.message?.messageType);

  if (!eventType || eventType.toLowerCase() !== "messages") return null;
  if (!messageType || messageType !== "LocationMessage") return null;

  const lat = payload?.message?.content?.degreesLatitude ?? payload?.data?.message?.content?.degreesLatitude;
  const lng = payload?.message?.content?.degreesLongitude ?? payload?.data?.message?.content?.degreesLongitude;

  if (lat == null || lng == null) return null;

  return {
    trigger: "location_shared" as const,
    latitude: lat,
    longitude: lng,
  };
}

