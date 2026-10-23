// Small CDP harness using Node's WebSocket: exercises the deployed static-asset path and _headers without a browser SDK.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function until(check, description = "condition", timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await check(); if (result) return result; await sleep(50); }
  throw new Error(`Timed out waiting for ${description}`);
}
class Connection {
  constructor(socket) {
    this.socket = socket; this.next = 0; this.pending = new Map(); this.listeners = new Set();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const entry = this.pending.get(message.id); this.pending.delete(message.id);
        if (message.error) entry?.reject(new Error(JSON.stringify(message.error))); else entry?.resolve(message.result);
      } else for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener("close", () => {
      for (const entry of this.pending.values()) entry.reject(new Error("Browser connection closed"));
      this.pending.clear();
    });
  }
  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    return new Connection(socket);
  }
  send(method, params = {}) {
    const id = ++this.next;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

export async function browserHarness() {
  const directory = await mkdtemp(join(tmpdir(), "landing-browser-"));
  const processes = [];
  let browser;
  const stop = async () => {
    browser?.socket.close();
    for (const child of processes) {
      if (child.exitCode !== null) continue;
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    await sleep(200);
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  const launch = (command, args) => {
    const child = spawn(command, args, { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    processes.push(child);
    child.logs = "";
    child.stdout.on("data", (data) => child.logs += data);
    child.stderr.on("data", (data) => child.logs += data);
    child.on("error", (error) => child.logs += error.message);
    return child;
  };
  try {
    const listener = createServer();
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const server = launch("pnpm", ["exec", "wrangler", "dev", "--local", "--local-protocol", "https", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", join(directory, "state")]);
    await until(() => {
      if (server.exitCode !== null) throw new Error(server.logs);
      return /Ready on https:/.test(server.logs);
    }, "local HTTPS asset server");
    // Certificate errors are ignored ONLY for Wrangler's self-signed local test certificate.
    const chrome = launch(process.env.CHROME_BIN || "google-chrome", ["--headless=new", "--no-first-run", "--no-default-browser-check", "--ignore-certificate-errors", "--remote-debugging-port=0", `--user-data-dir=${join(directory, "chrome")}`, "about:blank"]);
    const connection = await until(async () => {
      if (chrome.exitCode !== null) throw new Error(chrome.logs);
      try { return await readFile(join(directory, "chrome/DevToolsActivePort"), "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }, "Chrome (set CHROME_BIN if needed)");
    const [debugPort, browserPath] = connection.trim().split("\n");
    const debug = `http://127.0.0.1:${debugPort}`;
    browser = await Connection.open(`ws://127.0.0.1:${debugPort}${browserPath}`);
    const origin = `https://127.0.0.1:${port}`;
    return { origin, stop, async page(t, { mobile = false, scripting = true, failPreviews = false } = {}) {
      const { browserContextId } = await browser.send("Target.createBrowserContext");
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
      const targets = await (await fetch(`${debug}/json/list`)).json();
      const page = await Connection.open(targets.find((target) => target.id === targetId).webSocketDebuggerUrl);
      t.after(async () => { page.socket.close(); await browser.send("Target.disposeBrowserContext", { browserContextId }); });
      page.requests = []; page.errors = []; page.sizes = new Map();
      page.listeners.add(({ method, params }) => {
        if (method === "Network.requestWillBeSent") page.requests.push({ id: params.requestId, url: params.request.url, type: params.type });
        if (method === "Network.loadingFinished") page.sizes.set(params.requestId, params.encodedDataLength);
        if (method === "Runtime.exceptionThrown") page.errors.push(params.exceptionDetails);
      });
      await page.send("Page.enable"); await page.send("Runtime.enable"); await page.send("Network.enable");
      await page.send("Network.setCacheDisabled", { cacheDisabled: true });
      await page.send("Emulation.setDeviceMetricsOverride", { width: mobile ? 390 : 1440, height: mobile ? 844 : 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
      if (mobile) await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
      if (!scripting) await page.send("Emulation.setScriptExecutionDisabled", { value: true });
      if (failPreviews) await page.send("Network.setBlockedURLs", { urls: [`${origin}/app-previews/*`] });
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
        window.violations = [];
        document.addEventListener('securitypolicyviolation', e => window.violations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
        localStorage.setItem('lc-showcase-token', JSON.stringify({token:'0123456789abcdef0123456789abcdef',created:Date.now()}));
      ` });
      await page.send("Page.navigate", { url: origin + "/" });
      await until(() => page.evaluate("document.readyState === 'complete'"), "homepage");
      return page;
    } };
  } catch (error) { await stop(); throw error; }
}
