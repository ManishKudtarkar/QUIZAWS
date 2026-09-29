# QuizHost — a simple Kahoot-style live quiz app

A self-hosted, real-time quiz platform. A host builds a quiz in the browser and starts a game; students join with a 6-digit PIN, answer questions on their own devices, and earn points for correct and fast answers. A live leaderboard shows the standings between questions.

Built to run as a single Node.js server (serves the web app + websockets), which makes it straightforward to host on AWS.

## Features

- Host builds a quiz directly on the website (questions, up to 4 answers, mark the correct one, per-question time limit)
- **Quizzes are saved** and persist across refreshes and server restarts, so you build once and host anytime
- **My Quizzes** list with Go Live, Edit, and Delete
- Going live shows a **6-digit PIN and a QR code** — students scan the QR (or enter the PIN) to join
- Students join with a game PIN and a nickname — no accounts needed
- Real-time question display and answering over WebSockets (Socket.IO)
- Scoring rewards correct answers and speed (up to 1000 points per question), with answer streaks
- Live leaderboard after each question and a final results screen

## Tech stack

- **Frontend:** React + Vite (plain CSS), `qrcode` for the join QR code
- **Backend:** Node.js + Express + Socket.IO
- **Quiz storage:** a JSON file on disk (`server/data/quizzes.json`) — quizzes persist across restarts
- **Live game state:** in-memory — a running game (players, scores) lives only for that session

## How data is stored

There are two different kinds of data, stored differently:

| Data | Where | Persists? |
|---|---|---|
| **Quizzes** you build | `server/data/quizzes.json` on disk | **Yes** — survives refresh and server restart |
| **Live game state** (players, scores, current question) | server memory (RAM) | No — ends when the game ends or the server restarts |

So the quizzes you create are saved and reusable. The per-game scores are live-only; if you want to keep a record of results after a game, that's a separate feature (ask and it can be added — JSON file or DynamoDB).

The `server/data/` folder is created automatically on first run and is git-ignored (your quizzes aren't committed to the repo).

## Project structure

```
.
├── package.json          # server deps + build/start scripts
├── server/
│   ├── index.js          # Express + Socket.IO server + REST API, serves client/dist in prod
│   ├── game.js           # Game + GameManager: rooms, PIN, scoring, leaderboard
│   ├── quizStore.js      # JSON-file quiz storage (CRUD)
│   ├── sampleQuiz.js     # default quiz fallback
│   └── data/             # created at runtime; holds quizzes.json (git-ignored)
└── client/
    ├── index.html
    ├── vite.config.js    # dev proxy for /socket.io -> :3000
    └── src/
        ├── App.jsx        # routes between Home / Host / Player
        ├── socket.js      # same-origin Socket.IO client
        ├── styles.css
        ├── components/
        │   └── QRCode.jsx      # renders the join QR code
        └── screens/
            ├── Home.jsx
            ├── MyQuizzes.jsx    # saved quizzes: Go Live / Edit / Delete / Create
            ├── QuizBuilder.jsx  # build/edit a quiz, saved to the server
            ├── HostGame.jsx     # lobby (PIN + QR), live questions, reveal, results
            └── PlayerGame.jsx   # join (PIN prefilled from QR), answer, see results
```

## REST API (quizzes)

- `GET /api/quizzes` — list saved quizzes (metadata)
- `GET /api/quizzes/:id` — full quiz
- `POST /api/quizzes` — create (or update if body has an `id`)
- `DELETE /api/quizzes/:id` — delete

## Run locally

Requires Node.js 18+.

Install everything:

```bash
npm run install:all
```

### Option A — production-style (one server)

Build the client, then start the server which serves it:

```bash
npm run build
npm start
```

Open http://localhost:3000. Host on one browser/tab, join from others (or from phones on the same network using your machine's LAN IP, e.g. `http://192.168.1.20:3000`).

### Option B — dev mode (hot reload)

Two terminals:

```bash
# terminal 1 — backend on :3000
npm run dev:server

# terminal 2 — Vite dev server on :5173 (proxies websockets to :3000)
npm run dev:client
```

Open http://localhost:5173.

## How to use

1. Click **Host a quiz**, build your questions, mark the correct answer for each, set time limits, then **Create game**.
2. Share the 6-digit **PIN** shown on the lobby screen.
3. Students open the site, click **Join a quiz**, enter the PIN and a nickname.
4. When everyone's in, the host clicks **Start quiz**. Advance through questions from the host screen; the leaderboard shows between questions.

## Deploying on AWS

The app is a single Node process listening on `PORT` (default 3000) that serves both the web app and the websocket connection. Any AWS compute option that runs Node works. Two common paths:

### Option 1 — EC2 (simplest to reason about)

1. Launch an Amazon Linux 2023 (or Ubuntu) EC2 instance. In its **security group**, allow inbound **HTTP (80)** and **SSH (22)** from your IP. (Add **443** if you set up TLS.)
2. SSH in and install Node 18+:
   ```bash
   # Amazon Linux 2023
   sudo dnf install -y nodejs git
   ```
3. Clone your repo and build:
   ```bash
   git clone <your-repo-url> quizhost && cd quizhost
   npm run install:all
   npm run build
   ```
4. Run it on port 80 with a process manager so it survives reboots/crashes:
   ```bash
   sudo npm install -g pm2
   sudo PORT=80 pm2 start server/index.js --name quizhost
   pm2 save
   sudo pm2 startup   # follow the printed command to enable on boot
   ```
5. Visit `http://<your-ec2-public-ip>/`.

For a domain + HTTPS, put an **Application Load Balancer** or **Nginx + Certbot** in front. If you use an ALB, enable **stickiness** on the target group (see WebSockets note below).

### Option 2 — Elastic Beanstalk (managed)

1. Ensure the app starts with `npm start` (it does) and reads `PORT` from the environment (it does — Beanstalk sets `PORT`).
2. Commit `client/dist` **or** build during deploy. Simplest: build locally, then include `client/dist` in the bundle you upload (temporarily remove `client/dist` from `.gitignore`, or use a prebuild step / `.ebextensions` to run `npm run build`).
3. Create an **Elastic Beanstalk** application, platform **Node.js**, and deploy the project zip.
4. On the environment's load balancer, enable **session stickiness** (see below).

### WebSockets note (important)

Socket.IO uses sticky sessions when scaled behind a load balancer. For a single instance this doesn't matter. If you run **more than one instance** behind an ALB/ELB:

- Enable **target group stickiness** (duration-based cookie), and
- Add the **Socket.IO Redis adapter** (`@socket.io/redis-adapter` + an ElastiCache Redis) so game rooms are shared across instances.

Game state here is in-memory, so a single instance is the simplest correct setup. Scale vertically (bigger instance) first; move to the Redis adapter only when you truly need multiple instances.

## Notes & limits

- **Quizzes persist; live games don't.** Your saved quizzes live in `server/data/quizzes.json` and survive restarts. A game in progress (players/scores) is in memory only, so restarting mid-game ends it. Fine for classroom-style use.
- **Backing up quizzes:** copy `server/data/quizzes.json` somewhere safe if they matter. On EC2, this file lives on the instance's disk — it survives reboots and app restarts, but is lost if you **terminate** the instance. For durable, instance-independent storage, move to DynamoDB (ask and it can be wired in).
- **Player capacity** is bounded by the instance's memory/CPU/connection limits. A single modest instance comfortably handles 100–200 students; use a larger instance (and the Redis adapter for multi-instance) for very large audiences.
- No authentication — anyone with the site can host. Add auth if you expose it publicly and want to restrict hosting.
