import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createRoom } from "@/lib/game.functions";
import { createSet, deleteSet, listSets, type QuestionSetRow } from "@/lib/questions.functions";

export const Route = createFileRoute("/sorular/")({
  head: () => ({
    meta: [
      { title: "Soru Setlerim — Halat Yarışı" },
      {
        name: "description",
        content: "Ayrı ayrı soru setleri oluştur, istediğin kadar soru ekle ve istediğin seti sun.",
      },
      { property: "og:title", content: "Soru Setlerim — Halat Yarışı" },
      { property: "og:description", content: "Soru setlerini hazırla ve istediğini yarışmada sun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetsPage,
});

function SetsPage() {
  const navigate = useNavigate();
  const fetchSets = useServerFn(listSets);
  const add = useServerFn(createSet);
  const remove = useServerFn(deleteSet);
  const create = useServerFn(createRoom);
  const sets = useQuery<QuestionSetRow[]>({ queryKey: ["sets"], queryFn: () => fetchSets() });

  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const newSet = async () => {
    setError(null);
    setBusy("new");
    try {
      const res = await add({ data: { title } });
      void navigate({ to: "/sorular/$setId", params: { setId: res.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Oluşturulamadı");
      setBusy(null);
    }
  };

  const present = async (setId: string) => {
    setError(null);
    setBusy(setId);
    try {
      const res = await create({ data: { setId } });
      void navigate({ to: "/host/$code", params: { code: res.code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Başlatılamadı");
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.35em] text-muted-foreground">
              SORU SETLERİM
            </p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-foreground">
              HANGİ SETİ SUNACAKSIN?
            </h1>
          </div>
          <Link
            to="/"
            className="rounded-xl border-2 border-border bg-panel px-4 py-3 text-sm font-bold text-foreground hover:bg-muted"
          >
            ANA SAYFA
          </Link>
        </header>

        <section className="mt-6 rounded-[var(--radius)] bg-panel p-6 shadow-[var(--shadow-panel)]">
          <h2 className="text-lg font-extrabold text-foreground">YENİ SORU SETİ OLUŞTUR</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && title.trim() && void newSet()}
              placeholder="Örn: 5. Sınıf Fen Bilimleri"
              className="flex-1 rounded-2xl border-2 border-border bg-background px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-team1"
            />
            <button
              onClick={newSet}
              disabled={!title.trim() || busy === "new"}
              className="rounded-xl bg-team1 px-6 py-3 text-sm font-bold text-panel disabled:opacity-40"
            >
              OLUŞTUR VE SORU EKLE
            </button>
          </div>
        </section>

        {error && <p className="mt-4 text-sm font-semibold text-destructive">{error}</p>}

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {sets.isLoading && (
            <p className="text-sm font-semibold text-muted-foreground">Setler yükleniyor...</p>
          )}
          {sets.data?.length === 0 && (
            <p className="text-sm font-semibold text-muted-foreground">Henüz set yok.</p>
          )}
          {(sets.data ?? []).map((s) => (
            <article
              key={s.id}
              className="flex flex-col rounded-[var(--radius)] bg-panel p-5 shadow-[var(--shadow-panel)]"
            >
              <h3 className="text-xl font-extrabold text-foreground">{s.title}</h3>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {s.questionCount} soru
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => present(s.id)}
                  disabled={s.questionCount === 0 || busy === s.id}
                  className="rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-40"
                >
                  {busy === s.id ? "HAZIRLANIYOR..." : "SUN"}
                </button>
                <Link
                  to="/sorular/$setId"
                  params={{ setId: s.id }}
                  className="rounded-xl border-2 border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted"
                >
                  SORULARI DÜZENLE
                </Link>
                <button
                  onClick={async () => {
                    if (!confirm(`"${s.title}" seti ve tüm soruları silinsin mi?`)) return;
                    try {
                      await remove({ data: { id: s.id } });
                      await sets.refetch();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Silinemedi");
                    }
                  }}
                  className="rounded-xl border-2 border-destructive px-4 py-2 text-sm font-bold text-destructive"
                >
                  SİL
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
