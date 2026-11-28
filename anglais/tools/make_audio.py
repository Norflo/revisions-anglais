#!/usr/bin/env python3
"""Fabrique les sons de prononciation (anglais/site/audio/<slug>.mp3) avec une voix neuronale.

- Voix : anglais/tools/voice.txt (une ligne, ex. en-US-AvaNeural).
- Ne fabrique que les sons manquants, sauf si la voix a changé (alors tout est refait).
- Nettoyage : silences et petits bruits de début/fin retirés, fondu très court (pas de clic),
  0,3 s de silence avant et après (sinon le début est coupé sur Android), volume égalisé.

Usage : python3 make_audio.py anglais/site          (mots de DATA + phrases d'exemple → audio/)
        python3 make_audio.py anglais/site --top    (3000 mots courants, top3000.json → audio3000/)
        python3 make_audio.py anglais/site --big [--max N]   (20 000 mots, words20k.txt → audio20k/ ;
                                                 N sons au plus par appel ; pas de versions.json)
"""
import asyncio
import hashlib
import json
import pathlib
import re
import subprocess
import sys

import edge_tts

SITE = pathlib.Path(sys.argv[1])
TOP = "--top" in sys.argv[2:]
BIG = "--big" in sys.argv[2:]
MAX = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 0
AUDIO = SITE / ("audio20k" if BIG else "audio3000" if TOP else "audio")
TOOLS = pathlib.Path(__file__).resolve().parent
VOICE = (TOOLS / "voice.txt").read_text().strip()
STAMP = AUDIO / "voice.txt"


def slug(s):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def words():
    if BIG:
        return [w for w in (SITE / "words20k.txt").read_text(encoding="utf-8").split("\n") if w.strip()]
    if TOP:
        return [d[0] for d in json.loads((SITE / "top3000.json").read_text(encoding="utf-8"))]
    html = (SITE / "index.html").read_text(encoding="utf-8")
    m = re.search(r"const DATA = \[(.*?)\n\];", html, re.S)
    return [d[0] for d in json.loads("[" + m.group(1) + "]")]


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def clean(raw, out):
    tmp = out.with_suffix(".tmp.wav")
    # 1) retire le silence (et les petits bruits faibles) au début et à la fin
    run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-ac", "1", "-ar", "44100", "-af",
         "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01,"
         "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,"
         "afade=t=in:d=0.012", str(tmp)])
    # 2) mesure le pic pour égaliser le volume (pic à -1,5 dB)
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(tmp), "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr)
    gain = -1.5 - float(m.group(1)) if m else 0.0
    # 3) fondu de fin, gain, 0,3 s de silence avant et après, mp3
    dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                     "-of", "csv=p=0", str(tmp)]).stdout.strip())
    run(["ffmpeg", "-y", "-v", "error", "-i", str(tmp), "-af",
         f"afade=t=out:st={max(0.0, dur - 0.03):.3f}:d=0.03,volume={gain:.2f}dB,"
         "adelay=300:all=1,apad=pad_dur=0.3",
         "-ac", "1", "-ar", "44100", "-b:a", "96k", str(out)])
    tmp.unlink()


def examples():
    f = SITE / "exemples.json"
    if TOP or BIG or not f.exists():
        return {}
    return {w: v[0].replace("[", "").replace("]", "") for w, v in json.loads(f.read_text(encoding="utf-8")).items()}


async def make(text, sem, name=None):
    name = name or slug(text)
    out = AUDIO / f"{name}.mp3"
    raw = AUDIO / f"{name}.raw.mp3"
    t = text.strip()
    if t[-1] not in ".!?":
        t += "."
    async with sem:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(t, VOICE, rate="-8%").save(str(raw))
                break
            except Exception as e:  # réseau capricieux : on réessaie
                if attempt == 2:
                    raise
                await asyncio.sleep(2 + attempt * 3)
        await asyncio.to_thread(clean, raw, out)
        raw.unlink()
        print("ok", out.name, flush=True)


async def main():
    AUDIO.mkdir(parents=True, exist_ok=True)
    redo_all = not STAMP.exists() or STAMP.read_text().strip() != VOICE
    if BIG:
        # 20 000 sons faits par paquets : on ne refait jamais tout (sinon chaque paquet recommencerait
        # au début). Pour changer de voix ici, supprimer le dossier audio20k.
        redo_all = False
    todo = [(w, slug(w)) for w in words() if redo_all or not (AUDIO / f"{slug(w)}.mp3").exists()]
    # Phrases d'exemple (exercice « En contexte ») : audio/ex-<slug>.mp3, refaites si la phrase change.
    done = {}
    stamp_ex = AUDIO / "exemples.txt"
    if stamp_ex.exists() and not redo_all:
        for line in stamp_ex.read_text(encoding="utf-8").splitlines():
            k, _, v = line.partition("\t")
            done[k] = v
    ex = examples()
    for w, sentence in ex.items():
        name = "ex-" + slug(w)
        if redo_all or done.get(name) != sentence or not (AUDIO / f"{name}.mp3").exists():
            todo.append((sentence, name))
    print(f"Voix {VOICE} — {len(todo)} son(s) à fabriquer" + (" (tous)" if redo_all else ""))
    left = 0
    if MAX and len(todo) > MAX:
        left = len(todo) - MAX; todo = todo[:MAX]
    sem = asyncio.Semaphore(10 if BIG else 8 if TOP else 4)
    # Un son qui échoue (réseau) n'arrête pas les autres : il sera refait au prochain passage.
    res = await asyncio.gather(*(make(t, sem, n) for t, n in todo), return_exceptions=True)
    bad = [n for (t, n), r in zip(todo, res) if isinstance(r, Exception)]
    if bad:
        print(f"{len(bad)} son(s) en échec, refaits au prochain passage : {', '.join(bad[:20])}")
    if not (TOP or BIG):
        stamp_ex.write_text("".join(f"ex-{slug(w)}\t{s}\n" for w, s in ex.items()), encoding="utf-8")
    if ((not bad or TOP) and not left) or BIG:
        STAMP.write_text(VOICE + "\n")
    print(f"reste {left + len(bad)}")
    if BIG:
        return   # 20 000 sons : pas de versions.json (l'appli essaie directement audio20k/<mot>.mp3)
    # versions.json : une empreinte par son. L'appli l'ajoute à l'adresse du son (?v=…) :
    # un son refait sous le même nom (phrase changée, nouvelle voix) n'est plus confondu avec l'ancien.
    vers = {f.stem: hashlib.md5(f.read_bytes()).hexdigest()[:8] for f in sorted(AUDIO.glob("*.mp3"))}
    (AUDIO / "versions.json").write_text(
        "{\n" + ",\n".join(f'"{k}": "{v}"' for k, v in vers.items()) + "\n}\n", encoding="utf-8")


asyncio.run(main())
