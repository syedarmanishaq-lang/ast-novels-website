#!/usr/bin/env python3
"""Generate 15 static per-novel SEO landing pages at novels/<slug>.html."""
import json, os, html

BASE = os.path.dirname(os.path.abspath(__file__))
SITE = "https://ast-novels.vercel.app"

# Original 2-3 sentence descriptions, written fresh for these pages.
SEO_DESC = {
"gift-of-the-magi": ("Della and Jim are young, deeply in love, and almost broke on Christmas Eve. "
    "Each secretly sells their most precious possession to buy the other a gift — and O. Henry's famous "
    "twist turns their sacrifice into the wisest gift of all."),
"the-tell-tale-heart": ("A narrator swears he is perfectly sane — then describes, step by step, how he murdered "
    "the old man he lived with and hid the body under the floorboards. But in the silence after the perfect "
    "crime, a sound begins: a heartbeat, growing louder and louder."),
"chandni-raat": ("ہر چاندنی رات دادا جان چھت پر دیا کیوں جلاتے تھے؟ ایک لڑکے، پرانی کتابوں اور ایک پرانے وعدے کی "
    "محبت بھری کہانی — اے ایس ٹی نوولز کی اصل اردو کہانی، مفت پڑھیں۔",
    "Why did Dada Jan light a lamp on the rooftop every moonlit night? A warm original Urdu story of a boy, "
    "old books, and an old promise — free to read on AST Novels."),
"pride-and-prejudice": ("Elizabeth Bennet is sharp, witty, and determined to marry for love — not money. When the "
    "proud, wealthy Mr. Darcy enters her life, first impressions clash spectacularly. Austen's most beloved novel "
    "is a sparkling battle of pride, prejudice, and slow-burning romance."),
"frankenstein": ("Victor Frankenstein unlocks the secret of giving life to dead matter — then flees in horror from "
    "the creature he assembles. Abandoned by his creator, the lonely creature turns to vengeance. The original "
    "science-fiction nightmare about ambition, creation, and responsibility."),
"dracula": ("Count Dracula leaves his Transylvanian castle in a ship crewed by the dead, bound for England. Told "
    "through letters, diaries, and newspaper cuttings, Stoker's masterpiece follows Jonathan Harker, Mina Murray, "
    "and Van Helsing as they hunt the vampire — before he claims them all."),
"alice-in-wonderland": ("Bored on a riverbank, Alice follows a waistcoated White Rabbit down a rabbit hole — and "
    "tumbles into Wonderland. Mad tea parties, a grinning Cheshire Cat, and a Queen who shouts 'Off with their "
    "heads!' Carroll's dream-logic classic delights children and puzzles philosophers alike."),
"sherlock-holmes": ("All twelve original cases of the world's most famous detective — from A Scandal in Bohemia to "
    "The Copper Beeches. With Dr. Watson narrating, Holmes deduces the impossible from a speck of dust at 221B "
    "Baker Street. The stories that invented modern detective fiction."),
"moby-dick": ("Ishmael signs aboard the Pequod and finds himself under Captain Ahab — a monomaniac hunting Moby "
    "Dick, the white whale that took his leg. Part sea adventure, part metaphysical quest, Melville's vast novel "
    "is America's great epic of obsession."),
"treasure-island": ("Young Jim Hawkins finds a treasure map in a dead sailor's chest and sails for Treasure Island "
    "— with Long John Silver and his pirates aboard. Mutiny, a marooned castaway, and buried gold: the adventure "
    "story that defined pirates forever."),
"toba-tek-singh": ("تقسیم کے بعد دونوں ملکوں نے پاگل خانوں کے قیدیوں کے تبادلے کا فیصلہ کیا۔ بشن سنگھ — جو خود کو "
    "ٹوبہ ٹیک سنگھ کا باشندہ کہتا ہے — یہ فیصلہ سمجھ نہیں پاتا۔ منٹو کا سب سے مشہور افسانہ، بٹوارے کی بے حسی پر ایک "
    "کاری ضرب۔"),
"khol-do": ("تقسیم کے فسادات میں سراج الدین کی بیٹی سکینہ گم ہو جاتی ہے۔ جب وہ ملتی ہے تو منٹو کا یہ مختصر افسانہ "
    "انسانی بے حسی کو بے نقاب کر دیتا ہے — اردو ادب کے سب سے دل دہلا دینے والے اختتام کے ساتھ۔"),
"thanda-gosht": ("ایشر سنگھ ایک سرد رات کلونت کور کے پاس آتا ہے، مگر اس کے ہاتھ برف کی طرح ٹھنڈے ہیں۔ منٹو کا متنازع "
    "مگر عظیم افسانہ — جنگ، ہوس اور انسانی نفسیات کا بے رحم مطالعہ۔"),
"iqbal-selected-poetry": ("بانگِ درا سے منتخب نظمیں — 'شکوہ' میں خدا سے امت مسلمہ کی شکایت، 'ہمالہ' میں پہاڑوں سے خطاب، "
    "اور خودی کا لافانی پیغام۔ علامہ اقبال کا کلام اردو شاعری کا فخر ہے — اصل اردو رسم الخط میں مفت پڑھیں۔"),
"ghalib-selected-ghazals": ("دیوانِ غالب سے منتخب مشہور غزلیں — عشق، فلسفہ اور زندگی کے گہرے سوالات، غالب کے لافانی "
    "اشعار میں۔ اردو شاعری کا تاج محل، اصل اردو رسم الخط میں مفت پڑھیں۔"),
}

