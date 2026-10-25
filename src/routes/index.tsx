import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LESSONS, TOPIC_ICONS, type Lesson, type TopicKey } from "../data/lessons";
import { generateVideoQuiz } from "../lib/video-quiz.server";
import {
  askGemini,
  extractYouTubeId,
  generateQuestionsFromTranscript,
  levenshtein,
  norm,
  simulateFeedback,
} from "../lib/english";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VideoLingua Kids 🎬 Aprende inglés con videos" },
      {
        name: "description",
        content:
          "Aprende inglés jugando: videos de YouTube, preguntas divertidas, feedback del Profe Búho y práctica de pronunciación.",
      },
      { property: "og:title", content: "VideoLingua Kids 🎬 Aprende inglés con videos" },
      {
        property: "og:description",
        content: "Videos, preguntas y práctica de pronunciación para aprender inglés jugando.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

interface FlyingStar {
  id: number;
  left: number;
  top: number;
  delay: number;
}

interface VoiceResult {
  pct: number;
  words: { word: string; tone: "good" | "mid" | "low" }[];
  msg: string;
}

type AiResult =
  | { source: "sim"; greeting: string; tips: string[]; score: number }
  | { source: "gemini"; text: string };

interface QuizMsg {
  text: string;
  tone: "warn" | "great" | "ok" | "bad";
}

interface CustomLesson extends Lesson {
  id: string;
}

function isSavedCustomLesson(value: unknown): value is CustomLesson {
  if (!value || typeof value !== "object") return false;
  const lesson = value as Record<string, unknown>;
  return (
    typeof lesson["id"] === "string" &&
    typeof lesson["label"] === "string" &&
    typeof lesson["videoId"] === "string" &&
    typeof lesson["prompt"] === "string" &&
    Array.isArray(lesson["subs"]) &&
    lesson["subs"].every(
      (line) =>
        Array.isArray(line) && line.length === 2 && line.every((text) => typeof text === "string"),
    ) &&
    Array.isArray(lesson["questions"]) &&
    lesson["questions"].length >= 10 &&
    lesson["questions"].every((value) => {
      if (!value || typeof value !== "object") return false;
      const question = value as Record<string, unknown>;
      const options = question["options"];
      const answer = question["answer"];
      return (
        typeof question["q"] === "string" &&
        typeof question["es"] === "string" &&
        Array.isArray(options) &&
        options.length === 3 &&
        options.every((option) => typeof option === "string") &&
        Number.isInteger(answer) &&
        Number(answer) >= 0 &&
        Number(answer) <= 2
      );
    }) &&
    Array.isArray(lesson["phrases"]) &&
    lesson["phrases"].length >= 3 &&
    lesson["phrases"].every((phrase) => typeof phrase === "string")
  );
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

interface GoogleIdentityWindow extends Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (options: {
          client_id: string;
          scope: string;
          callback: (response: GoogleTokenResponse) => void;
        }) => { requestAccessToken: (config?: { prompt?: string }) => void };
      };
    };
  };
}

