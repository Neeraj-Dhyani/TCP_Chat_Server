# Terminal Chat — TCP + WebSocket Proxy + Browser Client

A small multi-client chat application that connects a browser to a raw **TCP socket server** through a **WebSocket-to-TCP proxy**. It's built to demonstrate how low-level TCP networking can be bridged to the browser, since browsers can't open raw TCP sockets directly.

## How it all fits together

```
Browser (HTML/JS)  <--WebSocket-->  Proxy Server (Node, ws + net)  <--TCP-->  TCP Chat Server (Node, net)
   port: n/a              ws://localhost:8080                          localhost:5000
```

Browsers can only speak WebSocket (or HTTP), not raw TCP. So the **proxy server** sits in the middle: it accepts WebSocket connections from the browser on port `8080`, and for each one opens a matching raw TCP connection to the chat server on port `5000`. It then pipes data back and forth between the two, so from the chat server's point of view, it's just talking TCP, and from the browser's point of view, it's just talking WebSocket.

```
[Client A] ─┐
[Client B] ─┼─ WS:8080 ─ Proxy ─ TCP:5000 ─ [TCP Chat Server] ─ broadcasts to all connections
[Client C] ─┘
```

Each browser tab gets its own WebSocket connection, its own proxy-side TCP connection, and is tracked individually by the chat server.

---

## 1. TCP Chat Server (`server.js` / TCP file)

