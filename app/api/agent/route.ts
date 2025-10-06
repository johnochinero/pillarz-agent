import { NextRequest } from "next/server";

export const runtime = "edge";

// Limit allowed origins (Squarespace domain)
function okOrigin(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allow = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return allow.length === 0 || allow.includes(origin);
}

// Handle browser preflight
export async function OPTIONS(req: NextRequest) {
  if (!okOrigin(req)) return new Response("Forbidden", { status: 403 });
  const origin = req.headers.get("origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  });
}

// Main POST handler
export async function POST(req: NextRequest) {
  if (!okOrigin(req)) return new Response("Forbidden", { status: 403 });
  const origin = req.headers.get("origin") || "*";

  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    // Build payload for OpenAI Responses API
    const payload = {
      model: "gpt-4o-mini", // fast + affordable model
      input: [
        { role: "system", content: process.env.SYSTEM_PROMPT || "You are a helpful concierge." },
        ...messages
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "captureLead",
            description: "Capture visitor lead info (name, email, topic). Call only after providing value.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: { type: "string", format: "email" },
                topic: { type: "string" }
              },
              required: ["name", "email"]
            }
          }
        }
      ],
      tool_choice: "auto",
      stream: true
    };

    // Forward request to OpenAI Responses API
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => "");
      return new Response(JSON.stringify({ error: "Upstream error", detail: text }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": origin, "Content-Type": "application/json" }
      });
    }

    // Proxy the stream back to the browser
    const headers = new Headers(r.headers);
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Cache-Control", "no-cache");
    headers.set("Content-Type", "text/event-stream; charset=utf-8");
    headers.set("Connection", "keep-alive");
    headers.delete("content-length");

    return new Response(r.body, { status: 200, headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown server error" }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": origin, "Content-Type": "application/json" }
    });
  }
}