def esc(s):
    return html.escape(str(s or ""), quote=True)

catalog = json.load(open(os.path.join(BASE, "data/novels/index.json")))
outdir = os.path.join(BASE, "novels")
os.makedirs(outdir, exist_ok=True)

NAV = """<div class="topline"></div>

<nav>
  <div class="nav-inner">
    <a class="brand" href="../index.html">
      <span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#B98A2F" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg></span>
      <span class="brand-name">AST <span>Novels</span></span>
    </a>
    <div class="nav-links">
      <a href="../index.html">Home</a>
      <a href="../library.html">Library</a>
      <a href="../urdu-novels.html">Urdu Novels</a>
      <a href="../authors.html">Authors</a>
      <a href="../about.html">About</a>
      <a href="../library.html" class="btn btn-sm" style="padding:9px 20px">Start Reading</a>
    </div>
    <button class="hamburger" aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  </div>
  <div class="mobile-menu">
    <a href="../index.html">Home</a>
    <a href="../library.html">Library</a>
    <a href="../urdu-novels.html">Urdu Novels</a>
    <a href="../about.html">About</a>
    <a href="../privacy-policy.html">Privacy Policy</a>
  </div>
</nav>"""

FOOTER = """<footer>
  <div class="foot-inner">
    <div class="foot-brand">
      <a class="brand" href="../index.html"><span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#B98A2F" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg></span><span class="brand-name">AST <span>Novels</span></span></a>
      <p>A quiet library of Urdu and English novels — free to read, forever. Crafted by AST Family Studio.</p>
    </div>
    <div class="foot-col"><h4>Library</h4><a href="../library.html">All novels</a><a href="../stats.html">Reading stats</a><a href="#" id="installAppLink">Install app</a><a href="../index.html">Home</a><a href="../about.html">About</a></div>
    <div class="foot-col"><h4>Legal</h4><a href="../privacy-policy.html">Privacy Policy</a><a href="../about.html">Content &amp; Copyright</a></div>
  </div>
  <div class="foot-bottom"><span>&copy; 2026 AST Family Studio. All rights reserved.</span><span>Read free, forever.</span></div>
</footer>"""

