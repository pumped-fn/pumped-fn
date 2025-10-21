package main

import (
	"context"
	"testing"
)

func TestHealthChecker_HTTPCheck(t *testing.T) {
	checker := NewHealthChecker()

	service := &Service{
		ID:       "svc-1",
		Type:     ServiceTypeHTTP,
		Endpoint: "https://httpbin.org/status/200",
		Timeout:  5000,
	}

	check, err := checker.Check(context.Background(), service)
	if err != nil {
		t.Fatalf("health check failed: %v", err)
	}

	if check.Status != HealthStatusHealthy {
		t.Errorf("expected healthy status, got %s", check.Status)
	}

	if check.ResponseTime == nil {
		t.Error("expected response time to be set")
	}

	if check.ServiceID != "svc-1" {
		t.Errorf("expected service ID svc-1, got %s", check.ServiceID)
	}
}

func TestHealthChecker_HTTPCheckUnhealthy(t *testing.T) {
	checker := NewHealthChecker()

	service := &Service{
		ID:       "svc-1",
		Type:     ServiceTypeHTTP,
		Endpoint: "https://httpbin.org/status/500",
		Timeout:  5000,
	}

	check, err := checker.Check(context.Background(), service)
	if err != nil {
		t.Fatalf("health check failed: %v", err)
	}

	if check.Status != HealthStatusUnhealthy {
		t.Errorf("expected unhealthy status, got %s", check.Status)
	}

	if check.Error == nil {
		t.Error("expected error message to be set")
	}
}

func TestHealthChecker_TCPCheck(t *testing.T) {
	checker := NewHealthChecker()

	service := &Service{
		ID:       "svc-1",
		Type:     ServiceTypeTCP,
		Endpoint: "google.com:80",
		Timeout:  5000,
	}

	check, err := checker.Check(context.Background(), service)
	if err != nil {
		t.Fatalf("health check failed: %v", err)
	}

	if check.Status != HealthStatusHealthy {
		t.Errorf("expected healthy status, got %s", check.Status)
	}

	if check.ResponseTime == nil {
		t.Error("expected response time to be set")
	}
}
