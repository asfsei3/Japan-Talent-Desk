# Expansion Research Brief

Last updated: 2026-08-02
Status: Research input, not yet a decision

## Purpose

This brief holds the deep-research instructions used to test four expansion ideas
against the current Japan Talent Desk position. Nothing here has been validated yet.
Do not treat any hypothesis in this file as source-of-truth positioning.

## Ideas under test

1. Reorient the Japan-side intelligence layer from European clubs to Asian markets.
2. Work the reverse flow: Asian players into J.League partner-country and Asian quota slots.
3. Multilingual Japanese football media aimed at Asia first, not Europe.
4. No-inventory cross-border commerce for J.League merchandise, including
   flea-market-app sourcing.

## Initial internal read

The first two ideas reuse the existing core asset directly: translating Japan-side
context into practical decision support. The customer changes, the method does not.

The media idea is a distribution question, not a product question. Its value depends
on whether it feeds a paying B2B customer.

The commerce idea uses none of the existing asset. It carries licensing, trademark,
and platform-terms exposure, and it should be tested under a separate brand so that
a merchandise dispute cannot touch the credibility of the intelligence work.

Known constraint to verify rather than assume: Japanese flea-market platforms
generally prohibit listing items the seller does not hold. Research prompt 3 is
written to surface the exact clauses.

## Sequencing

Run prompt 1 and prompt 3 in parallel. Prompt 1 tests the best-case reuse of the
existing asset. Prompt 3 is a go / no-go feasibility gate that resolves quickly.
Prompt 2 depends on the outcome of prompt 1, because the role of media changes
entirely depending on who the paying customer turns out to be.

## Research prompt 1: Asia and Japan player-and-information market

```text
あなたは、アジアのサッカー産業を専門とするトップティアの戦略コンサルタント兼スポーツビジネス
アナリストです。以下の意思決定を支援するための、一次情報に基づく徹底調査を行ってください。

【意思決定内容】
私は現在、欧州クラブ向けに「日本市場のリクルーティング情報（選手の可用性・契約状況・移籍現実性・
本人の欧州志向などの日本側文脈を翻訳して提供する）」サービスを運営している。
この事業の顧客を、欧州からアジアに向け直すべきか、また向けるならどのセグメントが最も
「支払い意思 × 競合の薄さ × 参入の容易さ」で優れているかを判断したい。

【調査してほしい市場の全体像】
1. 日本→アジアの選手フロー
   - タイ・リーグ1、ベトナムVリーグ、インドネシアBRIリーガ1、マレーシア・スーパーリーグ、
     シンガポール、香港プレミアリーグ、Kリーグ、中国スーパーリーグにおける
     日本人選手の在籍数の推移（直近5シーズン）とポジション傾向
   - これらのリーグの外国籍枠・アジア枠（AFCクォータ）・ASEAN枠のルールと直近の変更
   - 日本人選手を獲得する際の典型的な移籍金レンジ・年俸レンジ（判明する範囲で実額）
   - 実際に誰が仲介しているか（日本の代理人事務所、現地エージェント、クラブ間の直接ルート）

2. アジア→日本の選手フロー（逆流）
   - Jリーグの外国籍枠・提携国枠（パートナーシップ協定国）の現行ルールと運用実態
   - 東南アジア出身選手のJリーグ在籍実績と、獲得の動機（競技力／マーケティング／放映権）
   - チャナティップ型の「マーケティング込みの獲得」がクラブ収益に与えた実測効果に関する
     公開データ・報道
   - J1/J2/J3クラブの平均的な強化予算と、外国籍選手にかけられる金額のレンジ

3. 情報の非対称性がどこに存在するか
   - ASEAN側クラブが日本人選手を評価する際、実際に何に困っているか
     （言語、契約情報、給与水準の相場観、本人の意思、代理人の信頼性、ビザ・労働許可）
   - Jクラブが東南アジア選手を評価する際に何に困っているか
   - 既存の解決手段（Transfermarkt、Wyscout/Hudl、InStat、Scoutium、代理人ネットワーク、
     現地メディア）が、この文脈翻訳をどこまでカバーしているか、カバーできていない空白は何か

【競合調査】
- 日本人選手のアジア移籍を支援している既存プレイヤー（代理人事務所、コンサル、メディア）を
  実名で列挙し、ビジネスモデル・料金体系・規模を可能な限り特定
- アジア各国からJリーグへの送り出し側で機能している組織
- 「スカウティング情報を有料で販売している」独立系サービスの事例と価格（世界のどこの事例でもよい）

【支払い意思の検証】
- ASEAN主要リーグのクラブの年間運営予算レンジと、外部コンサル／データサービスへの支出実態
- Jリーグクラブがデータ・スカウティングサービスに支払っている金額の公開情報
- どのセグメント（ASEANクラブ／Jクラブ／代理人／協会／メディア）が
  「情報そのもの」に金を払う習慣を持っているか

【出力形式】
1. エグゼクティブサマリー（結論を先に。どのセグメントが最も有望か、明確に順位づけ）
2. 選手フローのデータ表（国別・年別・人数・典型的な金額レンジ）
3. 顧客セグメント別の機会評価マトリクス
   （軸：市場規模／支払い意思／競合の薄さ／参入コスト／JTD既存資産の再利用度）
4. 競合マップ（実名・モデル・価格・弱点）
5. 反証パート：この事業が成立しない理由として最も強い論拠を3つ、根拠つきで
6. 最初の90日で検証すべき仮説を5つ、それぞれ検証方法つきで

【必須ルール】
- すべての数値・主張に出典URLを付す
- 推測と事実を明確に区別し、推測には「推定」と明記
- 日本語・英語・タイ語・ベトナム語・インドネシア語のソースを可能な限り横断する
- 「〜と言われている」で終わらせず、必ず一次情報または報道の出典に当たる
- 楽観バイアスを排し、悪いニュースを省略しない
```

