import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_JOB_SECRET");
  const authHeader = req.headers.get("Authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Buscar sesiones activas en estado DRAWING
  const { data: sessions, error } = await supabaseAdmin
    .from("game_sessions")
    .select("id, table_id")
    .eq("status", "DRAWING");

  if (error || !sessions) {
    return new Response(JSON.stringify({ error: error?.message || "Failed to fetch drawing sessions" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const results = [];
  for (const session of sessions) {
    const { data, error: rpcError } = await supabaseAdmin.rpc("reveal_next_bingo_ball", { 
      p_session_id: session.id 
    });

    if (!rpcError && data?.success) {
      results.push({
        session_id: session.id,
        ...data
      });

      if (data.has_winner) {
        console.log(`[BINGO_CRON] Winner detected in session ${session.id}:`, data.winner_user_id);
      }
    } else if (data?.reason === "DRAW_COMPLETE") {
      // Marcar sesión como FINISHED si finalizó el sorteo sin ganador adicional
      await supabaseAdmin
        .from("game_sessions")
        .update({ status: "FINISHED", updated_at: new Date().toISOString() })
        .eq("id", session.id);
      
      results.push({
        session_id: session.id,
        status: "FINISHED",
        reason: "DRAW_COMPLETE"
      });
    } else if (rpcError) {
      console.error(`[BINGO_CRON] RPC error for session ${session.id}:`, rpcError.message);
    }
  }

  return new Response(JSON.stringify({ success: true, revealed: results }), { 
    headers: { "Content-Type": "application/json" } 
  });
});
