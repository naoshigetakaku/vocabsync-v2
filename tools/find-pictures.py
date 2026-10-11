#!/usr/bin/env python3
"""Collects a picture for each word, on a machine DuckDuckGo will answer.

Apps Script cannot do this. It fetches from Google's network, and DuckDuckGo
turns that away — half the attempts never open a connection and the other half
come back as a page with no search token in it. So the lookup happens here
instead, and the result is handed back as a file the Apps Script project can
read without fetching anything.

    1. In Apps Script, run logWordsForPictures(). Copy the array from the log
       into a file, say words.json.
    2. python3 tools/find-pictures.py words.json
    3. Paste the PictureData.gs it writes into the Apps Script project and run
       applyPictures().

It keeps a cache beside the output and skips anything already in it, so a run
that is interrupted — or rate-limited half way — can simply be run again.

Usage:
    find-pictures.py WORDS.json [--out PictureData.gs] [--cache pictures-cache.json]
    find-pictures.py WORDS.csv  [...]          # a sheet exported as CSV
"""

import argparse
import csv
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/17.0 Safari/605.1.15')

MIN_WIDTH = 400
PAUSE = (0.7, 1.4)       # a human-ish gap, so a long run is not a flood
BACKOFF = (5, 15, 45)    # when the search starts refusing, wait and retry


def fetch(url, referer=None):
    headers = {'User-Agent': UA}
    if referer:
        headers['Referer'] = referer
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read().decode('utf-8', 'replace')


def token_for(word):
    page = fetch('https://duckduckgo.com/?q=%s&iax=images&ia=images'
                 % urllib.parse.quote(word))
    # The page writes it both bare and quoted; accept either.
    match = re.search(r'vqd=["\']?([-0-9a-zA-Z]+)', page)
    return match.group(1) if match else None


def search(word):
    """The first portrait result, or None. Raises on a refusal worth retrying."""
    token = token_for(word)
    if not token:
        raise RuntimeError('no search token (rate limited?)')

    raw = fetch('https://duckduckgo.com/i.js?l=us-en&o=json&f=,,,&p=1&q=%s&vqd=%s'
                % (urllib.parse.quote(word), urllib.parse.quote(token)),
                referer='https://duckduckgo.com/')
    results = json.loads(raw).get('results', [])

    for hit in results:
        width, height = hit.get('width', 0), hit.get('height', 0)
        image = hit.get('image', '')
        if height <= width:                     # portrait only: the card is
            continue
        if width < MIN_WIDTH:                   # too small to be a photograph
            continue
        if not image.startswith('https://'):
            continue
        return {'image': image, 'thumb': hit.get('thumbnail', ''),
                'width': width, 'height': height, 'title': hit.get('title', '')}

    return {'image': '', 'thumb': '', 'why': '%d results, none portrait' % len(results)}


def with_retries(word):
    for attempt, wait in enumerate([0] + list(BACKOFF)):
        if wait:
            print('      backing off %ss' % wait, file=sys.stderr)
            time.sleep(wait)
        try:
            return search(word)
        except (RuntimeError, urllib.error.URLError, json.JSONDecodeError) as error:
            last = error
    return {'image': '', 'thumb': '', 'why': 'gave up: %s' % last}


def read_words(path):
    if path.lower().endswith('.csv'):
        with open(path, newline='', encoding='utf-8') as handle:
            rows = list(csv.DictReader(handle))
        # A sheet exported as CSV: take the word column, skip ones already done.
        return [r['word'].strip() for r in rows
                if r.get('word', '').strip() and not r.get('image', '').strip()]
    with open(path, encoding='utf-8') as handle:
        return [str(w).strip() for w in json.load(handle) if str(w).strip()]


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('words', help='JSON array of words, or a CSV export of the sheet')
    parser.add_argument('--out', default='PictureData.gs')
    parser.add_argument('--cache', default='pictures-cache.json')
    parser.add_argument('--limit', type=int, default=0, help='stop after N lookups')
    args = parser.parse_args()

    words = read_words(args.words)
    cache = {}
    if os.path.exists(args.cache):
        with open(args.cache, encoding='utf-8') as handle:
            cache = json.load(handle)

    todo = [w for w in words if w.lower() not in cache]
    if args.limit:
        todo = todo[:args.limit]

    print('%d word(s), %d already cached, %d to look up'
          % (len(words), len(words) - len(todo), len(todo)), file=sys.stderr)

    found = sum(1 for v in cache.values() if v.get('image'))
    for index, word in enumerate(todo, 1):
        hit = with_retries(word)
        cache[word.lower()] = hit
        if hit.get('image'):
            found += 1
            print('%4d/%d  %-28s %dx%d' % (index, len(todo), word[:28],
                                           hit['width'], hit['height']), file=sys.stderr)
        else:
            print('%4d/%d  %-28s %s' % (index, len(todo), word[:28], hit.get('why', '')),
                  file=sys.stderr)

        # Written every time, so an interrupted run loses nothing.
        with open(args.cache, 'w', encoding='utf-8') as handle:
            json.dump(cache, handle, ensure_ascii=False, indent=1)
        time.sleep(random.uniform(*PAUSE))

    pictures = {w: {'image': h['image'], 'thumb': h.get('thumb', '')}
                for w, h in sorted(cache.items()) if h.get('image')}

    with open(args.out, 'w', encoding='utf-8') as handle:
        handle.write('/**\n'
                     ' * PictureData.gs — generated by tools/find-pictures.py. Do not edit.\n'
                     ' *\n'
                     ' * One entry per word that has a picture, keyed by the word in lower\n'
                     ' * case. applyPictures() in FindPictures.gs writes these into the\n'
                     ' * sheet; nothing here fetches anything.\n'
                     ' *\n'
                     ' * %d word(s).\n'
                     ' */\n\n' % len(pictures))
        handle.write('var PICTURES = ')
        handle.write(json.dumps(pictures, ensure_ascii=False, indent=2))
        handle.write(';\n')

    print('\nwrote %s with %d picture(s) of %d word(s)'
          % (args.out, len(pictures), len(cache)), file=sys.stderr)


if __name__ == '__main__':
    main()
