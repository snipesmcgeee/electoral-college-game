"""End-to-end run of a full game with the in-browser mock database.

    python3 tests/e2e.py   (needs: pip install playwright; Chrome installed)

Opens host, board and two phones in one browser, plays every question of the Kansas game
with spending at every checkpoint, and checks the closings against the engine's rules.
"""
import json, re, subprocess, sys, time, pathlib, random
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
OUT = ROOT.parent / 'e2e-shots'
OUT.mkdir(exist_ok=True)
questions = json.loads((DATA / 'questions.json').read_text())
seed = {}
mock = (ROOT / 'tests/mock/firebase.js').read_text()

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
BASE = 'http://localhost:8765'
errors = []
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel='chrome', headless=True)
        ctx = br.new_context(viewport={'width': 1280, 'height': 900})
        ctx.route('**/js/firebase.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=mock))

        def page(url, w=1280, h=900):
            p = ctx.new_page()
            p.set_viewport_size({'width': w, 'height': h})
            p.on('pageerror', lambda e: errors.append(f'{url}: {e} {e.stack[:600] if e.stack else ""}'))
            p.on('console', lambda m: m.type == 'error' and errors.append(f'{url}: {m.text}'))
            p.goto(BASE + url)
            return p

        host = page('/host/')
        host.evaluate('d => localStorage.setItem("mockdb", JSON.stringify(d))', seed)
        host.reload()
        import os
        if os.environ.get('MODE') == 'candidate':
            host.locator('select[name=mode]').select_option('candidate')
        host.get_by_text('Create game').click()
        host.wait_for_url(re.compile(r'code='))
        code = re.search(r'code=(\w+)', host.url).group(1)
        print('game', code)

        blue = page(f'/play/?code={code}', 420, 900)
        blue.get_by_placeholder('Nickname (optional, just for tonight)').fill('Jack')
        blue.get_by_role('button', name='Blue').click()
        red = page(f'/play/?code={code}', 420, 900)
        red.get_by_role('button', name='Red').click()
        board = page(f'/board/?code={code}', 1600, 1000)
        host.wait_for_timeout(600)

        # Pick the Kansas questions (already used in the Excel game, so turn off "hide used")
        host.get_by_label('Hide questions already used in a game').uncheck()
        host.get_by_label('Kansas').check()
        host.get_by_role('button', name=re.compile(r'^Add all \d+ shown')).click()
        host.wait_for_timeout(300)
        host.locator('#every').fill('8')
        host.get_by_role('button', name='Set', exact=True).click()
        host.wait_for_timeout(300)
        host.screenshot(path=str(OUT / '1-host-lobby.png'), full_page=True)
        host.get_by_role('button', name=re.compile('^Start game')).click()

        def game():
            return host.evaluate(f'JSON.parse(localStorage.mockdb)["games/{code}"]')

        def answer(phone, text):
            try:
                phone.wait_for_selector('form [name=a]', timeout=8000)
            except Exception:
                dump(); raise
            el = phone.locator('form [name=a]')
            if el.evaluate('e => e.tagName') == 'SELECT':
                el.select_option(text)
            else:
                el.fill(text)
            phone.locator('form button').click()

        Q = {q['id']: q for q in questions}
        def dump():
            for n, pg in (('host', host), ('blue', blue), ('red', red), ('board', board)):
                pg.screenshot(path=str(OUT / f'fail-{n}.png'), full_page=True)
            print('ERRORS', errors)
        rnd = random.Random(7)
        checkpoint_log = []
        while True:
            g = game()
            if g['status'] == 'over':
                break
            if g['status'] == 'spending':
                bal = {t: sum(v[t] for v in g['scored'].values()) - sum(s.get(t, 0) for s in g['spend'].values()) for t in ('blue', 'red')}
                for phone, t in ((blue, 'blue'), (red, 'red')):
                    phone.wait_for_selector('.state-row')
                    rows = phone.locator('.state-row')
                    n = rows.count()
                    left = bal[t]
                    picks = rnd.sample(range(n), min(4, n))
                    for i, idx in enumerate(picks):
                        amt = left if i == len(picks) - 1 else rnd.randint(0, left)
                        left -= amt
                        if amt:
                            rows.nth(idx).locator('input').fill(str(amt))
                            rows.nth(idx).locator('input').dispatch_event('change')
                            phone.wait_for_timeout(250)
                    if g['round'] == 1 and t == 'blue':
                        phone.screenshot(path=str(OUT / '3-phone-spending.png'), full_page=False)
                    phone.once('dialog', lambda d: d.accept())
                    phone.get_by_role('button', name='Lock spending').click()
                    phone.wait_for_timeout(300)
                host.wait_for_timeout(400)
                if host.get_by_text('Popular vote is tied').count():
                    host.get_by_role('button', name='Blue', exact=True).click(); host.wait_for_timeout(300)
                try:
                    host.get_by_role('button', name='Reveal spending & close states').click(timeout=6000)
                except Exception:
                    dump(); raise
                host.wait_for_timeout(700)
                g2 = game()
                checkpoint_log.append((g2['qIndex'], len(g2['closed']), g2['lastReveal']['closedNow']))
                if g2['round'] == 2:
                    board.wait_for_timeout(500)
                    board.screenshot(path=str(OUT / '2-board.png'))
                continue
            # question phase
            host.get_by_role('button', name='Show question').click()
            for _ in range(40):
                host.wait_for_timeout(100)
                cur = game().get('current')
                if cur and cur['id'] not in game()['scored']:
                    break
            if not game().get('current'):
                print('STATE', {k: game()[k] for k in ('status','qIndex','total','checkpoints','round')}); dump()
            qid = game()['current']['id']
            q = Q[qid]
            right = str(q.get('answerLo') if q['type'] == 'range' and q.get('answerLo') is not None else
                        'True' if q['type'] == 'tf' else q['answer'])
            if q['type'] == 'range' and right.endswith('.0'):
                right = right[:-2]
            answer(blue, right)
            answer(red, 'True' if q['type'] == 'tf' else ('1' if q['type'] == 'range' else 'no idea'))
            host.wait_for_timeout(400)
            if g['qIndex'] == 2:
                host.screenshot(path=str(OUT / '4-host-scoring.png'), full_page=True)
            host.get_by_role('button', name='Close answers').click()
            host.wait_for_timeout(200)
            host.get_by_role('button', name='Award points').click()
            for _ in range(40):
                host.wait_for_timeout(100)
                if qid in game()['scored']:
                    break
            host.wait_for_timeout(200)

        g = game()
        board.wait_for_timeout(600)
        board.screenshot(path=str(OUT / '5-board-final.png'))
        print('checkpoints (after Q, closed, closed now):')
        for row in checkpoint_log:
            print('  ', row)
        print('result', json.dumps(g['result']))
        assert g['status'] == 'over'
        assert len(g['closed']) == 51, len(g['closed'])
        assert sum(g['result']['ec'].values()) == 538
        earned = {t: sum(v[t] for v in g['scored'].values()) for t in ('blue', 'red')}
        assert earned == g['result']['popular'], (earned, g['result']['popular'])
        used = host.evaluate('Object.keys(JSON.parse(localStorage.mockdb)).filter(k => k.startsWith("usage/")).length')
        print('questions logged as used:', used)
        assert used == g['total'], used
        print('earned', earned)
        br.close()
finally:
    srv.terminate()
print('page errors:', errors or 'none')
sys.exit(1 if errors else 0)
