/**
 * AddSubstances.gs — a one-off import. Run it once, then delete this file.
 *
 * Adds the substances that keep coming up in school and A Level chemistry —
 * ammonia, chlorine, sulfuric acid and the rest — to the "General" folder.
 * The English name is the word, the Japanese name the definition, and the
 * note is the formula followed by the one thing worth remembering about it.
 *
 * Names follow the spelling the exam boards use: sulfur (not sulphur),
 * aluminium, ethanoic acid with the everyday name in brackets after the
 * Japanese. Roman numerals mark the oxidation state where a metal has more
 * than one, as in copper(II) sulfate.
 *
 * How to run it
 *   1. Paste this file into the same Apps Script project as Code.gs — it uses
 *      the helpers there, so Code.gs must already be the current version.
 *   2. Pick addSubstances in the function list and press Run.
 *   3. Read the log for the count.
 *
 * Safe to run twice: a substance already in the folder is skipped, and
 * nothing already in the sheet is modified. All rows go in with one write.
 */

var SUBSTANCE_FOLDER = 'General';

/** [English name, part of speech, Japanese name, formula and note] */
var SUBSTANCES = [
  // --- Gases and the elements they come from -------------------------------
  ['hydrogen', 'Noun', '水素',
   'H₂ — 最も軽い気体。火を近づけるとポンと音を立てて燃える（水素の検出法）。'],
  ['oxygen', 'Noun', '酸素',
   'O₂ — 空気の約21%。火のついた線香を入れると炎を上げて燃える（酸素の検出法）。'],
  ['nitrogen', 'Noun', '窒素',
   'N₂ — 空気の約78%。三重結合で非常に安定し、常温ではほとんど反応しない。'],
  ['chlorine', 'Noun', '塩素',
   'Cl₂ — 黄緑色で刺激臭のある有毒な気体。水に溶けて漂白作用を示す。'],
  ['fluorine', 'Noun', 'フッ素',
   'F₂ — 淡黄色の気体。ハロゲンの中で最も反応性が高く、電気陰性度も最大。'],
  ['bromine', 'Noun', '臭素',
   'Br₂ — 常温で液体の唯一の非金属。赤褐色で、蒸気は刺激臭をもつ。'],
  ['iodine', 'Noun', 'ヨウ素',
   'I₂ — 黒紫色の固体。加熱すると昇華して紫色の蒸気になる。デンプンで青紫色。'],
  ['helium', 'Noun', 'ヘリウム',
   'He — 単原子分子の希ガス。反応せず、水素に次いで軽い。'],
  ['neon', 'Noun', 'ネオン',
   'Ne — 希ガス。放電すると赤橙色に光る。'],
  ['argon', 'Noun', 'アルゴン',
   'Ar — 空気中に約0.9%含まれる希ガス。電球の封入ガスに使われる。'],
  ['ozone', 'Noun', 'オゾン',
   'O₃ — 酸素の同素体。淡青色で特異臭をもち、紫外線を吸収する。'],
  ['hydrogen sulfide', 'Noun', '硫化水素',
   'H₂S — 腐卵臭のある有毒な気体。水に溶けて弱酸性を示す。'],
  ['ammonia', 'Noun', 'アンモニア',
   'NH₃ — 無色で刺激臭のある気体。水に非常によく溶けて弱塩基性を示す。'],
  ['carbon dioxide', 'Noun', '二酸化炭素',
   'CO₂ — 石灰水を白く濁らせる（二酸化炭素の検出法）。水に溶けて弱酸性。'],
  ['carbon monoxide', 'Noun', '一酸化炭素',
   'CO — 無色無臭で猛毒。不完全燃焼で生じ、ヘモグロビンと強く結合する。'],
  ['sulfur dioxide', 'Noun', '二酸化硫黄',
   'SO₂ — 刺激臭のある気体。漂白作用があり、酸性雨の原因のひとつ。'],
  ['sulfur trioxide', 'Noun', '三酸化硫黄',
   'SO₃ — 水と激しく反応して硫酸になる。接触法の中間生成物。'],
  ['nitrogen monoxide', 'Noun', '一酸化窒素',
   'NO — 無色の気体。空気に触れるとすぐ酸化されて二酸化窒素になる。'],
  ['nitrogen dioxide', 'Noun', '二酸化窒素',
   'NO₂ — 赤褐色で刺激臭のある有毒な気体。酸性雨と光化学スモッグの原因。'],
  ['hydrogen chloride', 'Noun', '塩化水素',
   'HCl — 刺激臭のある気体。水に溶けると塩酸になる。アンモニアと白煙を生じる。'],

  // --- Metals ---------------------------------------------------------------
  ['lithium', 'Noun', 'リチウム',
   'Li — 最も軽い金属。アルカリ金属で、炎色反応は深赤色。'],
  ['sodium', 'Noun', 'ナトリウム',
   'Na — アルカリ金属。水と激しく反応して水素を発生。炎色反応は黄色。'],
  ['potassium', 'Noun', 'カリウム',
   'K — ナトリウムより反応性が高いアルカリ金属。炎色反応は淡紫色。'],
  ['magnesium', 'Noun', 'マグネシウム',
   'Mg — 白く強い光を放って燃える金属。酸と反応して水素を発生する。'],
  ['calcium', 'Noun', 'カルシウム',
   'Ca — アルカリ土類金属。水と反応して水酸化カルシウムと水素になる。炎色反応は橙赤色。'],
  ['barium', 'Noun', 'バリウム',
   'Ba — アルカリ土類金属。炎色反応は黄緑色。硫酸バリウムは水に溶けない。'],
  ['aluminium', 'Noun', 'アルミニウム',
   'Al — 軽く、表面の酸化被膜で錆びにくい金属。両性で、酸にも強塩基にも溶ける。'],
  ['iron', 'Noun', '鉄',
   'Fe — 代表的な遷移金属。2価と3価のイオンをとり、湿った空気中で錆びる。'],
  ['copper', 'Noun', '銅',
   'Cu — 赤色の金属で電気をよく通す。イオンは水溶液中で青色。'],
  ['zinc', 'Noun', '亜鉛',
   'Zn — 両性金属。トタンの防食（犠牲防食）や乾電池に使われる。'],
  ['silver', 'Noun', '銀',
   'Ag — 電気伝導性が最も高い金属。ハロゲン化物は感光性をもつ。'],
  ['gold', 'Noun', '金',
   'Au — 反応性が非常に低く、王水にしか溶けない。'],
  ['lead', 'Noun', '鉛',
   'Pb — 重くやわらかい金属。化合物は有毒で、水道管には使われなくなった。'],
  ['tin', 'Noun', 'スズ',
   'Sn — 錆びにくい金属。鉄にめっきしてブリキにする。'],
  ['nickel', 'Noun', 'ニッケル',
   'Ni — 遷移金属。触媒（アルケンの水素化など）やステンレス鋼の成分。'],
  ['mercury', 'Noun', '水銀',
   'Hg — 常温で液体の唯一の金属。蒸気は有毒。'],
  ['platinum', 'Noun', '白金',
   'Pt — 反応性が低く、触媒や電極に使われる貴金属。'],
  ['manganese', 'Noun', 'マンガン',
   'Mn — 遷移金属。+7価の過マンガン酸イオンは強い酸化剤で濃紫色。'],
  ['chromium', 'Noun', 'クロム',
   'Cr — 遷移金属。+6価の二クロム酸イオンは橙色の酸化剤。めっきにも使う。'],
  ['titanium', 'Noun', 'チタン',
   'Ti — 軽くて強く、腐食に強い金属。航空機や人工関節に使われる。'],

  // --- Non-metals and their forms ------------------------------------------
  ['carbon', 'Noun', '炭素',
   'C — 有機化合物の骨格をなす元素。黒鉛・ダイヤモンドなどの同素体をもつ。'],
  ['graphite', 'Noun', '黒鉛（グラファイト）',
   'C — 炭素の同素体。層状構造で、層間がずれるためやわらかく電気を通す。'],
  ['diamond', 'Noun', 'ダイヤモンド',
   'C — 炭素の同素体。正四面体状の共有結合結晶で、最も硬く電気を通さない。'],
  ['sulfur', 'Noun', '硫黄',
   'S₈ — 黄色の固体。燃えると二酸化硫黄になる。硫酸の原料。'],
  ['phosphorus', 'Noun', 'リン',
   'P₄ — 白リンは空気中で自然発火する。肥料やマッチに使われる。'],
  ['silicon', 'Noun', 'ケイ素',
   'Si — 半導体の材料。地殻中で酸素に次いで多い元素。'],

  // --- Oxides ---------------------------------------------------------------
  ['water', 'Noun', '水',
   'H₂O — 水素結合のため、分子量の割に沸点が非常に高い。多くの物質を溶かす。'],
  ['hydrogen peroxide', 'Noun', '過酸化水素',
   'H₂O₂ — 酸化剤。触媒（二酸化マンガンなど）で分解し、酸素を発生する。'],
  ['calcium oxide', 'Noun', '酸化カルシウム（生石灰）',
   'CaO — 炭酸カルシウムを強熱して得る。水を加えると発熱して消石灰になる。'],
  ['magnesium oxide', 'Noun', '酸化マグネシウム',
   'MgO — マグネシウムが燃えてできる白色固体。塩基性酸化物。'],
  ['aluminium oxide', 'Noun', '酸化アルミニウム',
   'Al₂O₃ — 両性酸化物。融点が高く、アルミナとして耐火物や触媒担体に使う。'],
  ['iron(III) oxide', 'Noun', '酸化鉄(III)',
   'Fe₂O₃ — 赤褐色。鉄鉱石の主成分で、高炉で還元して鉄を得る。'],
  ['copper(II) oxide', 'Noun', '酸化銅(II)',
   'CuO — 黒色の固体。水素や炭素で還元すると赤色の銅になる。'],
  ['zinc oxide', 'Noun', '酸化亜鉛',
   'ZnO — 白色の両性酸化物。加熱すると黄色くなり、冷えると白に戻る。'],
  ['silicon dioxide', 'Noun', '二酸化ケイ素',
   'SiO₂ — 石英・砂の主成分。共有結合結晶で融点が非常に高い。'],

  // --- Acids ----------------------------------------------------------------
  ['hydrochloric acid', 'Noun', '塩酸',
   'HCl(aq) — 塩化水素の水溶液。強酸で、胃液にも含まれる。'],
  ['sulfuric acid', 'Noun', '硫酸',
   'H₂SO₄ — 二価の強酸。濃硫酸は脱水作用と吸湿性をもち、希硫酸は金属と反応する。'],
  ['nitric acid', 'Noun', '硝酸',
   'HNO₃ — 強酸で強い酸化剤。光で分解するため褐色瓶に保存する。'],
  ['phosphoric acid', 'Noun', 'リン酸',
   'H₃PO₄ — 三価の中程度の酸。肥料や清涼飲料の酸味料に使われる。'],
  ['carbonic acid', 'Noun', '炭酸',
   'H₂CO₃ — 二酸化炭素が水に溶けてできる弱酸。容易に水と二酸化炭素に戻る。'],
  ['ethanoic acid', 'Noun', '酢酸（エタン酸）',
   'CH₃COOH — 代表的なカルボン酸。弱酸で、食酢に約4〜5%含まれる。'],

  // --- Bases and alkalis ----------------------------------------------------
  ['sodium hydroxide', 'Noun', '水酸化ナトリウム',
   'NaOH — 強塩基。潮解性があり、皮膚を侵す。中和滴定の標準的な塩基。'],
  ['potassium hydroxide', 'Noun', '水酸化カリウム',
   'KOH — 水酸化ナトリウムと同じく強塩基。アルカリ電池の電解液に使う。'],
  ['calcium hydroxide', 'Noun', '水酸化カルシウム（消石灰）',
   'Ca(OH)₂ — 水に少し溶けて強塩基性を示す。土壌の酸性を中和するのに使う。'],
  ['limewater', 'Noun', '石灰水',
   'Ca(OH)₂(aq) — 水酸化カルシウムの飽和水溶液。二酸化炭素で白濁する。'],
  ['ammonia solution', 'Noun', 'アンモニア水',
   'NH₃(aq) — アンモニアの水溶液。弱塩基で、金属イオンの沈殿反応に使う。'],

  // --- Salts and reagents ---------------------------------------------------
  ['sodium chloride', 'Noun', '塩化ナトリウム',
   'NaCl — 食塩。イオン結晶で、融解または水溶液にすると電気を通す。'],
  ['calcium carbonate', 'Noun', '炭酸カルシウム',
   'CaCO₃ — 石灰石・大理石・貝殻の主成分。酸と反応して二酸化炭素を出す。'],
  ['sodium carbonate', 'Noun', '炭酸ナトリウム',
   'Na₂CO₃ — 水に溶けて塩基性を示す。ガラスや洗剤の原料。'],
  ['sodium hydrogencarbonate', 'Noun', '炭酸水素ナトリウム（重曹）',
   'NaHCO₃ — 加熱すると二酸化炭素を出す。ふくらし粉や胃薬に使われる。'],
  ['ammonium chloride', 'Noun', '塩化アンモニウム',
   'NH₄Cl — 塩基を加えて加熱するとアンモニアが発生する（アンモニウムイオンの検出）。'],
  ['ammonium nitrate', 'Noun', '硝酸アンモニウム',
   'NH₄NO₃ — 窒素肥料。水に溶けるとき吸熱するため、瞬間冷却剤にも使われる。'],
  ['ammonium sulfate', 'Noun', '硫酸アンモニウム',
   '(NH₄)₂SO₄ — 硫安と呼ばれる窒素肥料。アンモニアと硫酸の中和で得る。'],
  ['copper(II) sulfate', 'Noun', '硫酸銅(II)',
   'CuSO₄ — 無水物は白色、五水和物 CuSO₄·5H₂O は青色。水の検出に使う。'],
  ['silver nitrate', 'Noun', '硝酸銀',
   'AgNO₃ — ハロゲン化物イオンの検出に使う。塩化物は白、臭化物は淡黄、ヨウ化物は黄色の沈殿。'],
  ['barium chloride', 'Noun', '塩化バリウム',
   'BaCl₂ — 硫酸イオンの検出に使う。白色の硫酸バリウムが沈殿する。'],
  ['lead(II) nitrate', 'Noun', '硝酸鉛(II)',
   'Pb(NO₃)₂ — 水に溶ける数少ない鉛塩。ヨウ化物と黄色の沈殿をつくる。'],
  ['potassium iodide', 'Noun', 'ヨウ化カリウム',
   'KI — ヨウ素を溶かしてヨウ素溶液にする。塩素水と反応してヨウ素を遊離する。'],
  ['potassium manganate(VII)', 'Noun', '過マンガン酸カリウム',
   'KMnO₄ — 濃紫色の強い酸化剤。酸性条件で還元されると無色になる。'],
  ['potassium dichromate(VI)', 'Noun', '二クロム酸カリウム',
   'K₂Cr₂O₇ — 橙色の酸化剤。還元されると緑色のクロム(III)になる。'],
  ['sodium thiosulfate', 'Noun', 'チオ硫酸ナトリウム',
   'Na₂S₂O₃ — ヨウ素滴定の標準液。写真の定着にも使われた。'],
  ['calcium chloride', 'Noun', '塩化カルシウム',
   'CaCl₂ — 潮解性があり乾燥剤に使う。凍結防止剤としても使われる。'],
  ['magnesium sulfate', 'Noun', '硫酸マグネシウム',
   'MgSO₄ — 七水和物はエプソム塩。乾燥剤や入浴剤に使われる。'],
  ['potassium nitrate', 'Noun', '硝酸カリウム',
   'KNO₃ — 水によく溶ける。黒色火薬の酸化剤、肥料に使われる。'],
  ['bromine water', 'Noun', '臭素水',
   'Br₂(aq) — 橙色の水溶液。アルケンを加えると脱色される（不飽和の検出）。'],

  // --- Organic compounds ----------------------------------------------------
  ['methane', 'Noun', 'メタン',
   'CH₄ — 最も簡単なアルカン。天然ガスの主成分で、強力な温室効果ガス。'],
  ['ethane', 'Noun', 'エタン',
   'C₂H₆ — 炭素2個のアルカン。天然ガスに含まれる。'],
  ['propane', 'Noun', 'プロパン',
   'C₃H₈ — 炭素3個のアルカン。液化して燃料に使われる。'],
  ['butane', 'Noun', 'ブタン',
   'C₄H₁₀ — 炭素4個のアルカン。直鎖と枝分かれの構造異性体をもつ。'],
  ['ethene', 'Noun', 'エテン（エチレン）',
   'C₂H₄ — 最も簡単なアルケン。二重結合をもち、ポリエチレンの原料。'],
  ['ethyne', 'Noun', 'エチン（アセチレン）',
   'C₂H₂ — 三重結合をもつアルキン。酸素と燃やすと高温の炎になる。'],
  ['benzene', 'Noun', 'ベンゼン',
   'C₆H₆ — 六員環の芳香族炭化水素。非局在化した電子で安定し、置換反応を起こす。'],
  ['methanol', 'Noun', 'メタノール',
   'CH₃OH — 最も簡単なアルコール。有毒で、飲むと失明の危険がある。'],
  ['ethanol', 'Noun', 'エタノール',
   'C₂H₅OH — 酒類に含まれるアルコール。発酵や、エテンの水和で得られる。'],
  ['propanone', 'Noun', 'プロパノン（アセトン）',
   'CH₃COCH₃ — 最も簡単なケトン。多くの有機物を溶かす溶媒。'],
  ['ethanal', 'Noun', 'エタナール（アセトアルデヒド）',
   'CH₃CHO — エタノールを酸化すると生じるアルデヒド。さらに酸化すると酢酸。'],
  ['glucose', 'Noun', 'グルコース（ブドウ糖）',
   'C₆H₁₂O₆ — 単糖。呼吸の基質であり、光合成の産物。'],
  ['sucrose', 'Noun', 'スクロース（ショ糖）',
   'C₁₂H₂₂O₁₁ — グルコースとフルクトースからなる二糖。砂糖の主成分。'],
  ['starch', 'Noun', 'デンプン',
   '(C₆H₁₀O₅)ₙ — グルコースが多数つながった多糖。ヨウ素溶液で青紫色になる。'],
  ['urea', 'Noun', '尿素',
   'CO(NH₂)₂ — 窒素肥料に使われる。最初に人工合成された有機化合物。'],
  ['poly(ethene)', 'Noun', 'ポリエチレン',
   '(C₂H₄)ₙ — エテンの付加重合でできる。袋や容器に使われる代表的な樹脂。'],
];

