# Electoral College Game

Trivia where the scoreboard is the Electoral College. Parties earn points by answering questions, spend them on states at checkpoints, and states are called from the biggest blowouts first. Most electoral votes wins. Points earned are the popular vote.

No logins and no accounts. Anyone can open the site and pick a role:

| Page | Who | What |
| --- | --- | --- |
| `host/` | Whoever runs the game | Start a game, pick questions and checkpoints, score, reveal spending, undo |
| `board/?code=ABCD` | TV | Live map, 270 tracker, popular vote, current question; ⛶ for full screen |
| `play/?code=ABCD` | Phones | Join with the room code, answer, plan spending with your party, lock |
| `admin/` | Anyone browses; admins edit | Question bank: browse, test scoring; signed-in admins can add, edit, hide or delete |

## Setup (already done)
- Firebase project `electoral-college-game`: Firestore, Anonymous sign-in (invisible to players), rules from `firestore.rules`.
- GitHub Pages from `main`, root. Site: https://snipesmcgeee.github.io/electoral-college-game/

## Running a game
1. **Host a game**: name, mode, who can lock (party mode), whether teammates see each other's spending (candidate mode), map year, party names and colors. You get a room code.
2. Put the board on the TV. Players tap **Play**, enter the code, their name, and pick a party.
3. In the lobby, pick questions: single ones, or whole groups by game, category, type or "General only". "Hide questions already used in a game" skips anything played before. Set checkpoints and start.
4. Each question: **Show question** → answers come in with auto-scores → adjust any number → **Award points**.
5. At a checkpoint, phones switch to spending. When both parties lock (or the host force-locks), **Reveal** adds the spending and calls states. In candidate mode each player spends only the points they earned and locks their own spending; a party is locked once all its players are.
6. After the last question's reveal every state is called and the result shows. **Undo last action** works at any step.

## Question tracking
Questions remember which games they were used in (the Excel games, plus every game played here, with the date). No names are stored anywhere.

## Rules (mirrors the Excel "COPY ONLY 2024" tab)
- Every state starts 1–1; margin = leader's share including the seed.
- States are called only at checkpoints. Target called = floor(0.0051 × (100 × progress)²), progress = questions scored ÷ total. (The sheet used scored + 1 because it called states as each score was typed; with checkpoints that jumped a question ahead.) A 32-question game with spending every 8 calls 3, 12, 28, then all 51.
- The closing line is the (target + 1)th largest margin among open states; only states strictly above it are called. Ties on the line stay open.
- Called is permanent. At 100% everything is called; tied states go to the popular vote leader.
- Electoral tie → popular vote leader → bonus question.

## Question types
`qa` exact answer · `number` (scoring set per question: **range** by default — a scoring table of points and how far under/over the answer still earns them, uneven or lopsided allowed — or **closest takes all**) · `list` points per correct item · `tf` true/false. Anything flagged `needsReview` shows a ⚠ in admin with the reason.

Every question has 1–2 categories (Sports, History, Geography, Science, Animals, TV & Movies, Music, Literature & Art, Food & Drink, Politics, Business & Tech, Pop Culture), free sub-tags, a **General** checkbox (off = too specific for a general crowd), and an optional **re-check by** date for answers that go out of date. Past-due ones show under "Due for check" and warn the host.

## Updating questions
On the Question bank page, sign in with Google (account must be in Firestore `admins`) to add, edit, hide (restorable) or delete (permanent) questions. Edits are saved in Firestore (`questionEdits`) on top of `data/questions.json`.

The base bank lives in `data/questions.json`. To rebuild from Excel:
```
pip install openpyxl
python3 tools/import/import_questions.py Electoral_Games.xlsx data
```

## Tests
```
node tests/engine.test.mjs      # replays your played Excel games against the engine
node tests/scoring.test.mjs
python3 tests/quick_check.py      # under a minute: wallets, spending limits, join box, editor
python3 tests/e2e.py              # full game in headless Chrome with a fake database (long)
```
