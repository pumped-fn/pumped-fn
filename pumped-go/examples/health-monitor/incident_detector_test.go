package main

import (
	"testing"
	"time"

	pumped "github.com/pumped-fn/pumped-go"
)

func TestIncidentDetector_StartsIncident(t *testing.T) {
	g := DefineGraph()

	mockIncidentRepo := NewMockIncidentRepository()
	mockIncidentRepoExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (IncidentRepo, error) {
		return mockIncidentRepo, nil
	})

	testScope := pumped.NewScope(
		pumped.WithPreset(g.IncidentRepo, mockIncidentRepoExecutor),
	)
	defer testScope.Dispose()

	detector, err := pumped.Resolve(testScope, g.IncidentDetector)
	if err != nil {
		t.Fatalf("failed to resolve incident detector: %v", err)
	}

	unhealthyCheck := &HealthCheck{
		ID:        "check-1",
		ServiceID: "svc-1",
		Status:    HealthStatusUnhealthy,
		Timestamp: time.Now(),
	}

	err = detector.ProcessHealthCheck(unhealthyCheck)
	if err != nil {
		t.Fatalf("ProcessHealthCheck failed: %v", err)
	}

	incidents, _ := mockIncidentRepo.ListActive()
	if len(incidents) != 1 {
		t.Errorf("expected 1 active incident, got %d", len(incidents))
	}

	if len(incidents) > 0 && incidents[0].ServiceID != "svc-1" {
		t.Errorf("expected incident for svc-1, got %s", incidents[0].ServiceID)
	}

	if len(incidents) > 0 && incidents[0].ChecksFailedCount != 1 {
		t.Errorf("expected 1 failed check, got %d", incidents[0].ChecksFailedCount)
	}
}

func TestIncidentDetector_ClosesIncidentOnRecovery(t *testing.T) {
	g := DefineGraph()

	mockIncidentRepo := NewMockIncidentRepository()
	mockIncidentRepoExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (IncidentRepo, error) {
		return mockIncidentRepo, nil
	})

	testScope := pumped.NewScope(
		pumped.WithPreset(g.IncidentRepo, mockIncidentRepoExecutor),
	)
	defer testScope.Dispose()

	detector, err := pumped.Resolve(testScope, g.IncidentDetector)
	if err != nil {
		t.Fatalf("failed to resolve incident detector: %v", err)
	}

	unhealthyCheck := &HealthCheck{
		ID:        "check-1",
		ServiceID: "svc-1",
		Status:    HealthStatusUnhealthy,
		Timestamp: time.Now(),
	}
	detector.ProcessHealthCheck(unhealthyCheck)

	healthyCheck := &HealthCheck{
		ID:        "check-2",
		ServiceID: "svc-1",
		Status:    HealthStatusHealthy,
		Timestamp: time.Now(),
	}

	err = detector.ProcessHealthCheck(healthyCheck)
	if err != nil {
		t.Fatalf("ProcessHealthCheck recovery failed: %v", err)
	}

	activeIncidents, _ := mockIncidentRepo.ListActive()
	if len(activeIncidents) != 0 {
		t.Errorf("expected 0 active incidents after recovery, got %d", len(activeIncidents))
	}

	allIncidents, _ := mockIncidentRepo.ListByService("svc-1")
	if len(allIncidents) != 1 {
		t.Errorf("expected 1 total incident, got %d", len(allIncidents))
	}

	if len(allIncidents) > 0 && allIncidents[0].RecoveredAt == nil {
		t.Error("expected incident to have recovery time")
	}

	if len(allIncidents) > 0 && allIncidents[0].Duration == nil {
		t.Error("expected incident to have duration")
	}
}

func TestIncidentDetector_IncrementsFailCount(t *testing.T) {
	g := DefineGraph()

	mockIncidentRepo := NewMockIncidentRepository()
	mockIncidentRepoExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (IncidentRepo, error) {
		return mockIncidentRepo, nil
	})

	testScope := pumped.NewScope(
		pumped.WithPreset(g.IncidentRepo, mockIncidentRepoExecutor),
	)
	defer testScope.Dispose()

	detector, err := pumped.Resolve(testScope, g.IncidentDetector)
	if err != nil {
		t.Fatalf("failed to resolve incident detector: %v", err)
	}

	for i := 1; i <= 5; i++ {
		unhealthyCheck := &HealthCheck{
			ID:        "check-" + string(rune(i)),
			ServiceID: "svc-1",
			Status:    HealthStatusUnhealthy,
			Timestamp: time.Now(),
		}
		detector.ProcessHealthCheck(unhealthyCheck)
	}

	incidents, _ := mockIncidentRepo.ListActive()
	if len(incidents) != 1 {
		t.Fatalf("expected 1 active incident, got %d", len(incidents))
	}

	if incidents[0].ChecksFailedCount != 5 {
		t.Errorf("expected 5 failed checks, got %d", incidents[0].ChecksFailedCount)
	}
}
