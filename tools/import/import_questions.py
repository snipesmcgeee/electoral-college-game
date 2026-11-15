"""Convert Jack's Electoral_Games.xlsx into data/questions.json and data/profiles.json.

Usage:  python3 tools/import/import_questions.py Electoral_Games.xlsx data/
Needs:  pip install openpyxl

Range questions: the typed step strings in the sheet are replaced by steps computed from the
exact answer and the step width. Any question whose typed steps disagree with the computed ones,
or that can't be parsed cleanly, gets  needsReview: true  plus a note, so it shows up in /admin.
"""
import json, math, re, sys, unicodedata
import openpyxl

SRC, OUT = sys.argv[1], sys.argv[2].rstrip('/')
wb = openpyxl.load_workbook(SRC, data_only=True)
questions = []
seen_text = {}


def slug(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:40]


def num(v):
    """Parse a number out of a cell: 4038, '25.5 million', '$141mil', '20,000+' -> float or None."""
    if isinstance(v, (int, float)):
        return float(v)
    if v is None:
        return None
    m = re.search(r'-?\d[\d,]*\.?\d*', str(v))
    return float(m.group().replace(',', '')) if m else None


def parse_exact(v):
    """Exact (top-points) step: a number or 'a-b'. Returns (lo, hi) or None."""
    if isinstance(v, (int, float)):
        return (float(v), float(v))
    s = str(v or '').strip()
    m = re.fullmatch(r'(-?\d[\d,]*\.?\d*)\s*-\s*(-?\d[\d,]*\.?\d*)', s)
    if m:
        return (float(m.group(1).replace(',', '')), float(m.group(2).replace(',', '')))
    if re.fullmatch(r'-?\d[\d,]*\.?\d*', s):
        x = float(s.replace(',', ''))
        return (x, x)
    return None


def band_numbers(s):
    """'38-837, 7239-8038' -> set of ints, or None if unparseable."""
    if s is None or str(s).strip() == '':
        return set()
    if isinstance(s, (int, float)):
        return {int(s)}
    out = set()
    for seg in str(s).split(','):
        seg = seg.strip()
        m = re.fullmatch(r'(\d+)\s*-\s*(\d+)', seg)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if b < a or b - a > 100000:
                return None
            out |= set(range(a, b + 1))
        elif re.fullmatch(r'\d+', seg):
            out.add(int(seg))
        else:
            return None
    return out


def score_range(guess, lo, hi, step, max_pts, step_pts):
    d = 0 if lo <= guess <= hi else min(abs(guess - lo), abs(guess - hi))
    if d == 0:
        return max_pts
    return max(0, max_pts - step_pts * math.ceil(d / step - 1e-9))


def add(q):
    key = slug(q['text'])
    if key in seen_text:  # same question used in two games (music rounds): merge sources
        other = seen_text[key]
        for g in q['games']:
            if g not in other['games']:
                other['games'].append(g)
        return
    seen_text[key] = q
    questions.append(q)


def band_ranges(s):
    """'38-837, 7239-8038' -> [(38, 837), (7239, 8038)]; '41+' -> [(41, inf)]; None if unreadable."""
    if s is None or str(s).strip() == '':
        return []
    if isinstance(s, (int, float)):
        return [(float(s), float(s))]
    out = []
    for seg in str(s).split(','):
        seg = seg.strip()
        m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)', seg)
        if m:
            out.append((float(m.group(1)), float(m.group(2))))
        elif re.fullmatch(r'\d+(?:\.\d+)?', seg):
            out.append((float(seg), float(seg)))
        elif re.fullmatch(r'\d+\+', seg):
            out.append((float(seg[:-1]), math.inf))
        else:
            return None
    return out


