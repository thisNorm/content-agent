import { GoogleGenAI, Modality } from "@google/genai";

export function createAiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export async function generateJson<T>({
  ai,
  model,
  systemInstruction,
  prompt,
  responseSchema,
  temperature = 0.4,
}: {
  ai: GoogleGenAI;
  model: string;
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature?: number;
}): Promise<T> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema,
      temperature,
    },
  });

  const raw = response.text?.trim();
  if (!raw) {
    throw new Error("AI returned an empty JSON response.");
  }

  return JSON.parse(raw) as T;
}

export async function generateImage({
  ai,
  model,
  prompt,
}: {
  ai: GoogleGenAI;
  model: string;
  prompt: string;
}): Promise<{ mimeType: string; bytes: Buffer }> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      temperature: 0.8,
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data && part.inlineData?.mimeType);

  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
    throw new Error("AI did not return an image payload.");
  }

  return {
    mimeType: imagePart.inlineData.mimeType,
    bytes: Buffer.from(imagePart.inlineData.data, "base64"),
  };
}
