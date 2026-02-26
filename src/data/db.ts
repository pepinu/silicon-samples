import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DB_PATH } from '../config.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Seed data records (normalized from various datasets)
    CREATE TABLE IF NOT EXISTS seed_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      education TEXT,
      marital_status TEXT,
      income REAL,
      race TEXT,
      occupation TEXT,
      region TEXT,
      kids INTEGER,
      household_size INTEGER,
      raw_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_seed_dataset ON seed_records(dataset);

    -- Experiments
    CREATE TABLE IF NOT EXISTS experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dataset TEXT NOT NULL,
      persona_count INTEGER NOT NULL,
      model_ids TEXT NOT NULL,
      question_set TEXT NOT NULL,
      temperature REAL NOT NULL DEFAULT 1.0,
      budget_limit REAL NOT NULL DEFAULT 5.0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      config_json TEXT
    );

    -- Generated personas
    CREATE TABLE IF NOT EXISTS personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id INTEGER NOT NULL REFERENCES experiments(id),
      seed_record_id INTEGER REFERENCES seed_records(id),
      model_id TEXT NOT NULL,
      backstory TEXT NOT NULL,
      demographics_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_personas_experiment ON personas(experiment_id);

    -- Interview responses
    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id INTEGER NOT NULL REFERENCES personas(id),
      question_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL,
      raw_response TEXT NOT NULL,
      parsed_value REAL,
      likert_value INTEGER,
      is_valid INTEGER NOT NULL DEFAULT 1,
      rejection_reason TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_responses_persona ON responses(persona_id);

    -- Validation results
    CREATE TABLE IF NOT EXISTS validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id INTEGER NOT NULL REFERENCES experiments(id),
      metric TEXT NOT NULL,
      dimension TEXT NOT NULL,
      value REAL NOT NULL,
      p_value REAL,
      passed INTEGER,
      details_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_validations_experiment ON validations(experiment_id);

    -- Cost tracking
    CREATE TABLE IF NOT EXISTS cost_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id INTEGER NOT NULL REFERENCES experiments(id),
      model_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