function Index() {
  const [topic, setTopic] = useState<TopicKey>("animals");
  const [stars, setStars] = useState(0);
  const [flying, setFlying] = useState<FlyingStar[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [subIdx, setSubIdx] = useState(0);
  const [showEn, setShowEn] = useState(true);
  const [showEs, setShowEs] = useState(false);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const [quizMsg, setQuizMsg] = useState<QuizMsg | null>(null);
  const [customLessons, setCustomLessons] = useState<CustomLesson[]>([]);
  const [activeCustomLessonId, setActiveCustomLessonId] = useState<string | null>(null);
  const [customLessonsLoaded, setCustomLessonsLoaded] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [youtubeAccessToken, setYoutubeAccessToken] = useState("");
  const [youtubeTokenExpiresAt, setYoutubeTokenExpiresAt] = useState(0);
  const [youtubeAuthLoaded, setYoutubeAuthLoaded] = useState(false);
  const [googleIdentityReady, setGoogleIdentityReady] = useState(false);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [openText, setOpenText] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [liveText, setLiveText] = useState("...");
  const [listening, setListening] = useState(false);
  const [micStatus, setMicStatus] = useState("Pulsa y habla en inglés");
  const [voiceResult, setVoiceResult] = useState<VoiceResult | null>(null);
  const [srSupported, setSrSupported] = useState(true);

  const starBoxRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const finalRef = useRef("");
  const targetRef = useRef("");
  const liveTextRef = useRef("...");
  const generateVideoQuizFn = useServerFn(generateVideoQuiz);
  const googleClientId = import.meta.env["VITE_GOOGLE_CLIENT_ID"];

  const activeCustomLesson = customLessons.find((item) => item.id === activeCustomLessonId);
  const lesson = activeCustomLesson ?? LESSONS[topic];
  const isCustomLesson = activeCustomLesson !== undefined;
  const questions = lesson.questions;

  /* ----- progreso y config ----- */
  useEffect(() => {
    setStars(parseInt(localStorage.getItem("vlk_stars") || "0", 10) || 0);
    setApiKey(localStorage.getItem("vlk_gemini_key") || "");
    const savedToken = localStorage.getItem("vlk_youtube_access_token");
    const savedTokenExpiresAt = Number(localStorage.getItem("vlk_youtube_token_expires_at"));
    if (savedToken && savedTokenExpiresAt > Date.now() + 60_000) {
      setYoutubeAccessToken(savedToken);
      setYoutubeTokenExpiresAt(savedTokenExpiresAt);
    } else {
      localStorage.removeItem("vlk_youtube_access_token");
      localStorage.removeItem("vlk_youtube_token_expires_at");
    }
    setYoutubeAuthLoaded(true);
    try {
      const saved = localStorage.getItem("vlk_custom_lessons");
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        const savedLessons = parsed["lessons"];
        const savedActiveLessonId = parsed["activeLessonId"];
        if (
          !Array.isArray(savedLessons) ||
          !savedLessons.every((item: unknown) => isSavedCustomLesson(item)) ||
          (savedActiveLessonId !== null && typeof savedActiveLessonId !== "string")
        ) {
          throw new Error("Los temas guardados tienen un formato inválido.");
        }
        setCustomLessons(savedLessons);
        const activeId =
          typeof savedActiveLessonId === "string" &&
          savedLessons.some((item) => item.id === savedActiveLessonId)
            ? savedActiveLessonId
            : null;
        setActiveCustomLessonId(activeId);
        const activeLesson = savedLessons.find((item) => item.id === activeId);
        if (activeLesson) {
          setVideoId(activeLesson.videoId);
          setUrlInput(`https://www.youtube.com/watch?v=${activeLesson.videoId}`);
        }
      }
    } catch (error) {
      setQuizError(
        error instanceof Error
          ? `No se pudieron restaurar los temas guardados: ${error.message}`
          : "No se pudieron restaurar los temas guardados.",
      );
    } finally {
      setCustomLessonsLoaded(true);
    }
    setSrSupported(
      !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition,
    );
    const identityWindow = window as GoogleIdentityWindow;
    if (identityWindow.google?.accounts.oauth2) {
      setGoogleIdentityReady(true);
      return;
    }
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    const script = existingScript ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleIdentityReady(true);
    script.onerror = () => setQuizError("No se pudo cargar el inicio de sesión de Google.");
    if (!existingScript) document.head.appendChild(script);
  }, []);
  useEffect(() => {
    localStorage.setItem("vlk_stars", String(stars));
  }, [stars]);
  useEffect(() => {
    localStorage.setItem("vlk_gemini_key", apiKey);
  }, [apiKey]);
  useEffect(() => {
    if (!youtubeAuthLoaded) return;
    if (youtubeAccessToken && youtubeTokenExpiresAt > Date.now() + 60_000) {
      localStorage.setItem("vlk_youtube_access_token", youtubeAccessToken);
      localStorage.setItem("vlk_youtube_token_expires_at", String(youtubeTokenExpiresAt));
      return;
    }
    localStorage.removeItem("vlk_youtube_access_token");
    localStorage.removeItem("vlk_youtube_token_expires_at");
  }, [youtubeAccessToken, youtubeTokenExpiresAt, youtubeAuthLoaded]);
  useEffect(() => {
    if (!customLessonsLoaded) return;
    try {
      localStorage.setItem(
        "vlk_custom_lessons",
        JSON.stringify({ lessons: customLessons, activeLessonId: activeCustomLessonId }),
      );
    } catch {
      setQuizError("No se pudieron guardar los temas en este navegador.");
    }
  }, [customLessons, activeCustomLessonId, customLessonsLoaded]);
  useEffect(() => {
    targetRef.current = lesson.phrases[phraseIdx] ?? "";
  }, [lesson, phraseIdx]);
  useEffect(() => {
    liveTextRef.current = liveText;
  }, [liveText]);

  /* ----- subtítulos automáticos mientras hay video ----- */
  useEffect(() => {
    if (!videoId) return;
    const t = window.setInterval(() => {
      setSubIdx((i) => (i + 1) % LESSONS[topic].subs.length);
    }, 6000);
    return () => window.clearInterval(t);
  }, [videoId, topic]);

  const addStars = (n: number) => {
    if (n <= 0) return;
    setStars((s) => s + n);
    const r = starBoxRef.current?.getBoundingClientRect();
    const cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
    const cy = r ? r.top + r.height / 2 : 80;
    const batch: FlyingStar[] = Array.from({ length: Math.min(n, 6) }, (_, i) => ({
      id: Date.now() + i,
      left: cx + (Math.random() * 120 - 60),
      top: cy,
      delay: i * 0.08,
    }));
    setFlying((f) => [...f, ...batch]);
    window.setTimeout(() => {
      setFlying((f) => f.filter((x) => !batch.some((b) => b.id === x.id)));
    }, 1600);
  };

  const chooseTopic = (t: TopicKey, withVideo: boolean) => {
    setTopic(t);
    setActiveCustomLessonId(null);
    setSubIdx(0);
    setPhraseIdx(0);
    setSelected({});
    setChecked(false);
    setQuizMsg(null);
    setQuizError("");
    setVoiceResult(null);
    setLiveText("...");
    setAiResult(null);
    setMicStatus("Pulsa y habla en inglés");
    if (withVideo) {
      const id = LESSONS[t].videoId;
      setVideoId(id);
      setUrlInput("https://www.youtube.com/watch?v=" + id);
      void loadVideoQuiz(id, apiKey);
    }
  };

  const loadVideoQuiz = async (
    id: string,
    key: string,
    accessToken = youtubeAccessToken,
    replaceLessonId: string | null = null,
  ) => {
    setQuizError("");
    setSelected({});
    setChecked(false);
    setQuizMsg(null);
    if (!key.trim()) {
      setQuizError(
        "Añade tu API key de Gemini en la sección de revisión con IA para crear preguntas automáticamente.",
      );
      return;
    }
    if (!accessToken) {
      setQuizError(
        "Conecta una cuenta de Google que administre este video para leer sus subtítulos.",
      );
      return;
    }
    setQuizLoading(true);
    try {
      const transcript = await generateVideoQuizFn({ data: { videoId: id, accessToken } });
      const generated = await generateQuestionsFromTranscript(transcript, key);
      const idForLesson =
        replaceLessonId ?? `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const nextLesson: CustomLesson = {
        id: idForLesson,
        label: generated.label,
        videoId: id,
        prompt: `Escribe una o dos frases en inglés sobre ${generated.label}.`,
        subs: generated.phrases.map((phrase) => [phrase, ""]),
        questions: generated.questions,
        phrases: generated.phrases,
      };
      setCustomLessons((items) =>
        replaceLessonId
          ? items.map((item) => (item.id === replaceLessonId ? nextLesson : item))
          : [...items, nextLesson],
      );
      setActiveCustomLessonId(idForLesson);
      setTopic("animals");
      setPhraseIdx(0);
      setSubIdx(0);
      setVoiceResult(null);
      setLiveText("...");
      setMicStatus("Pulsa y habla en inglés");
    } catch (error) {
      setQuizError(
        error instanceof Error ? error.message : "No se pudieron crear preguntas para este video.",
      );
    } finally {
      setQuizLoading(false);
    }
  };

  const connectYouTube = () => {
    if (!googleClientId) {
      setQuizError(
        "Configura VITE_GOOGLE_CLIENT_ID en el archivo .env.local para conectar YouTube.",
      );
      return;
    }
    const identity = (window as GoogleIdentityWindow).google?.accounts.oauth2;
    if (!googleIdentityReady || !identity) {
      setQuizError(
        "El inicio de sesión de Google todavía está cargando. Espera un momento e inténtalo de nuevo.",
      );
      return;
    }
    const tokenClient = identity.initTokenClient({
      client_id: googleClientId,
      scope: "https://www.googleapis.com/auth/youtube.force-ssl",
      callback: (response) => {
        if (response.error || !response.access_token) {
          setQuizError(
            `No se pudo autorizar YouTube${response.error ? `: ${response.error}` : "."}`,
          );
          return;
        }
        setYoutubeAccessToken(response.access_token);
        setYoutubeTokenExpiresAt(Date.now() + (response.expires_in ?? 3600) * 1000);
        if (videoId)
          void loadVideoQuiz(videoId, apiKey, response.access_token, activeCustomLessonId);
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  const loadCustom = () => {
    const id = extractYouTubeId(urlInput);
    setUrlError(!id);
    if (id) {
      setActiveCustomLessonId(null);
      setVideoId(id);
      addStars(1);
      void loadVideoQuiz(id, apiKey);
    }
  };

  const selectCustomLesson = (item: CustomLesson) => {
    setActiveCustomLessonId(item.id);
    setVideoId(item.videoId);
    setUrlInput(`https://www.youtube.com/watch?v=${item.videoId}`);
    setSelected({});
    setChecked(false);
    setQuizMsg(null);
    setQuizError("");
    setPhraseIdx(0);
    setSubIdx(0);
    setVoiceResult(null);
    setLiveText("...");
    setMicStatus("Pulsa y habla en inglés");
  };

  const regenerateLesson = () => {
    if (!videoId) return;
    void loadVideoQuiz(videoId, apiKey, youtubeAccessToken, activeCustomLessonId);
  };

  /* ----- preguntas ----- */
  const pick = (qi: number, oi: number) => {
    if (checked) return;
    setSelected((s) => ({ ...s, [qi]: oi }));
  };

  const checkQuiz = () => {
    const qs = questions;
    if (Object.keys(selected).length < qs.length) {
      setQuizMsg({ text: "🤔 ¡Responde todas las preguntas primero!", tone: "warn" });
      return;
    }
    if (checked) {
      setSelected({});
      setChecked(false);
      setQuizMsg(null);
      return;
    }
    setChecked(true);
    let ok = 0;
    qs.forEach((q, qi) => {
      if (selected[qi] === q.answer) ok++;
    });
    setQuizMsg({
      text:
        ok === qs.length
          ? `🎉 ¡Perfecto! ${ok}/${qs.length} ¡Eres un crack!`
          : ok > 0
            ? `👍 ¡Bien! ${ok}/${qs.length}. ¡Sigue practicando!`
            : `💪 0/${qs.length}. ¡No pasa nada, inténtalo de nuevo!`,
      tone: ok === qs.length ? "great" : ok > 0 ? "ok" : "bad",
    });
    addStars(ok);
  };

  /* ----- IA ----- */
  const submitAi = async () => {
    const text = openText.trim();
    if (!text || aiLoading) return;
    setAiLoading(true);
    let result: AiResult;
    if (apiKey.trim()) {
      try {
        const reply = await askGemini(text, apiKey.trim(), lesson.label);
        result = { source: "gemini", text: reply };
      } catch {
        result = simulateFeedback(text);
      }
    } else {
      result = simulateFeedback(text);
    }
    setAiResult(result);
    setAiLoading(false);
    if (result.source === "sim") addStars(result.score);
  };

  /* ----- voz ----- */
  const evaluate = (spoken: string) => {
    const target = norm(targetRef.current);
    const said = norm(spoken);
    let total = 0;
    const words = target.map((w) => {
      let best = 0;
      said.forEach((s) => {
        const sim = 1 - levenshtein(w, s) / Math.max(w.length, s.length);
        if (sim > best) best = sim;
      });
      total += best;
      const tone: "good" | "mid" | "low" = best >= 0.8 ? "good" : best >= 0.5 ? "mid" : "low";
      return { word: w, tone };
    });
    const pct = target.length ? Math.round((total / target.length) * 100) : 0;
    const msg =
      pct >= 90
        ? "🏆 ¡Pronunciación increíble! ¡Suenas como un nativo!"
        : pct >= 70
          ? "🌟 ¡Muy bien! Casi perfecto."
          : pct >= 40
            ? "😊 ¡Buen intento! Escucha la frase y repite."
            : "💪 ¡Sigue intentándolo! Pulsa 🔊 para escucharla.";
    setVoiceResult({ pct, words, msg });
    addStars(pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0);
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listeningRef.current) {
      recRef.current?.stop();
      return;
    }
    if (!recRef.current) {
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => {
        listeningRef.current = true;
        finalRef.current = "";
        setListening(true);
        setMicStatus("🎧 Te escucho... ¡habla ahora!");
        setLiveText("...");
      };
      rec.onresult = (e: any) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalRef.current += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        setLiveText((finalRef.current + " " + interim).trim() || "...");
      };
      rec.onerror = (e: any) => {
        setMicStatus(
          e.error === "not-allowed"
            ? "🚫 Permite el micrófono en el navegador"
            : e.error === "no-speech"
              ? "🤫 No escuché nada, inténtalo otra vez"
              : "⚠️ Error: " + e.error,
        );
      };
      rec.onend = () => {
        listeningRef.current = false;
        setListening(false);
        const said = finalRef.current || (liveTextRef.current !== "..." ? liveTextRef.current : "");
        if (said) {
          setMicStatus("✅ ¡Listo! Mira tu resultado");
          evaluate(said);
        }
      };
      recRef.current = rec;
    }
    try {
      recRef.current.start();
    } catch {
      /* ya estaba iniciado */
    }
  };

  const speakPhrase = () => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(targetRef.current);
    u.lang = "en-US";
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const nextPhrase = () => {
    setPhraseIdx((i) => (i + 1) % lesson.phrases.length);
    setVoiceResult(null);
    setLiveText("...");
    setMicStatus("Pulsa y habla en inglés");
  };

  const resetStars = () => {
    if (window.confirm("¿Reiniciar tus estrellas?")) setStars(0);
  };

  const nextSub = () => setSubIdx((i) => (i + 1) % lesson.subs.length);
  const prevSub = () => setSubIdx((i) => (i - 1 + lesson.subs.length) % lesson.subs.length);

  const topicKeys = Object.keys(LESSONS) as TopicKey[];

  return (
    <div className="vlk-root">
      {/* estrellas voladoras */}
      {flying.map((s) => (
        <div
          key={s.id}
          className="vlk-flying-star"
          style={{ left: s.left + "px", top: s.top + "px", animationDelay: s.delay + "s" }}
        >
          ⭐
        </div>
      ))}

      {/* ===== BARRA SUPERIOR ===== */}
      <nav className="vlk-nav">
        <div className="vlk-nav-inner">
          <div className="vlk-brand">
            <div className="vlk-logo">🎬</div>
            <div>
              <h1 className="vlk-title">
                <span className="t-orange">Video</span>
                <span className="t-sky">Lingua</span> <span className="t-pink">Kids</span>
              </h1>
              <p className="vlk-tagline">¡Aprende inglés jugando!</p>
            </div>
          </div>
          <div className="vlk-progress">
            <div className="vlk-level hidden sm:block">
              <div className="vlk-level-label">
                Nivel <span>{Math.floor(stars / 10) + 1}</span>
              </div>
              <div className="vlk-level-bar">
                <div className="vlk-level-fill" style={{ width: (stars % 10) * 10 + "%" }} />
              </div>
            </div>
            <div ref={starBoxRef} className="vlk-starbox">
              <span className="vlk-star-icon">⭐</span>
              <span className="vlk-star-count">{stars}</span>
            </div>
            <button className="vlk-reset" title="Reiniciar progreso" onClick={resetStars}>
              🔄
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-2">
        {/* ===== VIDEO ===== */}
        <section className="vlk-card lg:col-span-2">
          <h2 className="vlk-card-title">📺 Mi Video</h2>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <input
              className="vlk-input flex-1"
              type="text"
              placeholder="Pega aquí un enlace de YouTube 🔗"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadCustom();
              }}
            />
            <button className="vlk-btn vlk-btn--sky vlk-btn--lg" onClick={loadCustom}>
              ▶️ Cargar Video
            </button>
          </div>
          <div className="vlk-chip-row">
            <span className="vlk-chip-label">Temas de ejemplo:</span>
            {topicKeys.map((t) => (
              <button
                key={t}
                className={
                  "vlk-btn vlk-btn--chip " +
                  (t === "animals"
                    ? "vlk-chip--green "
                    : t === "colors"
                      ? "vlk-chip--pink "
                      : "vlk-chip--orange ") +
                  (topic === t ? "vlk-chip--active" : "")
                }
                onClick={() => chooseTopic(t, true)}
              >
                {TOPIC_ICONS[t]}
              </button>
            ))}
            {customLessons.map((item) => (
              <button
                key={item.id}
                className={
                  "vlk-btn vlk-btn--chip vlk-chip--orange " +
                  (activeCustomLessonId === item.id ? "vlk-chip--active" : "")
                }
                onClick={() => selectCustomLesson(item)}
                title={`Video: ${item.videoId}`}
              >
                🎬 {item.label}
              </button>
            ))}
          </div>
          {urlError && (
            <p className="vlk-error">😕 Ese enlace no parece de YouTube. ¡Inténtalo otra vez!</p>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="vlk-video-wrap">
                {videoId ? (
                  <iframe
                    src={
                      "https://www.youtube.com/embed/" +
                      videoId +
                      "?rel=0&modestbranding=1&cc_load_policy=1"
                    }
                    title="YouTube video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="vlk-video-placeholder">
                    <div>
                      <div className="big">🍿</div>
                      <p>¡Pega un enlace o elige un tema para empezar!</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="vlk-sub-panel">
              <h3 className="mb-3 text-xl font-extrabold">💬 Subtítulos</h3>
              <div className="vlk-sub-row">
                <span>🇺🇸 Inglés</span>
                <button
                  type="button"
                  className={"vlk-toggle" + (showEn ? " on" : "")}
                  aria-label="Mostrar subtítulos en inglés"
                  onClick={() => setShowEn((v) => !v)}
                />
              </div>
              <div className="vlk-sub-row">
                <span>🇪🇸 Español</span>
                <button
                  type="button"
                  className={"vlk-toggle" + (showEs ? " on" : "")}
                  aria-label="Mostrar subtítulos en español"
                  onClick={() => setShowEs((v) => !v)}
                />
              </div>
              <div className="vlk-sub-screen">
                {showEn && <p className="vlk-sub-en">{lesson.subs[subIdx]?.[0] ?? ""}</p>}
                {showEs && <p className="vlk-sub-es">{lesson.subs[subIdx]?.[1] ?? ""}</p>}
                {!showEn && !showEs && <p className="vlk-sub-es">Activa un idioma arriba 👆</p>}
              </div>
              <div className="vlk-sub-controls">
                <button className="vlk-btn vlk-btn--ghost" onClick={prevSub}>
                  ⬅️
                </button>
                <span className="vlk-sub-index">
                  {subIdx + 1}/{lesson.subs.length}
                </span>
                <button className="vlk-btn vlk-btn--ghost" onClick={nextSub}>
                  ➡️
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ===== PREGUNTAS ===== */}
        <section className="vlk-card">
          <h2 className="vlk-card-title">🧠 Preguntas</h2>
          <p className="vlk-card-sub">
            Tema: <b className="text-orange-500">{lesson.label}</b>
          </p>
          <p className="vlk-card-sub">
            Para leer subtítulos de videos que administras, conecta la cuenta de Google propietaria
            del video.
          </p>
          <button
            className="vlk-btn vlk-btn--ghost mb-3"
            onClick={connectYouTube}
            disabled={!googleIdentityReady && !!googleClientId}
          >
            {youtubeAccessToken ? "🔄 Renovar acceso a YouTube" : "🔐 Conectar cuenta de Google"}
          </button>
          {quizLoading && (
            <p className="vlk-card-sub">
              🦉 Viendo los subtítulos y creando preguntas sobre el video...
            </p>
          )}
          {quizError && (
            <div className="vlk-quiz-result vlk-warn" role="status">
              {quizError} Por ahora se muestran preguntas de ejemplo.
              {videoId && apiKey.trim() && (
                <button
                  className="vlk-btn vlk-btn--ghost mt-2"
                  onClick={() =>
                    void loadVideoQuiz(videoId, apiKey, youtubeAccessToken, activeCustomLessonId)
                  }
                >
                  🔄 Intentar de nuevo
                </button>
              )}
            </div>
          )}
          {isCustomLesson && (
            <p className="vlk-card-sub">
              ✨ Tema, preguntas y frases generados desde los subtítulos de este video.
            </p>
          )}
          {videoId && (
            <button
              className="vlk-btn vlk-btn--ghost mb-3"
              onClick={regenerateLesson}
              disabled={quizLoading}
            >
              🔄 Regenerar preguntas y frases
            </button>
          )}
          <div>
            {questions.map((q, qi) => (
              <div key={qi} className="vlk-question">
                <p className="vlk-question-title">
                  {qi + 1}. {q.q}
                  {checked && (
                    <span className="vlk-mark pop">
                      {selected[qi] === q.answer ? "😄⭐" : "😟"}
                    </span>
                  )}
                </p>
                <p className="vlk-question-es">{q.es}</p>
                <div className="vlk-options">
                  {q.options.map((o, oi) => {
                    let state = "";
                    if (checked) {
                      if (oi === q.answer) state = "correct";
                      else if (selected[qi] === oi) state = "wrong";
                    } else if (selected[qi] === oi) {
                      state = "selected";
                    }
                    return (
                      <button
                        key={oi}
                        type="button"
                        disabled={checked}
                        className={"vlk-option" + (state ? " " + state : "")}
                        onClick={() => pick(qi, oi)}
                      >
                        {["🅰️", "🅱️", "🌀"][oi]} {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <button className="vlk-btn vlk-btn--green vlk-btn--block vlk-btn--lg" onClick={checkQuiz}>
            {checked ? "🔁 Intentar de nuevo" : "✅ Comprobar respuestas"}
          </button>
          {quizMsg && (
            <div className={"vlk-quiz-result vlk-" + quizMsg.tone + " pop"}>{quizMsg.text}</div>
          )}
        </section>

        {/* ===== IA ===== */}
        <section className="vlk-card">
          <h2 className="vlk-card-title">✍️ Escribe en inglés</h2>
          <p className="vlk-card-sub">{lesson.prompt}</p>
          <textarea
            className="vlk-textarea"
            placeholder="Escribe aquí en inglés..."
            value={openText}
            onChange={(e) => setOpenText(e.target.value)}
          />
          <input
            className="vlk-input vlk-input--key mt-3"
            type="password"
            placeholder="🔑 Pega tu API Key de Gemini (opcional)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={() => {
              if (videoId && apiKey.trim() && !isCustomLesson && !quizLoading) {
                void loadVideoQuiz(videoId, apiKey, youtubeAccessToken, activeCustomLessonId);
              }
            }}
          />
          <p className="vlk-ai-mode">
            {apiKey.trim()
              ? "🟢 Conectado a Google Gemini (si falla, se usa el modo simulado)"
              : "🟡 Modo simulado con el Profe Búho — añade tu API Key para revisión real"}
          </p>
          <button
            className="vlk-btn vlk-btn--orange vlk-btn--block mt-3"
            onClick={submitAi}
            disabled={aiLoading}
          >
            📤 Enviar respuesta a la IA para revisión
          </button>
          {aiLoading && (
            <div className="vlk-ai-result">
              <div className="vlk-ai-owl">🦉</div>
              <div>
                <span className="vlk-typing">
                  <span />
                  <span />
                  <span />
                </span>
                Profe Búho está leyendo tu respuesta...
              </div>
            </div>
          )}
          {aiResult && !aiLoading && (
            <div className="vlk-ai-result pop">
              <div className="vlk-ai-owl">🦉</div>
              <div className="flex-1">
                <p className="vlk-ai-title">Profe Búho dice:</p>
                {aiResult.source === "gemini" ? (
                  <p className="vlk-ai-text">{aiResult.text}</p>
                ) : (
                  <div className="vlk-ai-text">
                    <p>{aiResult.greeting}</p>
                    {aiResult.tips.length > 0 && (
                      <ul className="vlk-ai-tips">
                        {aiResult.tips.map((tip, i) => (
                          <li key={i}>{tip}</li>
                        ))}
                      </ul>
                    )}
                    <p className="vlk-ai-score">Puntuación: {aiResult.score}/5</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ===== LABORATORIO DE VOZ ===== */}
        <section className="vlk-card lg:col-span-2">
          <h2 className="vlk-card-title">🎙️ Laboratorio de Voz</h2>
          <p className="vlk-card-sub">Lee la frase en voz alta y mira cómo de bien lo dices.</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="vlk-panel-sky">
              <p className="vlk-panel-label">Frase para decir:</p>
              <p className="vlk-target-phrase">{lesson.phrases[phraseIdx]}</p>
              <div className="mt-3 flex gap-2">
                <button className="vlk-btn vlk-btn--ghost" onClick={speakPhrase}>
                  🔊 Escuchar
                </button>
                <button className="vlk-btn vlk-btn--ghost" onClick={nextPhrase}>
                  🎲 Otra
                </button>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-2">
              <button
                className={
                  "vlk-btn vlk-btn--rose vlk-btn--mic vlk-btn--block" +
                  (listening ? " vlk-recording" : "")
                }
                onClick={toggleMic}
                disabled={!srSupported}
              >
                {listening ? "⏹️ Detener" : "🎤 Hablar / Grabar"}
              </button>
              <p className="vlk-mic-status">{micStatus}</p>
              {!srSupported && (
                <p className="vlk-mic-status">
                  😢 Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.
                </p>
              )}
            </div>
            <div className="vlk-panel-amber">
              <p className="vlk-panel-label">Lo que escucho:</p>
              <p className="vlk-live-text">{liveText}</p>
            </div>
          </div>
          {voiceResult && (
            <div className="vlk-voice-result pop">
              <div className="vlk-score-row">
                <span className="vlk-score-title">Coincidencia</span>
                <span className="vlk-score-pct">{voiceResult.pct}%</span>
              </div>
              <div className="vlk-score-track">
                <div
                  className={
                    "vlk-score-fill " +
                    (voiceResult.pct >= 80 ? "good" : voiceResult.pct >= 50 ? "mid" : "low")
                  }
                  style={{ width: voiceResult.pct + "%" }}
                />
              </div>
              <p className="vlk-words">
                {voiceResult.words.map((w, i) => (
                  <span key={i} className={"vlk-word " + w.tone}>
                    {w.word}
                  </span>
                ))}
              </p>
              <p className="vlk-voice-msg">{voiceResult.msg}</p>
            </div>
          )}
        </section>
      </main>

      <footer className="vlk-footer">
        Hecho con 💛 para pequeños exploradores del inglés · VideoLingua Kids
      </footer>
    </div>
  );
}