## Research prompt 2: Multilingual Japanese football media

```text
あなたは、スポーツメディアの収益化に精通したトップティアのメディア戦略アナリストです。
以下の意思決定のための徹底調査を行ってください。

【意思決定内容】
「日本のサッカー（Jリーグ、日本代表、日本人選手）の情報を、日本語以外の言語で発信する
プラットフォーム」を立ち上げるべきかを判断したい。
特に、欧州向けではなくアジア向け（英語・タイ語・ベトナム語・インドネシア語・中国語）を
先に狙う仮説の妥当性を検証したい。

【需要サイドの調査】
1. Jリーグおよび日本サッカーに対する海外の関心量の実測
   - Jリーグの国際放映権契約（国別・放映事業者・契約規模・期間）の現状
   - 国別の検索ボリューム傾向（Jリーグ、Japanese football、選手名などの主要キーワード）
   - Jリーグ公式および各クラブの海外向けSNSアカウントのフォロワー数と国別構成
     （公開されている範囲で）
   - 東南アジア各国における日本サッカー人気の実態を示す調査・報道
2. 既存の情報供給
   - 日本サッカーを非日本語で扱っている既存メディア／ブログ／YouTube／Podcast／
     SNSアカウントを実名で列挙し、言語・更新頻度・規模・運営主体・収益源を特定
   - 特に英語圏とASEAN言語圏の供給密度の差
   - 供給が薄い言語・薄いトピックの特定（＝空白地帯）
3. 隣接する成功事例
   - 「特定国リーグの情報を外国語で発信して収益化した」事例を世界中から探す
     （例：ブンデスリーガの英語圏メディア、Kリーグの英語メディア、
      南米リーグのスカウティングメディアなど）
   - それぞれの収益モデル・規模・成立条件・失敗事例

【収益化サイドの調査】
- 東南アジア各国のディスプレイ広告CPM／YouTube RPMの実勢レンジ（スポーツカテゴリ）
- スポーツメディアにおける有料サブスクの成立条件（最低必要読者数、価格帯の実例）
- スポンサーシップ（ブックメーカー、旅行、日本企業のアジア展開、語学、留学）の
  出稿実態と単価感
- アフィリエイト（グッズ、チケット、旅行、配信サービス）の収益性実例
- B2C媒体をB2B（クラブ・代理人向け情報）へ転換した事例があるか

【リスク・制約】
- Jリーグおよびクラブの映像・画像・データの二次利用に関する権利制約
- 東南アジア各国のブックメーカー広告に関する法規制
- 言語運用コスト（翻訳・現地ライター）の実勢単価

【出力形式】
1. エグゼクティブサマリー（結論先出し。やるべきか／やるならどの言語・どのトピックから）
2. 国別・言語別の「需要 × 供給」ギャップマップ
3. 既存プレイヤー一覧（実名・言語・規模・収益源・弱点）
4. 収益モデル別のシミュレーション前提（CPM、必要PV、必要フォロワー数などの実数）
5. 「メディア単体では成立しない」場合に、何と組み合わせれば成立するかの選択肢
6. 反証パート：この事業をやるべきでない理由の最強論拠3つ
7. 90日検証プラン

【必須ルール】
- 全数値に出典URL
- 事実と推定を明記して区別
- 各言語圏のローカルソースに当たる
- 「関心は高まっている」のような定性表現は使わず、必ず数字で示す
```

## Research prompt 3: Cross-border merchandise feasibility

