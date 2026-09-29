# Deploying QuizHost to AWS EC2 — full step-by-step

This guide takes you from nothing to students opening your quiz on their phones. It assumes 100–200 concurrent students, so a single small instance is all you need. No database, no load balancer, no Redis.

Your code is on GitHub at: `https://github.com/ManishKudtarkar/QUIZAWS.git`

---

## Overview of what you'll do

1. Launch an EC2 instance
2. Open port 80 in its security group (firewall)
3. Connect to the instance over SSH
4. Install Node.js and git
5. Clone your repo, install deps, build
6. Run the server on port 80 with pm2 (auto-restart)
7. Open the site from the public IP
8. (Optional) Attach an Elastic IP so the address never changes

---

## Part 1 — Launch the EC2 instance

1. Sign in to the **AWS Console** and go to the **EC2** service (search "EC2" in the top bar).
2. Make sure the **Region** (top-right) is the one closest to your students (e.g. Mumbai `ap-south-1`).
3. Click **Launch instance**.
4. **Name:** type `quizhost`.
5. **Application and OS Images (AMI):** choose **Amazon Linux 2023** (free-tier eligible).
6. **Instance type:**
   - `t3.micro` — free-tier eligible, fine for 100–200 students.
   - `t3.small` — a little more headroom (recommended if you're not worried about free tier).
7. **Key pair (login):** click **Create new key pair**.
   - Name it `quizhost-key`, type **RSA**, format **.pem** (or **.ppk** if you use PuTTY on Windows).
   - Click **Create** — the key file downloads. **Keep this file safe; you can't download it again.**
8. **Network settings:** click **Edit**, then set up the firewall rules (security group):
   - Check **Allow SSH traffic from** → set to **My IP** (so only you can SSH in).
   - Check **Allow HTTP traffic from the internet** (this opens port 80 for students). ✅ This is the important one.
   - (Leave HTTPS unchecked for now unless you're setting up a domain.)
9. Leave storage at the default (8 GB is plenty).
10. Click **Launch instance**, then **View all instances**.
11. Wait until **Instance state = Running** and **Status checks = 2/2 passed** (takes a minute or two).

---

## Part 2 — Find your public address

1. In the EC2 console, click your `quizhost` instance.
2. In the details pane, copy the **Public IPv4 address** (e.g. `13.234.56.78`).

This is the address students will use. (Note: it changes if you stop/start the instance — see Part 8 to make it permanent.)

---

## Part 3 — Connect to the instance (SSH)

### On macOS / Linux

Open a terminal where your `.pem` file is (e.g. `~/Downloads`):

```bash
# lock down the key file permissions (required, or SSH refuses it)
chmod 400 Manish.pem

# connect (replace with YOUR public IP)
ssh -i quizhost-key.pem ec2-user@15.207.89.187
```

Type `yes` when asked about authenticity the first time.

### On Windows

- **Easiest:** in the EC2 console, select the instance → **Connect** → **EC2 Instance Connect** tab → **Connect**. This opens a browser terminal, no key file needed.
- **Or** use PuTTY with the `.ppk` key and host `ec2-user@<public-ip>`.

You'll know you're in when the prompt changes to something like `[ec2-user@ip-172-31-x-x ~]$`.

---

## Part 4 — Install Node.js and git

Run these on the instance (copy-paste line by line or as a block):

```bash
sudo dnf update -y
sudo dnf install -y nodejs git
```

Verify:

```bash
node -v    # should print v18.x or newer
git --version
```

If `node -v` shows something older than 18, install a newer version:

```bash
sudo dnf install -y nodejs20   # then use node20 / or set as default
```

(Amazon Linux 2023's default `nodejs` package is typically 18+, which is fine.)

---

## Part 5 — Get the code and build it

```bash
# clone your repo
git clone https://github.com/ManishKudtarkar/QUIZAWS.git quizhost
cd quizhost

# install server + client dependencies
npm run install:all

# build the React client into client/dist
npm run build
```

The build should end with something like `✓ built in 2s`.

---

## Part 6 — Run the server on port 80 with pm2

`pm2` keeps the app running and restarts it if it crashes or the box reboots.

```bash
# install pm2 globally
sudo npm install -g pm2

# start the app on port 80 (port 80 is the default web port, so no ":3000" needed)
sudo PORT=80 pm2 start server/index.js --name quizhost

# save the process list and enable start-on-boot
sudo pm2 save
sudo pm2 startup
```

The `pm2 startup` command prints another command — copy and run that printed command to enable auto-start on reboot.

Check it's running:

```bash
sudo pm2 status          # should show "quizhost" as "online"
sudo pm2 logs quizhost    # live logs; Ctrl+C to exit
```

You should see `Kahoot-clone server listening on port 80` in the logs.

---

## Part 7 — Open the site

- **You (host):** in a browser, go to `http://<your-public-ip>` (e.g. `http://13.234.56.78`).
  - Note: it's `http://`, not `https://`. Type the IP directly.
- Click **Host a quiz**, build your questions, get the **PIN**.
- **Students:** on their phones/laptops (any internet connection), they open the same `http://<your-public-ip>`, tap **Join a quiz**, enter the PIN and a nickname.

That's it — you're live.

> If the page doesn't load: 99% of the time it's the security group. Go back to Part 1 step 8 and confirm an inbound rule for **HTTP, port 80, source 0.0.0.0/0** exists on the instance's security group.

---

## Part 8 — (Recommended) Keep a stable address with an Elastic IP

A plain public IP changes if you stop/start the instance. An Elastic IP stays fixed (free while attached to a running instance).

1. EC2 console → left menu → **Elastic IPs** → **Allocate Elastic IP address** → **Allocate**.
2. Select the new IP → **Actions** → **Associate Elastic IP address**.
3. Choose your `quizhost` instance → **Associate**.
4. Use this Elastic IP from now on as your site address.

---

## Part 9 — (Optional) Domain name + HTTPS

If you want `quiz.yourschool.com` with a padlock instead of a bare IP:

- Point your domain's **A record** at the Elastic IP.
- Add HTTPS by putting **Nginx + Certbot** on the instance, or an **Application Load Balancer** with an **ACM** certificate in front of the instance. (Ask me and I'll write these steps out.)

---

## Where your quizzes are stored on the instance

Saved quizzes and game results are written to the `server/data/` folder inside the app on the instance (`~/quizhost/server/data/quizzes.json` and `results.json`). These files:

- **survive** app restarts, `pm2 restart`, and instance **reboots**
- are **lost** if you **terminate** the instance (terminate deletes the disk)

To back them up, copy the whole data folder off the instance now and then:

```bash
# run this on your own machine (replace IP + key)
scp -i Manish.pem -r ec2-user@<public-ip>:~/quizhost/server/data ./quizhost-data-backup
```

If you want quizzes stored durably outside the instance (so terminating the box doesn't lose them), the next step up is DynamoDB — ask and it can be wired in.

## Updating the app later

When you push new changes to GitHub, update the server. Your saved quizzes in `server/data/` are not touched by `git pull` (that folder is git-ignored):

```bash
cd quizhost
git pull
npm run install:all
npm run build
sudo pm2 restart quizhost
```

---

## Useful pm2 commands

```bash
sudo pm2 status            # is it running?
sudo pm2 logs quizhost      # view logs
sudo pm2 restart quizhost   # restart after changes
sudo pm2 stop quizhost      # stop it
sudo pm2 delete quizhost    # remove from pm2
```

---

## Cost note

- `t3.micro` is free-tier eligible for the first 12 months (750 hrs/month).
- Remember an Elastic IP is only free **while attached to a running instance** — if you stop the instance for a long time, either release the Elastic IP or you'll be charged a small hourly fee for the idle address.
- To avoid charges when you're not using it: `sudo pm2 stop quizhost` doesn't stop billing — you must **Stop** or **Terminate** the EC2 instance from the console. **Stop** = pausable (keeps disk, IP may change). **Terminate** = deletes it entirely.

---

## Quick reference — the whole server-side sequence

```bash
sudo dnf update -y
sudo dnf install -y nodejs git
git clone https://github.com/ManishKudtarkar/QUIZAWS.git quizhost
cd quizhost
npm run install:all
npm run build
sudo npm install -g pm2
sudo PORT=80 pm2 start server/index.js --name quizhost
sudo pm2 save
sudo pm2 startup   # then run the command it prints
```

Then open `http://<public-ip>` and share it with your students.