def expand_year_ranges(ranges, exact):
    """Bands sometimes abbreviate years: '51-52' for 1851-52, '99-02' for 1899-1902."""
    if exact < 1000 or not ranges or max(r[0] for r in ranges) >= 1000:
        return ranges
    century = int(exact // 100) * 100

    def fix(n):
        return min((century - 100 + n, century + n, century + 100 + n), key=lambda c: abs(c - exact))
    out = []
    for lo, hi in ranges:
        lo2, hi2 = fix(lo), fix(hi)
        out.append((lo2, hi2) if lo2 <= hi2 else (lo2, hi2 + 100))
    return out


def make_range(base, exact_cell, bands, step_cell, max_pts, step_pts):
    """bands = {points: typed string}.

    If the typed steps read cleanly and don't overlap, they are kept exactly as Jack wrote them
    (some are deliberately uneven or escalating). Otherwise steps are computed from the exact
    answer and the step width, and the question is flagged for review.
    """
    notes = []
    if bands:  # the top filled step is the exact answer
        top = max(bands)
        if top != max_pts:
            notes.append(f'value column says {max_pts} but the exact answer sits in the {top}-pt column; using {top}')
            max_pts = top
        exact_cell = bands[top]
    q = dict(base, type='range', value=max_pts, stepPoints=step_pts)
    ex = parse_exact(exact_cell)
    if ex is None:
        n = num(exact_cell)
        ex = (n, n) if n is not None else None
    if ex is None:
        q.update(judge='host', needsReview=True,
                 reviewNotes=notes + [f'exact answer "{exact_cell}" is not a number; host judges'])
        return q
    q.update(answerLo=ex[0], answerHi=ex[1])
    ans_n = num(base['answer'])
    if ans_n is not None and not (ex[0] - 1 <= ans_n <= ex[1] + 1):
        notes.append(f'answer cell says {base["answer"]} but steps are in other units (exact = {exact_cell}); tell players the unit')

    typed, unreadable = {max_pts: [ex]}, False
    for pts, s in bands.items():
        if pts == max_pts:
            continue
        r = band_ranges(s)
        if r is None:
            notes.append(f'{pts}-pt step "{s}" could not be read')
            unreadable = True
        else:
            typed[pts] = expand_year_ranges(r, ex[0])
    # overlap check
    flat = sorted((lo, hi, pts) for pts, rs in typed.items() for lo, hi in rs)
    overlaps = [(flat[i], flat[i + 1]) for i in range(len(flat) - 1) if flat[i + 1][0] <= flat[i][1]]
    for x, y in overlaps[:3]:
        notes.append(f'{x[2]}-pt and {y[2]}-pt steps overlap at {y[0]:g}')

    # step width (fallback scoring, and what /admin edits)
    f = num(step_cell) if step_cell not in (None, '') and re.fullmatch(r'\s*\d+(\.\d+)?\s*', str(step_cell)) else None
    cands = [f] if f else []
    nxt = typed.get(max_pts - step_pts) or []
    for lo, hi in nxt:
        if lo > ex[1] and hi != math.inf:
            cands.append(hi - ex[1])
        if hi < ex[0]:
            cands.append(ex[0] - lo)
    cands = [c for c in cands if c and c > 0]
    step = None
    if cands:
        def bad(c):
            return sum(1 for pts, rs in typed.items() for lo, hi in rs if hi != math.inf
                       for n in {lo, hi} if score_range(n, ex[0], ex[1], c, max_pts, step_pts) != pts)
        step = min(cands, key=lambda c: (bad(c), c != f))
        q['step'] = step

    clean = not unreadable and not overlaps and len(typed) > 1
    if clean:
        q['bands'] = [{'points': pts, 'ranges': [[lo, None if hi == math.inf else hi] for lo, hi in rs]}
                      for pts, rs in sorted(typed.items(), reverse=True)]
    elif step:
        notes.append(f'typed steps not usable; scoring with computed steps of width {step:g}')
    else:
        q['judge'] = 'host'
        notes.append('no usable steps; host judges until a step width is set')
    if notes:
        q.update(needsReview=True, reviewNotes=notes)
    return q


def list_items(ans):
    return [a.strip() for a in re.split(r',|\band\b', str(ans)) if a.strip()]


def make_text(base, value, explicit_type=None):
    ans = str(base['answer']).strip()
    text = base['text']
    q = dict(base, value=value)
    if ans.lower() in ('up', '') or ans.startswith('http'):
        return dict(q, type='qa', judge='host', needsReview=True, reviewNotes=['answer must be judged by the host'])
    if explicit_type == 'tf':
        return dict(q, type='tf', accepted=[ans.split()[0].strip('()').lower()])
    items = list_items(ans)
    name_one = re.match(r'\s*name (a|one)\b', text, re.I)
    if name_one:
        return dict(q, type='qa', accepted=items)
    if explicit_type == 'list' or (len(items) >= 2 and explicit_type is None and value % len(items) == 0 and value // len(items) >= 1):
        per = value / len(items) if items else 0
        q.update(type='list', items=items, perItem=per if per == int(per) else round(per, 2))
        notes = []
        if per != int(per):
            notes.append(f'{value} pts over {len(items)} items is not a whole number per item')
        if re.search(r'order|chronolog|west to east|east to west', text, re.I):
            q['judge'] = 'host'
            notes.append('order matters; host judges')
        if notes:
            q.update(needsReview=True, reviewNotes=notes)
        return q
    accepted = [a.strip() for a in ans.split('/') if a.strip()]
    return dict(q, type='qa', accepted=accepted)


# ---------------- Kansas (10-pt scale, steps 2..12 in G..L) ----------------
ws = wb['Kansas']
for r in range(2, ws.max_row + 1):
    text, ans, val = ws.cell(r, 2).value, ws.cell(r, 3).value, ws.cell(r, 4).value
    if not text:
        continue
    base = dict(id=f'kansas-{r:03d}', text=str(text).strip(), answer=str(ans), category=str(ws.cell(r, 5).value or 'Kansas'), games=['Kansas'])
    bands = {ws.cell(1, c).value: ws.cell(r, c).value for c in range(7, 13) if ws.cell(r, c).value not in (None, '')}
    if bands:
        add(make_range(base, ws.cell(r, 12).value, bands, ws.cell(r, 6).value, int(val), 2))
    else:
        add(make_text(base, int(val)))

# ---------------- DECA (explicit types) ----------------
ws = wb['DECA']
for r in range(16, ws.max_row + 1):
    text, ans, val, typ = ws.cell(r, 2).value, ws.cell(r, 3).value, ws.cell(r, 4).value, ws.cell(r, 5).value
    if not text or not typ:
        continue
    val = int(float(val))
    cat = str(ws.cell(r, 1).value or 'General').strip()
    base = dict(id=f'deca-{r:03d}', text=str(text).strip(), answer=str(ans), category=cat, games=['DECA'])
    typ = str(typ).strip().lower()
    if typ == 'range':
        bands = {int(ws.cell(15, c).value): ws.cell(r, c).value for c in range(7, 13) if ws.cell(r, c).value not in (None, '')}
        add(make_range(base, ws.cell(r, 12).value, bands, ws.cell(r, 6).value, val, 2))
    elif typ == 'closer':
        n = num(ans)
        add(dict(base, type='closer', value=val, answerLo=n, answerHi=n))
    elif typ == 'list':
        add(make_text(base, val, 'list'))
    else:
        add(make_text(base, val, 'qa'))

# ---------------- Trump 2020 (2–6 scale, steps 1..6 in G..L) ----------------
ws = wb['Trump 2020']
for r in range(2, ws.max_row + 1):
    text, ans, val, typ = ws.cell(r, 2).value, ws.cell(r, 3).value, ws.cell(r, 4).value, ws.cell(r, 5).value
    if not text:
        continue
    val = int(float(val))
    typ = str(typ or '').strip().upper()
    cat = {'TRUMP': 'Trump', 'NICKNAME': 'Nicknames', 'TRIVIA': 'Politics', 'SCALE': 'Politics', 'T/F': 'True/False', 'LIST': 'Politics'}.get(typ, 'Politics')
    base = dict(id=f'trump-{r:03d}', text=str(text).strip(), answer=str(ans), category=cat, games=['Trump 2020'])
    if typ == 'SCALE':
        bands = {int(ws.cell(1, c).value): ws.cell(r, c).value for c in range(7, 13) if ws.cell(r, c).value not in (None, '')}
        exact_col = 6 + val  # column whose header equals the max points
        add(make_range(base, ws.cell(r, exact_col).value, bands, ws.cell(r, 6).value, val, 1))
    elif typ == 'T/F':
        add(make_text(base, val, 'tf'))
    elif typ == 'LIST':
        add(make_text(base, val, 'list'))
    else:
        add(make_text(base, val, 'qa'))

# ---------------- Music rounds (Cousins + Cabin) ----------------
for tab in ['Cousins', 'Cabin']:
    ws = wb[tab]
    mode = None
    for r in range(1, ws.max_row + 1):
        a, b, c = ws.cell(r, 1).value, ws.cell(r, 2).value, ws.cell(r, 3).value
        if b == 'First Word':
            mode = 'first'; continue
        if b == 'Word' and c == '#':
            mode = 'count'; hdr = {col: int(ws.cell(r, col).value) for col in range(4, 10)}; continue
        if a == 'List Duplicate Song Titles':
            add(dict(id='music-duplicate-titles', text='List song titles that have been used by more than one artist',
                     answer='Double = 1, Triple = 2, Quadruple+ = 3', category='Music', games=[tab], type='list',
                     value=0, timer=120, judge='host', needsReview=True,
                     reviewNotes=['timed 2 minutes; 1 pt per double, 2 per triple, 3 per quadruple+; host totals']))
            mode = None; continue
        if mode == 'first' and a and b:
            add(dict(id=f'music-first-{slug(a)}', text=f'What is the first word of "{a}" ({c})?', answer=str(b),
                     category='Song Lyrics', games=[tab], type='qa', value=10,
                     accepted=[x.strip() for x in str(b).split('/') if x.strip()]))
        elif mode == 'first' and not a:
            mode = None
        if mode == 'count' and a and b:
            base = dict(id=f'music-count-{slug(a)}', text=f'How many times is "{b}" said in "{a}"?', answer=str(c).strip(),
                        category='Song Lyrics', games=[tab])
            bands = {hdr[col]: ws.cell(r, col).value for col in range(4, 10) if ws.cell(r, col).value not in (None, '')}
            if num(c) is None:
                add(dict(base, type='range', value=12, judge='host', needsReview=True, reviewNotes=['no answer recorded']))
            elif len(bands) <= 1:
                add(dict(base, type='range', value=12, stepPoints=2, answerLo=num(c), answerHi=num(c), step=None,
                         judge='host', needsReview=True, reviewNotes=['no steps recorded; set a step width']))
            else:
                add(make_range(base, ws.cell(r, 9).value, bands, None, 12, 2))
        elif mode == 'count' and not a:
            mode = None

# ---------------- Profiles ----------------
ws = wb['MASTER']
games_hdr = {c: ws.cell(1, c).value for c in range(2, ws.max_column + 1)}
alias = {'Trump': 'Trump 2020'}
profiles = {}
for r in range(2, ws.max_row + 1):
    name = ws.cell(r, 1).value
    if not name:
        continue
    pid = slug(name)
    games = [alias.get(games_hdr[c], games_hdr[c]) for c in games_hdr if ws.cell(r, c).value]
    profiles[pid] = dict(id=pid, name=name, games=games)
# Cabin = UTNYE game; its 8 players (Jack confirmed the name matches 2026-11-14)
cabin = ['Marissa Heruth', 'Jack Heruth', 'Mike Eigenmann', 'Katie Eigenmann', 'Susie Pederson',
         'Sam Liebowitz', 'Nathan Miller', 'Melissa Miller']
for name in cabin:
    pid = slug(name)
    profiles.setdefault(pid, dict(id=pid, name=name, games=[]))
    if 'Cabin' not in profiles[pid]['games']:
        profiles[pid]['games'].append('Cabin')
for p in profiles.values():
    p['seen'] = sorted(q['id'] for q in questions if set(q['games']) & set(p['games']))

json.dump(questions, open(f'{OUT}/questions.json', 'w'), indent=1, ensure_ascii=False)
json.dump(sorted(profiles.values(), key=lambda p: p['name']), open(f'{OUT}/profiles.json', 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(len(questions), 'questions', dict(Counter(q['type'] for q in questions)))
print(sum(1 for q in questions if q.get('needsReview')), 'flagged for review')
print(len(profiles), 'profiles')
