// Supabase Edge Function: gemini-proxy
// Keeps GEMINI_API_KEY safe on the server side and verifies user session.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify User Authentication via Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or expired session token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Read Request Payload
    const body = await req.json();
    const { prompt, systemInstruction, responseSchema, model } = body;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get GEMINI_API_KEY from Supabase Secrets
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY secret not configured in Supabase Edge Functions." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const candidateModels = [
      model,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-3-flash-preview",
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    const requestBody: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
      },
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    if (responseSchema) {
      (requestBody.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
      (requestBody.generationConfig as Record<string, unknown>).responseSchema = responseSchema;
    }

    let lastError: Error | null = null;
    let successfulData: any = null;

    // 4. Call Google Gemini API with fallback models
    for (const targetModel of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${geminiApiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 503 || res.status === 404 || res.status === 429) {
            console.warn(`Model ${targetModel} returned status ${res.status}. Falling back...`);
            lastError = new Error(`Gemini status ${res.status}: ${errText}`);
            continue;
          }
          throw new Error(`Gemini status ${res.status}: ${errText}`);
        }

        const data = await res.json();
        successfulData = data;
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Exception on model ${targetModel}:`, err.message);
      }
    }

    if (!successfulData) {
      throw lastError || new Error("Failed to get response from Gemini API.");
    }

    const candidate = successfulData?.candidates?.[0];
    const textParts = candidate?.content?.parts
      ?.filter((p: any) => !p.thought && typeof p.text === "string")
      ?.map((p: any) => p.text) || [];

    const resultText = (textParts.length > 0
      ? textParts.join("\n")
      : (candidate?.content?.parts?.[0]?.text || "")
    ).trim();

    let parsedResult = null;
    if (responseSchema && resultText) {
      let cleanJson = resultText;
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      }
      try {
        parsedResult = JSON.parse(cleanJson);
      } catch (_) {
        parsedResult = null;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: resultText,
        data: parsedResult,
        candidates: successfulData.candidates,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

