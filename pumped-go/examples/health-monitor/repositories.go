package main

import (
	"database/sql"
	"fmt"
	"time"
)

type ServiceRepository struct {
	db *sql.DB
}

func NewServiceRepository(db *sql.DB) *ServiceRepository {
	return &ServiceRepository{db: db}
}

func (r *ServiceRepository) Create(service *Service) error {
	query := `
		INSERT INTO services (id, name, type, endpoint, check_interval, timeout, criticality, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.db.Exec(query,
		service.ID, service.Name, service.Type, service.Endpoint,
		service.CheckInterval, service.Timeout, service.Criticality,
		service.CreatedAt.Unix(), service.UpdatedAt.Unix(),
	)
	return err
}

func (r *ServiceRepository) Get(id string) (*Service, error) {
	query := `SELECT id, name, type, endpoint, check_interval, timeout, criticality, created_at, updated_at FROM services WHERE id = ?`
	var s Service
	var createdAt, updatedAt int64

	err := r.db.QueryRow(query, id).Scan(&s.ID, &s.Name, &s.Type, &s.Endpoint, &s.CheckInterval, &s.Timeout, &s.Criticality, &createdAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	s.CreatedAt = time.Unix(createdAt, 0)
	s.UpdatedAt = time.Unix(updatedAt, 0)
	return &s, nil
}

func (r *ServiceRepository) List() ([]*Service, error) {
	query := `SELECT id, name, type, endpoint, check_interval, timeout, criticality, created_at, updated_at FROM services ORDER BY name`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var services []*Service
	for rows.Next() {
		var s Service
		var createdAt, updatedAt int64
		err := rows.Scan(&s.ID, &s.Name, &s.Type, &s.Endpoint, &s.CheckInterval, &s.Timeout, &s.Criticality, &createdAt, &updatedAt)
		if err != nil {
			return nil, err
		}
		s.CreatedAt = time.Unix(createdAt, 0)
		s.UpdatedAt = time.Unix(updatedAt, 0)
		services = append(services, &s)
	}
	return services, rows.Err()
}

func (r *ServiceRepository) Update(service *Service) error {
	query := `UPDATE services SET name = ?, type = ?, endpoint = ?, check_interval = ?, timeout = ?, criticality = ?, updated_at = ? WHERE id = ?`
	result, err := r.db.Exec(query, service.Name, service.Type, service.Endpoint, service.CheckInterval, service.Timeout, service.Criticality, time.Now().Unix(), service.ID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("service not found: %s", service.ID)
	}
	return nil
}

func (r *ServiceRepository) Delete(id string) error {
	query := `DELETE FROM services WHERE id = ?`
	result, err := r.db.Exec(query, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("service not found: %s", id)
	}
	return nil
}

type HealthCheckRepository struct {
	db *sql.DB
}

func NewHealthCheckRepository(db *sql.DB) *HealthCheckRepository {
	return &HealthCheckRepository{db: db}
}

func (r *HealthCheckRepository) Create(check *HealthCheck) error {
	query := `INSERT INTO health_checks (id, service_id, status, response_time, error, timestamp) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := r.db.Exec(query, check.ID, check.ServiceID, check.Status, check.ResponseTime, check.Error, check.Timestamp.Unix())
	return err
}

func (r *HealthCheckRepository) GetLatest(serviceID string) (*HealthCheck, error) {
	query := `SELECT id, service_id, status, response_time, error, timestamp FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT 1`
	var check HealthCheck
	var timestamp int64

	err := r.db.QueryRow(query, serviceID).Scan(&check.ID, &check.ServiceID, &check.Status, &check.ResponseTime, &check.Error, &timestamp)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	check.Timestamp = time.Unix(timestamp, 0)
	return &check, nil
}

