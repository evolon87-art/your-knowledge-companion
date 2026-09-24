import { createServerFn } from "@tanstack/react-start";

export type QuestionRow = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  category: string;
  difficulty: string;
};

export type QuestionSetRow = {
  id: string;
  title: string;
  description: string | null;
  questionCount: number;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listSets = createServerFn({ method: "POST" }).handler(async (): Promise<
  QuestionSetRow[]
> => {
  const supabase = await db();
  const { data, error } = await supabase
    .from("question_sets")
    .select("id, title, description")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const sets = data ?? [];
  const { data: questions } = await supabase.from("questions").select("id, set_id");
  return sets.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    questionCount: (questions ?? []).filter((q) => q.set_id === s.id).length,
  }));
});

export const createSet = createServerFn({ method: "POST" })
  .inputValidator((data: { title: string; description?: string }) => ({
    title: String(data.title || "").trim().slice(0, 80),
    description: String(data.description || "").trim().slice(0, 200),
  }))
  .handler(async ({ data }) => {
    if (!data.title) throw new Error("Set adı gerekli");
    const supabase = await db();
    const { data: row, error } = await supabase
      .from("question_sets")
      .insert({ title: data.title, description: data.description || null })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Set oluşturulamadı");
    return { id: row.id };
  });

export const renameSet = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; title: string; description?: string }) => ({
    id: String(data.id),
    title: String(data.title || "").trim().slice(0, 80),
    description: String(data.description || "").trim().slice(0, 200),
  }))
  .handler(async ({ data }) => {
    if (!data.title) throw new Error("Set adı gerekli");
    const supabase = await db();
    const { error } = await supabase
      .from("question_sets")
      .update({ title: data.title, description: data.description || null })
      .eq("id", data.id);
    if (error) throw new Error("Set güncellenemedi");
    return { ok: true };
  });

export const deleteSet = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: String(data.id) }))
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: qs } = await supabase.from("questions").select("id").eq("set_id", data.id);
    const ids = (qs ?? []).map((q) => q.id);
    if (ids.length) {
      await supabase.from("answers").delete().in("question_id", ids);
      await supabase.from("questions").delete().in("id", ids);
    }
    await supabase.from("rooms").update({ set_id: null }).eq("set_id", data.id);
    const { error } = await supabase.from("question_sets").delete().eq("id", data.id);
    if (error) throw new Error("Set silinemedi");
    return { ok: true };
  });

export const getSet = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: String(data.id) }))
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: row, error } = await supabase
      .from("question_sets")
      .select("id, title, description")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Set bulunamadı");
    return row;
  });

export const listQuestions = createServerFn({ method: "POST" })
  .inputValidator((data?: { setId?: string }) => ({ setId: data?.setId ? String(data.setId) : undefined }))
  .handler(async ({ data }): Promise<QuestionRow[]> => {
    const supabase = await db();
    let query = supabase
      .from("questions")
      .select(
        "id, question, option_a, option_b, option_c, option_d, correct_answer, category, difficulty",
      )
      .order("created_at", { ascending: true });
    if (data.setId) query = query.eq("set_id", data.setId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

type QuestionInput = {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  category?: string | undefined;
};

function clean(data: QuestionInput): QuestionInput {
  return {
    question: String(data.question || "").trim().slice(0, 400),
    option_a: String(data.option_a || "").trim().slice(0, 200),
    option_b: String(data.option_b || "").trim().slice(0, 200),
    option_c: String(data.option_c || "").trim().slice(0, 200),
    option_d: String(data.option_d || "").trim().slice(0, 200),
    correct_answer: String(data.correct_answer || "A").toUpperCase().slice(0, 1),
    category: data.category ? String(data.category).trim().slice(0, 60) : undefined,
  };
}

function validate(d: QuestionInput) {
  if (!d.question) throw new Error("Soru metni gerekli");
  if (!d.option_a || !d.option_b || !d.option_c || !d.option_d)
    throw new Error("Dört seçeneğin tamamını doldurun");
  if (!["A", "B", "C", "D"].includes(d.correct_answer))
    throw new Error("Doğru cevap A, B, C veya D olmalı");
}

export const addQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: QuestionInput & { setId?: string }) => ({
    ...clean(data),
    setId: data.setId ? String(data.setId) : undefined,
  }))
  .handler(async ({ data }) => {
    const { setId, ...fields } = data;
    validate(fields);
    const supabase = await db();
    let targetSetId = setId ?? null;
    if (!targetSetId) {
      const { data: firstSet } = await supabase
        .from("question_sets")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      targetSetId = firstSet?.id ?? null;
    }
    const { data: row, error } = await supabase
      .from("questions")
      .insert({ ...fields, category: fields.category ?? "Genel Kültür", set_id: targetSetId })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Soru kaydedilemedi");
    return { id: row.id };
  });

export const duplicateQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: String(data.id) }))
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: src, error: readError } = await supabase
      .from("questions")
      .select("question, option_a, option_b, option_c, option_d, correct_answer, category, difficulty, time_limit, set_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !src) throw new Error("Soru bulunamadı");
    const { data: row, error } = await supabase
      .from("questions")
      .insert(src)
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Soru kopyalanamadı");
    return { id: row.id };
  });


export const updateQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: QuestionInput & { id: string }) => ({
    ...clean(data),
    id: String(data.id),
  }))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    validate(fields);
    const { category, ...rest } = fields;
    const update = category === undefined ? rest : { ...rest, category };
    const supabase = await db();
    const { error } = await supabase.from("questions").update(update).eq("id", id);
    if (error) throw new Error("Soru güncellenemedi");
    return { ok: true };
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: String(data.id) }))
  .handler(async ({ data }) => {
    const supabase = await db();
    const { error } = await supabase.from("questions").delete().eq("id", data.id);
    if (error) throw new Error("Soru silinemedi");
    return { ok: true };
  });
