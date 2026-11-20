// Each entry is one schema version. Never edit a shipped migration — append a new one.
export const migrations = [
  /* v1 — initial schema */ `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_emoji  TEXT NOT NULL,
    avatar_color  TEXT NOT NULL,
    status_text   TEXT NOT NULL DEFAULT '',
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE classes (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    emoji         TEXT NOT NULL,
    student_code  TEXT NOT NULL UNIQUE,
    teacher_code  TEXT NOT NULL UNIQUE,
    owner_id      INTEGER NOT NULL REFERENCES users(id),
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE memberships (
    class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK (role IN ('owner','teacher','student')),
    muted_until  INTEGER,
    joined_at    INTEGER NOT NULL,
    PRIMARY KEY (class_id, user_id)
  ) WITHOUT ROWID;
  CREATE INDEX idx_memberships_user ON memberships(user_id);

  CREATE TABLE channels (
    id          INTEGER PRIMARY KEY,
    class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    topic       TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL CHECK (kind IN ('text','announcement','dm')),
    dm_key      TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX idx_channels_name ON channels(class_id, name) WHERE kind <> 'dm';
  CREATE UNIQUE INDEX idx_channels_dm ON channels(class_id, dm_key) WHERE kind = 'dm';

  CREATE TABLE channel_members (
    channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (channel_id, user_id)
  ) WITHOUT ROWID;
  CREATE INDEX idx_channel_members_user ON channel_members(user_id);

  CREATE TABLE read_state (
    channel_id    INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_id  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, user_id)
  ) WITHOUT ROWID;

  CREATE TABLE messages (
    id           INTEGER PRIMARY KEY,
    channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('user','bot','system')),
    body         TEXT NOT NULL DEFAULT '',
    reply_to_id  INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    edited_at    INTEGER,
    deleted_at   INTEGER,
    deleted_by   INTEGER,
    pinned_at    INTEGER,
    pinned_by    INTEGER,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX idx_messages_channel ON messages(channel_id, id);
  CREATE INDEX idx_messages_pinned ON messages(channel_id, pinned_at) WHERE pinned_at IS NOT NULL;

  CREATE TABLE attachments (
    id             INTEGER PRIMARY KEY,
    public_id      TEXT NOT NULL UNIQUE,
    class_id       INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    message_id     INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    uploader_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    original_name  TEXT NOT NULL,
    stored_name    TEXT NOT NULL,
    mime           TEXT NOT NULL,
    size           INTEGER NOT NULL,
    width          INTEGER,
    height         INTEGER,
    duration       REAL,
    created_at     INTEGER NOT NULL
  );
  CREATE INDEX idx_attachments_message ON attachments(message_id);
  CREATE INDEX idx_attachments_orphans ON attachments(created_at) WHERE message_id IS NULL;

  CREATE TABLE reactions (
    message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  ) WITHOUT ROWID;

  CREATE TABLE polls (
    message_id  INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    question    TEXT NOT NULL,
    multiple    INTEGER NOT NULL DEFAULT 0,
    anonymous   INTEGER NOT NULL DEFAULT 0,
    closed_at   INTEGER
  );
  CREATE TABLE poll_options (
    id          INTEGER PRIMARY KEY,
    message_id  INTEGER NOT NULL REFERENCES polls(message_id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    position    INTEGER NOT NULL
  );
  CREATE INDEX idx_poll_options_message ON poll_options(message_id);
  CREATE TABLE poll_votes (
    option_id   INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (option_id, user_id)
  ) WITHOUT ROWID;

  CREATE TABLE knowledge (
    id          INTEGER PRIMARY KEY,
    class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_knowledge_class ON knowledge(class_id);

  CREATE VIRTUAL TABLE messages_fts USING fts5(body, content='messages', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
  CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
  END;
  CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.id, old.body);
  END;
  CREATE TRIGGER messages_au AFTER UPDATE OF body ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.id, old.body);
    INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
  END;
  `,

  /* v2 — fun: rich message payloads, class emoji, chess, scheduled events */ `
  -- JSON payload for special messages (random picks, chess challenges…)
  ALTER TABLE messages ADD COLUMN meta TEXT;

  CREATE TABLE class_emojis (
    id           INTEGER PRIMARY KEY,
    class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    stored_name  TEXT NOT NULL,
    mime         TEXT NOT NULL,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   INTEGER NOT NULL,
    UNIQUE (class_id, name)
  );

  CREATE TABLE chess_games (
    id             INTEGER PRIMARY KEY,
    class_id       INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    channel_id     INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id     INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    challenger_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opponent_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    white_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    black_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status         TEXT NOT NULL CHECK (status IN ('pending','active','finished','declined','cancelled')),
    moves          TEXT NOT NULL DEFAULT '[]',
    result         TEXT,  -- white | black | draw
    reason         TEXT,  -- checkmate | resign | stalemate | repetition | insufficient | fifty
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX idx_chess_message ON chess_games(message_id);

  -- Remembers one-off scheduled things (e.g. "awards posted for week 2026-W47").
  CREATE TABLE class_events (
    class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    key         TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (class_id, kind, key)
  ) WITHOUT ROWID;
  `,

  /* v3 — Imposter word game */ `
  CREATE TABLE imposter_games (
    id           INTEGER PRIMARY KEY,
    class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id   INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    host_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_plays   INTEGER NOT NULL,           -- 1: host plays, word picked by the server; 0: host typed the word and runs the game
    category     TEXT NOT NULL,
    word         TEXT NOT NULL,              -- secret: never sent to spectators or imposters until the game ends
    status       TEXT NOT NULL CHECK (status IN ('lobby','clues','voting','guess','finished','cancelled')),
    players      TEXT NOT NULL DEFAULT '[]', -- user ids; in turn order once started
    imposter_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    round        INTEGER NOT NULL DEFAULT 0,
    turn         INTEGER NOT NULL DEFAULT 0, -- index into players
    clues        TEXT NOT NULL DEFAULT '[]', -- [{ userId, text, round, skipped? }]
    votes        TEXT NOT NULL DEFAULT '{}', -- { voterId: targetId }
    accused_id   INTEGER,
    guess        TEXT,
    result       TEXT,                       -- players | imposter
    reason       TEXT,                       -- caught | guessed | wrong_vote | tie | no_votes | no_guess
    version      INTEGER NOT NULL DEFAULT 0, -- bumped on every change; clients ignore older updates
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE INDEX idx_imposter_message ON imposter_games(message_id);

  `,

  /* v4 — configurable Imposter teams */
  `
  ALTER TABLE imposter_games ADD COLUMN imposter_count INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE imposter_games ADD COLUMN imposter_ids TEXT;
  `,

  /* v5 — class calendar and reminders */
  `
  CREATE TABLE calendar_events (
    id             INTEGER PRIMARY KEY,
    class_id       INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    starts_at      INTEGER NOT NULL,
    reminder_at    INTEGER NOT NULL,
    reminder_sent  INTEGER NOT NULL DEFAULT 0,
    created_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at     INTEGER NOT NULL
  );
  CREATE INDEX idx_calendar_events_start ON calendar_events(class_id, starts_at);
  CREATE INDEX idx_calendar_reminders ON calendar_events(reminder_at) WHERE reminder_sent = 0;
  `,
];
