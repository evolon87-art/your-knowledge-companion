import { createServerFn } from "@tanstack/react-start";

const QUESTION_COUNT = 10;
const STEP = 10;
const WIN_LIMIT = 100;

export type RoomStatus = "WAITING" | "READY" | "PLAYING" | "PAUSED" | "FINISHED";

export type PublicQuestion = {
  index: number;
  total: number;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  category: string;
  difficulty: string;
};

export type PublicPlayer = {
  id: string;
  name: string;
  team: 1 | 2;
  connected: boolean;
  answered: boolean;
};

export type RoomState = {
  code: string;
  status: RoomStatus;
  ropePosition: number;
  winner: string | null;
  players: PublicPlayer[];
  question: PublicQuestion | null;
  me: { answer: string; isCorrect: boolean } | null;
  /** Bu soru çözüldü mü (doğru cevap verildi ya da herkes cevapladı) */
  resolved: boolean;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  let out = "";
  for (let i = 0; i < 3; i++) out += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 3; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}

async function loadRoom(code: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("room_code", code.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Oda bulunamadı");
  return data;
}

export const createRoom = createServerFn({ method: "POST" })
  .inputValidator((data?: { setId?: string }) => ({
    setId: data?.setId ? String(data.setId) : undefined,
  }))
  .handler(async ({ data: input }) => {
  const supabase = await db();
  let questionIds: string[];
  if (input.setId) {
    const { data: qs, error } = await supabase
      .from("questions")
      .select("id")
      .eq("set_id", input.setId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    questionIds = (qs ?? []).map((q) => q.id);
    if (!questionIds.length) throw new Error("Bu sette hiç soru yok");
  } else {
    const { data: questions, error: qErr } = await supabase.from("questions").select("id");
    if (qErr) throw new Error(qErr.message);
    questionIds = (questions ?? [])
      .map((q) => q.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, QUESTION_COUNT);
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ room_code: code, question_ids: questionIds, set_id: input.setId ?? null })
      .select("room_code")
      .maybeSingle();
    if (!error && data) return { code: data.room_code };
  }
  throw new Error("Oda oluşturulamadı, tekrar deneyin");
});

export const joinRoom = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; name: string }) => ({
    code: String(data.code || "").trim().toUpperCase(),
    name: String(data.name || "").trim().slice(0, 24),
  }))
  .handler(async ({ data }) => {
    if (!data.name) throw new Error("Lütfen adınızı yazın");
    const supabase = await db();
    const room = await loadRoom(data.code);
    if (room.status === "FINISHED") throw new Error("Bu yarışma sona erdi");

    const { data: players, error } = await supabase
      .from("players")
      .select("id, team")
      .eq("room_id", room.id);
    if (error) throw new Error(error.message);
    if ((players ?? []).length >= 2) throw new Error("Bu yarışma dolu (en fazla 2 oyuncu)");

    const taken = new Set((players ?? []).map((p) => p.team));
    const team = taken.has(1) ? 2 : 1;

    const { data: player, error: insErr } = await supabase
      .from("players")
      .insert({ room_id: room.id, name: data.name, team })
      .select("id, team")
      .maybeSingle();
    if (insErr || !player) throw new Error("Takıma katılamadınız, tekrar deneyin");

    const total = (players ?? []).length + 1;
    if (total === 2 && room.status === "WAITING") {
      await supabase.from("rooms").update({ status: "READY" }).eq("id", room.id);
    }
    return { playerId: player.id, team: player.team as 1 | 2, code: room.room_code };
  });

export const getRoomState = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; playerId?: string | undefined }) => ({
    code: String(data.code || "").trim().toUpperCase(),
    playerId: data.playerId ? String(data.playerId) : undefined,
  }))

  .handler(async ({ data }): Promise<RoomState> => {
    const supabase = await db();
    const room = await loadRoom(data.code);

    const { data: players } = await supabase
      .from("players")
      .select("id, name, team, connected")
      .eq("room_id", room.id)
      .order("team");

    const questionIds = (room.question_ids ?? []) as string[];
    const currentId = questionIds[room.current_question] ?? null;

    let question: PublicQuestion | null = null;
    let answeredIds: string[] = [];
    let me: RoomState["me"] = null;
    let resolved = false;

    if (currentId && room.status !== "WAITING" && room.status !== "READY") {
      const { data: q } = await supabase
        .from("questions")
        .select("question, option_a, option_b, option_c, option_d, category, difficulty")
        .eq("id", currentId)
        .maybeSingle();
      if (q) {
        question = {
          index: room.current_question + 1,
          total: questionIds.length,
          question: q.question,
          options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
          category: q.category,
          difficulty: q.difficulty,
        };
      }
      const { data: answers } = await supabase
        .from("answers")
        .select("player_id, answer, is_correct")
        .eq("room_id", room.id)
        .eq("question_id", currentId);
      answeredIds = (answers ?? []).map((a) => a.player_id);
      // Soru yalnızca doğru cevap verildiğinde çözülür; yanlış cevap veren denemeye devam eder.
      resolved = (answers ?? []).some((a) => a.is_correct);
      const mine = (answers ?? []).find((a) => a.player_id === data.playerId);
      if (mine) me = { answer: mine.answer, isCorrect: mine.is_correct };
    }

    return {
      code: room.room_code,
      status: room.status as RoomStatus,
      ropePosition: room.rope_position,
      winner: room.winner,
      players: (players ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team as 1 | 2,
        connected: p.connected,
        answered: answeredIds.includes(p.id),
      })),
      question,
      me,
      resolved,
    };
  });

