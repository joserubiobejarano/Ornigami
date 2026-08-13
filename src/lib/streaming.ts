type TextChunk = { choices?: Array<{ delta?: { content?: string | null } }> };

export async function* textChunks(text: string): AsyncGenerator<TextChunk> {
  for (const part of text.match(/\S+\s*/g) ?? []) {
    yield { choices: [{ delta: { content: part } }] };
  }
}

export function textStreamResponse(
  stream: AsyncIterable<TextChunk>,
  onComplete?: (text: string) => Promise<void>,
  finalize?: (text: string) => string
): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        for await (const chunk of stream) {
          const text = chunk.choices?.[0]?.delta?.content ?? "";
          if (!text) continue;
          fullText += text;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
        }
        await onComplete?.(fullText);
        if (finalize) {
          controller.enqueue(encoder.encode(`event: final\ndata: ${JSON.stringify(finalize(fullText))}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation failed";
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(message)}\n\n`));
        controller.close();
      }
    },
  }), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