This is the core of the application — a plain Node.js [`net`](https://nodejs.org/api/net.html) server listening on **port 5000**. It does not know anything about WebSockets; it only understands raw TCP connections (which, in this project, come from the proxy server).

### What it does

- **Accepts connections**: `net.createServer()` fires a callback for every new TCP connection.
- **Tracks clients**: every connection is stored in a `Set` called `clients`, so the server can loop over everyone currently connected.
- **Assigns a username**: each connection gets a random, human-friendly username via [`@faker-js/faker`](https://fakerjs.dev/) (e.g. `connection.username = faker.internet.username()`).
- **Sends a welcome message**: as soon as a client connects, it receives `"Welcome to the FICS-style Chat Server!\n"`. This is the very first message the client ever gets — the HTML client uses this first message to set the page title (see below).
- **Broadcasts messages**: when a connection emits `data` (i.e. the client typed something and sent it), the server loops through every client in the `Set` and writes the message to all of them:
  - If the recipient is the **sender**, they receive `You:<message>`.
  - If the recipient is **someone else**, they receive `<sender's username>:<message>`.
- **Cleans up on disconnect**: when a connection emits `end`, it's removed from the `clients` Set and the client count is decremented.

### Known quirk

`clientNum` is incremented inside the connection handler but used as a general "total clients" counter — it starts at `1` and is incremented before logging, so the very first client will be logged as `client 2 connected!`. This is cosmetic and doesn't affect functionality, but worth knowing if the printed count looks off by one.

### Why a `Set`?

A `Set` is used instead of an array because it gives `O(1)` add/remove operations via `.add()` and `.delete()`, and naturally prevents the same connection from being tracked twice.

---

## 2. WebSocket Proxy Server (`proxy.js` / WS file)

This file is the **bridge** between the browser and the TCP server. It uses the [`ws`](https://www.npmjs.com/package/ws) library to run a WebSocket server on **port 8080**, and Node's built-in `net` module to open outbound TCP connections to the chat server on port 5000.

### What it does, step by step

1. A browser opens a WebSocket connection to `ws://localhost:8080`. The proxy's `"connection"` event fires, giving it a `stream` (the WebSocket) for that browser.
2. For **that specific browser**, the proxy opens a **brand new TCP connection** to the chat server (`net.createConnection({ port: 5000 })`) called `tcpClient`. This means every browser tab effectively gets its own dedicated TCP connection on the chat server side.
3. **TCP → WebSocket**: whenever the chat server sends data down `tcpClient` (e.g. a broadcast chat message), the proxy converts it to a string and forwards it to the browser using `stream.send(...)`.
4. **WebSocket → TCP**: whenever the browser sends a WebSocket message (e.g. the user typed something and hit Send), the proxy writes that message into `tcpClient`, forwarding it into the TCP chat server.
5. **Cleanup**: if the browser closes its WebSocket, the proxy ends the TCP connection (`tcpClient.end()`). If the TCP connection ends from the server side, the proxy closes the WebSocket (`stream.close()`). This keeps both sides in sync — no orphaned connections on either end.

In short, this file does no chat logic of its own — its only job is **translating between two protocols** so the chat server and the browser can talk to each other without either one needing to understand the other's transport.

---

## 3. HTML/JS Client (`index.html`)

This is the browser-side chat UI. It connects directly to the proxy (not the TCP server, since browsers can't do that) via `new WebSocket("ws://localhost:8080")`.

### Structure

- **`#title`** — an `<h1>` that displays the server's welcome message once, the very first time a message arrives.
- **`#messageBox`** — a scrolling container where every subsequent chat message is appended.
- **`#inputBox` + `<button>Send</button>`** — where the user types and sends a message.
- **`style.css`** — a separate stylesheet controlling the terminal-style look (dark background, colored text, etc).

### How the script works

- **`socket.onopen`** — just logs to the console that the connection succeeded.
- **`socket.onmessage`** — this is the core message handler:
  - The **first message** the client ever receives (from the chat server's welcome message, relayed through the proxy) is treated specially: it's written into the `#title` heading instead of the chat log, and a `firstMessage` flag is flipped so this only happens once.
  - **Every message after that** is appended into `#messageBox` as a new `<div>`, and the box is auto-scrolled to the bottom so the latest message is always visible.
- **`sendMessage()`** — reads whatever is in `#inputBox`; if it's non-empty, sends it over the WebSocket and clears the input. If empty, it just logs a reminder to the console instead of sending.
- **Send button** — calls `sendMessage()` on click.

### Message flow for a single chat message

1. User types in `#inputBox` and clicks **Send**.
2. `sendMessage()` sends the text over the WebSocket to the **proxy** (port 8080).
3. The proxy forwards it over TCP to the **chat server** (port 5000).
4. The chat server broadcasts it to **every connected TCP client** (i.e. every proxy connection, i.e. every browser), with `You:` prefixed for the sender and `username:` prefixed for everyone else.
5. Each proxy connection receives this over TCP and forwards it back over WebSocket to its respective browser.
6. Each browser's `socket.onmessage` fires and appends the message to `#messageBox`.

---

## Running the project

Make sure a `package.json` exists in the project root listing `ws` and `@faker-js/faker` as dependencies (run `npm init -y` once if you don't have one yet, then `npm install ws @faker-js/faker` a single time to generate it). After that, anyone cloning the repo only needs to run:

```bash
npm i
```

This installs every required library in one step. Then start the two servers and open the client, in this order:

1. **Start the TCP chat server** (port 5000)
   ```bash
   node server.js
   ```

2. **Start the WebSocket proxy** (port 8080)
   ```bash
   node proxy.js
   ```

3. **Open the HTML client**
   Open `index.html` in a browser (or serve it with any static file server). Open it in multiple tabs to simulate multiple chat users — each tab gets its own random username from the TCP server.

### Testing the raw TCP server directly (PuTTY / telnet)

Since `server.js` is a plain TCP server, you can connect to it directly with a raw socket tool, bypassing the WebSocket proxy and HTML client entirely. This is useful for confirming the TCP server works in isolation before debugging the proxy or browser side.

**Using telnet (Windows/macOS/Linux):**

```bash
telnet localhost 5000
```

On Windows, telnet may need to be enabled first via *Control Panel → Programs → Turn Windows features on or off → Telnet Client*.

**Using PuTTY (Windows):**

1. Open PuTTY.
2. Set **Connection type** to `Raw` (not SSH/Telnet — `Raw` talks plain TCP, matching what `net.createServer` expects).
3. Set **Host Name (or IP address)** to `localhost` (or `127.0.0.1`).
4. Set **Port** to `5000`.
5. Click **Open**.

Once connected (via either tool), you should immediately see:

```
Welcome to the FICS-style Chat Server!
```

Typing a line and pressing Enter sends it as TCP data, which the server broadcasts to every connected client (`You:<message>` back to you, `<username>:<message>` to everyone else). Open a second PuTTY/telnet window, or mix one PuTTY session with one browser tab, to confirm messages broadcast correctly across all connected clients regardless of how they connected.

## Why this architecture?

This setup mirrors a common real-world pattern: **legacy or internal services that only speak raw TCP** (databases, game servers, old chat protocols like FICS) can be exposed to web browsers without modifying the original service, just by writing a thin WebSocket-to-TCP proxy in front of them.

## Possible improvements

- Fix the off-by-one in `clientNum` logging.
- Send the username back to the browser so the client can display "logged in as `<username>`" instead of only seeing it in incoming messages.
- Add reconnect logic to the WebSocket client for when the proxy or TCP server restarts.
- Sanitize/escape message content before inserting into the DOM to avoid HTML injection from chat messages.