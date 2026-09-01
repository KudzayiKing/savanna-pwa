import {
  SAVANNA_LITERT_LM_RUNTIME_URL,
  SAVANNA_LOCAL_GEMMA_WEB_MODEL_URL,
} from "@/savanna/inference/InferenceProvider";

type SavannaWorkerRequest = {
  id: string;
  type: "detect" | "load" | "generate" | "unload";
  payload?: Partial<{
    runtimeUrl: string;
    modelUrl: string;
    maxNumTokens: number;
    systemPrompt: string;
    prompt: string;
    maxTokens: number;
  }>;
};

type SavannaWorkerResponse = {
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
};

type LiteRtLmEngine = {
  createConversation(config?: {
    preface?: { messages?: Array<{ role: "system" | "user" | "assistant"; content: string }> };
  }): Promise<LiteRtLmConversation>;
  delete?(): Promise<void> | void;
};

type LiteRtLmConversation = {
  sendMessage(input: string | { role: "user"; content: string }): Promise<unknown>;
  cancel?(): void;
};

type LiteRtLmModule = {
  Engine: {
    create(settings: {
      model: string | Blob | ReadableStream;
      mainExecutorSettings?: { maxNumTokens?: number };
    }): Promise<LiteRtLmEngine>;
  };
};

let engine: LiteRtLmEngine | null = null;
let engineModelUrl = "";
let engineRuntimeUrl = "";

function reply(message: SavannaWorkerResponse) {
  self.postMessage(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!isObject(value)) return "";
  const content = value.content;
  if (Array.isArray(content)) {
    return content
      .map(item => isObject(item) && typeof item.text === "string" ? item.text : "")
      .join("")
      .trim();
  }
  if (typeof value.text === "string") return value.text.trim();
  if (typeof value.output_text === "string") return value.output_text.trim();
  if (typeof value.response === "string") return value.response.trim();
  return "";
}

async function modelBlob(url: string) {
  if (!("caches" in self)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download Gemma web model (${response.status}).`);
    return response.blob();
  }

  const cache = await caches.open("savanna-litertlm-models-v1");
  const cached = await cache.match(url);
  if (cached) return cached.blob();

  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Could not download Gemma web model (${response.status}).`);
  await cache.put(url, response.clone());
  return response.blob();
}

async function loadEngine(payload: SavannaWorkerRequest["payload"] = {}) {
  const runtimeUrl = payload.runtimeUrl || import.meta.env.VITE_SAVANNA_LITERT_LM_RUNTIME_URL || SAVANNA_LITERT_LM_RUNTIME_URL;
  const modelUrl = payload.modelUrl || import.meta.env.VITE_SAVANNA_LOCAL_GEMMA_MODEL_URL || SAVANNA_LOCAL_GEMMA_WEB_MODEL_URL;
  if (engine && engineModelUrl === modelUrl && engineRuntimeUrl === runtimeUrl) return;

  await engine?.delete?.();
  engine = null;

  const runtime = await import(/* @vite-ignore */ runtimeUrl) as LiteRtLmModule;
  const model = await modelBlob(modelUrl);
  engine = await runtime.Engine.create({
    model,
    mainExecutorSettings: {
      maxNumTokens: payload.maxNumTokens ?? 4096,
    },
  });
  engineModelUrl = modelUrl;
  engineRuntimeUrl = runtimeUrl;
}

async function generate(payload: SavannaWorkerRequest["payload"] = {}) {
  await loadEngine(payload);
  if (!engine) throw new Error("Local Gemma engine did not load.");
  const conversation = await engine.createConversation({
    preface: {
      messages: [{ role: "system", content: payload.systemPrompt || "You are Savanna." }],
    },
  });
  const response = await conversation.sendMessage({
    role: "user",
    content: payload.prompt || "",
  });
  const text = extractText(response);
  if (!text) throw new Error("Local Gemma returned no text.");
  return { text };
}

self.addEventListener("message", event => {
  const message = event.data as SavannaWorkerRequest;
  if (!message?.id) return;

  void (async () => {
    if (message.type === "detect") {
      reply({ id: message.id, ok: true, payload: { ready: true } });
      return;
    }

    if (message.type === "load") {
      await loadEngine(message.payload);
      reply({ id: message.id, ok: true, payload: { ready: true } });
      return;
    }

    if (message.type === "generate") {
      reply({ id: message.id, ok: true, payload: await generate(message.payload) });
      return;
    }

    if (message.type === "unload") {
      await engine?.delete?.();
      engine = null;
      engineModelUrl = "";
      engineRuntimeUrl = "";
      reply({ id: message.id, ok: true, payload: { ready: false } });
    }
  })().catch(error => {
    reply({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : "Local Gemma worker failed.",
    });
  });
});

export {};