export const submitAnswer = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; playerId: string; answer: string }) => ({
    code: String(data.code || "").trim().toUpperCase(),
    playerId: String(data.playerId),
    answer: String(data.answer || "").toUpperCase().slice(0, 1),
  }))
  .handler(async ({ data }) => {
    if (!["A", "B", "C", "D"].includes(data.answer)) throw new Error("Geçersiz cevap");
    const supabase = await db();
    const room = await loadRoom(data.code);
    if (room.status !== "PLAYING") throw new Error("Şu anda cevap verilemez");

    const questionIds = (room.question_ids ?? []) as string[];
    const currentId = questionIds[room.current_question];
    if (!currentId) throw new Error("Aktif soru yok");

    const { data: player } = await supabase
      .from("players")
      .select("id, team, room_id")
      .eq("id", data.playerId)
      .maybeSingle();
    if (!player || player.room_id !== room.id) throw new Error("Oyuncu bu odada değil");

    const { data: q } = await supabase
      .from("questions")
      .select("correct_answer")
      .eq("id", currentId)
      .maybeSingle();
    if (!q) throw new Error("Soru bulunamadı");

    const { data: existing } = await supabase
      .from("answers")
      .select("id, player_id, is_correct")
      .eq("room_id", room.id)
      .eq("question_id", currentId);
    if ((existing ?? []).some((a) => a.is_correct))
      throw new Error("Bu soru çözüldü, sıradaki soru geliyor");

    const isCorrect = q.correct_answer.toUpperCase() === data.answer;
    const mine = (existing ?? []).find((a) => a.player_id === player.id);
    if (mine) {
      const { error: updErr } = await supabase
        .from("answers")
        .update({ answer: data.answer, is_correct: isCorrect })
        .eq("id", mine.id);
      if (updErr) throw new Error("Cevap kaydedilemedi");
    } else {
      const { error: insErr } = await supabase.from("answers").insert({
        room_id: room.id,
        player_id: player.id,
        question_id: currentId,
        answer: data.answer,
        is_correct: isCorrect,
      });
      if (insErr) throw new Error("Cevap kaydedilemedi");
    }

    const someoneAlreadyCorrect = (existing ?? []).some((a) => a.is_correct);
    if (isCorrect && !someoneAlreadyCorrect) {
      const delta = player.team === 1 ? -STEP : STEP;
      const next = Math.max(-WIN_LIMIT, Math.min(WIN_LIMIT, room.rope_position + delta));
      const finished = Math.abs(next) >= WIN_LIMIT;
      await supabase
        .from("rooms")
        .update({
          rope_position: next,
          ...(finished
            ? { status: "FINISHED", winner: next <= -WIN_LIMIT ? "TEAM1" : "TEAM2" }
            : {}),
        })
        .eq("id", room.id);
    }

    return { isCorrect };
  });

export const controlRoom = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; action: string }) => ({
    code: String(data.code || "").trim().toUpperCase(),
    action: String(data.action),
  }))
  .handler(async ({ data }) => {
    const supabase = await db();
    const room = await loadRoom(data.code);
    const questionIds = (room.question_ids ?? []) as string[];

    if (data.action === "start") {
      await supabase
        .from("rooms")
        .update({
          status: "PLAYING",
          current_question: 0,
          rope_position: 0,
          winner: null,
        })
        .eq("id", room.id);
      await supabase.from("answers").delete().eq("room_id", room.id);
      return { ok: true };
    }

    if (data.action === "next") {
      const nextIndex = room.current_question + 1;
      if (nextIndex >= questionIds.length) {
        const winner =
          room.rope_position < 0 ? "TEAM1" : room.rope_position > 0 ? "TEAM2" : "TIE";
        await supabase.from("rooms").update({ status: "FINISHED", winner }).eq("id", room.id);
        return { ok: true };
      }
      await supabase
        .from("rooms")
        .update({
          current_question: nextIndex,
          status: "PLAYING",
        })
        .eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "pause") {
      await supabase.from("rooms").update({ status: "PAUSED" }).eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "resume") {
      await supabase.from("rooms").update({ status: "PLAYING" }).eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "restart") {
      await supabase.from("answers").delete().eq("room_id", room.id);
      await supabase
        .from("rooms")
        .update({
          status: "PLAYING",
          current_question: 0,
          rope_position: 0,
          winner: null,
        })
        .eq("id", room.id);
      return { ok: true };
    }

    if (data.action === "finish") {
      const winner =
        room.rope_position < 0 ? "TEAM1" : room.rope_position > 0 ? "TEAM2" : "TIE";
      await supabase.from("rooms").update({ status: "FINISHED", winner }).eq("id", room.id);
      return { ok: true };
    }

    throw new Error("Bilinmeyen işlem");
  });

export const heartbeat = createServerFn({ method: "POST" })
  .inputValidator((data: { playerId: string }) => ({ playerId: String(data.playerId) }))
  .handler(async ({ data }) => {
    const supabase = await db();
    await supabase
      .from("players")
      .update({ connected: true, last_seen: new Date().toISOString() })
      .eq("id", data.playerId);
    return { ok: true };
  });
