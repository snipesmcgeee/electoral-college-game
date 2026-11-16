"""Quick check (well under a minute) of the candidate-mode wallets, spending limits, join box,
board full-screen button and the question editor, using the in-browser mock database.

    python3 tests/quick_check.py
"""
import json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
mock = (ROOT / 'tests/mock/firebase.js').read_text()
teams = [{'id': 'blue', 'name': 'Donkeys', 'color': 'blue'}, {'id': 'red', 'name': 'Elephants', 'color': 'red'}]
game = {
    'code': 'QCHK', 'name': 'Quick check', 'hostUid': 'host', 'status': 'spending', 'round': 1,
    'settings': {'mode': 'candidate', 'lockBy': 'anyone', 'seeTeam': True, 'mapYear': 2024, 'teams': teams},
    'questionIds': ['kansas-026', 'kansas-005', 'kansas-007', 'kansas-008'], 'checkpoints': [2, 4], 'total': 4, 'qIndex': 2,
    'current': None, 'answersOpen': False,
    'scored': {'kansas-026': {'blue': 12, 'red': 5}, 'kansas-005': {'blue': 3, 'red': 4}},
    'playerTotals': {'p1': 10, 'p2': 5, 'p3': 9}, 'playerSpent': {}, 'spend': {}, 'closed': {},
    'locked': {'blue': False, 'red': False}, 'plocked': {}, 'leaders': {'blue': 'p1', 'red': 'p3'},
}
seed = {'games/QCHK': game,
        'games/QCHK/players/p1': {'uid': 'p1', 'name': 'Ann', 'team': 'blue', 'joinedAt': 1},
        'games/QCHK/players/p2': {'uid': 'p2', 'name': 'Bo', 'team': 'blue', 'joinedAt': 2},
        'games/QCHK/players/p3': {'uid': 'p3', 'name': 'Cy', 'team': 'red', 'joinedAt': 3}}

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '-d', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
B = 'http://localhost:8766'
errors, fails = [], []
def ok(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel='chrome', headless=True)
        ctx = br.new_context(viewport={'width': 420, 'height': 900})
        ctx.route('**/js/firebase.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=mock))
        def page(url, uid=None):
            p = ctx.new_page()
            if uid: p.add_init_script(f'sessionStorage.setItem("uid", "{uid}")')
            p.on('pageerror', lambda e: errors.append(f'{url}: {e}'))
            p.goto(B + url)
            return p
        first = page('/')
        first.evaluate('d => localStorage.setItem("mockdb", JSON.stringify(d))', seed)
        db = lambda: first.evaluate('JSON.parse(localStorage.mockdb)')

        host = page('/host/?code=QCHK', 'host')
        ann = page('/play/?code=QCHK', 'p1'); bo = page('/play/?code=QCHK', 'p2'); cy = page('/play/?code=QCHK', 'p3')
        ann.wait_for_selector('.state-row')
        ok('Ann sees her own wallet (10)', 'Balance 10' in ann.inner_text('.sticky'))
        ok('step box labeled', ann.locator('text=Amount per +/- Click').count() == 1)
        ok('"Closest to being called" sort', ann.locator('text=Closest to being called').count() == 1)
        # step of 4: + on California twice → 8, third press capped at 10
        ann.fill('input[data-keep=step]', '4'); ann.press('input[data-keep=step]', 'Tab')
        row = lambda p, st: p.locator('.state-row', has_text=st)
        for _ in range(2): row(ann, 'California').locator('button', has_text='+').click(); time.sleep(.25)
        ok('+ adds 4 per click', row(ann, 'California').locator('input').input_value() == '8')
        row(ann, 'California').locator('button', has_text='+').click(); time.sleep(.3)
        ok('+ capped at what is left (10)', row(ann, 'California').locator('input').input_value() == '10')
        ok('+ disabled at 0 left', row(ann, 'Texas').locator('button', has_text='+').is_disabled())
        # typing over the balance is cut down
        row(ann, 'California').locator('input').fill('50'); row(ann, 'California').locator('input').press('Tab'); time.sleep(.4)
        ok('typed 50 cut to 10', row(ann, 'California').locator('input').input_value() == '10')
        ann.on('dialog', lambda d: d.accept()); bo.on('dialog', lambda d: d.accept()); cy.on('dialog', lambda d: d.accept())
        ann.click('text=Lock spending'); time.sleep(.5)
        bo.wait_for_timeout(400)
        ok('Bo sees teammate plan live', 'teammates +10' in row(bo, 'California').inner_text())
        ok('Bo wallet is his own (5)', 'Balance 5' in bo.inner_text('.sticky'))
        row(bo, 'Texas').locator('input').fill('5'); row(bo, 'Texas').locator('input').press('Tab'); time.sleep(.3)
        time.sleep(.5); ok('blue not locked with 1 of 2 players', not db()['games/QCHK']['locked']['blue'] and '1/2 players locked' in host.inner_text('body'))
        bo.click('text=Lock spending'); time.sleep(.3)
        row(cy, 'Texas').locator('input').fill('9'); row(cy, 'Texas').locator('input').press('Tab'); time.sleep(.3)
        cy.click('text=Lock spending'); time.sleep(1)
        d = db()['games/QCHK']
        ok('parties auto-locked when all players lock', d['locked'] == {'blue': True, 'red': True})
        host.click('text=Reveal spending & call states'); time.sleep(1)
        d = db()['games/QCHK']
        ok('spend summed per party', d['spend'].get('CA', {}).get('blue') == 10 and d['spend'].get('TX', {}) == {'blue': 5, 'red': 9})
        ok('player wallets charged', d['playerSpent'] == {'p1': 10, 'p2': 5, 'p3': 9})
        ok('Q2 of 4 calls 12 states (not all 51)', len(d['closed']) <= 12)
        # join box: room code as a name is refused
        jp = page('/play/?code=QCHK', 'p9'); jp.wait_for_selector('text=Your name')
        ok('room shown separately', jp.locator('text=Room QCHK ✓').count() == 1)
        jp.fill('input', 'QCHK'); jp.click('button.bigbtn >> nth=0'); time.sleep(.4)
        ok('room code rejected as a name', 'games/QCHK/players/p9' not in db())
        # board
        bd = page('/board/?code=QCHK'); time.sleep(.5)
        ok('board has full screen button', bd.locator('#fs').count() == 1)
        # admin editor
        ad = page('/admin/'); ad.add_init_script('sessionStorage.setItem("google","1")'); ad.reload(); ad.wait_for_selector('table')
        ok('admin category filter', ad.locator('select option', has_text='Literature & Art').count() >= 1)
        ad.locator('tr', has_text='How many counties does Kansas').locator('text=Edit').click()
        ad.wait_for_selector('text=Scoring table')
        ok('editor shows 5 table rows for counties', ad.locator('h3:has-text("Scoring table") ~ table tr').count() == 6)
        ad.fill('input[placeholder="Try an answer to test scoring"]', '90')
        ok('editor test: 90 → 10 pts', ad.locator('.pill', has_text='pts').first.inner_text().startswith('10 pts'))
        br.close()
finally:
    srv.terminate()
for e in errors: print('PAGE ERROR', e)
print(f'{len(fails)} failed' if fails or errors else 'all passed')
sys.exit(1 if fails or errors else 0)
