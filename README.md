# Electoral College Game

Trivia where the scoreboard is the Electoral College. Parties earn points by answering questions, spend them on states at checkpoints, and states close from the biggest blowouts first. Most electoral votes wins. Points earned are the popular vote.

No logins and no accounts. Anyone can open the site and pick a role:

| Page | Who | What |
| --- | --- | --- |
| `host/` | Whoever runs the game | Start a game, pick questions and checkpoints, score, reveal spending, undo |
| `board/?code=ABCD` | TV | Live map, 270 tracker, popular vote, current question |
| `play/?code=ABCD` | Phones | Join with the room code, answer, plan spending with your party, lock |
| `admin/` | Anyone | Browse the question bank, review flags, test how an answer scores |

## Setup (already done)
- Firebase project `electoral-college-game`: Firestore, Anonymous sign-in (invisible to players), rules from `firestore.rules`.
- GitHub Pages from `main`, root. Site: https://snipesmcgeee.github.io/electoral-college-game/

## Running a game
1. **Host a game**: name, mode, who can lock, map year, party names. You get a room code.
2. Put the board on the TV. Players tap **Play**, enter the code, optionally a nickname, and pick a party.
3. In the lobby, pick questions: single ones, or whole groups by game, category or type. "Hide questions already used in a game" skips anything played before. Set checkpoints and start.
4. Each question: **Show question** → answers come in with auto-scores → adjust any number → **Award points**.
5. At a checkpoint, phones switch to spending. When both parties lock (or the host force-locks), **Reveal** adds the spending and closes states.
6. After the last question's reveal every state closes and the result shows. **Undo last action** works at any step.

## Question tracking
Questions remember which games they were used in (the Excel games, plus every game played here, with the date). No names are stored anywhere.

## Rules (mirrors the Excel "COPY ONLY 2024" tab)
- Every state starts 1–1; margin = leader's share including the seed.
- States close only at checkpoints. Target closed = floor(0.0051 × (100 × progress)²), progress = (questions scored + 1) ÷ total, capped at 100%.
- The closing line is the (target + 1)th largest margin among open states; only states strictly above it close. Ties on the line stay open.
- Closed is permanent. At 100% everything closes; tied states go to the popular vote leader.
- Electoral tie → popular vote leader → bonus question.

## Question types
`qa` exact answer · `range` closest number in steps (your typed steps are kept when they're clean; otherwise steps come from the step width) · `list` points per correct item · `closer` closest takes all · `tf` true/false. Anything flagged `needsReview` shows a ⚠ in admin with the reason.

## Updating questions
Questions live in `data/questions.json`. To rebuild from Excel:
```
pip install openpyxl
python3 tools/import/import_questions.py Electoral_Games.xlsx data
```

## Tests
```
node tests/engine.test.mjs      # replays your played Excel games against the engine
node tests/scoring.test.mjs
python3 tests/e2e.py              # full game in headless Chrome with a fake database
```
