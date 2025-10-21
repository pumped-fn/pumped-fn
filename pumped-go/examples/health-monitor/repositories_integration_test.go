package main

import (
	"testing"
	"time"

	pumped "github.com/pumped-fn/pumped-go"
)

func TestServiceRepository_Integration(t *testing.T) {
	g := DefineGraph()

	testConfig := &Config{
		DBPath:     ":memory:",
		ServerPort: 8080,
		LogLevel:   "info",
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Config, testConfig),
	)
	defer testScope.Dispose()

	serviceRepo, err := pumped.Resolve(testScope, g.ServiceRepo)
	if err != nil {
		t.Fatalf("failed to resolve service repo: %v", err)
	}

	service := &Service{
		ID:            "svc-test",
		Name:          "Test Service",
		Type:          ServiceTypeHTTP,
		Endpoint:      "http://example.com",
		CheckInterval: 60,
		Timeout:       5000,
		Criticality:   CriticalityHigh,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	err = serviceRepo.Create(service)
	if err != nil {
		t.Fatalf("failed to create service: %v", err)
	}

	retrieved, err := serviceRepo.Get("svc-test")
	if err != nil {
		t.Fatalf("failed to get service: %v", err)
	}

	if retrieved == nil {
		t.Fatal("expected to retrieve service")
	}

	if retrieved.Name != "Test Service" {
		t.Errorf("expected name 'Test Service', got %s", retrieved.Name)
	}

	service.Name = "Updated Service"
	err = serviceRepo.Update(service)
	if err != nil {
		t.Fatalf("failed to update service: %v", err)
	}

	updated, err := serviceRepo.Get("svc-test")
	if err != nil {
		t.Fatalf("failed to get updated service: %v", err)
	}

	if updated.Name != "Updated Service" {
		t.Errorf("expected name 'Updated Service', got %s", updated.Name)
	}

	services, err := serviceRepo.List()
	if err != nil {
		t.Fatalf("failed to list services: %v", err)
	}

	if len(services) != 1 {
		t.Errorf("expected 1 service, got %d", len(services))
	}

	err = serviceRepo.Delete("svc-test")
	if err != nil {
		t.Fatalf("failed to delete service: %v", err)
	}

	deleted, err := serviceRepo.Get("svc-test")
	if err != nil {
		t.Fatalf("failed to get deleted service: %v", err)
	}

	if deleted != nil {
		t.Error("expected service to be deleted")
	}
}

func TestHealthCheckRepository_Integration(t *testing.T) {
	g := DefineGraph()

	testConfig := &Config{
		DBPath:     ":memory:",
		ServerPort: 8080,
		LogLevel:   "info",
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Config, testConfig),
	)
	defer testScope.Dispose()

	healthRepo, err := pumped.Resolve(testScope, g.HealthRepo)
	if err != nil {
		t.Fatalf("failed to resolve health repo: %v", err)
	}

	responseTime := 100
	check := &HealthCheck{
		ID:           "check-1",
		ServiceID:    "svc-1",
		Status:       HealthStatusHealthy,
		ResponseTime: &responseTime,
		Timestamp:    time.Now(),
	}

	err = healthRepo.Create(check)
	if err != nil {
		t.Fatalf("failed to create health check: %v", err)
	}

	latest, err := healthRepo.GetLatest("svc-1")
	if err != nil {
		t.Fatalf("failed to get latest check: %v", err)
	}

	if latest == nil {
		t.Fatal("expected to retrieve check")
	}

	if latest.Status != HealthStatusHealthy {
		t.Errorf("expected healthy status, got %s", latest.Status)
	}

	check2 := &HealthCheck{
		ID:           "check-2",
		ServiceID:    "svc-1",
		Status:       HealthStatusUnhealthy,
		ResponseTime: nil,
		Timestamp:    time.Now(),
	}
	healthRepo.Create(check2)

	latest2, _ := healthRepo.GetLatest("svc-1")
	if latest2.Status != HealthStatusUnhealthy {
		t.Errorf("expected latest to be unhealthy, got %s", latest2.Status)
	}

	from := time.Now().Add(-1 * time.Hour)
	to := time.Now().Add(1 * time.Hour)
	history, err := healthRepo.GetHistory("svc-1", from, to)
	if err != nil {
		t.Fatalf("failed to get history: %v", err)
	}

	if len(history) != 2 {
		t.Errorf("expected 2 checks in history, got %d", len(history))
	}
}

func TestIncidentRepository_Integration(t *testing.T) {
	g := DefineGraph()

	testConfig := &Config{
		DBPath:     ":memory:",
		ServerPort: 8080,
		LogLevel:   "info",
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Config, testConfig),
	)
	defer testScope.Dispose()

	incidentRepo, err := pumped.Resolve(testScope, g.IncidentRepo)
	if err != nil {
		t.Fatalf("failed to resolve incident repo: %v", err)
	}

	incident := &Incident{
		ID:                "inc-1",
		ServiceID:         "svc-1",
		StartedAt:         time.Now(),
		ChecksFailedCount: 1,
	}

	err = incidentRepo.Create(incident)
	if err != nil {
		t.Fatalf("failed to create incident: %v", err)
	}

	active, err := incidentRepo.GetActive("svc-1")
	if err != nil {
		t.Fatalf("failed to get active incident: %v", err)
	}

	if active == nil {
		t.Fatal("expected to find active incident")
	}

	if active.ServiceID != "svc-1" {
		t.Errorf("expected service svc-1, got %s", active.ServiceID)
	}

	now := time.Now()
	duration := 60
	incident.RecoveredAt = &now
	incident.Duration = &duration

	err = incidentRepo.Update(incident)
	if err != nil {
		t.Fatalf("failed to update incident: %v", err)
	}

	activeAfter, _ := incidentRepo.GetActive("svc-1")
	if activeAfter != nil {
		t.Error("expected no active incident after recovery")
	}

	allIncidents, err := incidentRepo.ListByService("svc-1")
	if err != nil {
		t.Fatalf("failed to list incidents: %v", err)
	}

	if len(allIncidents) != 1 {
		t.Errorf("expected 1 incident, got %d", len(allIncidents))
	}
}
