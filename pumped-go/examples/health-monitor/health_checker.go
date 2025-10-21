package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type HealthChecker struct {
	httpClient *http.Client
}

func NewHealthChecker() *HealthChecker {
	return &HealthChecker{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (h *HealthChecker) Check(ctx context.Context, service *Service) (*HealthCheck, error) {
	check := &HealthCheck{
		ID:        uuid.New().String(),
		ServiceID: service.ID,
		Timestamp: time.Now(),
	}

	timeout := time.Duration(service.Timeout) * time.Millisecond
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var err error
	var responseTime int

	switch service.Type {
	case ServiceTypeHTTP:
		responseTime, err = h.checkHTTP(ctx, service.Endpoint)
	case ServiceTypeTCP:
		responseTime, err = h.checkTCP(ctx, service.Endpoint)
	case ServiceTypeCustom:
		err = fmt.Errorf("custom health checks not implemented")
	default:
		err = fmt.Errorf("unknown service type: %s", service.Type)
	}

	if err != nil {
		check.Status = HealthStatusUnhealthy
		errMsg := err.Error()
		check.Error = &errMsg
	} else {
		check.Status = HealthStatusHealthy
		check.ResponseTime = &responseTime
	}

	return check, nil
}

func (h *HealthChecker) checkHTTP(ctx context.Context, endpoint string) (int, error) {
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, err
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	elapsed := time.Since(start).Milliseconds()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return int(elapsed), fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}
	return int(elapsed), nil
}

func (h *HealthChecker) checkTCP(ctx context.Context, endpoint string) (int, error) {
	start := time.Now()
	var dialer net.Dialer
	conn, err := dialer.DialContext(ctx, "tcp", endpoint)
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	elapsed := time.Since(start).Milliseconds()
	return int(elapsed), nil
}
