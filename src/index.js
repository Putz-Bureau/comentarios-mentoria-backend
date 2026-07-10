function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      { "Content-Type": "application/json" },
      corsHeaders(env)
    )
  });
}

function uid() {
  return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function sanitize(str, maxLen) {
  return String(str || "").trim().slice(0, maxLen);
}

async function listComments(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, text, ts, is_reply FROM comments ORDER BY ts ASC LIMIT 500"
  ).all();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    text: r.text,
    ts: r.ts,
    isReply: !!r.is_reply
  }));
}

async function createComment(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "JSON inválido" }, 400, env);
  }

  const name = sanitize(body.name, 40);
  const text = sanitize(body.text, 200);

  if (!name || !text) {
    return json({ error: "name e text são obrigatórios" }, 400, env);
  }

  const comment = {
    id: uid(),
    name,
    text,
    ts: Date.now(),
    isReply: false
  };

  await env.DB.prepare(
    "INSERT INTO comments (id, name, text, ts, is_reply) VALUES (?, ?, ?, ?, 0)"
  )
    .bind(comment.id, comment.name, comment.text, comment.ts)
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

  return json(comment, 201, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === "/api/comments" && request.method === "GET") {
      const list = await listComments(env);
      return json(list, 200, env);
    }

    if (url.pathname === "/api/comments" && request.method === "POST") {
      return createComment(request, env, ctx);
    }

    return json({ error: "not found" }, 404, env);
  }
};