func (r *HealthCheckRepository) GetHistory(serviceID string, from, to time.Time) ([]*HealthCheck, error) {
	query := `SELECT id, service_id, status, response_time, error, timestamp FROM health_checks WHERE service_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC`
	rows, err := r.db.Query(query, serviceID, from.Unix(), to.Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var checks []*HealthCheck
	for rows.Next() {
		var check HealthCheck
		var timestamp int64
		err := rows.Scan(&check.ID, &check.ServiceID, &check.Status, &check.ResponseTime, &check.Error, &timestamp)
		if err != nil {
			return nil, err
		}
		check.Timestamp = time.Unix(timestamp, 0)
		checks = append(checks, &check)
	}
	return checks, rows.Err()
}

type IncidentRepository struct {
	db *sql.DB
}

func NewIncidentRepository(db *sql.DB) *IncidentRepository {
	return &IncidentRepository{db: db}
}

func (r *IncidentRepository) Create(incident *Incident) error {
	query := `INSERT INTO incidents (id, service_id, started_at, recovered_at, duration, checks_failed_count) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := r.db.Exec(query, incident.ID, incident.ServiceID, incident.StartedAt.Unix(), timeToUnixPtr(incident.RecoveredAt), incident.Duration, incident.ChecksFailedCount)
	return err
}

func (r *IncidentRepository) Update(incident *Incident) error {
	query := `UPDATE incidents SET recovered_at = ?, duration = ?, checks_failed_count = ? WHERE id = ?`
	_, err := r.db.Exec(query, timeToUnixPtr(incident.RecoveredAt), incident.Duration, incident.ChecksFailedCount, incident.ID)
	return err
}

func (r *IncidentRepository) GetActive(serviceID string) (*Incident, error) {
	query := `SELECT id, service_id, started_at, recovered_at, duration, checks_failed_count FROM incidents WHERE service_id = ? AND recovered_at IS NULL ORDER BY started_at DESC LIMIT 1`
	var incident Incident
	var startedAt int64
	var recoveredAt sql.NullInt64
	var duration sql.NullInt64

	err := r.db.QueryRow(query, serviceID).Scan(&incident.ID, &incident.ServiceID, &startedAt, &recoveredAt, &duration, &incident.ChecksFailedCount)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	incident.StartedAt = time.Unix(startedAt, 0)
	incident.RecoveredAt = unixToTimePtr(recoveredAt)
	incident.Duration = intPtrFromNull(duration)
	return &incident, nil
}

func (r *IncidentRepository) ListByService(serviceID string) ([]*Incident, error) {
	query := `SELECT id, service_id, started_at, recovered_at, duration, checks_failed_count FROM incidents WHERE service_id = ? ORDER BY started_at DESC`
	rows, err := r.db.Query(query, serviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanIncidents(rows)
}

func (r *IncidentRepository) ListActive() ([]*Incident, error) {
	query := `SELECT id, service_id, started_at, recovered_at, duration, checks_failed_count FROM incidents WHERE recovered_at IS NULL ORDER BY started_at DESC`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanIncidents(rows)
}

func (r *IncidentRepository) scanIncidents(rows *sql.Rows) ([]*Incident, error) {
	var incidents []*Incident
	for rows.Next() {
		var incident Incident
		var startedAt int64
		var recoveredAt sql.NullInt64
		var duration sql.NullInt64

		err := rows.Scan(&incident.ID, &incident.ServiceID, &startedAt, &recoveredAt, &duration, &incident.ChecksFailedCount)
		if err != nil {
			return nil, err
		}
		incident.StartedAt = time.Unix(startedAt, 0)
		incident.RecoveredAt = unixToTimePtr(recoveredAt)
		incident.Duration = intPtrFromNull(duration)
		incidents = append(incidents, &incident)
	}
	return incidents, rows.Err()
}

func timeToUnixPtr(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return t.Unix()
}

func unixToTimePtr(n sql.NullInt64) *time.Time {
	if !n.Valid {
		return nil
	}
	t := time.Unix(n.Int64, 0)
	return &t
}

func intPtrFromNull(n sql.NullInt64) *int {
	if !n.Valid {
		return nil
	}
	val := int(n.Int64)
	return &val
}