/* --- The import ----------------------------------------------------------- */
/* Names here are distinct from the other import files, so any of them can sit
   in the same project without quietly replacing each other's helpers. */

function ensureSubstanceFolder_() {
  var folders = listFolders_();
  for (var i = 0; i < folders.length; i++) {
    if (folders[i].name.toLowerCase() === SUBSTANCE_FOLDER.toLowerCase()) return folders[i];
  }
  var created = createFolder_(SUBSTANCE_FOLDER);
  Logger.log('Created folder "%s".', SUBSTANCE_FOLDER);
  return created;
}

function addSubstances() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var width = schema.width;
  var folder = ensureSubstanceFolder_().name;

  // What is already in the folder, so a second run adds nothing twice.
  var seen = {};
  var existing = listWords_();
  for (var e = 0; e < existing.length; e++) {
    if ((existing[e].folder || '').toLowerCase() === folder.toLowerCase()) {
      seen[existing[e].word.toLowerCase()] = true;
    }
  }

  var now = new Date().toISOString();
  var rows = [];
  var skipped = 0;

  for (var i = 0; i < SUBSTANCES.length; i++) {
    var entry = SUBSTANCES[i];
    if (seen[entry[0].toLowerCase()]) {
      skipped += 1;
      continue;
    }
    seen[entry[0].toLowerCase()] = true;

    // Through the same validation every saved word goes through.
    var fields = validate_({
      word: entry[0], pos: entry[1], definition: entry[2], note: entry[3],
      color: 'default', folder: folder, status: ''
    });
    rows.push(wordToRow_(buildRecord_(fields, Utilities.getUuid(), now, now), schema.map, width));
  }

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
  }

  Logger.log('Added %s substance(s) to "%s".', rows.length, folder);
  if (skipped) Logger.log('Skipped %s already in that folder.', skipped);
  Logger.log('Done. The app picks these up on its next sync.');
}
