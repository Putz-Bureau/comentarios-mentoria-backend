function corsHeaders(env, request) {
  const allowedList = String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const requestOrigin = request ? request.headers.get("Origin") : null;
  const allowOrigin =
    requestOrigin && allowedList.includes(requestOrigin)
      ? requestOrigin
      : allowedList[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, env, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      { "Content-Type": "application/json" },
      corsHeaders(env, request)
    )
  });
}

function uid() {
  return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function sanitize(str, maxLen) {
  return String(str || "").trim().slice(0, maxLen);
}

function isAuthorized(request, env) {
  const token = request.headers.get("x-admin-token");
  return Boolean(env.ADMIN_TOKEN) && token === env.ADMIN_TOKEN;
}

async function listComments(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, text, ts, is_reply, parent_id FROM comments ORDER BY ts ASC LIMIT 500"
  ).all();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    text: r.text,
    ts: r.ts,
    isReply: !!r.is_reply,
    parentId: r.parent_id || null
  }));
}

async function createComment(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "JSON inválido" }, 400, env, request);
  }

  const parentId = sanitize(body.parentId, 60) || null;

  if (parentId && !isAuthorized(request, env)) {
    return json({ error: "não autorizado" }, 401, env, request);
  }

  const name = sanitize(body.name, 40) || (parentId ? "Equipe Putz Mentoria" : "");
  const text = sanitize(body.text, 200);

  if (!name || !text) {
    return json({ error: "name e text são obrigatórios" }, 400, env, request);
  }

  const comment = {
    id: uid(),
    name,
    text,
    ts: Date.now(),
    isReply: Boolean(parentId),
    parentId
  };

  await env.DB.prepare(
    "INSERT INTO comments (id, name, text, ts, is_reply, parent_id) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(comment.id, comment.name, comment.text, comment.ts, comment.isReply ? 1 : 0, parentId)
    .run();

  if (env.N8N_WEBHOOK_URL) {
    console.log("Chamando webhook n8n...");
    ctx.waitUntil(
      fetch(env.N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: comment.id,
          name: comment.name,
          text: comment.text,
          ts: comment.ts,
          dataHora: new Date(comment.ts).toISOString()
        })
      })
        .then(async (res) => {
          const bodyText = await res.text();
          console.log("Webhook n8n respondeu status", res.status, bodyText);
        })
        .catch((err) => {
          console.error("Erro ao chamar webhook n8n:", err.message || String(err));
        })
    );
  } else {
    console.log("N8N_WEBHOOK_URL nao configurado, pulando webhook.");
  }

  return json(comment, 201, env, request);
}

async function deleteComment(request, env, id) {
  if (!isAuthorized(request, env)) {
    return json({ error: "não autorizado" }, 401, env, request);
  }
  if (!id) {
    return json({ error: "id obrigatório" }, 400, env, request);
  }
  await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
  return json({ ok: true }, 200, env, request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env, request) });
    }

    if (url.pathname === "/api/comments" && request.method === "GET") {
      const list = await listComments(env);
      return json(list, 200, env, request);
    }

    if (url.pathname === "/api/comments" && request.method === "POST") {
      return createComment(request, env, ctx);
    }

    if (url.pathname.startsWith("/api/comments/") && request.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.replace("/api/comments/", ""));
      return deleteComment(request, env, id);
    }

    return json({ error: "not found" }, 404, env, request);
  }
};
