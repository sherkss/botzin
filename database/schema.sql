CREATE TABLE IF NOT EXISTS config_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(120) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'viewer',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_config_users_username (username)
);

CREATE TABLE IF NOT EXISTS bot_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  login_identifier VARCHAR(180) NOT NULL,
  secret_reference VARCHAR(180) NULL,
  notes TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_accounts_login_identifier (login_identifier)
);

CREATE TABLE IF NOT EXISTS bot_characters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  world VARCHAR(80) NULL,
  vocation VARCHAR(80) NULL,
  level INT UNSIGNED NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_characters_account_name (account_id, name),
  CONSTRAINT fk_bot_characters_account
    FOREIGN KEY (account_id) REFERENCES bot_accounts (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_machines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  node_id VARCHAR(120) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role ENUM('perception', 'coordinator', 'raspberry-executor') NOT NULL DEFAULT 'perception',
  preferred_host VARCHAR(120) NULL,
  connection_notes TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_machines_node_id (node_id)
);

CREATE TABLE IF NOT EXISTS bot_hunts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(140) NOT NULL,
  city VARCHAR(100) NULL,
  route_profile VARCHAR(120) NULL,
  min_level INT UNSIGNED NULL,
  notes TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_hunts_name (name)
);

CREATE TABLE IF NOT EXISTS bot_skills (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(140) NOT NULL,
  spell_words VARCHAR(140) NULL,
  hotkey VARCHAR(40) NULL,
  category ENUM('attack', 'healing', 'support', 'utility') NOT NULL DEFAULT 'attack',
  mana_cost INT UNSIGNED NULL DEFAULT 0,
  required_level INT UNSIGNED NOT NULL DEFAULT 0,
  allowed_vocations VARCHAR(255) NOT NULL,
  cooldown_ms INT UNSIGNED NOT NULL DEFAULT 1000,
  notes TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_skills_name (name)
);

CREATE TABLE IF NOT EXISTS bot_creature_catalog (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  race VARCHAR(140) NOT NULL,
  name VARCHAR(255) NOT NULL,
  image_url VARCHAR(500) NULL,
  description TEXT NULL,
  behaviour TEXT NULL,
  hitpoints INT UNSIGNED NOT NULL DEFAULT 0,
  experience BIGINT UNSIGNED NOT NULL DEFAULT 0,
  immune_json JSON NULL,
  strong_json JSON NULL,
  weakness_json JSON NULL,
  healed_json JSON NULL,
  can_be_paralysed BOOLEAN NOT NULL DEFAULT FALSE,
  can_be_summoned BOOLEAN NOT NULL DEFAULT FALSE,
  summoned_mana INT UNSIGNED NOT NULL DEFAULT 0,
  can_be_convinced BOOLEAN NOT NULL DEFAULT FALSE,
  convinced_mana INT UNSIGNED NOT NULL DEFAULT 0,
  sees_invisible BOOLEAN NOT NULL DEFAULT FALSE,
  lootable BOOLEAN NOT NULL DEFAULT FALSE,
  loot_json JSON NULL,
  source_url VARCHAR(500) NOT NULL,
  source_generated_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_creature_catalog_race (race),
  KEY idx_bot_creature_catalog_name (name)
);

CREATE TABLE IF NOT EXISTS bot_item_catalog (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  category_slug VARCHAR(140) NULL,
  category_name VARCHAR(180) NULL,
  primary_type VARCHAR(180) NULL,
  secondary_type VARCHAR(180) NULL,
  object_class VARCHAR(180) NULL,
  wiki_url VARCHAR(500) NULL,
  image_path VARCHAR(500) NULL,
  source_updated_at DATETIME NULL,
  source_url VARCHAR(500) NOT NULL,
  source_generated_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_item_catalog_source_id (source_id),
  KEY idx_bot_item_catalog_name (name),
  KEY idx_bot_item_catalog_category (category_slug)
);

CREATE TABLE IF NOT EXISTS bot_game_knowledge (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  knowledge_key VARCHAR(255) NOT NULL,
  domain VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  summary TEXT NULL,
  content MEDIUMTEXT NOT NULL,
  metadata_json JSON NULL,
  source_url VARCHAR(500) NOT NULL,
  source_updated_at DATETIME NULL,
  trust_level ENUM('official', 'community', 'user') NOT NULL,
  volatile BOOLEAN NOT NULL DEFAULT FALSE,
  source_generated_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_game_knowledge_key (knowledge_key),
  KEY idx_bot_game_knowledge_domain_name (domain, name),
  KEY idx_bot_game_knowledge_name (name)
);

