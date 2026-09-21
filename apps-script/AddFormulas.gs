/**
 * AddFormulas.gs — a one-off import. Run it once, then delete this file.
 *
 * Adds the formulas from the 図形と方程式 and 三角比・三角関数 sections of
 * naoshigetakaku.github.io/koukousugaku/ as words in one folder,
 * "Geometry & Trig". The title is the formula's English name, the definition
 * its Japanese name, and the note the formula itself — fractions written as
 * a/b and roots as √(…), so they read as plain text in the app.
 *
 * How to run it
 *   1. Paste this file into the same Apps Script project as Code.gs — it uses
 *      the helpers there, so Code.gs must already be the current version.
 *   2. Pick addFormulas in the function list and press Run.
 *   3. Read the log for the count.
 *
 * Safe to run twice: a formula already in the folder is skipped, and nothing
 * already in the sheet is modified. All rows go in with a single write.
 */

var FORMULA_FOLDER = 'Geometry & Trig';

/** [English name, part of speech, Japanese name, the formula] */
var FORMULAS = [
  ["Distance Between Two Points", "Noun",
   "2 点間の距離",
   "AB = √((x₂ − x₁)² + (y₂ − y₁)²)"],
  ["Section Formula", "Noun",
   "内分点・外分点",
   "m : n に内分　( (nx₁ + mx₂)/(m + n) , (ny₁ + my₂)/(m + n) )\nm : n に外分　( (−nx₁ + mx₂)/(m − n) , (−ny₁ + my₂)/(m − n) )"],
  ["Centroid of a Triangle", "Noun",
   "三角形の重心",
   "G ( (x₁ + x₂ + x₃)/3 , (y₁ + y₂ + y₃)/3 )"],
  ["Equation of a Straight Line", "Noun",
   "直線の方程式",
   "傾き m・点 (x₁, y₁) 通過　y − y₁ = m(x − x₁)\n2 点通過　y − y₁ = (y₂ − y₁)/(x₂ − x₁) (x − x₁)\n切片形　x/a + y/b = 1"],
  ["Parallel and Perpendicular Lines", "Noun",
   "平行・垂直条件",
   "平行　m₁ = m₂\n垂直　m₁m₂ = −1\na₁x + b₁y + c₁ = 0 と a₂x + b₂y + c₂ = 0 について\n平行　a₁b₂ − a₂b₁ = 0\n垂直　a₁a₂ + b₁b₂ = 0"],
  ["Distance from a Point to a Line", "Noun",
   "点と直線の距離",
   "d = |ax₁ + by₁ + c|/√(a² + b²)"],
  ["Area of a Triangle from Coordinates", "Noun",
   "三角形の面積（座標）",
   "S = 1/2 |x₁y₂ − x₂y₁|"],
  ["Family of Lines", "Noun",
   "直線束",
   "(a₁x + b₁y + c₁) + k(a₂x + b₂y + c₂) = 0"],
  ["Equation of a Circle", "Noun",
   "円の方程式",
   "(x − p)² + (y − q)² = r²\nx² + y² + lx + my + n = 0 　⇔　中心 (−l/2, −m/2)、半径 √((l² + m²)/4 − n)"],
  ["Tangent to a Circle", "Noun",
   "円の接線",
   "x² + y² = r² 上の点 (x₁, y₁) で　x₁x + y₁y = r²\n(x−p)² + (y−q)² = r² 上の点で　(x₁−p)(x−p) + (y₁−q)(y−q) = r²"],
  ["Position of a Circle and a Line", "Noun",
   "円と直線の位置関係",
   "中心と直線の距離 d、半径 r\nd < r 　2 点で交わる\nd = r 　接する\nd > r 　共有点なし"],
  ["Position of Two Circles", "Noun",
   "2 円の位置関係",
   "中心間距離 d、半径 r₁ > r₂\nd > r₁ + r₂ 離れる\nd = r₁ + r₂ 外接\nr₁ − r₂ < d < r₁ + r₂ 交わる\nd = r₁ − r₂ 内接\nd < r₁ − r₂ 内包"],
  ["Family of Curves Through Two Circles", "Noun",
   "2 円の交点を通る図形",
   "C₁ + kC₂ = 0"],
  ["Locus and Regions", "Noun",
   "軌跡と領域",
   "y > f(x) は曲線の上側、y < f(x) は下側\n(x−p)² + (y−q)² < r² は円の内部"],
  ["Pythagorean Identities", "Noun",
   "相互関係",
   "sin²θ + cos²θ = 1\ntanθ = sinθ/cosθ\n1 + tan²θ = 1/cos²θ\n1 + 1/tan²θ = 1/sin²θ"],
  ["Reduction Formulas", "Noun",
   "角の変換",
   "sin(−θ) = −sinθ\ncos(−θ) = cosθ\ntan(−θ) = −tanθ\nsin(π − θ) = sinθ\ncos(π − θ) = −cosθ\nsin(π/2 − θ) = cosθ\ncos(π/2 − θ) = sinθ\nsin(θ + π/2) = cosθ\ncos(θ + π/2) = −sinθ"],
  ["Exact Values of Special Angles", "Noun",
   "代表的な値",
   "sin 30° = 1/2\nsin 45° = 1/√2\nsin 60° = √3/2\ntan 30° = 1/√3\ntan 45° = 1\ntan 60° = √3"],
  ["Sine Rule", "Noun",
   "正弦定理",
   "a/(sin A) = b/(sin B) = c/(sin C) = 2R"],
  ["Cosine Rule", "Noun",
   "余弦定理",
   "a² = b² + c² − 2bc cos A\ncos A = (b² + c² − a²)/(2bc)"],
  ["Area of a Triangle", "Noun",
   "三角形の面積",
   "S = 1/2 bc sin A = abc/(4R) = rs\nヘロンの公式　S = √(s(s−a)(s−b)(s−c))　( s = (a+b+c)/2 )"],
  ["Compound Angle Formulas", "Noun",
   "加法定理",
   "sin(A ± B) = sin A cos B ± cos A sin B\ncos(A ± B) = cos A cos B ∓ sin A sin B\ntan(A ± B) = (tan A ± tan B)/(1 ∓ tan A tan B)"],
  ["Double Angle Formulas", "Noun",
   "倍角の公式",
   "sin 2θ = 2 sinθ cosθ\ncos 2θ = cos²θ − sin²θ = 2cos²θ − 1 = 1 − 2sin²θ\ntan 2θ = (2 tanθ)/(1 − tan²θ)"],
  ["Half Angle Formulas", "Noun",
   "半角の公式",
   "sin²(θ/2) = (1 − cosθ)/2\ncos²(θ/2) = (1 + cosθ)/2\ntan²(θ/2) = (1 − cosθ)/(1 + cosθ)"],
  ["Triple Angle Formulas", "Noun",
   "三倍角の公式",
   "sin 3θ = 3 sinθ − 4 sin³θ\ncos 3θ = 4 cos³θ − 3 cosθ"],
  ["Tangent Half-Angle Substitution", "Noun",
   "t = tan(θ/2) 置換",
   "sinθ = 2t/(1 + t²)\ncosθ = (1 − t²)/(1 + t²)\ntanθ = 2t/(1 − t²)"],
  ["Harmonic Form", "Noun",
   "三角関数の合成",
   "a sinθ + b cosθ = √(a² + b²) sin(θ + φ)\ncos φ = a/√(a²+b²),　sin φ = b/√(a²+b²)　すなわち tan φ = b/a"],
  ["Product-to-Sum Formulas", "Noun",
   "積を和に直す公式",
   "sin A cos B = 1/2{ sin(A+B) + sin(A−B) }\ncos A cos B = 1/2{ cos(A+B) + cos(A−B) }\nsin A sin B = −1/2{ cos(A+B) − cos(A−B) }"],
  ["Sum-to-Product Formulas", "Noun",
   "和を積に直す公式",
   "sin A + sin B = 2 sin((A+B)/2) cos((A−B)/2)\nsin A − sin B = 2 cos((A+B)/2) sin((A−B)/2)\ncos A + cos B = 2 cos((A+B)/2) cos((A−B)/2)\ncos A − cos B = −2 sin((A+B)/2) sin((A−B)/2)"],
  ["Period and Amplitude of Trig Graphs", "Noun",
   "グラフの性質",
   "y = a sin(bx + c) の周期は 2π/|b|、振幅は |a|"],
];

/* --- The import ----------------------------------------------------------- */
/* Names here are distinct from AddALevelWords.gs, so both files can sit in
   the same project without one quietly replacing the other's helpers. */

function ensureFormulaFolder_() {
  var folders = listFolders_();
  for (var i = 0; i < folders.length; i++) {
    if (folders[i].name.toLowerCase() === FORMULA_FOLDER.toLowerCase()) return folders[i];
  }
  var created = createFolder_(FORMULA_FOLDER);
  Logger.log('Created folder "%s".', FORMULA_FOLDER);
  return created;
}

function addFormulas() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var width = schema.width;
  var folder = ensureFormulaFolder_().name;

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

  for (var i = 0; i < FORMULAS.length; i++) {
    var entry = FORMULAS[i];
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

  Logger.log('Added %s formula(s) to "%s".', rows.length, folder);
  if (skipped) Logger.log('Skipped %s already in that folder.', skipped);
  Logger.log('Done. The app picks these up on its next sync.');
}
