import { NextRequest } from "next/server";

export const runtime = "edge";

// Limit allowed origins (Squarespace domain, your site, etc.)
function okOrigin(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allow = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
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
      "Access-Control-Max-Age": "86400",
    },
  });
}

// Handle POST requests
export async function POST(req: NextRequest) {
  if (!okOrigin(req)) return new Response("Forbidden", { status: 403 });

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: messages" }),
        { status: 400 }
      );
    }

    // Forward to OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: process.env.SYSTEM_PROMPT || "You are a helpful assistant." },
          ...messages,
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(
        JSON.stringify({ error: "Upstream error", detail: err }),
        { status: 500 }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: err.message }),
      { status: 500 }
    );
  }
}
