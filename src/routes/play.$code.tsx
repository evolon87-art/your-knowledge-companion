import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useGameState } from "@/hooks/useGameState";
import { heartbeat, joinRoom, submitAnswer } from "@/lib/game.functions";

export const Route = createFileRoute("/play/$code")({
  head: () => ({
    meta: [
      { title: "Yarışmaya Katıl — Halat Yarışı" },
      { name: "description", content: "Takımına katıl, soruları cevapla ve halatı kendine çek." },
      { property: "og:title", content: "Yarışmaya Katıl — Halat Yarışı" },
      { property: "og:description", content: "Telefonundan cevapla, halatı takımına çek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayerScreen,
});

const LETTERS = ["A", "B", "C", "D"] as const;

function PlayerScreen() {
  const { code } = Route.useParams();
  const storageKey = `halat-player:${code}`;
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPlayerId(localStorage.getItem(storageKey));
    setHydrated(true);
  }, [storageKey]);

  if (!hydrated) return <Shell>Yükleniyor...</Shell>;
  if (!playerId)
    return (
      <JoinForm
        code={code}
        onJoined={(id) => {
          localStorage.setItem(storageKey, id);
          setPlayerId(id);
        }}
      />
    );
  return <GameView code={code} playerId={playerId} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-[var(--radius)] bg-panel p-6 shadow-[var(--shadow-panel)]">
        {children}
      </div>
    </main>
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (id: string) => void }) {
  const join = useServerFn(joinRoom);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await join({ data: { code, name } });
      onJoined(res.playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Katılamadınız");
      setLoading(false);
    }
  };

  return (
    <Shell>
      <p className="text-center text-xs font-semibold tracking-[0.3em] text-muted-foreground">
        ODA {code}
      </p>
      <h1 className="mt-2 text-center text-3xl font-extrabold text-foreground">HALAT YARIŞI</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Adını yaz, takımın otomatik olarak atanır.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Adın"
        className="mt-6 w-full rounded-2xl border-2 border-border bg-background px-5 py-4 text-center text-lg font-bold outline-none focus:border-team1"
      />
      <button
        onClick={handle}
        disabled={loading || name.trim().length < 2}
        className="mt-4 w-full rounded-2xl bg-foreground px-6 py-4 text-lg font-bold text-background disabled:opacity-50"
      >
        {loading ? "KATILIYOR..." : "YARIŞMAYA KATIL"}
      </button>
      {error && <p className="mt-4 text-center text-sm font-semibold text-destructive">{error}</p>}
    </Shell>
  );
}

function GameView({ code, playerId }: { code: string; playerId: string }) {
  const { data, isError, refetch } = useGameState(code, playerId);
  const answer = useServerFn(submitAnswer);
  const ping = useServerFn(heartbeat);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => void ping({ data: { playerId } }), 15000);
    return () => clearInterval(id);
  }, [ping, playerId]);

  const q = data?.question ?? null;
  const me = data?.players.find((p) => p.id === playerId);

  if (isError)
    return (
      <Shell>
        <p className="text-center font-semibold text-foreground">Bağlantı yeniden kuruluyor...</p>
        <button
          onClick={() => void refetch()}
          className="mt-4 w-full rounded-2xl bg-foreground py-3 font-bold text-background"
        >
          Tekrar dene
        </button>
      </Shell>
    );

  if (!data) return <Shell>Yükleniyor...</Shell>;

  const teamLabel = me ? `TAKIM ${me.team}` : "TAKIM";
  const teamColor = me?.team === 1 ? "bg-team1" : "bg-team2";

  if (data.status === "FINISHED") {
    const iWon =
      (data.winner === "TEAM1" && me?.team === 1) || (data.winner === "TEAM2" && me?.team === 2);
    return (
      <Shell>
        <h1 className="text-center text-4xl font-extrabold text-foreground">
          {data.winner === "TIE" ? "BERABERE!" : iWon ? "🏆 KAZANDINIZ!" : "OYUN SONA ERDİ"}
        </h1>
        <p className="mt-3 text-center text-sm font-semibold text-muted-foreground">
          Halat konumu: {data.ropePosition}
        </p>
      </Shell>
    );
  }

  if (data.status === "WAITING" || data.status === "READY") {
    return (
      <Shell>
        <div className={`rounded-2xl ${teamColor} px-4 py-2 text-center font-bold text-panel`}>
          {teamLabel}
        </div>
        <p className="mt-6 text-center text-lg font-bold text-foreground">
          {data.players.length < 2 ? "Diğer oyuncu bekleniyor..." : "İKİ OYUNCU HAZIR!"}
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Öğretmen oyunu başlattığında sorular burada görünecek.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <div className={`rounded-full ${teamColor} px-4 py-1.5 text-sm font-bold text-panel`}>
          {teamLabel}
        </div>
        {data.status === "PAUSED" && (
          <div className="text-sm font-bold text-muted-foreground">DURAKLATILDI</div>
        )}
      </div>

      {q && (
        <>
          <p className="mt-5 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            SORU {q.index} / {q.total} • {q.category.toUpperCase()}
          </p>
          <h2 className="mt-2 text-xl font-extrabold leading-snug text-foreground">{q.question}</h2>

          <div className="mt-5 grid gap-3">
            {LETTERS.map((letter) => {
              const chosen = data.me?.answer === letter;
              return (
                <button
                  key={letter}
                  disabled={
                    data.resolved || data.me?.isCorrect === true || data.status !== "PLAYING" || !!sending
                  }
                  onClick={async () => {
                    setSending(letter);
                    setError(null);
                    try {
                      await answer({ data: { code, playerId, answer: letter } });
                      await refetch();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Gönderilemedi");
                    } finally {
                      setSending(null);
                    }
                  }}
                  className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-4 text-left text-base font-semibold transition-colors disabled:opacity-60 ${
                    chosen ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-extrabold text-foreground">
                    {letter}
                  </span>
                  {q.options[letter]}
                </button>
              );
            })}
          </div>

          {data.me && (
            <div className="mt-5 text-center">
              <p className="mt-1 text-2xl font-extrabold text-foreground">
                {data.me.isCorrect ? "DOĞRU! 🎉" : "YANLIŞ — tekrar dene"}
              </p>
              {!data.me.isCorrect && !data.resolved && (
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Doğru cevabı bulana kadar deneyebilirsin.
                </p>
              )}
            </div>
          )}
          {error && (
            <p className="mt-4 text-center text-sm font-semibold text-destructive">{error}</p>
          )}
        </>
      )}
    </Shell>
  );
}
