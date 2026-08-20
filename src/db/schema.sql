-- Japan Football Intelligence — canonical schema.
--
-- Design rules encoded here:
--   1. Every published claim is traceable to a source row (data provenance).
--   2. Raw article text is never stored in full; only metadata plus a short
--      factual summary, to stay inside copyright limits.
--   3. The model is market-agnostic (country/market columns, not Japan-only
--      columns) so Asia and Global expansion is a data change, not a migration.
--   4. Scores are stored with their inputs so the UI can always explain them.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Reference entities
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS countries (
  code            TEXT PRIMARY KEY,          -- ISO 3166-1 alpha-2
  name_en         TEXT NOT NULL,
  name_ja         TEXT,
  confederation   TEXT,                      -- UEFA | AFC | CONMEBOL | ...
  market_priority INTEGER NOT NULL DEFAULT 0 -- 1 = Japan, 2 = Asia stage 2, ...
);

CREATE TABLE IF NOT EXISTS leagues (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name_en       TEXT NOT NULL,
  name_ja       TEXT,
  country_code  TEXT REFERENCES countries(code),
  tier          INTEGER NOT NULL DEFAULT 1,
  confederation TEXT,
  -- 0-100 measure of how visible this league is to a Japanese audience.
  jp_visibility INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clubs (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name_en      TEXT NOT NULL,
  name_ja      TEXT,
  short_name   TEXT,
  country_code TEXT REFERENCES countries(code),
  league_id    INTEGER REFERENCES leagues(id),
  website      TEXT,
  data_status  TEXT NOT NULL DEFAULT 'seed_unverified', -- seed_unverified | verified
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id                INTEGER PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name_en           TEXT NOT NULL,
  name_ja           TEXT,
  name_kana         TEXT,
  birth_date        TEXT,
  position          TEXT,                    -- GK | CB | LB | RB | DM | CM | AM | LW | RW | ST
  position_detail   TEXT,
  foot              TEXT,
  nationality       TEXT REFERENCES countries(code),
  second_nationality TEXT,
  current_club_id   INTEGER REFERENCES clubs(id),
  league_id         INTEGER REFERENCES leagues(id),
  contract_until    TEXT,                    -- YYYY-MM-DD or YYYY-06-30 estimate
  contract_confidence TEXT DEFAULT 'unverified',
  national_team     TEXT,                    -- senior | u23 | u21 | none
  national_team_caps INTEGER,
  market_value_eur  INTEGER,
  market_value_source TEXT,
  status            TEXT NOT NULL DEFAULT 'active', -- active | retired | inactive
  tracked           INTEGER NOT NULL DEFAULT 1,
  data_status       TEXT NOT NULL DEFAULT 'seed_unverified',
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_players_club ON players(current_club_id);
CREATE INDEX IF NOT EXISTS idx_players_league ON players(league_id);
CREATE INDEX IF NOT EXISTS idx_players_tracked ON players(tracked, status);

-- Alias tables carry the multilingual matching surface (English, kanji, kana,
-- common romanisations, misspellings seen in the wild).
CREATE TABLE IF NOT EXISTS player_aliases (
  id         INTEGER PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  alias      TEXT NOT NULL,
  alias_norm TEXT NOT NULL,
  lang       TEXT NOT NULL DEFAULT 'en',     -- en | ja | kana | romaji
  kind       TEXT NOT NULL DEFAULT 'name',   -- name | surname | nickname | misspelling
  UNIQUE (player_id, alias_norm, lang)
);

CREATE INDEX IF NOT EXISTS idx_player_aliases_norm ON player_aliases(alias_norm);

CREATE TABLE IF NOT EXISTS club_aliases (
  id         INTEGER PRIMARY KEY,
  club_id    INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  alias      TEXT NOT NULL,
  alias_norm TEXT NOT NULL,
  lang       TEXT NOT NULL DEFAULT 'en',
  UNIQUE (club_id, alias_norm, lang)
);

CREATE INDEX IF NOT EXISTS idx_club_aliases_norm ON club_aliases(alias_norm);

-- ---------------------------------------------------------------------------
-- Sources and collection
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sources (
  id                INTEGER PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL,           -- official_club | official_league | federation | media_jp | media_eu | journalist | aggregator | social
  homepage          TEXT,
  feed_url          TEXT,
  provider          TEXT NOT NULL DEFAULT 'rss',
  country_code      TEXT,
  language          TEXT NOT NULL DEFAULT 'en',
  tier              INTEGER NOT NULL DEFAULT 3,
  -- Learned reliability, 0-100. Seeded from tier, updated by outcome tracking.
  reliability_score INTEGER NOT NULL DEFAULT 50,
  reports_total     INTEGER NOT NULL DEFAULT 0,
  reports_correct   INTEGER NOT NULL DEFAULT 0,
  reports_wrong     INTEGER NOT NULL DEFAULT 0,
  commercial_use    TEXT NOT NULL DEFAULT 'unknown', -- allowed | link_only | restricted | unknown
  licence_note      TEXT,
  robots_checked_at TEXT,
  robots_allowed    INTEGER,
  enabled           INTEGER NOT NULL DEFAULT 1,
  last_fetched_at   TEXT,
  last_status       TEXT,
  last_error        TEXT,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  etag              TEXT,
  last_modified     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled, provider);

CREATE TABLE IF NOT EXISTS articles (
  id              INTEGER PRIMARY KEY,
  source_id       INTEGER NOT NULL REFERENCES sources(id),
  url             TEXT NOT NULL,
  url_hash        TEXT NOT NULL UNIQUE,
  canonical_url   TEXT,
  title           TEXT NOT NULL,
  -- Short factual summary only. Never the full copyrighted body.
  excerpt         TEXT,
  -- Japanese rendering for the Japanese-first product. Generated, not scraped,
  -- so it is a summary of the facts rather than a translation of the article.
  title_ja        TEXT,
  summary_ja      TEXT,
  author          TEXT,
  language        TEXT,
  published_at    TEXT,
  detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
  content_hash    TEXT NOT NULL,
  simhash         TEXT,
  relevance_score INTEGER NOT NULL DEFAULT 0,
  relevance_reason TEXT,
  status          TEXT NOT NULL DEFAULT 'new', -- new | prefiltered_out | classified | duplicate | error
  duplicate_of    INTEGER REFERENCES articles(id),
  processed_at    TEXT,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON articles(content_hash);
CREATE INDEX IF NOT EXISTS idx_articles_detected ON articles(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id, published_at DESC);

CREATE TABLE IF NOT EXISTS article_entities (
  id           INTEGER PRIMARY KEY,
  article_id   INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,               -- player | club | league
  entity_id    INTEGER NOT NULL,
  matched_text TEXT,
  match_field  TEXT,                        -- title | excerpt
  score        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (article_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_article_entities_entity ON article_entities(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Events: the core intelligence object
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY,
  dedupe_key     TEXT NOT NULL UNIQUE,
  type           TEXT NOT NULL,             -- transfer | contract | injury | performance | national_team | media | social | commercial | club_situation
  subtype        TEXT,                      -- interest | bid | agreement | completed | renewal | expiry | out | return | ...
  player_id      INTEGER REFERENCES players(id) ON DELETE CASCADE,
  club_id        INTEGER REFERENCES clubs(id),
  from_club_id   INTEGER REFERENCES clubs(id),
  to_club_id     INTEGER REFERENCES clubs(id),
  headline       TEXT NOT NULL,
  summary        TEXT,
  headline_ja    TEXT,
  summary_ja     TEXT,
  occurred_at    TEXT,
  detected_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  confidence     TEXT NOT NULL DEFAULT 'unverified',
  confidence_rank INTEGER NOT NULL DEFAULT 1,
  importance     INTEGER NOT NULL DEFAULT 1, -- 1-5
  source_count   INTEGER NOT NULL DEFAULT 0,
  independent_source_count INTEGER NOT NULL DEFAULT 0,
  best_source_tier INTEGER,
  payload        TEXT,                       -- JSON: extracted structured facts
  status         TEXT NOT NULL DEFAULT 'active', -- active | superseded | rejected | pending_review
  superseded_by  INTEGER REFERENCES events(id),
  review_required INTEGER NOT NULL DEFAULT 0,
  reviewed_at    TEXT,
  reviewed_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_player ON events(player_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status, importance DESC, detected_at DESC);

CREATE TABLE IF NOT EXISTS event_sources (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  article_id   INTEGER REFERENCES articles(id),
  source_id    INTEGER NOT NULL REFERENCES sources(id),
  url          TEXT NOT NULL,
  title        TEXT,
  published_at TEXT,
  detected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  tier         INTEGER,
  weight       REAL NOT NULL DEFAULT 0,
  UNIQUE (event_id, url)
);

CREATE INDEX IF NOT EXISTS idx_event_sources_event ON event_sources(event_id);

-- ---------------------------------------------------------------------------
-- Signals, scores and history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS signals (
  id           INTEGER PRIMARY KEY,
  entity_type  TEXT NOT NULL DEFAULT 'player',
  entity_id    INTEGER NOT NULL,
  signal_type  TEXT NOT NULL,               -- transfer | injury_risk | attention | japan_market
  score        REAL NOT NULL,
  band         TEXT NOT NULL,
  coverage     REAL NOT NULL DEFAULT 1,
  inputs       TEXT,                        -- JSON: component -> {raw, normalized, weight, points}
  computed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_type, entity_id, signal_type)
);

CREATE TABLE IF NOT EXISTS signal_history (
  id          INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL DEFAULT 'player',
  entity_id   INTEGER NOT NULL,
  signal_type TEXT NOT NULL,
  score       REAL NOT NULL,
  band        TEXT NOT NULL,
  as_of_date  TEXT NOT NULL,                -- YYYY-MM-DD
  UNIQUE (entity_type, entity_id, signal_type, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_signal_history_lookup
  ON signal_history(entity_type, entity_id, signal_type, as_of_date DESC);

-- Generic measured metric store. Keeps social/media/search inputs auditable and
-- lets the Japan Market Score refuse to guess when a metric is missing.
CREATE TABLE IF NOT EXISTS metrics (
  id          INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,                -- player | club | league
  entity_id   INTEGER NOT NULL,
  metric_key  TEXT NOT NULL,                -- jp_social_followers | jp_media_mentions_30d | ...
  value       REAL NOT NULL,
  unit        TEXT,
  market      TEXT NOT NULL DEFAULT 'JP',
  provider    TEXT NOT NULL DEFAULT 'manual',
  as_of_date  TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_type, entity_id, metric_key, market, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_lookup ON metrics(entity_type, entity_id, metric_key, as_of_date DESC);

-- Before/after acquisition impact study rows — the long-term proprietary moat.
CREATE TABLE IF NOT EXISTS market_impact_studies (
  id            INTEGER PRIMARY KEY,
  player_id     INTEGER REFERENCES players(id),
  club_id       INTEGER REFERENCES clubs(id),
  market        TEXT NOT NULL DEFAULT 'JP',
  signing_date  TEXT,
  window_days   INTEGER NOT NULL DEFAULT 90,
  metric_key    TEXT NOT NULL,
  before_value  REAL,
  after_value   REAL,
  delta_pct     REAL,
  confidence    TEXT NOT NULL DEFAULT 'unverified',
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (player_id, club_id, market, metric_key, window_days)
);

-- ---------------------------------------------------------------------------
-- Change detection — powers "What Changed Today?"
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS changes (
  id           INTEGER PRIMARY KEY,
  entity_type  TEXT NOT NULL DEFAULT 'player',
  entity_id    INTEGER NOT NULL,
  change_type  TEXT NOT NULL,               -- signal_band | new_event | confidence_up | club_linked | contract | injury | performance
  headline     TEXT NOT NULL,
  detail       TEXT,
  headline_ja  TEXT,
  detail_ja    TEXT,
  before_value TEXT,
  after_value  TEXT,
  importance   INTEGER NOT NULL DEFAULT 1,
  confidence   TEXT NOT NULL DEFAULT 'reported',
  event_id     INTEGER REFERENCES events(id),
  as_of_date   TEXT NOT NULL,
  detected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  dedupe_key   TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_changes_date ON changes(as_of_date DESC, importance DESC);
CREATE INDEX IF NOT EXISTS idx_changes_entity ON changes(entity_type, entity_id, detected_at DESC);

-- ---------------------------------------------------------------------------
-- Human review, operations, cost
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS review_queue (
  id          INTEGER PRIMARY KEY,
  item_type   TEXT NOT NULL,                -- event | player | claim | source
  item_id     INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  detail      TEXT,
  priority    INTEGER NOT NULL DEFAULT 3,   -- 1 (low) - 5 (urgent)
  status      TEXT NOT NULL DEFAULT 'open', -- open | approved | rejected | merged | edited | marked_unverified
  resolution  TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (item_type, item_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_review_open ON review_queue(status, priority DESC, created_at);

CREATE TABLE IF NOT EXISTS job_runs (
  id          INTEGER PRIMARY KEY,
  job_name    TEXT NOT NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status      TEXT NOT NULL DEFAULT 'running', -- running | ok | partial | error
  stats       TEXT,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name ON job_runs(job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS cost_ledger (
  id           INTEGER PRIMARY KEY,
  as_of_date   TEXT NOT NULL,
  provider     TEXT NOT NULL,               -- anthropic | rss | gnews | hosting | brevo | ...
  operation    TEXT NOT NULL,               -- triage | extract | fetch | send
  model        TEXT,
  calls        INTEGER NOT NULL DEFAULT 0,
  input_units  INTEGER NOT NULL DEFAULT 0,  -- tokens or requests
  output_units INTEGER NOT NULL DEFAULT 0,
  cost_usd     REAL NOT NULL DEFAULT 0,
  meta         TEXT,
  UNIQUE (as_of_date, provider, operation, model)
);

CREATE INDEX IF NOT EXISTS idx_cost_date ON cost_ledger(as_of_date DESC);

CREATE TABLE IF NOT EXISTS llm_cache (
  cache_key   TEXT PRIMARY KEY,
  model       TEXT NOT NULL,
  task        TEXT NOT NULL,
  response    TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  hits        INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Distribution
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id           INTEGER PRIMARY KEY,
  issue_date   TEXT NOT NULL UNIQUE,
  subject      TEXT NOT NULL,
  markdown     TEXT NOT NULL,
  html         TEXT,
  status       TEXT NOT NULL DEFAULT 'draft', -- draft | approved | sent | discarded
  approved_by  TEXT,
  approved_at  TEXT,
  sent_at      TEXT,
  stats        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_drafts (
  id          INTEGER PRIMARY KEY,
  as_of_date  TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'x',
  body        TEXT NOT NULL,
  language    TEXT NOT NULL DEFAULT 'ja',
  change_id   INTEGER REFERENCES changes(id),
  status      TEXT NOT NULL DEFAULT 'draft', -- draft | approved | rejected | posted
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (as_of_date, platform, body)
);

CREATE TABLE IF NOT EXISTS watchlists (
  id          INTEGER PRIMARY KEY,
  owner_email TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT 'Default',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_email, name)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id           INTEGER PRIMARY KEY,
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  added_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (watchlist_id, player_id)
);

-- Japan commercial impact, expressed as a RANGE with named drivers and a
-- confidence -- never a point estimate. "Signing this player sells N shirts"
-- is exactly the kind of unsupported claim the product refuses to make.
CREATE TABLE IF NOT EXISTS commercial_estimates (
  id           INTEGER PRIMARY KEY,
  entity_type  TEXT NOT NULL DEFAULT 'player',
  entity_id    INTEGER NOT NULL,
  club_id      INTEGER REFERENCES clubs(id),
  market       TEXT NOT NULL DEFAULT 'JP',
  metric_key   TEXT NOT NULL,              -- jp_audience_uplift | jp_media_uplift | ...
  low          REAL,
  high         REAL,
  unit         TEXT,
  band         TEXT,                        -- LOW | MEDIUM | HIGH | VERY_HIGH
  basis        TEXT NOT NULL,               -- JSON: which benchmarks and metrics produced this
  confidence   TEXT NOT NULL DEFAULT 'unverified',
  computed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_type, entity_id, club_id, market, metric_key)
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
