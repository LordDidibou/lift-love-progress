import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { exerciseId } = await req.json();
    if (!exerciseId) throw new Error("exerciseId requis");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Récupérer l'exercice
    const { data: ex, error: exErr } = await admin
      .from("exercises")
      .select("id, name, muscle_group, equipment, image_url")
      .eq("id", exerciseId)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!ex) throw new Error("Exercice introuvable");
    if (ex.image_url) {
      return new Response(JSON.stringify({ image_url: ex.image_url, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prompt pédagogique : mouvement clair + muscles ciblés mis en évidence
    const prompt = `Educational fitness illustration showing a person performing the strength exercise "${ex.name}" using ${ex.equipment}. Side-view anatomical pictogram, clean modern flat vector style. The figure clearly demonstrates the correct movement and posture. The targeted muscle group (${ex.muscle_group}) is highlighted in vivid lime green (#e1ff01) with a subtle anatomical glow, while the rest of the body is rendered in neutral dark grey (#3a3a3a) with light outlines. Dark near-black background (#0f0f12). Single centered subject, no text, no watermark, no logos, no background props. Modern sport-app pictogram aesthetic, instructional and easy to read.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      if (aiRes.status === 429)
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans une minute." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (aiRes.status === 402)
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      throw new Error("Échec génération IA");
    }

    const aiJson = await aiRes.json();
    const dataUrl = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
    if (!dataUrl?.startsWith("data:image")) throw new Error("Aucune image reçue");

    // Décoder le base64
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "image/png";
    const ext = mime.split("/")[1] ?? "png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const path = `${exerciseId}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("exercise-images")
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from("exercise-images").getPublicUrl(path);
    const image_url = pub.publicUrl;

    const { error: updErr } = await admin
      .from("exercises")
      .update({ image_url })
      .eq("id", exerciseId);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ image_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-exercise-image error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
