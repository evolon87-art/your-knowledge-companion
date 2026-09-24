import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createRoom } from "@/lib/game.functions";
import {
  addQuestion,
  deleteQuestion,
  duplicateQuestion,
  getSet,
  listQuestions,
  renameSet,
  updateQuestion,
  type QuestionRow,
} from "@/lib/questions.functions";

export const Route = createFileRoute("/sorular/$setId")({
  head: () => ({
    meta: [
      { title: "Soru Seti Düzenle — Halat Yarışı" },
      {
        name: "description",
        content: "Kahoot tarzı düzenleyiciyle soru ekle, düzenle, kopyala veya sil; sonra seti sun.",
      },
      { property: "og:title", content: "Soru Seti Düzenle — Halat Yarışı" },
      { property: "og:description", content: "Soru setini hazırla ve yarışmada sun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuestionsPage,
});

const LETTERS = ["A", "B", "C", "D"] as const;
const SHAPES: Record<(typeof LETTERS)[number], string> = { A: "▲", B: "◆", C: "●", D: "■" };
const OPT_BG: Record<(typeof LETTERS)[number], string> = {
  A: "bg-kh-red",
  B: "bg-kh-blue",
  C: "bg-kh-yellow",
  D: "bg-kh-green",
};

const empty = {
  question: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_answer: "A",
};

function QuestionsPage() {
  const { setId } = Route.useParams();
  const navigate = useNavigate();
  const fetchAll = useServerFn(listQuestions);
  const fetchSet = useServerFn(getSet);
  const add = useServerFn(addQuestion);
  const edit = useServerFn(updateQuestion);
  const remove = useServerFn(deleteQuestion);
  const copy = useServerFn(duplicateQuestion);
  const rename = useServerFn(renameSet);
  const create = useServerFn(createRoom);

  const setInfo = useQuery({
    queryKey: ["set", setId],
    queryFn: () => fetchSet({ data: { id: setId } }),
  });
  const list = useQuery<QuestionRow[]>({
    queryKey: ["questions", setId],
    queryFn: () => fetchAll({ data: { setId } }),
    refetchOnWindowFocus: false,
  });

  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState(true);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!titleTouched && setInfo.data) setTitle(setInfo.data.title);
  }, [setInfo.data, titleTouched]);

  // Seçili soru listeden kalkarsa (silme vb.) yeni soruya dön
  useEffect(() => {
    const qs = list.data;
    if (!qs) return;
    if (selectedId && !qs.some((q) => q.id === selectedId)) {
      setSelectedId(null);
      setDraftMode(true);
    }
  }, [list.data, selectedId]);

  // Seçim veya liste değişince formu doldur
  useEffect(() => {
    if (draftMode) {
      setForm({ ...empty });
      return;
    }
    const q = list.data?.find((x) => x.id === selectedId);
    if (q)
      setForm({
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer.toUpperCase(),
      });
  }, [draftMode, selectedId, list.data]);

  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const questions = list.data ?? [];
  const total = questions.length;
  const selectedIndex = questions.findIndex((q) => q.id === selectedId);

  const pickQuestion = (id: string) => {
    setError(null);
    setNotice(null);
    setSelectedId(id);
    setDraftMode(false);
  };

  const newQuestion = () => {
    setError(null);
    setNotice(null);
    setSelectedId(null);
    setDraftMode(true);
    setForm({ ...empty });
  };

  const save = async () => {
    setError(null);
    setNotice(null);
    const q = form.question.trim();
    const a = form.option_a.trim();
    const b = form.option_b.trim();
    const c = form.option_c.trim();
    const d = form.option_d.trim();
    if (!q) return setError("Soru metni gerekli");
    if (!a || !b) return setError("İlk iki cevap (A ve B) zorunlu");
    const filled: Record<string, string> = { A: a, B: b, C: c, D: d };
    if (!filled[form.correct_answer])
      return setError("Doğru cevap olarak dolu bir seçenek seçin");
    if (titleTouched && !title.trim()) return setError("Set başlığı gerekli");

    setSaving(true);
    try {
      if (titleTouched && setInfo.data) {
        await rename({ data: { id: setId, title } });
        setTitleTouched(false);
        void setInfo.refetch();
      }
      if (draftMode || !selectedId) {
        const res = await add({ data: { ...form, setId } });
        setSelectedId(res.id);
        setDraftMode(false);
      } else {
        await edit({ data: { ...form, id: selectedId } });
      }
      setNotice("Kaydedildi ✓");
      window.setTimeout(() => setNotice(null), 2000);
      await list.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    }
    setSaving(false);
  };

  const del = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      await remove({ data: { id: selectedId } });
      setSelectedId(null);
      setDraftMode(true);
      await list.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi");
    }
  };

  const duplicate = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const res = await copy({ data: { id: selectedId } });
      setSelectedId(res.id);
      setDraftMode(false);
      await list.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kopyalanamadı");
    }
  };

  const startContest = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await create({ data: { setId } });
      void navigate({ to: "/host/$code", params: { code: res.code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yarışma başlatılamadı");
      setStarting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Üst bar */}
      <header className="flex h-16 shrink-0 items-center gap-3 px-4 shadow-[0_2px_10px_oklch(0.1_0.1_296_/_0.12)] sm:gap-4 sm:px-6">
        <span className="text-2xl font-black tracking-tight text-kh-purple">
          Halat<span className="text-kh-yellow">!</span>
        </span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          placeholder="Soru setinin başlığını yazın..."
          className="w-44 rounded-xl border-2 border-border bg-white px-4 py-2 text-base font-extrabold text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-kh-purple sm:w-72"
        />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden text-xs font-extrabold uppercase tracking-wider text-muted-foreground sm:inline">
            {total} soru
          </span>
          <button
            onClick={() => void navigate({ to: "/sorular" })}
            className="rounded-xl border-2 border-border px-4 py-2 text-sm font-extrabold text-foreground transition hover:bg-muted sm:px-5"
          >
            ÇIKIŞ
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-kh-blue px-5 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_oklch(0.4_0.12_257)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-40 sm:px-7 sm:py-2.5"
          >
            {saving ? "KAYDEDİLİYOR..." : "KAYDET"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sol panel: soru listesi */}
        <aside className="flex w-56 shrink-0 flex-col border-r-2 border-border bg-white sm:w-64">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
              Sorular
            </p>
            {list.isLoading && (
              <p className="text-sm font-extrabold text-muted-foreground">Yükleniyor...</p>
            )}
            {!list.isLoading && total === 0 && (
              <p className="rounded-2xl bg-muted px-4 py-3 text-sm font-extrabold text-muted-foreground">
                Henüz soru yok — ilk sorunuzu ekleyin!
              </p>
            )}
            {questions.map((q, i) => {
              const active = q.id === selectedId && !draftMode;
              return (
                <button
                  key={q.id}
                  onClick={() => pickQuestion(q.id)}
                  className={`w-full rounded-2xl border-2 bg-white p-3 text-left transition ${
                    active
                      ? "border-kh-purple shadow-[0_4px_14px_oklch(0.5_0.22_285_/_0.3)]"
                      : "border-border hover:border-kh-purple/50 hover:bg-muted/50"
                  }`}
                >
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    {i + 1}. Soru
                  </span>
                  <p className="truncate text-sm font-extrabold text-foreground">
                    {q.question || "Boş soru"}
                  </p>
                  <span
                    className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white ${OPT_BG[q.correct_answer.toUpperCase() as (typeof LETTERS)[number]] ?? "bg-muted"}`}
                  >
                    DOĞRU: {q.correct_answer.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="space-y-3 border-t-2 border-border p-4">
            <button
              onClick={newQuestion}
              className={`w-full rounded-xl py-3 text-sm font-extrabold text-white shadow-[0_4px_0_oklch(0.4_0.12_257)] transition active:translate-y-0.5 active:shadow-none ${
                draftMode ? "bg-foreground" : "bg-kh-blue"
              }`}
            >
              + SORU EKLE
            </button>
            <button
              onClick={startContest}
              disabled={starting || total === 0}
              className="w-full rounded-xl bg-kh-green py-3 text-sm font-extrabold text-white shadow-[0_4px_0_oklch(0.42_0.14_145)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-40"
            >
              {starting ? "HAZIRLANIYOR..." : "BU SETİ SUN"}
            </button>
          </div>
        </aside>

        {/* Düzenleyici */}
        <main className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-kh-bg to-kh-bg-deep p-5 sm:p-10">
          <div className="mx-auto w-full max-w-3xl pb-10">
            {error && (
              <p className="mb-4 rounded-2xl bg-white/20 px-4 py-3 text-sm font-extrabold text-white">
                {error}
              </p>
            )}
            {notice && (
              <p className="mb-4 rounded-2xl bg-kh-green px-4 py-3 text-sm font-extrabold text-white">
                {notice}
              </p>
            )}

            <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-white/70">
              {draftMode ? "Yeni Soru" : `${(selectedIndex >= 0 ? selectedIndex : 0) + 1}. Soru`}
            </p>

            <textarea
              value={form.question}
              onChange={(e) => set("question", e.target.value)}
              rows={2}
              placeholder="Sorunuzu buraya yazın"
              className="mt-3 w-full resize-none rounded-2xl bg-white px-6 py-5 text-xl font-extrabold text-foreground shadow-[0_10px_30px_-12px_oklch(0.1_0.1_296_/_0.5)] outline-none placeholder:text-muted-foreground/60 sm:text-2xl"
            />

            <div className="mt-24 grid gap-4 sm:grid-cols-2">
              {LETTERS.map((l, i) => {
                const key = `option_${l.toLowerCase()}` as "option_a";
                const value = form[key];
                const correct = form.correct_answer === l;
                const optional = i >= 2;
                return (
                  <div
                    key={l}
                    className={`flex items-center gap-3 rounded-2xl p-3 shadow-[0_6px_0_oklch(0.1_0.05_296_/_0.3)] transition ${OPT_BG[l]} ${
                      correct ? "ring-4 ring-white" : ""
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`${l} doğru cevap`}
                      disabled={!value.trim()}
                      onClick={() => set("correct_answer", l)}
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/25 text-3xl leading-none text-white drop-shadow transition disabled:cursor-not-allowed ${
                        correct ? "ring-4 ring-white" : ""
                      }`}
                    >
                      {SHAPES[l]}
                    </button>
                    <input
                      value={value}
                      onChange={(e) => {
                        set(key, e.target.value);
                        // Doğru işaretli seçeneğin metni silinirse işareti A'ya al
                        if (correct && !e.target.value.trim()) set("correct_answer", "A");
                      }}
                      placeholder={optional ? `Cevap ${i + 1} (isteğe bağlı)` : `Cevap ${i + 1}`}
                      className="w-full min-w-0 bg-transparent text-base font-extrabold text-white outline-none placeholder:text-white/70 sm:text-lg"
                    />
                    <button
                      type="button"
                      aria-label={`${l} doğru cevap işaretle`}
                      disabled={!value.trim()}
                      onClick={() => set("correct_answer", l)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[3px] text-base font-extrabold transition disabled:opacity-30 ${
                        correct
                          ? "border-white bg-white text-foreground"
                          : "border-white/70 text-transparent hover:border-white"
                      }`}
                    >
                      ✓
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs font-extrabold text-white/70">
              Doğru cevabı seçmek için renkli kutuya veya ✓ düğmesine dokun. İlk iki cevap zorunlu,
              3. ve 4. cevap isteğe bağlı.
            </p>

            <div className="mt-8 flex items-center justify-end gap-3">
              {!draftMode && selectedId && (
                <>
                  <button
                    onClick={duplicate}
                    className="rounded-xl border-2 border-white/40 bg-white/10 px-6 py-3 text-sm font-extrabold text-white transition hover:bg-white/20"
                  >
                    KOPIALA
                  </button>
                  <button
                    onClick={del}
                    className="rounded-xl border-2 border-white/40 bg-white/10 px-6 py-3 text-sm font-extrabold text-white transition hover:bg-white/20"
                  >
                    SİL
                  </button>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
