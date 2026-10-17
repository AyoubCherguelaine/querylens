import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const routes =
  /^(users\/(login|signup|me)|cubes(\/discover|\/[a-f0-9-]+\/(analyze|profile))?|chat\/(sessions|session(\/[a-f0-9-]+(\/messages)?)?)|sources(\/(preview|import|connect|[a-f0-9-]+(\/discover)?))?|health\/ready)$/;
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  const jar = await cookies();
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const expected = process.env.APP_ORIGIN || request.nextUrl.origin;
    if (!origin || origin !== expected)
      return NextResponse.json(
        { detail: "Invalid request origin" },
        { status: 403 },
      );
  }
  if (path === "logout" && request.method === "POST") {
    jar.delete("olap_session");
    return NextResponse.json({ ok: true });
  }
  if (!routes.test(path))
    return NextResponse.json({ detail: "Route not found" }, { status: 404 });
  const token = jar.get("olap_session")?.value;
  try {
    const limit =
      Number(process.env.UPLOAD_MAX_BYTES || 25 * 1024 * 1024) + 1024 * 1024;
    if (Number(request.headers.get("content-length") || 0) > limit) {
      return NextResponse.json(
        { detail: "Upload request exceeds the size limit." },
        { status: 413 },
      );
    }
    let body: ArrayBuffer | undefined;
    if (request.method !== "GET" && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel();
          return NextResponse.json(
            { detail: "Upload request exceeds the size limit." },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      body = bytes.buffer;
    }
    const upstream = await fetch(
      `${process.env.BACKEND_URL || "http://127.0.0.1:8001"}/${path}`,
      {
        method: request.method,
        headers: {
          "Content-Type":
            request.headers.get("content-type") || "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(660000),
        redirect: "error",
      },
    );
    if (upstream.headers.get("content-type")?.includes("application/x-ndjson")) {
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
          "X-Request-ID": upstream.headers.get("X-Request-ID") || "",
        },
      });
    }
    const data = await upstream.json();
    if (path === "users/login" && upstream.ok) {
      jar.set("olap_session", data.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        path: "/",
        maxAge: data.expires_in,
      });
      delete data.access_token;
    }
    const response = NextResponse.json(data, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
    const requestId = upstream.headers.get("X-Request-ID");
    if (requestId) response.headers.set("X-Request-ID", requestId);
    return response;
  } catch {
    return NextResponse.json(
      {
        detail:
          "The analytics service is unavailable. Check the backend connection.",
      },
      { status: 502 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
