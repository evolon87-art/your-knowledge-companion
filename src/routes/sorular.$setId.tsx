import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CirclePlay,
  Copy,
  FileQuestion,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
        content: "Soru ekle, düzenle, kopyala veya sil; ardından seti yarışmada sun.",
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
type Letter = (typeof LETTERS)[number];

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

  useEffect(() => {
    const questions = list.data;
    if (!questions) return;
    if (selectedId && !questions.some((question) => question.id === selectedId)) {
      setSelectedId(null);
      setDraftMode(true);
    }
  }, [list.data, selectedId]);

  useEffect(() => {
    if (draftMode) {
      setForm({ ...empty });
      return;
    }
    const question = list.data?.find((item) => item.id === selectedId);
    if (question) {
      setForm({
        question: question.question,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
        correct_answer: question.correct_answer.toUpperCase(),
      });
    }
  }, [draftMode, selectedId, list.data]);

  const set = (key: keyof typeof empty, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const questions = list.data ?? [];
  const total = questions.length;
  const selectedIndex = questions.findIndex((question) => question.id === selectedId);

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
    const question = form.question.trim();
    const a = form.option_a.trim();
    const b = form.option_b.trim();
    const c = form.option_c.trim();
    const d = form.option_d.trim();
    if (!question) return setError("Soru metni gerekli");
    if (!a || !b) return setError("İlk iki cevap (A ve B) zorunlu");
    const filled: Record<string, string> = { A: a, B: b, C: c, D: d };
    if (!filled[form.correct_answer]) return setError("Doğru cevap olarak dolu bir seçenek seçin");
    if (titleTouched && !title.trim()) return setError("Set başlığı gerekli");

    setSaving(true);
    try {
      if (titleTouched && setInfo.data) {
        await rename({ data: { id: setId, title } });
        setTitleTouched(false);
        void setInfo.refetch();
      }
      if (draftMode || !selectedId) {
        const result = await add({ data: { ...form, setId } });
        setSelectedId(result.id);
        setDraftMode(false);
      } else {
        await edit({ data: { ...form, id: selectedId } });
      }
      setNotice("Değişiklikler kaydedildi");
      window.setTimeout(() => setNotice(null), 2000);
      await list.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      await remove({ data: { id: selectedId } });
      setSelectedId(null);
      setDraftMode(true);
      await list.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Silinemedi");
    }
  };

  const duplicate = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const result = await copy({ data: { id: selectedId } });
      setSelectedId(result.id);
      setDraftMode(false);
      await list.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kopyalanamadı");
    }
  };

  const startContest = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await create({ data: { setId } });
      void navigate({ to: "/host/$code", params: { code: result.code } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Yarışma başlatılamadı");
      setStarting(false);
    }
  };

  return (
    <main className="min-h-screen bg-studio-bg font-studio text-studio-ink">
      <header className="border-b border-studio-line bg-studio-bg/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1480px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Soru setlerine dön"
              title="Soru setlerine dön"
              onClick={() => void navigate({ to: "/sorular" })}
              className="h-11 w-11 shrink-0 rounded-lg border border-studio-line text-studio-muted hover:bg-studio-elevated hover:text-studio-ink"
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-studio-yellow">Soru Stüdyosu</p>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTitleTouched(true);
                }}
                placeholder="Soru setinin başlığı"
                aria-label="Soru seti başlığı"
                className="mt-0.5 w-full min-w-0 truncate border-0 bg-transparent font-studio-display text-lg text-studio-ink outline-hidden placeholder:text-studio-muted sm:text-2xl"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden border-r border-studio-line pr-4 text-sm font-semibold text-studio-muted md:block">
              {total} soru
            </span>
            <Button
              onClick={() => void startContest()}
              disabled={starting || total === 0}
              className="hidden h-11 rounded-lg bg-studio-elevated px-4 font-bold text-studio-ink hover:bg-studio-line sm:inline-flex"
            >
              <CirclePlay />
              {starting ? "Hazırlanıyor" : "Seti Sun"}
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="h-11 rounded-lg bg-studio-yellow px-4 font-bold text-studio-bg shadow-[0_4px_0_var(--studio-blue)] hover:bg-studio-yellow/90 active:translate-y-0.5 active:shadow-none sm:px-6"
            >
              <Save />
              <span className="hidden sm:inline">{saving ? "Kaydediliyor" : "Kaydet"}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1480px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-7 lg:px-8 lg:py-8">
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <div className="border border-studio-line bg-studio-surface">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-studio-line p-4">
              <div className="min-w-0">
                <p className="font-studio-display text-base text-studio-ink">SORULAR</p>
                <p className="text-xs font-medium text-studio-muted">Set içeriği</p>
              </div>
              <Button
                size="icon"
                aria-label="Yeni soru ekle"
                title="Yeni soru ekle"
                onClick={newQuestion}
                className="h-10 w-10 shrink-0 rounded-lg bg-studio-yellow text-studio-bg hover:bg-studio-yellow/90"
              >
                <Plus />
              </Button>
            </div>

            <div className="flex max-h-56 gap-2 overflow-x-auto p-3 lg:max-h-[calc(100vh-260px)] lg:flex-col lg:overflow-y-auto">
              {list.isLoading && (
                <p className="p-3 text-sm font-semibold text-studio-muted">Sorular yükleniyor...</p>
              )}
              {!list.isLoading && total === 0 && (
                <div className="min-w-64 border border-dashed border-studio-line bg-studio-bg p-4 lg:min-w-0">
                  <FileQuestion className="mb-3 h-6 w-6 text-studio-yellow" />
                  <p className="text-sm font-semibold text-studio-ink">İlk sorunu hazırlamaya başla.</p>
                </div>
              )}
              {questions.map((question, index) => {
                const active = question.id === selectedId && !draftMode;
                return (
                  <Button
                    key={question.id}
                    variant="ghost"
                    onClick={() => pickQuestion(question.id)}
                    className={`h-auto min-w-56 justify-start rounded-none border p-3 text-left lg:min-w-0 ${
                      active
                        ? "border-studio-yellow bg-studio-yellow/10 text-studio-ink"
                        : "border-transparent bg-studio-bg/50 text-studio-muted hover:border-studio-line hover:bg-studio-elevated hover:text-studio-ink"
                    }`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center text-xs font-bold ${active ? "bg-studio-yellow text-studio-bg" : "bg-studio-elevated text-studio-muted"}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{question.question || "Boş soru"}</span>
                      <span className="mt-0.5 block text-xs text-studio-muted">
                        Doğru yanıt: {question.correct_answer.toUpperCase()}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>

            <div className="border-t border-studio-line p-3">
              <Button
                onClick={newQuestion}
                className={`h-11 w-full rounded-lg font-bold ${draftMode ? "bg-studio-yellow text-studio-bg" : "bg-studio-elevated text-studio-ink hover:bg-studio-line"}`}
              >
                <Plus /> Yeni Soru
              </Button>
            </div>
          </div>
        </aside>

        <section className="studio-enter min-w-0 border border-studio-line bg-studio-surface">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-studio-line px-5 py-4 sm:px-7">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-studio-blue">
                {draftMode ? "Yeni Soru" : `Soru ${String((selectedIndex >= 0 ? selectedIndex : 0) + 1).padStart(2, "0")}`}
              </p>
              <h1 className="mt-1 truncate font-studio-display text-xl text-studio-ink sm:text-2xl">
                {draftMode ? "SORUNU TASARLA" : "SORUYU DÜZENLE"}
              </h1>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              {!draftMode && selectedId && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Soruyu kopyala"
                    title="Soruyu kopyala"
                    onClick={() => void duplicate()}
                    className="h-10 w-10 rounded-lg border border-studio-line text-studio-muted hover:bg-studio-elevated hover:text-studio-ink"
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Soruyu sil"
                    title="Soruyu sil"
                    onClick={() => void del()}
                    className="h-10 w-10 rounded-lg border border-studio-line text-studio-danger hover:bg-studio-danger/10 hover:text-studio-danger"
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-7 lg:p-9">
            {(error || notice) && (
              <div
                role="status"
                className={`mb-6 flex items-center gap-3 border px-4 py-3 text-sm font-semibold ${
                  error
                    ? "border-studio-danger/60 bg-studio-danger/10 text-studio-danger"
                    : "border-studio-success/60 bg-studio-success/10 text-studio-success"
                }`}
              >
                {notice && <Check className="h-4 w-4" />}
                {error ?? notice}
              </div>
            )}

            <div>
              <label htmlFor="question-text" className="mb-2 block text-xs font-bold uppercase text-studio-muted">
                Soru metni
              </label>
              <textarea
                id="question-text"
                value={form.question}
                onChange={(event) => set("question", event.target.value)}
                rows={4}
                placeholder="Sorunuzu buraya yazın..."
                className="w-full resize-none border border-studio-line bg-studio-bg p-5 text-lg font-semibold text-studio-ink outline-hidden placeholder:text-studio-muted/60 focus:border-studio-blue focus:ring-2 focus:ring-studio-blue/20 sm:text-xl"
              />
            </div>

            <div className="mt-7 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-studio-display text-base text-studio-ink">CEVAP SEÇENEKLERİ</h2>
                <p className="mt-1 text-xs text-studio-muted">Doğru yanıtı sağdaki işaretten seç.</p>
              </div>
              <span className="shrink-0 border border-studio-line bg-studio-bg px-3 py-1.5 text-xs font-bold text-studio-muted">
                A–B zorunlu
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {LETTERS.map((letter, index) => {
                const key = `option_${letter.toLowerCase()}` as "option_a";
                const value = form[key];
                const correct = form.correct_answer === letter;
                const optional = index >= 2;
                return (
                  <div
                    key={letter}
                    className={`grid min-h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border p-3 transition-colors ${
                      correct
                        ? "border-studio-yellow bg-studio-yellow/10"
                        : "border-studio-line bg-studio-bg focus-within:border-studio-blue"
                    }`}
                  >
                    <span className={`grid h-11 w-11 shrink-0 place-items-center font-studio-display text-sm ${correct ? "bg-studio-yellow text-studio-bg" : "bg-studio-elevated text-studio-ink"}`}>
                      {letter}
                    </span>
                    <input
                      value={value}
                      onChange={(event) => {
                        set(key, event.target.value);
                        if (correct && !event.target.value.trim()) set("correct_answer", "A");
                      }}
                      placeholder={optional ? "İsteğe bağlı cevap" : `Cevap ${index + 1}`}
                      aria-label={`${letter} cevap seçeneği`}
                      className="min-w-0 bg-transparent text-base font-semibold text-studio-ink outline-hidden placeholder:text-studio-muted/60"
                    />
                    <Button
                      type="button"
                      size="icon"
                      aria-label={`${letter} seçeneğini doğru yanıt olarak işaretle`}
                      title="Doğru yanıt olarak işaretle"
                      disabled={!value.trim()}
                      onClick={() => set("correct_answer", letter as Letter)}
                      className={`h-10 w-10 shrink-0 rounded-full border ${
                        correct
                          ? "border-studio-yellow bg-studio-yellow text-studio-bg hover:bg-studio-yellow"
                          : "border-studio-line bg-transparent text-studio-muted hover:border-studio-yellow hover:bg-studio-yellow/10 hover:text-studio-yellow"
                      }`}
                    >
                      <Check />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="mt-7 grid gap-3 border-t border-studio-line pt-6 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="flex gap-2 sm:hidden">
                {!draftMode && selectedId && (
                  <>
                    <Button onClick={() => void duplicate()} className="h-11 flex-1 rounded-lg bg-studio-elevated text-studio-ink hover:bg-studio-line">
                      <Copy /> Kopyala
                    </Button>
                    <Button onClick={() => void del()} className="h-11 flex-1 rounded-lg bg-studio-danger/10 text-studio-danger hover:bg-studio-danger/20">
                      <Trash2 /> Sil
                    </Button>
                  </>
                )}
              </div>
              <Button
                onClick={() => void startContest()}
                disabled={starting || total === 0}
                className="h-12 rounded-lg bg-studio-elevated px-5 font-bold text-studio-ink hover:bg-studio-line sm:hidden"
              >
                <CirclePlay /> {starting ? "Hazırlanıyor" : "Seti Sun"}
              </Button>
              <p className="text-xs font-medium text-studio-muted sm:col-start-2 sm:text-right">
                {draftMode ? "Yeni soru kaydedildiğinde sete eklenecek." : "Bu soru set içinde kayıtlı."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}