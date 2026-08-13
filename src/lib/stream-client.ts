export async function readTextStream(
  response: Response,
  onText: (text: string) => void,
  onFinal?: (text: string) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The generation stream was unavailable.");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const data = dataLine.slice(6);
      if (data === "[DONE]") continue;
      if (event.startsWith("event: error")) throw new Error(JSON.parse(data) as string);
      if (event.startsWith("event: final")) {
        onFinal?.(JSON.parse(data) as string);
      } else {
        onText(JSON.parse(data) as string);
      }
    }
    if (done) break;
  }
}
