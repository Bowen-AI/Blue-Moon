import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireBrowser = process.env.CI || process.env.REQUIRE_BROWSER_SMOKE === "1";
const skipBrowser = process.env.SKIP_BROWSER_SMOKE === "1";
const chromeCandidates = [
  process.env.BROWSER_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "google-chrome-stable",
  "google-chrome",
  "chromium-browser",
  "chromium",
  "microsoft-edge"
].filter(Boolean);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

function browserPath() {
  for (const candidate of chromeCandidates) {
    if (path.isAbsolute(candidate)) {
      if (existsSync(candidate)) return candidate;
      continue;
    }

    try {
      const resolved = execFileSync("which", [candidate], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (resolved) return resolved;
    } catch (error) {
      // Try the next well-known browser binary.
    }
  }
  return "";
}

function memberId(email) {
  return Buffer.from(email, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/index.html";
      if (/^\/events\/[^/]+$/.test(pathname) && !path.extname(pathname)) pathname = "/event.html";
      if (/^\/members\/[^/]+$/.test(pathname) && !path.extname(pathname)) pathname = "/member.html";
      if (pathname === "/event") pathname = "/event.html";
      if (pathname === "/member") pathname = "/member.html";

      const filePath = path.normalize(path.join(root, pathname));
      if (!filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
      });
      response.end(await readFile(filePath));
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(closeResolve))
      });
    });
  });
}

