#!/usr/bin/env python3
"""Complète les mots ajoutés depuis l'appli : phrase d'exemple et fréquence d'usage.

Pour chaque mot de DATA (anglais/site/index.html) qui n'a pas encore :
- de phrase dans exemples.json : cherche sur Tatoeba (tatoeba.org) une phrase anglaise courte avec
  sa traduction française, et met le mot entre crochets ([...]) comme les autres phrases ;
- de fréquence dans frequences.json : Zipf de wordfreq, max des formes fléchies
  (≥4,5 → 4, ≥3,8 → 3, ≥3 → 2, sinon 1).
Les mots déjà remplis ne sont jamais modifiés. Si Tatoeba ne trouve rien, le mot reste sans phrase.

Usage : python3 fill.py anglais/site
"""
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

from wordfreq import zipf_frequency

SITE = pathlib.Path(sys.argv[1])
TATOEBA = "https://api.tatoeba.org/unstable/sentences"


def words():
    html = (SITE / "index.html").read_text(encoding="utf-8")
    m = re.search(r"const DATA = \[(.*?)\n\];", html, re.S)
    return [d[0] for d in json.loads("[" + m.group(1) + "]")]


def load(name):
    p = SITE / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def save(name, data, compact):
    data = dict(sorted(data.items(), key=lambda kv: kv[0].lower()))
    if compact:   # frequences.json : "Mot": 2,
        body = ",\n".join(f"{json.dumps(k, ensure_ascii=False)}: {v}" for k, v in data.items())
    else:         # exemples.json : "Mot": [\n"phrase",\n"traduction"\n],
        body = ",\n".join(
            f"{json.dumps(k, ensure_ascii=False)}: [\n"
            + ",\n".join(json.dumps(x, ensure_ascii=False) for x in v) + "\n]"
            for k, v in data.items())
    (SITE / name).write_text("{\n" + body + "\n}", encoding="utf-8")


# ---------- Fréquence ----------

def forms(w):
    w = w.lower()
    out = {w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "er", w + "ly"}
    if w.endswith("e"):
        out |= {w[:-1] + "ing"}
    if w.endswith("y"):
        out |= {w[:-1] + "ies", w[:-1] + "ied"}
    if re.search(r"[^aeiou][aeiou][bdgklmnprt]$", w):
        out |= {w + w[-1] + "ed", w + w[-1] + "ing"}
    return out


def frequency(w):
    if " " in w.strip():
        # expression : wordfreq ne sait pas l'estimer (il donne « Act up » aussi courant que « act »).
        # « peu courant » par défaut ; à corriger à la main dans frequences.json si besoin.
        return 2
    z = max(zipf_frequency(f, "en") for f in forms(w))
    return 4 if z >= 4.5 else 3 if z >= 3.8 else 2 if z >= 3 else 1


# ---------- Phrase d'exemple (Tatoeba) ----------

def token_re(t):
    t = t.lower()
    stems = {re.escape(t)}
    if t.endswith("e"):
        stems.add(re.escape(t[:-1]))
    if t.endswith("y"):
        stems.add(re.escape(t[:-1]) + "i")
    return r"(?:" + "|".join(sorted(stems, key=len, reverse=True)) + r")[a-z]*"


def word_re(w):
    toks = re.findall(r"[a-z']+", w.lower())
    if not toks:
        return None
    if len(toks) == 1:
        return re.compile(r"\b" + token_re(toks[0]) + r"\b", re.I)
    # expression : jusqu'à 2 mots intercalés (« tucked his tail », « work it out »)
    sep = r"(?:\s+[\w']+){0,2}?\s+"
    return re.compile(r"\b" + token_re(toks[0]) + "".join(sep + re.escape(t) + r"\b" for t in toks[1:]), re.I)


def tatoeba(q):
    url = TATOEBA + "?" + urllib.parse.urlencode(
        {"lang": "eng", "q": q, "trans:lang": "fra", "sort": "words", "limit": 50, "is_unapproved": "no"})
    req = urllib.request.Request(url, headers={"User-Agent": "revisions-anglais/1.0"})
    for essai in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r).get("data", [])
        except Exception as e:   # noqa: BLE001
            print(f"  Tatoeba ({q}) : {e}")
            time.sleep(3)
    return []


def example(w):
    rx = word_re(w)
    if not rx:
        return None
    q = f'"{w.lower()}"' if " " in w.strip() else w.lower()
    best = None
    for s in tatoeba(q):
        en = s.get("text", "").strip()
        n = len(en.split())
        if not 5 <= n <= 14 or not rx.search(en):
            continue
        trs = [t for t in s.get("translations", []) if t.get("lang") == "fra" and t.get("text")]
        if not trs:
            continue
        trs.sort(key=lambda t: (not t.get("is_direct"), len(t["text"])))
        # préférence : traduction directe, pas de nom propre (phrase de la vie courante), ~8 mots
        names = len(re.findall(r"(?<=\s)[A-Z][a-z]+", en))
        score = (not trs[0].get("is_direct"), names, abs(n - 8))
        if best is None or score < best[0]:
            m = rx.search(en)
            best = (score, [en[:m.start()] + "[" + m.group(0) + "]" + en[m.end():], trs[0]["text"].replace("\u00a0", " ").replace("\u202f", " ").strip()])
    return best[1] if best else None


def main():
    ws = words()
    ex, fq = load("exemples.json"), load("frequences.json")
    new_ex = new_fq = 0
    for w in ws:
        if w not in fq:
            fq[w] = frequency(w)
            new_fq += 1
            print(f"Fréquence {w} : {fq[w]}")
        if w not in ex:
            e = example(w)
            if e:
                ex[w] = e
                new_ex += 1
                print(f"Exemple {w} : {e[0]} / {e[1]}")
            else:
                print(f"Exemple {w} : rien trouvé")
    if new_fq:
        save("frequences.json", fq, compact=True)
    if new_ex:
        save("exemples.json", ex, compact=False)
    print(f"{new_ex} phrase(s), {new_fq} fréquence(s) ajoutée(s).")


if __name__ == "__main__":
    main()
