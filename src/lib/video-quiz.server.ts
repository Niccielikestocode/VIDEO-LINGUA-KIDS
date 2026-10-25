import { createServerFn } from "@tanstack/react-start";

async function youtubeError(response: Response, action: string): Promise<Error> {
  const body = await response.text();
  let message = "";
  let reason = "";
  try {
    const payload = JSON.parse(body) as {
      error?: {
        message?: string;
        errors?: { reason?: string }[];
      };
    };
    message = payload.error?.message ?? "";
    reason = payload.error?.errors?.[0]?.reason ?? "";
  } catch {
    message = "";
  }

  if (response.status === 401 || reason === "authError") {
    return new Error(
      "El permiso de Google venció o fue revocado. Pulsa «Renovar acceso a YouTube» y vuelve a intentarlo.",
    );
  }
  if (reason === "accessNotConfigured" || reason === "serviceDisabled") {
    return new Error(
      "YouTube Data API v3 está deshabilitada en el proyecto de Google Cloud del cliente OAuth.",
    );
  }
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return new Error("Se agotó la cuota diaria de YouTube Data API. Inténtalo de nuevo más tarde.");
  }
  if (response.status === 403) {
    return new Error(
      `YouTube bloqueó ${action} (403${reason ? `, ${reason}` : ""}). Confirma que conectaste la cuenta propietaria del video y que el canal tiene acceso a YouTube Data API v3.${message ? ` Detalle: ${message}` : ""}`,
    );
  }
  return new Error(
    `YouTube no pudo ${action} (error ${response.status}).${message ? ` Detalle: ${message}` : ""}`,
  );
}

async function getTranscript(videoId: string, accessToken: string): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const captionsResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`,
    { headers },
  );
  if (!captionsResponse.ok) {
    throw await youtubeError(captionsResponse, "listar los subtítulos");
  }
  const captionsData = (await captionsResponse.json()) as {
    items?: { id: string; snippet?: { language?: string } }[];
  };
  const tracks = captionsData.items ?? [];
  const track = tracks.find((item) => item.snippet?.language?.startsWith("en")) ?? tracks[0];
  if (!track) {
    throw new Error("No se encontraron subtítulos para este video en tu cuenta de YouTube.");
  }

  const downloadResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/captions/${encodeURIComponent(track.id)}?tfmt=srt`,
    { headers },
  );
  if (!downloadResponse.ok) {
    throw await youtubeError(downloadResponse, "descargar los subtítulos");
  }
  const captions = await downloadResponse.text();
  const transcript = captions
    .replace(/<[^>]*>/g, " ")
    .split(/\r?\n/)
    .filter(
      (line) => !/^\s*\d+\s*$/.test(line) && !/^\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(line),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (transcript.length < 40) {
    throw new Error("La API de YouTube no devolvió suficiente texto de subtítulos.");
  }
  return transcript.slice(0, 12000);
}

export const generateVideoQuiz = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; accessToken: string }) => {
    if (!/^[\w-]{11}$/.test(data.videoId)) {
      throw new Error("El ID del video de YouTube no es válido.");
    }
    if (
      typeof data.accessToken !== "string" ||
      !data.accessToken.trim() ||
      data.accessToken.length > 5000
    ) {
      throw new Error("Conecta tu cuenta de Google para leer los subtítulos del video.");
    }
    return { videoId: data.videoId, accessToken: data.accessToken.trim() };
  })
  .handler(async ({ data }) => getTranscript(data.videoId, data.accessToken));