class CdpConnection {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id && this.pending.has(message.id)) {
      const { method, resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${method}: ${message.error.message}`));
      } else {
        resolve(message.result || {});
      }
      return;
    }

    for (const listener of this.listeners) listener(message);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async send(method, params = {}, sessionId = "") {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    this.socket.send(JSON.stringify(message));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
    });
  }

  close() {
    this.socket.close();
  }
}

async function chromeWebSocketUrl(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(versionUrl);
      if (response.ok) {
        const payload = await response.json();
        if (payload.webSocketDebuggerUrl) return payload.webSocketDebuggerUrl;
      }
    } catch (error) {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for Chrome remote debugging endpoint.");
}

async function launchChrome(chromePath) {
  const port = await freePort();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "blue-moon-browser-"));
  const args = [
    "--headless=new",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--window-size=1366,900",
    "about:blank"
  ];
  const chrome = spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const webSocketUrl = await chromeWebSocketUrl(port);
    return {
      chrome,
      webSocketUrl,
      async close() {
        if (!chrome.killed) chrome.kill("SIGTERM");
        await rm(userDataDir, { force: true, recursive: true });
      },
      stderr: () => stderr
    };
  } catch (error) {
    if (!chrome.killed) chrome.kill("SIGTERM");
    await rm(userDataDir, { force: true, recursive: true });
    error.message = `${error.message}\nChrome stderr:\n${stderr}`;
    throw error;
  }
}

async function waitFor(label, predicate, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

function browserAssertHelpers() {
  function fail(message) {
    throw new Error(message);
  }

  function assertBrowser(condition, message) {
    if (!condition) fail(message);
  }

  function text(selector) {
    const node = document.querySelector(selector);
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function fill(field, value) {
    assertBrowser(field, "Tried to fill a missing field.");
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function submit(form) {
    assertBrowser(form, "Tried to submit a missing form.");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function waitUntil(predicate, label) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 4000;
      function check() {
        try {
          if (predicate()) {
            resolve();
            return;
          }
          if (Date.now() > deadline) {
            reject(new Error(`Timed out waiting for ${label}`));
            return;
          }
          window.setTimeout(check, 50);
        } catch (error) {
          reject(error);
        }
      }
      check();
    });
  }

  return { assertBrowser, fill, submit, text, waitUntil };
}

async function main() {
  if (skipBrowser) {
    console.warn("Skipping browser smoke checks because SKIP_BROWSER_SMOKE=1.");
    return;
  }

  const chromePath = browserPath();
  if (!chromePath) {
    const message = "No Chrome or Chromium executable found for browser smoke checks. Set BROWSER_BIN or SKIP_BROWSER_SMOKE=1.";
    if (requireBrowser) throw new Error(message);
    console.warn(`Skipping browser smoke checks: ${message}`);
    return;
  }

  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not expose WebSocket, which the browser smoke runner needs.");
  }

  let server;
  try {
    server = await startStaticServer();
  } catch (error) {
    if (!requireBrowser && error.code === "EPERM") {
      console.warn("Skipping browser smoke checks: this sandbox does not allow binding a temporary localhost server.");
      return;
    }
    throw error;
  }

  const browser = await launchChrome(chromePath);
  const cdp = new CdpConnection(browser.webSocketUrl);
  const runtimeErrors = [];
  let sessionId = "";

  cdp.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params.exceptionDetails?.text || "Runtime exception");
    }
  });

  async function send(method, params = {}) {
    return cdp.send(method, params, sessionId);
  }

  async function evaluate(expression, label) {
    const result = await send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      const description = details.exception?.description || details.text || "Evaluation failed";
      throw new Error(`${label}: ${description}`);
    }
    return result.result?.value;
  }

  async function evaluateFunction(fn, ...args) {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    return evaluate(expression, fn.name || "browser evaluation");
  }

  async function evaluateFlow(fn, ...args) {
    const expression = `(${fn.toString()})((${browserAssertHelpers.toString()})(), ...${JSON.stringify(args)})`;
    return evaluate(expression, fn.name || "browser flow");
  }

  async function navigate(pathname, expectedSelector = "body") {
    await send("Page.navigate", { url: `${server.origin}${pathname}` });
    await waitFor(`page load for ${pathname}`, async () => {
      return evaluate("document.readyState", "document.readyState").then((state) => state === "complete");
    });
    await waitFor(`${expectedSelector} on ${pathname}`, async () => {
      return evaluate(`Boolean(document.querySelector(${JSON.stringify(expectedSelector)}))`, expectedSelector);
    });
  }

  async function auditCurrentPageInternalTargets(label) {
    const broken = await evaluateFunction(async () => {
      const blockedProtocols = /^(blob|data|javascript|mailto|sms|tel):/i;
      const seen = new Set();
      const targets = [];
      const currentWithoutHash = new URL(window.location.href);
      currentWithoutHash.hash = "";

      function addTarget(node, attribute, type) {
        const raw = node.getAttribute(attribute);
        if (!raw || blockedProtocols.test(raw.trim())) return;

        let url;
        try {
          url = new URL(raw, document.baseURI);
        } catch (error) {
          targets.push({ error: error.message, raw, type });
          return;
        }

        if (url.origin !== window.location.origin) return;

        const hash = url.hash;
        url.hash = "";
        const href = url.toString();
        const key = `${type}:${href}:${hash}`;
        if (seen.has(key)) return;
        seen.add(key);
        targets.push({ href, hash, raw, type });
      }

      [
        ["a[href]", "href", "anchor"],
        ["area[href]", "href", "area"],
        ["form[action]", "action", "form"],
        ["iframe[src]", "src", "iframe"],
        ["img[src]", "src", "image"],
        ["link[href]", "href", "link"],
        ["script[src]", "src", "script"],
        ["source[src]", "src", "source"],
        ["audio[src]", "src", "audio"],
        ["video[src]", "src", "video"]
      ].forEach(([selector, attribute, type]) => {
        document.querySelectorAll(selector).forEach((node) => addTarget(node, attribute, type));
      });

      const failures = [];
      for (const target of targets) {
        if (target.error) {
          failures.push(target);
          continue;
        }

        if (target.hash && target.href === currentWithoutHash.toString()) {
          const id = decodeURIComponent(target.hash.slice(1));
          if (id && !document.getElementById(id) && document.getElementsByName(id).length === 0) {
            failures.push({ ...target, error: `Missing fragment target ${target.hash}` });
          }
        }

        let response;
        try {
          response = await fetch(target.href, { cache: "no-store", method: "HEAD" });
          if (response.status === 405) {
            response = await fetch(target.href, { cache: "no-store", method: "GET" });
          }
        } catch (error) {
          failures.push({ ...target, error: error.message });
          continue;
        }

        if (!response.ok) {
          failures.push({ ...target, status: response.status });
        }
      }

      return failures;
    });

    assert.deepEqual(broken, [], `${label} should not expose broken internal links or assets.`);
  }

  try {
    await cdp.ready;
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    ({ sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true }));
    await send("Page.enable");
    await send("Runtime.enable");

    await navigate("/index.html", "#event-feed");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, fill, submit, text, waitUntil } = helpers;
      localStorage.clear();

      await waitUntil(() => document.querySelectorAll("#event-feed .event-card").length >= 3, "initial event cards");
      assertBrowser(text("#event-feed").includes("Santa Monica Beach Cleanup"), "Browse feed should include Santa Monica event.");

      fill(document.querySelector("#location-filter"), "Venice");
      assertBrowser(text("#event-feed").includes("Venice Food Pantry Pack"), "Location filter should show Venice event.");
      assertBrowser(!text("#event-feed").includes("Santa Monica Beach Cleanup"), "Location filter should hide nonmatching events.");
      assertBrowser(text("#filter-summary").includes("Showing 1"), "Filter summary should report one visible event.");

      document.querySelector("#clear-filters").click();
      assertBrowser(document.querySelectorAll("#event-feed .event-card").length >= 3, "Clear filters should restore the event feed.");

      const accountForm = document.querySelector("#account-form");
      fill(accountForm.elements.accountAction, "create");
      fill(accountForm.elements.name, "Riley Stone");
      fill(accountForm.elements.email, "riley@example.com");
      fill(accountForm.elements.password, "correct horse battery");
      submit(accountForm);
      await waitUntil(() => text("#account-form-note").includes("Account created"), "account creation");
      assertBrowser(window.BLUE_MOON_ACCOUNT.current().email === "riley@example.com", "Created account should become the active session.");

      const orgForm = document.querySelector("#org-form");
      fill(orgForm.elements.name, "Westside Review Group");
      fill(orgForm.elements.contactName, "Riley Stone");
      fill(orgForm.elements.email, "riley@example.com");
      fill(orgForm.elements.link, "https://example.org");
      fill(orgForm.elements.description, "A neighborhood group requesting review before official posting.");
      submit(orgForm);
      await waitUntil(() => text("#org-form-note").includes("Organization review requested"), "organization review request");
      assertBrowser(text("#organization-list").includes("pending maintainer review"), "Organizations should enter maintainer review.");
      assertBrowser(!text("#organization-list").includes("Approve organization"), "Public UI should not expose organization self-approval.");

      const waitlistForm = document.querySelector("#waitlist-form");
      fill(waitlistForm.elements.name, "Riley Stone");
      fill(waitlistForm.elements.email, "riley@example.com");
      fill(waitlistForm.elements.interest, "Invite organizers");
      submit(waitlistForm);
      await waitUntil(() => text("#waitlist-form-note").includes("early access"), "local early access save");
      const waitlist = JSON.parse(localStorage.getItem("blueMoonWaitlist") || "[]");
      assertBrowser(waitlist.length === 1, "Local early access request should be stored.");
      assertBrowser(waitlist[0].email === "riley@example.com", "Local early access request should keep the email.");
      assertBrowser(waitlist[0].backendStatus === "local_demo", "Local early access request should record demo status.");

      const eventForm = document.querySelector("#event-form");
      fill(eventForm.elements.template, "tree-planting");
      fill(eventForm.elements.title, "Westlake Tree Planting");
      fill(eventForm.elements.date, "2026-06-20");
      fill(eventForm.elements.city, "Los Angeles");
      fill(eventForm.elements.zip, "90017");
      fill(eventForm.elements.location, "MacArthur Park north entrance");
      fill(eventForm.elements.description, "Plant young trees with neighbors and city volunteers.");
      submit(eventForm);
      await waitUntil(() => text("#event-form-note").includes("Event created"), "event creation");
      assertBrowser(text("#event-feed").includes("Westlake Tree Planting"), "Created event should appear in browse feed.");
      assertBrowser(JSON.parse(localStorage.getItem("blueMoonEventSubmissions") || "[]").length === 1, "Created event should persist locally.");

      assertBrowser(text("#completed-card").includes("Palisades"), "Completed proof card should render.");
      document.querySelector('[data-showcase-tab="share"]').click();
      assertBrowser(!document.querySelector('[data-showcase-panel="share"]').hidden, "Share showcase panel should open.");
      try {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (value) => {
              window.__blueMoonCopiedShare = value;
            }
          }
        });
      } catch (error) {
        document.execCommand = () => true;
      }
      const copyButton = document.querySelector("#share-demo-card [data-copy-share]");
      assertBrowser(copyButton, "Share proof card should expose a copy-link action.");
      copyButton.click();
      await waitUntil(() => text("#share-status").includes("Proof link copied"), "proof copy status");

      return true;
    });
    await auditCurrentPageInternalTargets("home page");

    await navigate("/events/santa-monica-beach-cleanup", "#event-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, text } = helpers;

      assertBrowser(text("#event-page").includes("Santa Monica Beach Cleanup"), "Clean event URL should render the selected event.");
      assertBrowser(text("#event-page").includes("Example event"), "Seed event pages should be marked as examples.");
      return true;
    });
    await auditCurrentPageInternalTargets("clean event page");

    await navigate("/event.html?id=santa-monica-beach-cleanup", "#event-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, fill, submit, text, waitUntil } = helpers;

      assertBrowser(text("#event-page").includes("Santa Monica Beach Cleanup"), "Event page should render the selected event.");
      assertBrowser(text("#event-page").includes("Report a concern"), "Event page should expose a trust report path.");
      document.querySelector("#report-toggle").click();
      assertBrowser(!document.querySelector("#trust-report-form").hidden, "Report form should open from the event page.");
      assertBrowser(document.querySelector("#trust-report-note[role='status']"), "Report form should expose status semantics.");
      const reportForm = document.querySelector("#trust-report-form");
      fill(reportForm.elements.reason, "unsafe_event");
      fill(reportForm.elements.details, "The meetup location needs a maintainer safety review.");
      fill(reportForm.elements.reporterEmail, "riley@example.com");
      submit(reportForm);
      await waitUntil(() => text("#trust-report-note").includes("Report saved in this browser"), "local trust report save");
      const localReports = JSON.parse(localStorage.getItem("blueMoonTrustReports") || "[]");
      assertBrowser(localReports.length === 1, "Local demo report should be stored.");
      assertBrowser(localReports[0].eventId === "santa-monica-beach-cleanup", "Local trust report should target the event.");
      assertBrowser(localReports[0].reason === "unsafe_event", "Local trust report should keep the selected reason.");

      document.querySelector("#join-trigger").click();
      assertBrowser(!document.querySelector("#join-form").hidden, "Join form should open from the primary CTA.");
      const joinForm = document.querySelector("#join-form");
      fill(joinForm.elements.name, "Riley Stone");
      fill(joinForm.elements.email, "riley@example.com");
      submit(joinForm);
      await waitUntil(() => !document.querySelector("#join-confirmation").hidden, "join confirmation");

      const joins = JSON.parse(localStorage.getItem("blueMoonJoins") || "[]");
      assertBrowser(joins.length === 1, "Successful local join should be stored once.");
      assertBrowser(joins[0].email === "riley@example.com", "Stored join should use the participant email.");
      assertBrowser(text("#join-confirmation").includes("You're joining"), "Join confirmation should be visible.");
      assertBrowser(Boolean(document.querySelector('#join-confirmation a[download$=".ics"]')), "Join confirmation should include a calendar download.");
      assertBrowser(text("#public-join-list").includes("Riley Stone"), "Public join list should include public participant names.");

      return true;
    });
    await auditCurrentPageInternalTargets("event join page");

    await navigate("/index.html#account", "#account-dashboard");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, text, waitUntil } = helpers;
      await waitUntil(() => text("#account-dashboard").includes("Riley Stone"), "account dashboard");
      assertBrowser(text("#account-dashboard").includes("Santa Monica Beach Cleanup"), "Account dashboard should show joined events.");
      assertBrowser(text("#account-dashboard").includes("Westlake Tree Planting"), "Account dashboard should show organized events.");
      return true;
    });

    await navigate(`/member.html?id=${memberId("riley@example.com")}`, "#member-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, text, waitUntil } = helpers;
      await waitUntil(() => text("#member-page").includes("Riley Stone"), "member profile");
      assertBrowser(text("#member-page").includes("1 events joined"), "Member profile should count joined events.");
      assertBrowser(text("#member-page").includes("Santa Monica Beach Cleanup"), "Member profile should list joined event activity.");
      return true;
    });
    await auditCurrentPageInternalTargets("member query page");

    await navigate(`/members/${memberId("riley@example.com")}`, "#member-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, text, waitUntil } = helpers;
      await waitUntil(() => text("#member-page").includes("Riley Stone"), "clean member profile");
      assertBrowser(text("#member-page").includes("Santa Monica Beach Cleanup"), "Clean member URL should list joined event activity.");
      return true;
    });
    await auditCurrentPageInternalTargets("clean member page");

    await navigate("/events/not-a-real-event", "#event-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, text } = helpers;
      assertBrowser(text("#event-page").includes("Event not found"), "Missing clean event URLs should render the not-found state.");
      assertBrowser(Boolean(document.querySelector('a[href="/#events"]')), "Missing event links should return to the root events section.");
      return true;
    });
    await auditCurrentPageInternalTargets("event not-found page");

    await navigate(`/members/${memberId("missing@example.com")}`, "#member-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, text } = helpers;
      assertBrowser(text("#member-page").includes("Member not found"), "Missing clean member URLs should render the not-found state.");
      assertBrowser(Boolean(document.querySelector('a[href="/#account"]')), "Missing member links should return to the root account section.");
      return true;
    });
    await auditCurrentPageInternalTargets("member not-found page");

    await navigate("/event.html?id=santa-monica-beach-cleanup", "#event-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, fill, submit, text, waitUntil } = helpers;
      window.BLUE_MOON_SITE.backendEnabled = true;
      window.__blueMoonTrustReportPayload = null;
      window.fetch = async (url, options = {}) => {
        window.__blueMoonTrustReportPayload = {
          url: String(url),
          body: JSON.parse(options.body || "{}")
        };
        return new Response(JSON.stringify({
          ok: true,
          reportSaved: true,
          reportId: "00000000-0000-4000-8000-000000000001"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      };

      document.querySelector("#report-toggle").click();
      const reportForm = document.querySelector("#trust-report-form");
      fill(reportForm.elements.reason, "privacy");
      fill(reportForm.elements.reporterEmail, "riley@example.com");
      fill(reportForm.elements.details, "Please review whether this page shares too much personal roster information.");
      submit(reportForm);
      await waitUntil(() => text("#trust-report-note").includes("Report sent"), "backend trust report submission");
      assertBrowser(window.__blueMoonTrustReportPayload.url === "/api/trust-report", "Backend trust report should call the API route.");
      assertBrowser(window.__blueMoonTrustReportPayload.body.target.eventId === "santa-monica-beach-cleanup", "Backend trust report should target the event.");
      assertBrowser(window.__blueMoonTrustReportPayload.body.report.reason === "privacy", "Backend trust report should send the selected reason.");
      assertBrowser(
        JSON.parse(localStorage.getItem("blueMoonTrustReports") || "[]").length === 1,
        "Backend-saved trust reports should not duplicate local demo reports."
      );
      return true;
    });

    await evaluateFunction(() => {
      localStorage.setItem("blueMoonJoins", "[]");
      return true;
    });

    await navigate("/event.html?id=santa-monica-beach-cleanup", "#event-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, fill, submit, text, waitUntil } = helpers;
      window.BLUE_MOON_SITE.backendEnabled = true;
      window.fetch = async () => new Response(JSON.stringify({
        error: "duplicate_join",
        emailSent: false,
        joinSaved: false
      }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });

      document.querySelector("#join-trigger").click();
      const joinForm = document.querySelector("#join-form");
      fill(joinForm.elements.name, "Riley Stone");
      fill(joinForm.elements.email, "riley@example.com");
      submit(joinForm);
      await waitUntil(() => text("#join-note").includes("already on the list"), "duplicate join rejection");
      assertBrowser(JSON.parse(localStorage.getItem("blueMoonJoins") || "[]").length === 0, "Backend-rejected joins should not be stored locally.");
      assertBrowser(document.querySelector("#join-confirmation").hidden, "Backend-rejected joins should not show confirmation.");
      return true;
    });

    await evaluateFunction(() => {
      const joins = Array.from({ length: 18 }, (_, index) => ({
        eventId: "santa-monica-beach-cleanup",
        name: `Capacity Test ${index + 1}`,
        email: `capacity-${index + 1}@example.com`,
        visibility: "private",
        createdAt: new Date().toISOString()
      }));
      localStorage.setItem("blueMoonJoins", JSON.stringify(joins));
      return true;
    });
    await navigate("/event.html?id=santa-monica-beach-cleanup", "#event-page");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser, text } = helpers;
      const fullButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent.trim() === "Event full");
      assertBrowser(fullButton && fullButton.disabled, "Full events should disable the join CTA.");
      assertBrowser(text("#join-count") === "30", "Full event should show capacity-aware join count.");
      return true;
    });

    await send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 2,
      height: 844,
      mobile: true,
      width: 390
    });
    await navigate("/index.html", "#event-feed");
    await evaluateFlow(async (helpers) => {
      const { assertBrowser } = helpers;
      assertBrowser(
        document.documentElement.scrollWidth <= window.innerWidth + 2,
        `Mobile layout should not overflow horizontally (${document.documentElement.scrollWidth}px > ${window.innerWidth}px).`
      );
      ["#location-filter", "#category-filter", "#time-filter", "#event-template", "#account-action"].forEach((selector) => {
        assertBrowser(document.querySelector(selector)?.closest("label"), `${selector} should have a visible label.`);
      });
      ["#filter-summary[aria-live='polite']", "#event-feed[aria-live='polite']", "#account-dashboard[aria-live='polite']", "#share-status[role='status']"].forEach((selector) => {
        assertBrowser(document.querySelector(selector), `${selector} should expose status semantics.`);
      });
      return true;
    });

    assert.deepEqual(runtimeErrors, [], "Browser runtime should not throw uncaught exceptions.");
    console.log("Blue Moon browser smoke checks passed");
  } finally {
    cdp.close();
    await browser.close();
    await server.close();
  }
}

await main();