made = []
for n in catalog:
    slug = n["slug"]
    title = n["title"]
    author = n["author"]
    lang = n.get("language", "en")
    u = lang == "ur"
    genre = n.get("genre", "")
    year = n.get("year") or ""
    cover = n.get("cover", "img/og.jpg")
    desc_raw = SEO_DESC.get(slug, n.get("description", ""))
    if isinstance(desc_raw, tuple):
        desc_ur, desc_en = desc_raw
        desc = desc_ur + " " + desc_en
        desc_meta = (desc_ur + " " + desc_en)[:155]
    else:
        desc = desc_raw
        desc_meta = desc_raw[:155]
    # chapter count + word count from the novel JSON
    ch_count = 0
    total_words = 0
    nj_path = os.path.join(BASE, "data/novels", slug + ".json")
    if os.path.exists(nj_path):
        try:
            nj = json.load(open(nj_path))
            chs = nj.get("chapters") or []
            ch_count = len(chs)
            for c in chs:
                total_words += len(str(c.get("text") or "").split())
        except Exception:
            pass
    # reading time: ~200 wpm English, ~150 wpm Urdu
    wpm = 150 if lang == "ur" else 200
    rt_min = max(1, -(-total_words // wpm))  # ceil
    if rt_min < 60:
        rt_label = "~%d min read" % rt_min
    else:
        h, m = divmod(rt_min, 60)
        rt_label = ("~%dh %dm read" % (h, m)) if m else ("~%d hr read" % h if h == 1 else "~%d hrs read" % h)

    page_url = SITE + "/novels/" + slug + ".html"
    read_url = "../novel.html?id=" + slug
    title_tag = "%s by %s — Read Free | AST Novels" % (title, author)
    meta_desc = "Read %s by %s online free at AST Novels. %s" % (title if not u else n.get("title_en", title), author, desc_meta)
    meta_desc = meta_desc[:158]
    lang_label = "Urdu" if u else "English"
    in_lang = "ur" if u else "en"
    html_lang = "ur" if u else "en"
    dir_attr = ' dir="rtl" lang="ur"' if u else ' lang="en"'

    ld_book = {
        "@context": "https://schema.org", "@type": "Book",
        "name": title, "author": {"@type": "Person", "name": author},
        "inLanguage": in_lang, "genre": genre,
        "description": desc if not isinstance(desc_raw, tuple) else desc_raw[0] + " " + (desc_raw[1] if len(desc_raw) > 1 else ""),
        "image": SITE + "/" + cover, "url": page_url,
        "bookFormat": "https://schema.org/EBook", "isAccessibleForFree": True,
        "publisher": {"@type": "Organization", "name": "AST Family Studio", "url": SITE + "/"},
    }
    if year and str(year) != "?":
        ld_book["datePublished"] = str(year)
    ld_bc = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Library", "item": SITE + "/library.html"},
            {"@type": "ListItem", "position": 3, "name": title + " by " + author, "item": page_url},
        ],
    }

    ch_line = ("%d chapter%s" % (ch_count, "" if ch_count == 1 else "s")) if ch_count else "Full text"
    desc_html = esc(desc_raw[0]) if isinstance(desc_raw, tuple) else esc(desc)
    if isinstance(desc_raw, tuple):
        desc_block = ('<p class="novel-desc urdu" dir="rtl" lang="ur">%s</p>' % esc(desc_raw[0]) +
                      '<p class="novel-desc" lang="en">%s</p>' % esc(desc_raw[1]))
    else:
        desc_block = '<p class="novel-desc%s"%s>%s</p>' % (" urdu" if u else "", ' dir="rtl"' if u else "", esc(desc))

    page = """<!DOCTYPE html>
<html%(dir_attr)s>
<head>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="../img/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%(title_tag)s</title>
<meta name="description" content="%(meta_desc)s">
<meta name="robots" content="index, follow">
<link rel="canonical" href="%(page_url)s">
<meta property="og:type" content="book">
<meta property="og:site_name" content="AST Novels">
<meta property="og:locale" content="%(og_locale)s">
<meta property="og:title" content="%(title_tag)s">
<meta property="og:description" content="%(meta_desc)s">
<meta property="og:url" content="%(page_url)s">
<meta property="og:image" content="%(cover_abs)s">
<meta property="og:image:alt" content="Cover of %(title)s">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="%(title_tag)s">
<meta name="twitter:description" content="%(meta_desc)s">
<meta name="twitter:image" content="%(cover_abs)s">
<meta name="theme-color" content="#1C1814">
<link rel="manifest" href="../manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Source+Serif+4:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<script type="application/ld+json">
%(ld_book)s
</script>
<script type="application/ld+json">
%(ld_bc)s
</script>
</head>
<body>
%(nav)s

<section style="padding-top:56px">
  <div class="wrap">
    <div class="novel-hero">
      <div class="novel-cover"><img src="../%(cover)s" alt="Cover of %(title)s" loading="eager"></div>
      <div class="novel-info">
        <div class="kicker">%(genre)s &middot; %(lang_label)s%(year_line)s</div>
        <h1 class="%(urdu_cls)s">%(title)s</h1>
        <div class="author">by <b>%(author)s</b></div>
        <div class="tag-row">
          <span class="tag">%(ch_line)s</span>
          <span class="tag">%(rt_label)s</span>
          <span class="tag">Free forever</span>
          <span class="tag">No signup</span>
        </div>
        %(desc_block)s
        <div class="novel-actions">
          <a class="btn" href="%(read_url)s">Start reading &rarr;</a>
          <a class="btn btn-ghost" href="../library.html">All novels</a>
        </div>
      </div>
    </div>
    <div class="chapter-section">
      <h2 class="serif sec-title" style="font-size:28px;margin-bottom:14px">Why read it here</h2>
      <p class="sec-sub" style="max-width:720px">Read <b>%(title)s</b> free on AST Novels — the full text in a beautiful, distraction-free reader with day, sepia and night themes, read-aloud, offline reading and your progress saved automatically. No account, no signup, no cost.</p>
      <p><a class="btn" href="%(read_url)s">Read %(short_title)s now &rarr;</a></p>
    </div>
  </div>
</section>

%(footer)s

<script src="../js/main.js"></script>
</body>
</html>
""" % {
        "dir_attr": dir_attr,
        "title_tag": esc(title_tag),
        "meta_desc": esc(meta_desc),
        "page_url": page_url,
        "og_locale": "ur_PK" if u else "en_US",
        "cover_abs": SITE + "/" + cover,
        "cover": esc(cover),
        "title": esc(title),
        "short_title": esc(n.get("title_en", title) if u else title),
        "ld_book": json.dumps(ld_book, ensure_ascii=False, indent=2),
        "ld_bc": json.dumps(ld_bc, ensure_ascii=False, indent=2),
        "nav": NAV,
        "footer": FOOTER,
        "genre": esc(genre),
        "lang_label": lang_label,
        "year_line": (" &middot; " + esc(str(year))) if year and str(year) != "?" else "",
        "urdu_cls": "urdu" if u else "",
        "author": esc(author),
        "ch_line": ch_line,
        "rt_label": rt_label,
        "desc_block": desc_block,
        "read_url": read_url,
    }

    with open(os.path.join(outdir, slug + ".html"), "w", encoding="utf-8") as f:
        f.write(page)
    made.append(slug)

print("Generated %d pages:" % len(made))
for s in made:
    print(" -", s)
