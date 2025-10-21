package main

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

type IncidentDetector struct {
	incidentRepo IncidentRepo
}

func NewIncidentDetector(incidentRepo IncidentRepo) *IncidentDetector {
	return &IncidentDetector{incidentRepo: incidentRepo}
}

func (d *IncidentDetector) ProcessHealthCheck(check *HealthCheck) error {
	activeIncident, err := d.incidentRepo.GetActive(check.ServiceID)
	if err != nil {
		return fmt.Errorf("failed to get active incident: %w", err)
	}

	if check.Status == HealthStatusUnhealthy {
		if activeIncident == nil {
			return d.startIncident(check)
		}
		return d.incrementFailCount(activeIncident)
	}

	if check.Status == HealthStatusHealthy && activeIncident != nil {
		return d.recoverIncident(activeIncident)
	}

	return nil
}

func (d *IncidentDetector) startIncident(check *HealthCheck) error {
	incident := &Incident{
		ID:                uuid.New().String(),
		ServiceID:         check.ServiceID,
		StartedAt:         check.Timestamp,
		ChecksFailedCount: 1,
	}
	return d.incidentRepo.Create(incident)
}

func (d *IncidentDetector) incrementFailCount(incident *Incident) error {
	incident.ChecksFailedCount++
	return d.incidentRepo.Update(incident)
}

func (d *IncidentDetector) recoverIncident(incident *Incident) error {
	now := time.Now()
	incident.RecoveredAt = &now
	duration := int(now.Sub(incident.StartedAt).Seconds())
	incident.Duration = &duration
	return d.incidentRepo.Update(incident)
}
