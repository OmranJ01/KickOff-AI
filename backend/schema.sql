-- KickOff AI — Full Database Schema

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  user_type   VARCHAR(20)  NOT NULL,
  city        VARCHAR(100),
  country     VARCHAR(100),
  location    VARCHAR(100),
  avatar_url  TEXT,
  bio         VARCHAR(300),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stadiums (
  id             SERIAL PRIMARY KEY,
  owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(120) NOT NULL,
  city           VARCHAR(100),
  country        VARCHAR(100),
  location       VARCHAR(200),
  description    TEXT,
  price_per_hour NUMERIC NOT NULL,
  capacity       INTEGER,
  surface        VARCHAR(50) DEFAULT 'grass',
  phone          VARCHAR(30),
  open_time      TIME NOT NULL DEFAULT '08:00',
  close_time     TIME NOT NULL DEFAULT '22:00',
  is_active      BOOLEAN DEFAULT TRUE,
  image_url      TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stadium_schedule (
  id          SERIAL PRIMARY KEY,
  stadium_id  INTEGER NOT NULL REFERENCES stadiums(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,
  slot_start  TIME NOT NULL,
  slot_end    TIME NOT NULL,
  is_available BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS stadium_default_schedule (
  id          SERIAL PRIMARY KEY,
  stadium_id  INTEGER NOT NULL REFERENCES stadiums(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  slot_start  TIME NOT NULL,
  slot_end    TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS stadium_date_slots (
  id           SERIAL PRIMARY KEY,
  stadium_id   INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
  slot_date    DATE NOT NULL,
  slot_start   TIME NOT NULL,
  slot_end     TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(stadium_id, slot_date, slot_start)
);

CREATE INDEX IF NOT EXISTS idx_date_slots_stadium_date ON stadium_date_slots(stadium_id, slot_date);

CREATE TABLE IF NOT EXISTS bookings (
  id                  SERIAL PRIMARY KEY,
  stadium_id          INTEGER NOT NULL REFERENCES stadiums(id) ON DELETE CASCADE,
  player_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week         SMALLINT NOT NULL,
  booking_date        DATE,
  booked_start        TIME NOT NULL,
  booked_end          TIME NOT NULL,
  parent_schedule_id  INTEGER,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  note                TEXT,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stadium_reviews (
  id          SERIAL PRIMARY KEY,
  stadium_id  INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
  player_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stadium_id, player_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  id            SERIAL PRIMARY KEY,
  requester_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id                  SERIAL PRIMARY KEY,
  sender_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content             TEXT NOT NULL,
  is_read             BOOLEAN DEFAULT FALSE,
  deleted_for_sender  BOOLEAN DEFAULT FALSE,
  deleted_for_receiver BOOLEAN DEFAULT FALSE,
  deleted_for_all     BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  message      TEXT NOT NULL,
  is_read      BOOLEAN DEFAULT FALSE,
  related_id   INTEGER,
  related_type VARCHAR(50),
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_availability (
  id          SERIAL PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  slot_start  TIME NOT NULL,
  slot_end    TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  creator_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stadium_id  INTEGER REFERENCES stadiums(id) ON DELETE SET NULL,
  match_day   INTEGER,
  match_start TIME,
  match_end   TIME,
  max_players INTEGER DEFAULT 10,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(20) DEFAULT 'member',
  status      VARCHAR(20) DEFAULT 'active',
  joined_at   TIMESTAMP DEFAULT NOW(),
  last_read_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_messages (
  id                  SERIAL PRIMARY KEY,
  group_id            INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content             TEXT NOT NULL,
  deleted_for_sender  BOOLEAN DEFAULT FALSE,
  deleted_for_all     BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_results (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  played_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  score_a     INTEGER DEFAULT 0,
  score_b     INTEGER DEFAULT 0,
  notes       TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_match_stats (
  id               SERIAL PRIMARY KEY,
  match_result_id  INTEGER REFERENCES match_results(id) ON DELETE CASCADE,
  player_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  goals            INTEGER DEFAULT 0,
  assists          INTEGER DEFAULT 0,
  position         VARCHAR(50),
  rating           NUMERIC(3,1),
  notes_good       TEXT,
  notes_bad        TEXT
);
