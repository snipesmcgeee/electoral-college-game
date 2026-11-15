# Electoral College Game

Trivia where the scoreboard is the Electoral College. Parties earn points by answering questions, spend them on states at checkpoints, and states close from the biggest blowouts first. Most electoral votes wins. Points earned are the popular vote.

| Page | Who | What |
| --- | --- | --- |
| `board/?code=ABCD` | TV | Live map, 270 tracker, popular vote, current question |
| `host/` | You | Set up games, pick questions and checkpoints, score, reveal spending, undo |
| `play/?code=ABCD` | Phones | Join, answer, plan spending with your party, lock |
| `admin/` | You | Question warehouse, imports, profiles, game history |

## One-time setup (about 15 minutes)

**1. Firebase project**
1. Go to console.firebase.google.com → **Add project** → name it `electoral-college-game` (Analytics off is fine).
2. **Build → Firestore Database → Create database** → production mode → a US location.
3. **Build → Authentication → Get started** → enable **Anonymous** and **Google**.
4. **Authentication → Settings → Authorized domains** → add `<your-github-username>.github.io`.
5. **Project settings (gear) → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig` values into `js/firebase-config.js`.
6. **Firestore → Rules** → paste the contents of `firestore.rules` → **Publish**.

**2. GitHub**
1. Create a repo named `electoral-college-game`, upload everything in this folder (drag and drop works).
2. **Settings → Pages** → deploy from branch `main`, folder `/ (root)`.

**3. Make yourself the admin**
1. Open `https://<you>.github.io/electoral-college-game/admin/` and sign in with Google. It shows your UID.
2. In Firestore, start a collection `admins` with one document whose **Document ID** is that UID (add any field, e.g. `name: Jack`). Reload.

**4. Load the questions and profiles**
On the admin page → **Import** → pick `questions.json`, then `profiles.json`. These two files are kept out of the repo (see `.gitignore`) so answers and full names aren't public.

## Running a game
1. **Host → New game**: name, mode, who can lock, map year, party names. You get a room code.
2. Put `board/?code=XXXX` on the TV. Players open `play/` and enter the code, tap their name, pick a party.
3. In the lobby, pick questions (single ones or whole groups by game, category or type; "hide seen" uses the players who have joined) and set checkpoints. Start.
4. Each question: **Show question** → answers come in with auto-scores → adjust any number → **Award points**.
5. At a checkpoint, phones switch to spending. Each party plans privately; when both lock (or you force-lock), **Reveal** adds the spending and closes states.
6. After the last question's reveal every state closes and the result shows. **Undo last action** works at any step.

## Rules (mirrors the Excel "COPY ONLY 2024" tab)
- Every state starts 1–1; margin = leader's share including the seed.
- States close only at checkpoints. Target closed = floor(0.0051 × (100 × progress)²), progress = (questions scored + 1) ÷ total, capped at 100%.
- The closing line is the (target + 1)th largest margin among open states; only states strictly above it close. Ties on the line stay open.
- Closed is permanent. At 100% everything closes; tied states go to the popular vote leader.
- Electoral tie → popular vote leader → bonus question.

## Question types
`qa` exact answer · `range` closest number in steps (your typed steps are kept when they're clean; otherwise steps come from the step width) · `list` points per correct item · `closer` closest takes all · `tf` true/false. Anything flagged `needsReview` shows a ⚠ in admin with the reason.

## Updating questions from Excel
```
pip install openpyxl
python3 tools/import/import_questions.py Electoral_Games.xlsx ../import-files
```
Then import the new `questions.json` on the admin page.

## Tests
```
node tests/engine.test.mjs      # replays your played Excel games against the engine
node tests/scoring.test.mjs     # needs ../import-files/questions.json
python3 tests/e2e.py ../import-files   # full game in headless Chrome with a fake database
```
