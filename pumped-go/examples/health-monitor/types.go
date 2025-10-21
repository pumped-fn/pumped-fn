package main

import "time"

type ServiceType string

const (
	ServiceTypeHTTP   ServiceType = "http"
	ServiceTypeTCP    ServiceType = "tcp"
	ServiceTypeCustom ServiceType = "custom"
)

type Criticality string

const (
	CriticalityLow      Criticality = "low"
	CriticalityMedium   Criticality = "medium"
	CriticalityHigh     Criticality = "high"
	CriticalityCritical Criticality = "critical"
)

type HealthStatus string

const (
	HealthStatusHealthy   HealthStatus = "healthy"
	HealthStatusUnhealthy HealthStatus = "unhealthy"
	HealthStatusUnknown   HealthStatus = "unknown"
)

type Service struct {
	ID            string
	Name          string
	Type          ServiceType
	Endpoint      string
	CheckInterval int
	Timeout       int
	Criticality   Criticality
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type HealthCheck struct {
	ID           string
	ServiceID    string
	Status       HealthStatus
	ResponseTime *int
	Error        *string
	Timestamp    time.Time
}

type Incident struct {
	ID                string
	ServiceID         string
	StartedAt         time.Time
	RecoveredAt       *time.Time
	Duration          *int
	ChecksFailedCount int
}

type Config struct {
	DBPath     string
	ServerPort int
	LogLevel   string
}

func DefaultConfig() *Config {
	return &Config{
		DBPath:     "health-monitor.db",
		ServerPort: 8080,
		LogLevel:   "info",
	}
}