CREATE TABLE IF NOT EXISTS bot_hunt_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  machine_id BIGINT UNSIGNED NOT NULL,
  character_id BIGINT UNSIGNED NOT NULL,
  hunt_id BIGINT UNSIGNED NOT NULL,
  status ENUM('planned', 'active', 'paused', 'disabled') NOT NULL DEFAULT 'planned',
  priority INT NOT NULL DEFAULT 100,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_hunt_assignments_machine_character (machine_id, character_id),
  CONSTRAINT fk_bot_hunt_assignments_machine
    FOREIGN KEY (machine_id) REFERENCES bot_machines (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_hunt_assignments_character
    FOREIGN KEY (character_id) REFERENCES bot_characters (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_hunt_assignments_hunt
    FOREIGN KEY (hunt_id) REFERENCES bot_hunts (id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS bot_hunt_skill_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hunt_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  min_mana_percent INT UNSIGNED NULL,
  max_mana_percent INT UNSIGNED NULL,
  min_hp_percent INT UNSIGNED NULL,
  max_hp_percent INT UNSIGNED NULL,
  min_creatures INT UNSIGNED NULL,
  max_creatures INT UNSIGNED NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_hunt_skill_rules_hunt_skill (hunt_id, skill_id),
  CONSTRAINT fk_bot_hunt_skill_rules_hunt
    FOREIGN KEY (hunt_id) REFERENCES bot_hunts (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_hunt_skill_rules_skill
    FOREIGN KEY (skill_id) REFERENCES bot_skills (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_hunt_telemetry (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  character_id BIGINT UNSIGNED NOT NULL,
  hunt_id BIGINT UNSIGNED NOT NULL,
  assignment_id BIGINT UNSIGNED NULL,
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INT UNSIGNED NULL,
  xp_rate_percent INT UNSIGNED NOT NULL DEFAULT 150,
  xp_gain BIGINT NULL,
  raw_xp_gain BIGINT NULL,
  xp_per_hour BIGINT NULL,
  raw_xp_per_hour BIGINT NULL,
  loot_value BIGINT NULL,
  supplies_value BIGINT NULL,
  profit BIGINT NULL,
  creatures_json JSON NULL,
  raw_text MEDIUMTEXT NULL,
  source ENUM('session-analyser', 'ocr', 'manual', 'telemetry') NOT NULL DEFAULT 'session-analyser',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bot_hunt_telemetry_character_time (character_id, captured_at),
  KEY idx_bot_hunt_telemetry_hunt_time (hunt_id, captured_at),
  CONSTRAINT fk_bot_hunt_telemetry_character
    FOREIGN KEY (character_id) REFERENCES bot_characters (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_hunt_telemetry_hunt
    FOREIGN KEY (hunt_id) REFERENCES bot_hunts (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bot_hunt_telemetry_assignment
    FOREIGN KEY (assignment_id) REFERENCES bot_hunt_assignments (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bot_learning_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(140) NOT NULL,
  method_type ENUM('manual-rules', 'human-demonstration', 'replay', 'human-feedback', 'hunt-telemetry', 'external-knowledge') NOT NULL,
  scope ENUM('global', 'hunt', 'character', 'party') NOT NULL DEFAULT 'global',
  hunt_id BIGINT UNSIGNED NULL,
  character_id BIGINT UNSIGNED NULL,
  weight DECIMAL(8, 4) NOT NULL DEFAULT 1.0000,
  mode ENUM('observe', 'suggest', 'execute') NOT NULL DEFAULT 'observe',
  config_json JSON NULL,
  notes TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_learning_methods_name (name),
  CONSTRAINT fk_bot_learning_methods_hunt
    FOREIGN KEY (hunt_id) REFERENCES bot_hunts (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_bot_learning_methods_character
    FOREIGN KEY (character_id) REFERENCES bot_characters (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bot_learning_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  source_type ENUM('video', 'image', 'text', 'web-page', 'market-snapshot', 'obs-recording', 'replay', 'telemetry', 'manual-note') NOT NULL,
  uri TEXT NULL,
  content_hash VARCHAR(128) NULL,
  language VARCHAR(16) NULL,
  status ENUM('pending', 'processing', 'ready', 'failed', 'archived') NOT NULL DEFAULT 'pending',
  trust_level ENUM('low', 'medium', 'high', 'verified') NOT NULL DEFAULT 'low',
  captured_at TIMESTAMP NULL,
  processed_at TIMESTAMP NULL,
  metadata_json JSON NULL,
  notes TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_learning_sources_content_hash (content_hash),
  KEY idx_bot_learning_sources_type_status (source_type, status)
);

CREATE TABLE IF NOT EXISTS bot_learning_method_sources (
  method_id BIGINT UNSIGNED NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  role ENUM('primary', 'validation', 'reference', 'negative-example') NOT NULL DEFAULT 'primary',
  weight DECIMAL(8, 4) NOT NULL DEFAULT 1.0000,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (method_id, source_id),
  CONSTRAINT fk_bot_learning_method_sources_method
    FOREIGN KEY (method_id) REFERENCES bot_learning_methods (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_learning_method_sources_source
    FOREIGN KEY (source_id) REFERENCES bot_learning_sources (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_learning_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method_id BIGINT UNSIGNED NOT NULL,
  assignment_id BIGINT UNSIGNED NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('recording', 'reviewing', 'approved', 'rejected', 'archived') NOT NULL DEFAULT 'recording',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  summary_json JSON NULL,
  notes TEXT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_bot_learning_sessions_method
    FOREIGN KEY (method_id) REFERENCES bot_learning_methods (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_learning_sessions_assignment
    FOREIGN KEY (assignment_id) REFERENCES bot_hunt_assignments (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bot_learning_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  state_json JSON NULL,
  action_json JSON NULL,
  reward DECIMAL(10, 4) NULL,
  notes TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_bot_learning_events_session_time (session_id, occurred_at),
  CONSTRAINT fk_bot_learning_events_session
    FOREIGN KEY (session_id) REFERENCES bot_learning_sessions (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_decision_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  learning_event_id BIGINT UNSIGNED NULL,
  assignment_id BIGINT UNSIGNED NULL,
  rating ENUM('good', 'bad', 'unsafe', 'unknown') NOT NULL DEFAULT 'unknown',
  correction_action_json JSON NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_bot_decision_feedback_event
    FOREIGN KEY (learning_event_id) REFERENCES bot_learning_events (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_decision_feedback_assignment
    FOREIGN KEY (assignment_id) REFERENCES bot_hunt_assignments (id)
    ON DELETE CASCADE
);
