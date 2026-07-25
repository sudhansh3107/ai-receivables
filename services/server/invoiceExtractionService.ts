import { openai } from "@/lib/openai";

export async function testOpenAI() {
  const response = await openai.responses.create({
    model: "gpt-5.5",
    input: "Reply with exactly: OpenAI connection successful",
  });

  return response.output_text;
}