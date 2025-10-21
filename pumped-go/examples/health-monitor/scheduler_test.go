package main

import (
	"io"
	"testing"
	"time"

	pumped "github.com/pumped-fn/pumped-go"
)

func TestScheduler_ExecutesHealthChecks(t *testing.T) {
	g := DefineGraph()

	mockServiceRepo := NewMockServiceRepository()
	mockHealthRepo := NewMockHealthCheckRepository()

	service := &Service{
		ID:            "svc-1",
		Name:          "Test Service",
		Type:          ServiceTypeHTTP,
		Endpoint:      "https://httpbin.org/status/200",
		CheckInterval: 3,
		Timeout:       5000,
		Criticality:   CriticalityHigh,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	mockServiceRepo.Create(service)

	mockServiceRepoExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (ServiceRepo, error) {
		return mockServiceRepo, nil
	})
	mockHealthRepoExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (HealthCheckRepo, error) {
		return mockHealthRepo, nil
	})
	mockLoggerExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (*Logger, error) {
		return NewLogger("info", io.Discard), nil
	})

	testScope := pumped.NewScope(
		pumped.WithPreset(g.ServiceRepo, mockServiceRepoExecutor),
		pumped.WithPreset(g.HealthRepo, mockHealthRepoExecutor),
		pumped.WithPreset(g.Logger, mockLoggerExecutor),
	)
	defer testScope.Dispose()

	scheduler, err := pumped.Resolve(testScope, g.Scheduler)
	if err != nil {
		t.Fatalf("failed to resolve scheduler: %v", err)
	}

	scheduler.Start()
	time.Sleep(4 * time.Second)
	scheduler.Stop()

	if len(mockHealthRepo.checks) < 1 {
		t.Errorf("expected at least 1 health check to be completed, got %d", len(mockHealthRepo.checks))
	}

	for _, check := range mockHealthRepo.checks {
		if check.ServiceID != "svc-1" {
			t.Errorf("expected check for svc-1, got %s", check.ServiceID)
		}
	}
}

func TestScheduler_StopsGracefully(t *testing.T) {
	g := DefineGraph()

	mockServiceRepo := NewMockServiceRepository()
	mockHealthRepo := NewMockHealthCheckRepository()

	mockServiceRepoExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (ServiceRepo, error) {
		return mockServiceRepo, nil
	})
	mockHealthRepoExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (HealthCheckRepo, error) {
		return mockHealthRepo, nil
	})
	mockLoggerExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (*Logger, error) {
		return NewLogger("info", io.Discard), nil
	})

	testScope := pumped.NewScope(
		pumped.WithPreset(g.ServiceRepo, mockServiceRepoExecutor),
		pumped.WithPreset(g.HealthRepo, mockHealthRepoExecutor),
		pumped.WithPreset(g.Logger, mockLoggerExecutor),
	)
	defer testScope.Dispose()

	scheduler, err := pumped.Resolve(testScope, g.Scheduler)
	if err != nil {
		t.Fatalf("failed to resolve scheduler: %v", err)
	}

	scheduler.Start()
	scheduler.Stop()
	scheduler.Stop()
}
