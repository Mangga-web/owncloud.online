"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type PendingWrite = {
  name: string;
  input: Record<string, unknown>;
  approvalToken: string;
};

async function readResponse(response: Response) {
  return (await response.json()) as {
    authenticated?: boolean;
    answer?: string;
    pendingWrite?: PendingWrite;
    ok?: boolean;
    result?: string;
    error?: string;
  };
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/session")
      .then(readResponse)
      .then((result) => setAuthenticated(result.authenticated === true))
      .catch(() => {
        setAuthenticated(false);
        setError("无法连接服务，请稍后重试。");
      });
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await readResponse(response);
      if (!response.ok) throw new Error(result.error || "登录失败。");
      setAuthenticated(true);
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败。");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy || pendingWrite) return;

    const nextMessages = [...messages, { role: "user" as const, content: prompt }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const result = await readResponse(response);
      if (!response.ok) throw new Error(result.error || "请求失败。");
      if (result.answer) {
        setMessages([...nextMessages, { role: "assistant", content: result.answer }]);
      }
      setPendingWrite(result.pendingWrite || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请求失败。");
    } finally {
      setBusy(false);
    }
  }

  async function confirmWrite() {
    if (!pendingWrite || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/confirm-write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalToken: pendingWrite.approvalToken }),
      });
      const result = await readResponse(response);
      if (!response.ok) throw new Error(result.error || "文件操作失败。");
      const summary = result.ok
        ? `已执行 ${pendingWrite.name}。${result.result || ""}`
        : `${pendingWrite.name} 未成功：${result.result || "ownCloud 返回错误。"}`;
      setMessages((current) => [
        ...current,
        { role: "assistant", content: summary },
      ]);
      setPendingWrite(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文件操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    setAuthenticated(false);
    setMessages([]);
    setPendingWrite(null);
  }

  if (authenticated === null) {
    return <main className="shell"><p>正在连接…</p></main>;
  }

  return (
    <main className="shell">
      {!authenticated ? (
        <section className="card login-card">
          <p className="eyebrow">OWNCLOUD INTEGRATOR</p>
          <h1>登录文件助手</h1>
          <p>输入部署时设置的应用访问密码。</p>
          <form onSubmit={signIn} className="stack">
            <label htmlFor="password">访问密码</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button disabled={busy}>{busy ? "正在登录…" : "登录"}</button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      ) : (
        <section className="workspace">
          <header className="header">
            <div>
              <p className="eyebrow">OWNCLOUD INTEGRATOR</p>
              <h1>文件助手</h1>
            </div>
            <button className="secondary-button" onClick={signOut}>退出</button>
          </header>

          <p className="notice">
            助手只访问 ownCloud MCP 开放的文件工具。每次写入、创建、移动或复制都需要你确认；删除操作不可用。
            读取到的文件内容会发送给 Anthropic 以生成回答。
          </p>

          <div className="conversation" aria-live="polite">
            {messages.length === 0 ? (
              <p className="empty">例如：列出“Documents”中的文件，或总结某个文档。</p>
            ) : messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${index}-${message.role}`}>
                <strong>{message.role === "user" ? "你" : "助手"}</strong>
                <p>{message.content}</p>
              </article>
            ))}
            {pendingWrite && (
              <section className="approval" aria-label="待确认文件操作">
                <h2>请确认文件操作</h2>
                <p>
                  助手准备执行 <code>{pendingWrite.name}</code>。请检查路径和内容；确认后才会写入 ownCloud。
                </p>
                <pre>{JSON.stringify(pendingWrite.input, null, 2)}</pre>
                <div className="actions">
                  <button disabled={busy} onClick={confirmWrite}>
                    {busy ? "正在执行…" : "确认并执行"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setPendingWrite(null)}
                  >
                    取消
                  </button>
                </div>
              </section>
            )}
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          <form onSubmit={sendMessage} className="composer">
            <label className="visually-hidden" htmlFor="prompt">输入任务</label>
            <textarea
              id="prompt"
              rows={3}
              maxLength={5_000}
              placeholder="描述你希望助手查找或处理的文件…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy || Boolean(pendingWrite)}
            />
            <button disabled={busy || Boolean(pendingWrite) || !input.trim()}>
              {busy ? "处理中…" : "发送"}
            </button>
          </form>
          <p className="footnote">聊天记录只保存在当前浏览器页面，不写入应用数据库。</p>
        </section>
      )}
    </main>
  );
}
