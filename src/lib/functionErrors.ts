function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function messageFromErrors(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const message = stringField(item, 'message') || stringField(item, 'detail');
    if (message) return message;
  }
  return null;
}

function messageFromPayload(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (!isRecord(payload)) return null;

  const direct =
    stringField(payload, 'error') ||
    stringField(payload, 'message') ||
    stringField(payload, 'reason');
  if (direct) return direct;

  const details = payload.details;
  if (typeof details === 'string' && details.trim()) return details;
  if (isRecord(details)) {
    const nestedError = details.error;
    const detailMessage =
      stringField(details, 'error') ||
      stringField(details, 'message') ||
      (isRecord(nestedError)
        ? stringField(nestedError, 'message') || stringField(nestedError, 'error')
        : null) ||
      messageFromErrors(details.errors);
    if (detailMessage) return detailMessage;
  }

  return messageFromErrors(payload.errors) || messageFromErrors(payload.squareErrors);
}

async function payloadFromResponse(response: unknown) {
  if (!isRecord(response)) return null;

  let readable = response;
  if (typeof response.clone === 'function') {
    try {
      readable = (response.clone as () => unknown)();
    } catch {
      readable = response;
    }
  }

  if (isRecord(readable) && typeof readable.text === 'function') {
    const text = await (readable.text as () => Promise<string>)().catch(() => '');
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (isRecord(readable) && typeof readable.json === 'function') {
    return await (readable.json as () => Promise<unknown>)().catch(() => null);
  }

  return null;
}

export async function functionErrorMessage(error: unknown, fallback = 'Function failed') {
  const baseMessage = error instanceof Error ? error.message : fallback;
  const context = isRecord(error) ? error.context : null;
  const payload = await payloadFromResponse(context);
  return messageFromPayload(payload) || baseMessage || fallback;
}