```text
あなたは、越境ECとライセンス商品流通に精通したトップティアのアナリスト兼リーガルリサーチャーです。
以下の意思決定のための徹底調査を行ってください。

【意思決定内容】
「Jリーグ各クラブのユニフォーム等のグッズを海外のサッカーファン向けに紹介し、
注文が入ってから仕入れて発送する（受注仕入れ／無在庫型）」事業が
法的・実務的・経済的に成立するかを判断したい。
またその派生として、日本国内フリマアプリ（メルカリ等）を仕入れ元とするモデルの
規約適合性も判断したい。

【法務・規約の調査（最重要・ここは断定的に）】
1. Jリーグおよび各クラブのライセンス商品の流通構造
   - 公式グッズの製造・販売ライセンスの仕組み（Jリーグ、クラブ、アパレルメーカーの権利関係）
   - 正規取扱店・卸売の条件、個人事業者が正規に仕入れる方法が存在するか
   - 転売・再販に関する公式の見解、規約上の制限
2. 商標・意匠・肖像の問題
   - クラブエンブレム・リーグロゴ・選手名／背番号を商品画像や広告に使用する際の
     日本の商標法・不正競争防止法上の扱い
   - 「正規品の並行再販」がどこまで適法か（商標権の消尽の考え方と限界）
   - 海外向け販売時の輸出入規制、相手国での権利者による差止めリスク
3. プラットフォーム規約
   - メルカリの利用規約・ガイドラインにおける「手元にない商品の出品」「無在庫販売」
     「転売目的の購入」の扱いを、原文の該当条項を引用して明示
   - 同様に、ラクマ、ヤフオク、Amazon、eBay、Shopify、BASE、STORES の
     無在庫販売・ドロップシッピングに関する規約上の扱いを条項ベースで比較
   - 違反時のペナルティの実例（アカウント停止、売上金没収などの報告事例）
4. 日本の法規制
   - 特定商取引法上の表示義務（無在庫販売における納期表示など）
   - 古物商許可が必要になる条件（中古品仕入れ・転売の場合）
   - 景品表示法上、在庫がない商品を「在庫あり」と表示するリスク

【市場・需要の調査】
- 海外ファンがJリーググッズを買えていない実態（公式ストアの海外発送可否、
  決済手段、サイズ表記、言語対応の現状をクラブ別に確認）
- 既存の解決手段：転送・代理購入サービスの手数料体系と、Jリーグ関連の取扱実績
- eBay等での日本サッカー関連グッズの実際の落札価格帯と取引量
- 需要が最も強い国・商品カテゴリ（現行ユニフォーム／レトロ／限定コラボ／
  選手個人グッズ／マフラータオル等）
- 模倣品の流通状況と価格、それが正規品ビジネスに与える価格圧力

【ユニットエコノミクスの調査】
- Jリーグユニフォームの国内小売価格帯（オーセンティック／レプリカ）
- 正規仕入れが可能な場合の卸掛け率の相場（スポーツ用品業界一般の水準でよい）
- 国際発送コスト（EMS、eパケット、DHL等）の実勢と重量帯別の料金
- 決済手数料、為替、関税・現地VATの負担構造（DDP/DDUの扱い）
- 返品・サイズ交換の発生率と、無在庫モデルでの対応コスト
- 上記を積み上げた、1着あたりの現実的な粗利額と粗利率の試算

【代替モデルの比較】
以下の各モデルについて、法務リスク・粗利率・運転資金・スケーラビリティを比較評価すること：
A. 無在庫での再販（受注後に正規小売から購入して発送）
B. 購入代行・コンシェルジュ型（自らは売主にならず、手数料を取る）
C. 正規のライセンシー／取扱店になる道を目指す
D. 非ライセンスのオリジナルグッズ（日本サッカー文化をテーマにした自社デザイン）
E. アフィリエイト（既存代行サービスへの送客のみ）

【出力形式】
1. エグゼクティブサマリー（各モデルの可否を「可・条件付き可・不可」で明確に判定）
2. 法務リスク一覧表（リスク項目／根拠法令・規約条項／発生確率／影響度／回避策）
3. 規約の該当条項の原文引用集（メルカリ等）
4. ユニットエコノミクス試算表（前提数値と出典を明示）
5. モデルA〜Eの比較評価マトリクス
6. 反証パート：この事業をやるべきでない理由の最強論拠3つ
7. もし進めるなら、最も安全で最も検証速度が速い最初の一手

【必須ルール】
- 法務パートは特に、必ず条文・規約の原文と出典URLを示す。伝聞や要約記事だけで断定しない
- グレーな部分は「グレーである」と明記し、どちらに転ぶ可能性が高いかを根拠つきで示す
- 楽観的な情報商材系ソースは根拠として採用せず、
  必要なら「そう主張する情報源が存在する」という事実として区別して扱う
```

## After the research returns

Record the decision and its reasoning in `docs/strategy/decision-log.md`.
Only update `positioning.md` once a direction has actually been chosen and tested
with real customer contact, not on the strength of desk research alone.
