package main

import (
	"database/sql"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

func NewDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	if err := initSchema(db); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return db, nil
}

func initSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS services (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		endpoint TEXT NOT NULL,
		check_interval INTEGER NOT NULL,
		timeout INTEGER NOT NULL,
		criticality TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS health_checks (
		id TEXT PRIMARY KEY,
		service_id TEXT NOT NULL,
		status TEXT NOT NULL,
		response_time INTEGER,
		error TEXT,
		timestamp INTEGER NOT NULL,
		FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_health_checks_service_timestamp
		ON health_checks(service_id, timestamp);

	CREATE TABLE IF NOT EXISTS incidents (
		id TEXT PRIMARY KEY,
		service_id TEXT NOT NULL,
		started_at INTEGER NOT NULL,
		recovered_at INTEGER,
		duration INTEGER,
		checks_failed_count INTEGER NOT NULL,
		FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_incidents_service
		ON incidents(service_id);
	CREATE INDEX IF NOT EXISTS idx_incidents_active
		ON incidents(recovered_at) WHERE recovered_at IS NULL;
	`

	_, err := db.Exec(schema)
	return err
}
